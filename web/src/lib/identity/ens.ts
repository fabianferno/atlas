/**
 * W7 — ENS subname issuance and record read/write.
 *
 * The thesis of this product is that **the mini app is an ENS name**. A mini
 * app holds a wallet and can spend, so before you fund one you need to know
 * what it is and who made it. One lookup has to return: the UI, the wallet
 * address, the author, and the onchain identity. That is what this file
 * produces. See prd.md §8.
 *
 * ## Standards used, verbatim — nothing here is invented
 *
 * | Key                                            | Spec      |
 * |------------------------------------------------|-----------|
 * | `addr`                                         | ENSIP-1/9 |
 * | `contenthash`                                  | ENSIP-7   |
 * | `url`, `description`, `avatar`                 | ENSIP-5   |
 * | `agent-context`                                | ENSIP-26  |
 * | `agent-endpoint[web|mcp|a2a]`                   | ENSIP-26  |
 * | `agent-registration[<erc7930>][<agentId>]`     | ENSIP-25  |
 *
 * ENSIP-26 (draft, 2025-05-17) defines exactly two keys: `agent-context` and
 * `agent-endpoint[<protocol>]`, with `mcp` / `a2a` / `web` as the named
 * protocols. It explicitly does NOT mandate a body format for `agent-context`
 * — "Any format suitable for agentic systems (plain text, Markdown, YAML,
 * JSON, etc.)". We emit YAML because a mini app's context is structured
 * (schemas, caps, triggers) and an agent reading it should not have to parse
 * prose. That is a permitted choice, not a deviation.
 *
 * ENSIP-25 (draft, 2025-10-02) defines
 * `agent-registration[<registry>][<agentId>]` where `<registry>` is the
 * ERC-7930 interoperable address of the registry contract as a lowercase
 * `0x`-prefixed hex string, `<agentId>` is the registry's own identifier, and
 * the value MUST be non-empty — implementations SHOULD use `"1"`.
 *
 * ## Backends
 *
 * We do not own the parent name yet, and which issuance mechanism the ENS
 * booth wants to see is a Friday-morning question. So issuance sits behind
 * `EnsBackend` with four implementations selected by `ENS_REGISTRAR_MODE`:
 *
 *   `namespace` — offchain CCIP-Read subnames via Namespace. Gasless. DEFAULT.
 *   `namestone` — same idea, via NameStone. ⚠️ shuts down 2026-08-03.
 *   `onchain`   — NameWrapper `setSubnodeRecord` + PublicResolver, Sepolia.
 *   `mock`      — in-process. Zero config, deterministic, always available.
 *
 * `offchain` (the spelling in prd.md §8) resolves to whichever offchain
 * backend has a key, preferring Namespace. Any mode with no key degrades to
 * `mock` and says so, rather than throwing mid-demo.
 *
 * Reads are backend-independent: `readRecords()` always goes through a real
 * ENS resolver (viem universal resolver) when an RPC is configured, because a
 * name that only resolves inside our own process is not a name.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  labelhash,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, mainnet } from "viem/chains";
import type { Manifest } from "@/lib/contracts/manifest";

/* ========================================================================== */
/* ERC-7930 — Interoperable Addresses                                         */
/* ========================================================================== */

/**
 * ERC-7930 v1 binary layout:
 *
 *   ┌─────────┬───────────┬──────────────────────┬────────────────┬───────────────┬─────────┐
 *   │ Version │ ChainType │ ChainReferenceLength │ ChainReference │ AddressLength │ Address │
 *   │  2 B    │   2 B     │        1 B           │     n B        │      1 B      │  20 B   │
 *   └─────────┴───────────┴──────────────────────┴────────────────┴───────────────┴─────────┘
 *
 * Version = 0x0001. ChainType for the `eip155` CASA namespace = 0x0000
 * (CAIP-350 binary key). ChainReference is the bare chain id as a big-endian
 * unsigned integer in the *minimum* number of bytes, leading zero bytes
 * prohibited. AddressLength is 0x14 for a 20-byte EVM address.
 *
 * Verified against the ENSIP-25 worked example: chain 1 +
 * 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 encodes to
 * 0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432.
 */
export function erc7930Eip155(chainId: number | bigint, address: string): Hex {
  const id = BigInt(chainId);
  if (id <= 0n) throw new Error(`erc7930: chain id must be positive, got ${chainId}`);

  let ref = id.toString(16);
  if (ref.length % 2 === 1) ref = `0${ref}`;
  // Minimum-length encoding: strip whole leading zero bytes.
  while (ref.length > 2 && ref.startsWith("00")) ref = ref.slice(2);
  const refLen = ref.length / 2;
  if (refLen > 255) throw new Error("erc7930: chain reference too long");

  const addr = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(addr)) {
    throw new Error(`erc7930: expected a 20-byte hex address, got "${address}"`);
  }

  const VERSION = "0001";
  const CHAIN_TYPE_EIP155 = "0000";
  const ADDR_LEN = "14";
  return `0x${VERSION}${CHAIN_TYPE_EIP155}${refLen
    .toString(16)
    .padStart(2, "0")}${ref}${ADDR_LEN}${addr}` as Hex;
}

export interface Erc7930Decoded {
  chainId: number;
  address: Address;
}

/** Inverse of {@link erc7930Eip155}. Returns null for anything non-`eip155`. */
export function decodeErc7930(encoded: string): Erc7930Decoded | null {
  const hex = encoded.replace(/^0x/, "").toLowerCase();
  if (hex.length < 12 || !/^[0-9a-f]+$/.test(hex)) return null;
  if (hex.slice(0, 4) !== "0001") return null; // version 1 only
  if (hex.slice(4, 8) !== "0000") return null; // eip155 only
  const refLen = parseInt(hex.slice(8, 10), 16);
  const refEnd = 10 + refLen * 2;
  const ref = hex.slice(10, refEnd);
  const addrLen = parseInt(hex.slice(refEnd, refEnd + 2), 16);
  if (addrLen !== 20) return null;
  const addr = hex.slice(refEnd + 2, refEnd + 2 + 40);
  if (addr.length !== 40) return null;
  return { chainId: Number(BigInt(`0x${ref}`)), address: `0x${addr}` as Address };
}

/**
 * ENSIP-25 text record key.
 *
 * `agentId` is a registry-defined *string*. ENSIP-25 does not fix decimal vs
 * hex; every published example (ENSIP-25's own `167`, the ENS blog's `42`)
 * uses unpadded decimal, so that is what we emit — and `MiniAppRegistry`
 * documents the same convention on the registry side, which is what ENSIP-25
 * actually requires of a registry.
 */
export function agentRegistrationKey(
  registryChainId: number,
  registryAddress: string,
  agentId: number | bigint | string,
): string {
  const id = String(agentId);
  if (id.includes("[") || id.includes("]")) {
    throw new Error("ENSIP-25: agentId MUST NOT contain '[' or ']'");
  }
  return `agent-registration[${erc7930Eip155(registryChainId, registryAddress)}][${id}]`;
}

/** ENSIP-25: the value carries no meaning; presence of a non-empty string does. */
export const AGENT_REGISTRATION_VALUE = "1";

/** ENSIP-26 named protocols. The list is open, but these three are specified. */
export const AGENT_PROTOCOLS = ["web", "mcp", "a2a"] as const;
export type AgentProtocol = (typeof AGENT_PROTOCOLS)[number];

export function agentEndpointKey(protocol: AgentProtocol | string): string {
  return `agent-endpoint[${protocol}]`;
}

/* ========================================================================== */
/* contenthash (ENSIP-7)                                                      */
/* ========================================================================== */

function varint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

const B32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32Decode(input: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`contenthash: bad base32 char "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of input) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`contenthash: bad base58 char "${ch}"`);
    let carry = idx;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of input) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

/**
 * ENSIP-7 contenthash for an IPFS CID.
 * Layout: `<varint protoCode = 0xe3><cid bytes>`.
 * A CIDv1 already carries its own version+codec prefix; a CIDv0 (`Qm…`) is a
 * bare dag-pb multihash and gets `0x01 0x70` prepended to lift it to v1.
 */
export function encodeIpfsContenthash(cidOrUri: string): Hex {
  const cid = cidOrUri.replace(/^ipfs:\/\//, "").split("/")[0];
  let cidBytes: Uint8Array;
  if (cid.startsWith("Qm")) {
    const mh = base58Decode(cid);
    cidBytes = new Uint8Array(2 + mh.length);
    cidBytes.set([0x01, 0x70], 0);
    cidBytes.set(mh, 2);
  } else if (cid.startsWith("b")) {
    cidBytes = base32Decode(cid.slice(1));
  } else {
    throw new Error(`contenthash: unrecognised CID "${cid}"`);
  }
  const proto = varint(0xe3);
  const out = new Uint8Array(proto.length + cidBytes.length);
  out.set(proto, 0);
  out.set(cidBytes, proto.length);
  return toHex(out);
}

/**
 * Inverse of {@link encodeIpfsContenthash}. Returns `ipfs://<cid>` or null.
 *
 * The IPFS protoCode 0xe3 is a *two-byte* varint (`0xe3 0x01`) — dropping only
 * the first byte leaves a stray 0x01 in front of the CID and produces a
 * plausible-looking string that resolves to nothing.
 */
export function decodeIpfsContenthash(hex: string): string | null {
  if (!hex || hex === "0x") return null;
  const bytes = hexToBytes(hex);
  // Read the leading varint.
  let i = 0;
  let proto = 0;
  let shift = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    proto |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  if (proto !== 0xe3 || i >= bytes.length) return null;
  return `ipfs://b${base32Encode(bytes.slice(i))}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/* ========================================================================== */
/* agent-context (ENSIP-26)                                                   */
/* ========================================================================== */

function yamlScalar(v: string): string {
  if (v === "") return '""';
  if (/^[A-Za-z0-9][A-Za-z0-9 ._\-/:@]*$/.test(v) && !/: |\s#/.test(v)) return v;
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(indent: string, items: string[]): string {
  if (items.length === 0) return " []";
  return `\n${items.map((i) => `${indent}- ${yamlScalar(i)}`).join("\n")}`;
}

/**
 * The `agent-context` body. This is the record an autonomous agent reads to
 * decide whether it can use this mini app, so it answers exactly four
 * questions and nothing else: what does it do, what data does it stand on,
 * what can it spend, and how do I run it again.
 *
 * Deliberately capped in size — text records are stored bytes, and an offchain
 * gateway is not a place to put a manifest. The manifest lives in
 * `contenthash`; this is the summary that tells you whether to fetch it.
 */
export function buildAgentContext(
  manifest: Manifest,
  endpoints: AgentEndpoints,
  manifestCid?: string | null,
): string {
  const { agency, data } = manifest;
  const p = agency.policy;
  const actionLabels = Object.values(agency.actions).map((a) => `${a.kind}: ${a.label}`);
  const triggers = agency.triggers.map((t) =>
    t.on === "interval" ? `interval ${t.intervalSec ?? "?"}s -> ${t.run}` : `${t.on} -> ${t.run}`,
  );
  const healthy = data.sources.filter((s) => s.healthy).length;

  const lines = [
    `# ${manifest.title}`,
    `spec: graphmini/2`,
    `name: ${yamlScalar(manifest.name)}`,
    `title: ${yamlScalar(manifest.title)}`,
    `intent: ${yamlScalar(manifest.intent)}`,
    `category: ${yamlScalar(manifest.category)}`,
    `version: ${yamlScalar(manifest.appVersion)}`,
    manifest.forkedFrom ? `forked_from: ${yamlScalar(manifest.forkedFrom)}` : null,
    ``,
    `data:`,
    `  source: The Graph (Messari standardized subgraphs)`,
    `  schemas:${yamlList("    ", [...data.schemas])}`,
    `  networks:${yamlList("    ", [...data.networks])}`,
    `  deployments: ${healthy} healthy of ${data.sources.length} resolved`,
    `  transport: ${yamlScalar(data.transport)}`,
    `  streaming: ${data.stream ? yamlScalar(`${data.stream.package}#${data.stream.module}`) : "none"}`,
    ``,
    `capabilities:`,
    `  tier: ${yamlScalar(agency.tier)}`,
    `  queries:${yamlList("    ", Object.keys(data.queries))}`,
    `  actions:${yamlList("    ", actionLabels)}`,
    `  triggers:${yamlList("    ", triggers)}`,
    ``,
    `spend_policy:`,
    `  # Enforced at the signer, not by the model. An empty allowlist means`,
    `  # no actions are possible regardless of what the UI offers.`,
    `  wallet: ${p.wallet ? yamlScalar(p.wallet) : "none"}`,
    `  max_spend_usd: ${p.maxSpendUsd}`,
    `  max_per_tx_usd: ${p.maxPerTxUsd}`,
    `  allowlist:${yamlList("    ", p.allowlist)}`,
    `  requires_confirmation: ${p.requireConfirm}`,
    `  kill_switch: ${p.killSwitch}`,
    `  halted: ${p.halted}`,
    `  expires_at: ${p.expiresAt ? yamlScalar(p.expiresAt) : "never"}`,
    ``,
    `provenance:`,
    `  model: ${yamlScalar(manifest.provenance.model)}`,
    `  compute: ${yamlScalar(manifest.provenance.compute)}`,
    `  attestation: ${manifest.provenance.attestationRef ? yamlScalar(manifest.provenance.attestationRef) : "none"}`,
    `  author: ${manifest.author ? yamlScalar(manifest.author) : "unattributed"}`,
    ``,
    `run:`,
    `  # Resolve this name's contenthash to get the full manifest, then re-run`,
    `  # the plan against live data. A resolved mini app is live, not cached.`,
    `  manifest: ${(() => {
      const cid = manifestCid ?? manifest.identity.manifestCid;
      return cid ? `ipfs://${cid}` : "see contenthash record";
    })()}`,
    `  web: ${yamlScalar(endpoints.web)}`,
    endpoints.mcp ? `  mcp: ${yamlScalar(endpoints.mcp)}` : null,
    endpoints.a2a ? `  a2a: ${yamlScalar(endpoints.a2a)}` : null,
  ].filter((l): l is string => l !== null);

  return lines.join("\n");
}

/* ========================================================================== */
/* record set                                                                 */
/* ========================================================================== */

export interface AgentEndpoints {
  web: string;
  mcp?: string;
  a2a?: string;
}

export interface AgenticIdRef {
  chainId: number;
  /** The MiniAppRegistry address — the ENSIP-25 "registry" for these agents. */
  registry: Address;
  /** ENSIP-25 defines `<agentId>` as a registry-defined *string*; we emit
   *  unpadded decimal, and accept a string so a key parsed back off a resolver
   *  round-trips to the identical key. */
  tokenId: number | bigint | string;
}

export interface EnsRecordSet {
  /** ENSIP-1/9 — the mini app's own wallet. */
  addr: Address | null;
  /** ENSIP-7 — `ipfs://<manifest cid>`. */
  contenthash: string | null;
  /** ENSIP-5 text records, including ENSIP-25/26 agent keys. */
  texts: Record<string, string>;
}

export interface BuildRecordsInput {
  manifest: Manifest;
  /** The mini app's wallet. Falls back to `manifest.agency.policy.wallet`. */
  walletAddress?: string | null;
  manifestCid: string | null;
  endpoints: AgentEndpoints;
  agenticId?: AgenticIdRef | null;
  avatarUrl?: string | null;
}

/**
 * The complete record set for a published mini app. Exactly the table in
 * prd.md §8 — no extra keys, no renamed keys.
 */
export function buildRecordSet(input: BuildRecordsInput): EnsRecordSet {
  const { manifest, manifestCid, endpoints, agenticId } = input;
  const wallet = input.walletAddress ?? manifest.agency.policy.wallet;

  const texts: Record<string, string> = {
    // ENSIP-5 profile — what a generic ENS client shows.
    url: endpoints.web,
    description: `${manifest.title} — ${manifest.intent}`.slice(0, 280),
    // ENSIP-26 agent records.
    "agent-context": buildAgentContext(manifest, endpoints, manifestCid),
    [agentEndpointKey("web")]: endpoints.web,
  };

  if (input.avatarUrl) texts.avatar = input.avatarUrl;
  if (endpoints.mcp) texts[agentEndpointKey("mcp")] = endpoints.mcp;
  if (endpoints.a2a) texts[agentEndpointKey("a2a")] = endpoints.a2a;

  // Non-standard but useful, and namespaced so it can never collide with a
  // future ENSIP: our own quick-look keys for the registry grid.
  texts["graphmini.tier"] = manifest.agency.tier;
  texts["graphmini.schemas"] = manifest.data.schemas.join(",");
  texts["graphmini.version"] = manifest.appVersion;
  if (manifest.forkedFrom) texts["graphmini.forked-from"] = manifest.forkedFrom;

  // ENSIP-25 — the binding to the Agentic ID token on 0G Chain. This is the
  // forward half of the mutual proof; MiniAppRegistry holds the reverse half.
  if (agenticId) {
    texts[agentRegistrationKey(agenticId.chainId, agenticId.registry, agenticId.tokenId)] =
      AGENT_REGISTRATION_VALUE;
    // A discovery pointer, and the reason it has to exist: ENS resolvers do
    // not enumerate text records, so a client that does not already know the
    // registry and token id cannot construct the ENSIP-25 key to ask for. The
    // spec assumes you obtained both from the registry side (its verification
    // flow starts there); this record lets a pure-ENS client get there too.
    // It is a *pointer*, not the attestation — the ENSIP-25 record remains the
    // only thing a verifier trusts.
    texts[AGENTIC_ID_POINTER_KEY] = agenticIdPointer(agenticId);
  }

  return {
    addr: (wallet as Address | null) ?? null,
    contenthash: manifestCid ? `ipfs://${manifestCid}` : null,
    texts,
  };
}

/**
 * Namespaced pointer to the Agentic ID, in CAIP-10-shaped form:
 * `eip155:16602:0x<registry>/<tokenId>`. Not an ENS standard, and deliberately
 * prefixed so it can never collide with a future ENSIP.
 */
export const AGENTIC_ID_POINTER_KEY = "graphmini.agentic-id";

export function agenticIdPointer(ref: AgenticIdRef): string {
  return `eip155:${ref.chainId}:${ref.registry.toLowerCase()}/${ref.tokenId}`;
}

export function parseAgenticIdPointer(value: string): AgenticIdRef | null {
  const m = value.trim().match(/^eip155:(\d+):(0x[0-9a-fA-F]{40})\/([^/\s[\]]+)$/);
  if (!m) return null;
  return { chainId: Number(m[1]), registry: m[2].toLowerCase() as Address, tokenId: m[3] };
}

/** Pull the ENSIP-25 keys out of a record set, parsed. */
export function parseAgentRegistrations(
  texts: Record<string, string>,
): { registry: Hex; agentId: string; value: string }[] {
  const out: { registry: Hex; agentId: string; value: string }[] = [];
  for (const [key, value] of Object.entries(texts)) {
    const m = key.match(/^agent-registration\[(0x[0-9a-fA-F]+)\]\[([^\][]+)\]$/);
    if (m && value !== "") {
      out.push({ registry: m[1].toLowerCase() as Hex, agentId: m[2], value });
    }
  }
  return out;
}

/* ========================================================================== */
/* backend interface                                                          */
/* ========================================================================== */

export const ENS_REGISTRAR_MODES = ["namespace", "namestone", "onchain", "mock"] as const;
export type EnsRegistrarMode = (typeof ENS_REGISTRAR_MODES)[number];

export interface IssueResult {
  /** Fully qualified, e.g. `aave-guard.graphminis.eth`. */
  name: string;
  label: string;
  parent: string;
  mode: EnsRegistrarMode;
  /** Set when issuance touched a chain. Null for offchain/gasless paths. */
  txHash: string | null;
  /** False when the name exists only in this process (mock). */
  live: boolean;
}

export interface ReadResult {
  name: string;
  addr: Address | null;
  contenthash: string | null;
  texts: Record<string, string>;
  resolver: Address | null;
  source: EnsRegistrarMode | "resolver";
}

export interface EnsBackend {
  readonly mode: EnsRegistrarMode;
  readonly parent: string;
  /** True when this backend has everything it needs to write for real. */
  readonly configured: boolean;
  isAvailable(label: string): Promise<boolean>;
  issue(label: string, records: EnsRecordSet): Promise<IssueResult>;
  setRecords(label: string, records: EnsRecordSet): Promise<{ txHash: string | null }>;
  read(name: string): Promise<ReadResult | null>;
}

/* -------------------------------------------------------------------------- */
/* label validation                                                           */
/* -------------------------------------------------------------------------- */

/** Matches `zManifest.name` — an ENS label we are willing to mint. */
export const LABEL_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export function assertLabel(label: string): void {
  if (!LABEL_RE.test(label)) {
    throw new Error(
      `"${label}" is not a valid mini app label: lowercase a-z, 0-9 and hyphens, 3-32 chars, no leading/trailing hyphen.`,
    );
  }
  if (label.startsWith("xn--") || label.includes("--")) {
    // Reject punycode-lookalikes outright rather than trying to normalise.
    throw new Error(`"${label}" contains a reserved hyphen sequence.`);
  }
}

export function parentDomain(): string {
  return (process.env.ENS_PARENT_DOMAIN ?? "graphminis.eth").toLowerCase();
}

export function fullName(label: string): string {
  return `${label}.${parentDomain()}`;
}

/** Split `aave-guard.graphminis.eth` into label + parent. */
export function splitName(name: string): { label: string; parent: string } {
  const parts = name.toLowerCase().trim().replace(/\.$/, "").split(".");
  if (parts.length < 3) return { label: parts[0] ?? "", parent: parts.slice(1).join(".") };
  return { label: parts[0], parent: parts.slice(1).join(".") };
}

/* ========================================================================== */
/* mock backend                                                               */
/* ========================================================================== */

interface MockEntry {
  name: string;
  records: EnsRecordSet;
  issuedAt: string;
}

/** Process-local name store. Not persisted — this is a demo fallback. */
const mockNames = new Map<string, MockEntry>();

class MockBackend implements EnsBackend {
  readonly mode = "mock" as const;
  readonly configured = true;
  constructor(readonly parent: string) {}

  async isAvailable(label: string): Promise<boolean> {
    return !mockNames.has(`${label}.${this.parent}`);
  }

  async issue(label: string, records: EnsRecordSet): Promise<IssueResult> {
    assertLabel(label);
    const name = `${label}.${this.parent}`;
    if (mockNames.has(name)) throw new Error(`${name} is already taken.`);
    mockNames.set(name, { name, records, issuedAt: new Date().toISOString() });
    return { name, label, parent: this.parent, mode: "mock", txHash: null, live: false };
  }

  async setRecords(label: string, records: EnsRecordSet): Promise<{ txHash: null }> {
    const name = `${label}.${this.parent}`;
    const existing = mockNames.get(name);
    mockNames.set(name, {
      name,
      records,
      issuedAt: existing?.issuedAt ?? new Date().toISOString(),
    });
    return { txHash: null };
  }

  async read(name: string): Promise<ReadResult | null> {
    const hit = mockNames.get(name.toLowerCase());
    if (!hit) return null;
    return {
      name: hit.name,
      addr: hit.records.addr,
      contenthash: hit.records.contenthash,
      texts: hit.records.texts,
      resolver: null,
      source: "mock",
    };
  }
}

/* ========================================================================== */
/* Namespace backend (offchain, CCIP-Read) — the default live path            */
/* ========================================================================== */

interface NamespaceSubname {
  id: string;
  fullName: string;
  parentName: string;
  label: string;
  texts: Record<string, string>;
  /** Keyed by coin symbol, e.g. `{ ETH: "0x…" }`. */
  addresses: Record<string, string>;
  metadata: Record<string, string>;
  contenthash?: string;
  namehash: string;
}

/**
 * Namespace — gasless offchain subnames served over CCIP-Read.
 *
 * ### Why this and not NameStone
 *
 * NameStone announced on 2026-07-14 that it shuts down **2026-08-03**. It
 * still works today and the adapter below is kept, but building the demo on a
 * service with a published end date is not a decision worth defending. Durin
 * inherits the same risk — `resolverworks/durin` now redirects to
 * `namestonehq/durin` and its gateway is NameStone-operated.
 *
 * Namespace has none of that: SDK published 2026-05-01, live docs, a
 * self-serve key, and a plain `x-auth-token` header with no SIWE handshake
 * (which is what puts JustaName an hour behind it).
 *
 * ### To go live
 *
 *   1. Own the parent 2LD. On **Sepolia** see `SEPOLIA_PARENT_REGISTRATION`
 *      below — the documented controller reverts.
 *   2. In app.namespace.ninja, point the parent's resolver at Namespace's
 *      hybrid resolver. **Nothing resolves until this lands.**
 *   3. Get a key at app.namespace.ninja/offchain?activeTab=apiKeys.
 *   4. `ENS_REGISTRAR_MODE=namespace`, `NAMESPACE_API_KEY=…`.
 *
 * Free tier is 2,000 subnames per parent.
 *
 * ### Records
 *
 * Text keys are `string`, 1–255 chars, with no pattern validation — which is
 * exactly why the bracketed ENSIP-25/26 keys work. `contenthash` is a
 * first-class field taking an `ipfs://` URI. `addresses[]` carries `addr` as
 * coin type 60.
 */
class NamespaceBackend implements EnsBackend {
  readonly mode = "namespace" as const;
  private readonly base: string;

  constructor(
    readonly parent: string,
    private readonly apiKey: string,
  ) {
    // Staging serves Sepolia; production serves mainnet. There is no
    // per-request network field — the host IS the network selector.
    const fallback =
      ensChainKey() === "mainnet"
        ? "https://offchain-manager.namespace.ninja"
        : "https://staging.offchain-manager.namespace.ninja";
    this.base = (process.env.NAMESPACE_API_URL ?? fallback).replace(/\/$/, "");
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  private headers(): Record<string, string> {
    return { "x-auth-token": this.apiKey, "content-type": "application/json" };
  }

  private body(label: string, records: EnsRecordSet) {
    return {
      parentName: this.parent,
      label,
      texts: Object.entries(records.texts).map(([key, value]) => ({ key, value })),
      addresses: records.addr ? [{ coin: 60, value: records.addr }] : [],
      contenthash: records.contenthash ?? undefined,
      owner: process.env.ENS_SUBNAME_OWNER ?? undefined,
      ttl: 3600,
    };
  }

  async isAvailable(label: string): Promise<boolean> {
    const res = await fetch(
      `${this.base}/api/v1/subnames/${encodeURIComponent(`${label}.${this.parent}`)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (!res) return true; // a lookup failure must not block issuance
    return res.status === 404;
  }

  async issue(label: string, records: EnsRecordSet): Promise<IssueResult> {
    assertLabel(label);
    await this.upsert(label, records);
    return {
      name: `${label}.${this.parent}`,
      label,
      parent: this.parent,
      mode: "namespace",
      txHash: null, // gasless by design — CCIP-Read, no transaction
      live: true,
    };
  }

  async setRecords(label: string, records: EnsRecordSet): Promise<{ txHash: null }> {
    await this.upsert(label, records);
    return { txHash: null };
  }

  /**
   * The OpenAPI summary says "Create or update", but the same operation
   * documents a 409 for an existing subname. Rather than guess at an
   * undocumented update verb, a 409 is handled with DELETE + POST — both
   * confirmed endpoints — so a republish always converges.
   */
  private async upsert(label: string, records: EnsRecordSet): Promise<void> {
    const full = `${label}.${this.parent}`;
    const post = () =>
      fetch(`${this.base}/api/v1/subnames`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.body(label, records)),
        signal: AbortSignal.timeout(20_000),
      });

    let res = await post();
    if (res.status === 409) {
      await fetch(`${this.base}/api/v1/subnames/${encodeURIComponent(full)}`, {
        method: "DELETE",
        headers: this.headers(),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      res = await post();
    }
    if (!res.ok) {
      throw new Error(
        `namespace POST /subnames: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
  }

  async read(name: string): Promise<ReadResult | null> {
    const res = await fetch(
      `${this.base}/api/v1/subnames/${encodeURIComponent(name)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (!res || !res.ok) return null;
    const body = (await res.json()) as NamespaceSubname;
    const addr = body.addresses?.ETH ?? body.addresses?.["60"] ?? null;
    return {
      name: body.fullName,
      addr: (addr as Address | null) ?? null,
      contenthash: body.contenthash ?? null,
      texts: body.texts ?? {},
      resolver: null,
      source: "namespace",
    };
  }
}

/* ========================================================================== */
/* NameStone backend (offchain, CCIP-Read) — kept as a fallback               */
/* ========================================================================== */

interface NameStoneTextRecord {
  key: string;
  value: string;
}

interface NameStoneName {
  name: string;
  domain: string;
  address?: string;
  contenthash?: string;
  /** `get-names` returns `text_records`; `search-names` returns `textRecords`. */
  text_records?: Record<string, string> | NameStoneTextRecord[];
  textRecords?: Record<string, string> | NameStoneTextRecord[];
}

/**
 * NameStone issues gasless subnames under a domain you control, served to the
 * whole ENS ecosystem through a CCIP-Read offchain resolver. Records live in
 * NameStone's DB; resolution is real ENS resolution — any wallet, any client
 * that follows an `OffchainLookup` revert, which is all of them.
 *
 * ### To go live
 *
 *   1. Get an API key — namestone.com/try-namestone, or the ENS booth.
 *   2. Point the parent 2LD's resolver at NameStone's offchain resolver.
 *   3. Set `NAMESTONE_API_KEY` and `ENS_PARENT_DOMAIN`.
 *
 * That is the whole list. No contract deploy, no gas, no waiting for a block.
 *
 * ### ⚠️ NameStone shuts down 2026-08-03
 *
 * Announced 2026-07-14, sitewide banner. This adapter still works and is kept
 * so a NameStone key issued at the event is usable, but it is no longer the
 * default — see `NamespaceBackend`. Do not build a demo on it if the demo is
 * on or after that date.
 *
 * ### Three things worth knowing
 *
 * - **Sepolia is a different BASE PATH, not a query parameter.** Mainnet is
 *   `/api/public_v1`; Sepolia is `/api/public_v1_sepolia`. Getting this wrong
 *   does not error — it silently writes your testnet names to **mainnet**.
 * - **Arbitrary text record keys are supported.** `set-name` loops over
 *   `text_records` and inserts raw rows: no whitelist, no charset check. That
 *   is what makes the bracketed ENSIP-25/26 keys work here at all.
 * - **`set-name` is replace, not merge.** It deletes every existing text
 *   record and coin type, then reinserts. Always send the complete record set.
 */
class NameStoneBackend implements EnsBackend {
  readonly mode = "namestone" as const;
  private readonly base: string;

  constructor(
    readonly parent: string,
    private readonly apiKey: string,
  ) {
    const fallback =
      ensChainKey() === "mainnet"
        ? "https://namestone.com/api/public_v1"
        : "https://namestone.com/api/public_v1_sepolia";
    this.base = (process.env.NAMESTONE_API_URL ?? fallback).replace(/\/$/, "");
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  private url(path: string, query?: Record<string, string>): string {
    const qs = new URLSearchParams(query ?? {}).toString();
    return `${this.base}${path}${qs ? `?${qs}` : ""}`;
  }

  private headers(): Record<string, string> {
    // NameStone takes the raw key, not a `Bearer ` prefix.
    return { authorization: this.apiKey, "content-type": "application/json" };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(this.url(path), {
      ...init,
      headers: this.headers(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`namestone ${path}: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return (await res.json()) as T;
  }

  /** NameStone's payload shape: name + domain + address + text_records map. */
  private payload(label: string, records: EnsRecordSet) {
    const text_records = { ...records.texts };
    if (records.contenthash) text_records.contenthash = records.contenthash;
    return {
      domain: this.parent,
      name: label,
      address: records.addr ?? undefined,
      contenthash: records.contenthash ?? undefined,
      text_records,
    };
  }

  async isAvailable(label: string): Promise<boolean> {
    try {
      const rows = await this.searchName(label);
      return !rows.some((r) => r.name.toLowerCase() === label.toLowerCase());
    } catch {
      // A search failure must not block issuance; set-name is idempotent
      // upstream and will surface a real conflict.
      return true;
    }
  }

  /**
   * `/search-names` with `exact_match=1`. `/get-names` has no `name`
   * parameter — it pages the whole domain — so using it here would silently
   * miss any app past the first 50 once the registry has a few entries.
   */
  private async searchName(label: string): Promise<NameStoneName[]> {
    const res = await fetch(
      this.url("/search-names", {
        domain: this.parent,
        name: label,
        exact_match: "1",
        text_records: "1",
      }),
      { headers: this.headers(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as NameStoneName[] | { names?: NameStoneName[] };
    return Array.isArray(body) ? body : (body.names ?? []);
  }

  async issue(label: string, records: EnsRecordSet): Promise<IssueResult> {
    assertLabel(label);
    await this.request<unknown>("/set-name", {
      method: "POST",
      body: JSON.stringify(this.payload(label, records)),
    });
    return {
      name: `${label}.${this.parent}`,
      label,
      parent: this.parent,
      mode: "namestone",
      txHash: null, // gasless by design — offchain CCIP-Read, no transaction
      live: true,
    };
  }

  async setRecords(label: string, records: EnsRecordSet): Promise<{ txHash: null }> {
    await this.request<unknown>("/set-name", {
      method: "POST",
      body: JSON.stringify(this.payload(label, records)),
    });
    return { txHash: null };
  }

  async read(name: string): Promise<ReadResult | null> {
    const { label } = splitName(name);
    const rows = await this.searchName(label);
    const hit = rows.find((r) => r.name.toLowerCase() === label.toLowerCase());
    if (!hit) return null;
    const texts: Record<string, string> = {};
    const raw = hit.text_records ?? hit.textRecords;
    if (Array.isArray(raw)) {
      for (const t of raw) texts[t.key] = t.value;
    } else if (raw) {
      Object.assign(texts, raw);
    }
    return {
      name,
      addr: (hit.address as Address | undefined) ?? null,
      contenthash: hit.contenthash ?? texts.contenthash ?? null,
      texts,
      resolver: null,
      source: "namestone",
    };
  }
}

/* ========================================================================== */
/* onchain backend (NameWrapper + PublicResolver, Sepolia)                    */
/* ========================================================================== */

/**
 * Sepolia deployments. Testnet by default, always — a mini app that can spend
 * has no business defaulting to mainnet. `ENS_CHAIN=mainnet` is the only way
 * to get the mainnet addresses, and it is never inferred.
 */
const ENS_DEPLOYMENTS = {
  sepolia: {
    chain: sepolia,
    nameWrapper: "0x0635513f179D50A207757E05759CbD106d7dFcE8" as Address,
    publicResolver: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as Address,
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address,
    ethRegistrarController: "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968" as Address,
    universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" as Address,
  },
  mainnet: {
    chain: mainnet,
    nameWrapper: "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401" as Address,
    publicResolver: "0xF29100983E058B709F3D539b0c765937B804AC15" as Address,
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address,
    ethRegistrarController: "0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547" as Address,
    universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" as Address,
  },
} as const;

/** Exported so the Studio can link a name to the ENS manager app. */
export function ensDeployment(key: EnsChainKey = ensChainKey()) {
  return ENS_DEPLOYMENTS[key];
}

/**
 * ⚠️ **Registering the parent 2LD on Sepolia does not work the documented way.**
 *
 * `ETHRegistrarController` (`0xfb3c…f968`) is **not** an authorised controller
 * on Sepolia's `BaseRegistrarImplementation` — `controllers()` returns false
 * for it, so `register()` reverts. `available()` still returns true, so there
 * is no warning until the transaction burns gas, and `sepolia.app.ens.domains`
 * cannot complete a registration either.
 *
 * The controller that *is* authorised:
 *
 *   TestnetV1PremigrationRegistrar  0xdf60C561Ca35AD3C89D24BbA854654b1c3477078
 *
 * Free, no commit/reveal (single transaction), minimum 28 days, label ≥ 3
 * chars, same `register(Registration)` selector as the real controller.
 *
 * Three traps when using it:
 *
 *   1. Pass `resolver`, but leave `data: []`. A populated `data[]` reverts —
 *      it assigns ownership to `registration.owner` *before* running the
 *      resolver multicall, so the authorisation check fails. Set records in a
 *      follow-up transaction.
 *   2. Names come out **unwrapped**. `NameWrapper.setSubnodeRecord` on a fresh
 *      parent reverts with `Unauthorised`. Either wrap it first, or issue
 *      subnames through the registry instead.
 *   3. It is testnet-only and not in the ENS docs. Verify it still answers
 *      before relying on it.
 *
 * This is an operator step, not something this file does — it is recorded here
 * because it is the single most likely way to lose an hour.
 */
export const SEPOLIA_PARENT_REGISTRATION = {
  registrar: "0xdf60C561Ca35AD3C89D24BbA854654b1c3477078" as Address,
  note: "ETHRegistrarController is not an authorised controller on Sepolia; register() reverts.",
} as const;

export type EnsChainKey = keyof typeof ENS_DEPLOYMENTS;

export function ensChainKey(): EnsChainKey {
  return process.env.ENS_CHAIN === "mainnet" ? "mainnet" : "sepolia";
}

const NAME_WRAPPER_ABI = [
  {
    type: "function",
    name: "setSubnodeRecord",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
      { name: "fuses", type: "uint32" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [{ name: "node", type: "bytes32" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

const PUBLIC_RESOLVER_ABI = [
  {
    type: "function",
    name: "setAddr",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "a", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setContenthash",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "hash", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

/**
 * Onchain subnames. Slower (~24s for a name plus its records on Sepolia) and
 * needs a funded key, but every record is where a sceptical judge expects it:
 * in the PublicResolver, readable by any client with no gateway in the path.
 *
 * Requires the parent 2LD wrapped in NameWrapper and owned by
 * `ENS_REGISTRAR_PRIVATE_KEY`. See `SEPOLIA_PARENT_REGISTRATION` for how to
 * get the parent in the first place — the documented path reverts.
 *
 * ### The authorisation trap this deliberately avoids
 *
 * `PublicResolver.isAuthorised` checks the **subname's** owner, and its
 * approval maps are PublicResolver's own — *not* NameWrapper's. So the parent
 * owner cannot write records for a subname owned by someone else; that call
 * reverts.
 *
 * The consequence is that you cannot mint a subname straight to a user's
 * wallet and then have the backend populate it. `issue()` therefore mints to
 * the backend wallet, writes every record, and leaves ownership there; a
 * later `setSubnodeOwner` can hand it to the user once the records exist.
 * Doing it in the other order looks fine right up until `setText` reverts.
 */
class OnchainBackend implements EnsBackend {
  readonly mode = "onchain" as const;
  private readonly deployment;
  private readonly publicClient: PublicClient;

  constructor(
    readonly parent: string,
    private readonly privateKey: string | undefined,
    private readonly rpcUrl: string | undefined,
  ) {
    const key = ensChainKey();
    this.deployment = ENS_DEPLOYMENTS[key];
    // Cast: viem's generic PublicClient is invariant over transport/chain and
    // we only ever use chain-agnostic actions here.
    this.publicClient = createPublicClient({
      chain: this.deployment.chain,
      transport: http(rpcUrl),
    }) as unknown as PublicClient;
  }

  get configured(): boolean {
    return Boolean(this.privateKey);
  }

  private wallet() {
    if (!this.privateKey) {
      throw new Error("ENS_REGISTRAR_PRIVATE_KEY is required for ENS_REGISTRAR_MODE=onchain");
    }
    const account = privateKeyToAccount(
      (this.privateKey.startsWith("0x") ? this.privateKey : `0x${this.privateKey}`) as Hex,
    );
    return createWalletClient({
      account,
      chain: this.deployment.chain,
      transport: http(this.rpcUrl),
    });
  }

  async isAvailable(label: string): Promise<boolean> {
    const node = namehash(`${label}.${this.parent}`);
    try {
      const owner = await this.publicClient.readContract({
        address: this.deployment.nameWrapper,
        abi: NAME_WRAPPER_ABI,
        functionName: "ownerOf",
        args: [BigInt(node)],
      });
      return owner === "0x0000000000000000000000000000000000000000";
    } catch {
      return true;
    }
  }

  async issue(label: string, records: EnsRecordSet): Promise<IssueResult> {
    assertLabel(label);
    const wallet = this.wallet();
    const parentNode = namehash(this.parent);
    const hash = await wallet.writeContract({
      address: this.deployment.nameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: "setSubnodeRecord",
      args: [
        parentNode,
        label,
        wallet.account.address,
        this.deployment.publicResolver,
        0n,
        0, // no fuses burned — the parent must stay able to fix a bad name
        0n, // inherit the parent's expiry
      ],
      chain: this.deployment.chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    const { txHash } = await this.setRecords(label, records);
    return {
      name: `${label}.${this.parent}`,
      label,
      parent: this.parent,
      mode: "onchain",
      txHash: txHash ?? hash,
      live: true,
    };
  }

  async setRecords(label: string, records: EnsRecordSet): Promise<{ txHash: string | null }> {
    const wallet = this.wallet();
    const node = namehash(`${label}.${this.parent}`);
    const { encodeFunctionData } = await import("viem");

    const calls: Hex[] = [];
    if (records.addr) {
      calls.push(
        encodeFunctionData({
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "setAddr",
          args: [node, records.addr],
        }),
      );
    }
    if (records.contenthash) {
      calls.push(
        encodeFunctionData({
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "setContenthash",
          args: [node, encodeIpfsContenthash(records.contenthash)],
        }),
      );
    }
    for (const [key, value] of Object.entries(records.texts)) {
      calls.push(
        encodeFunctionData({
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "setText",
          args: [node, key, value],
        }),
      );
    }
    if (calls.length === 0) return { txHash: null };

    const hash = await wallet.writeContract({
      address: this.deployment.publicResolver,
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "multicall",
      args: [calls],
      chain: this.deployment.chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return { txHash: hash };
  }

  async read(name: string): Promise<ReadResult | null> {
    return readViaResolver(name, this.publicClient);
  }
}

/* ========================================================================== */
/* resolver-based reads (backend independent)                                 */
/* ========================================================================== */

/** The text keys we always try to read back. Resolvers have no enumeration. */
export function expectedTextKeys(agenticId?: AgenticIdRef | null): string[] {
  const keys = [
    "url",
    "description",
    "avatar",
    "agent-context",
    agentEndpointKey("web"),
    agentEndpointKey("mcp"),
    agentEndpointKey("a2a"),
    "graphmini.tier",
    "graphmini.schemas",
    "graphmini.version",
    "graphmini.forked-from",
    AGENTIC_ID_POINTER_KEY,
    // Mirrored by some offchain registrars; harmless when absent.
    "contenthash",
  ];
  if (agenticId) {
    keys.push(agentRegistrationKey(agenticId.chainId, agenticId.registry, agenticId.tokenId));
  }
  return keys;
}

const CONTENTHASH_ABI = [
  {
    type: "function",
    name: "contenthash",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/**
 * `contenthash` is NOT a text record — it is `contenthash(bytes32)` on the
 * resolver (ENSIP-7), returning ENSIP-7 bytes, not a string. Reading it with
 * `getEnsText` returns nothing and makes a published app look unresolvable.
 *
 * viem's `readContract` follows an `OffchainLookup` revert automatically, so
 * this one call covers onchain resolvers and CCIP-Read gateways alike.
 */
async function readContenthash(
  name: string,
  client: PublicClient,
): Promise<{ uri: string | null; resolver: Address | null }> {
  try {
    const resolver = await client.getEnsResolver({ name });
    if (!resolver) return { uri: null, resolver: null };
    const raw = await client.readContract({
      address: resolver,
      abi: CONTENTHASH_ABI,
      functionName: "contenthash",
      args: [namehash(name)],
    });
    return { uri: decodeIpfsContenthash(raw), resolver };
  } catch {
    return { uri: null, resolver: null };
  }
}

/**
 * Read through a real ENS resolver. Works for offchain CCIP-Read names too —
 * viem follows the OffchainLookup revert automatically — which is precisely
 * why offchain issuance still counts as ENS resolution.
 */
export async function readViaResolver(
  name: string,
  client: PublicClient,
  extraKeys: string[] = [],
): Promise<ReadResult | null> {
  const keys = [...new Set([...expectedTextKeys(), ...extraKeys])];
  try {
    const [addr, content, ...textValues] = await Promise.all([
      client.getEnsAddress({ name }).catch(() => null),
      readContenthash(name, client),
      ...keys.map((key) => client.getEnsText({ name, key }).catch(() => null)),
    ]);

    const texts: Record<string, string> = {};
    keys.forEach((key, i) => {
      const v = textValues[i];
      if (typeof v === "string" && v.length > 0) texts[key] = v;
    });

    // Belt and braces: some offchain registrars also mirror the contenthash
    // into a text record. Prefer the real ENSIP-7 record when both exist.
    const contenthash = content.uri ?? texts.contenthash ?? null;

    if (!addr && !contenthash && Object.keys(texts).length === 0) return null;

    return {
      name,
      addr: addr ?? null,
      contenthash,
      texts,
      resolver: content.resolver,
      source: "resolver",
    };
  } catch {
    return null;
  }
}

/** A read-only client for the configured ENS chain, or null with no RPC. */
export function ensPublicClient(): PublicClient | null {
  const key = ensChainKey();
  const rpc = process.env.ENS_RPC_URL;
  const deployment = ENS_DEPLOYMENTS[key];
  if (!rpc && key === "sepolia") {
    // viem falls back to the chain's public RPC. Fine for a demo read path.
    return createPublicClient({
      chain: deployment.chain,
      transport: http(),
    }) as unknown as PublicClient;
  }
  if (!rpc) return null;
  return createPublicClient({
    chain: deployment.chain,
    transport: http(rpc),
  }) as unknown as PublicClient;
}

/* ========================================================================== */
/* selection + verification                                                   */
/* ========================================================================== */

/**
 * A configured backend always beats an unconfigured one. Asking for
 * `namespace` with no key silently falling back to `mock` is the right
 * behaviour for a demo — a publish that half-works and reports why beats a
 * publish that throws.
 */
export function resolveRegistrarMode(): EnsRegistrarMode {
  const raw = (process.env.ENS_REGISTRAR_MODE ?? "").toLowerCase();
  const hasNamespace = Boolean(process.env.NAMESPACE_API_KEY);
  const hasNamestone = Boolean(process.env.NAMESTONE_API_KEY);
  const hasOnchain = Boolean(process.env.ENS_REGISTRAR_PRIVATE_KEY);

  if (raw === "namespace") return hasNamespace ? "namespace" : "mock";
  if (raw === "namestone") return hasNamestone ? "namestone" : "mock";
  if (raw === "onchain") return hasOnchain ? "onchain" : "mock";
  if (raw === "mock") return "mock";

  // `offchain` is the spelling in .env.example and prd.md §8. Namespace is the
  // preferred offchain implementation; NameStone is the fallback because it
  // has a published shutdown date (2026-08-03).
  if (raw === "offchain") {
    if (hasNamespace) return "namespace";
    if (hasNamestone) return "namestone";
    return "mock";
  }

  // No explicit mode: the strongest backend that is actually configured.
  if (hasNamespace) return "namespace";
  if (hasNamestone) return "namestone";
  if (hasOnchain) return "onchain";
  return "mock";
}

let cachedBackend: EnsBackend | null = null;
let cachedBackendKey = "";

export function getEnsBackend(): EnsBackend {
  const mode = resolveRegistrarMode();
  const parent = parentDomain();
  const key = `${mode}:${parent}:${ensChainKey()}`;
  if (cachedBackend && cachedBackendKey === key) return cachedBackend;

  let backend: EnsBackend;
  if (mode === "namespace" && process.env.NAMESPACE_API_KEY) {
    backend = new NamespaceBackend(parent, process.env.NAMESPACE_API_KEY);
  } else if (mode === "namestone" && process.env.NAMESTONE_API_KEY) {
    backend = new NameStoneBackend(parent, process.env.NAMESTONE_API_KEY);
  } else if (mode === "onchain") {
    backend = new OnchainBackend(
      parent,
      process.env.ENS_REGISTRAR_PRIVATE_KEY,
      process.env.ENS_RPC_URL,
    );
  } else {
    backend = new MockBackend(parent);
  }
  cachedBackend = backend;
  cachedBackendKey = key;
  return backend;
}

/** Test seam — lets a caller inject a backend without touching process.env. */
export function __setEnsBackend(backend: EnsBackend | null): void {
  cachedBackend = backend;
  cachedBackendKey = backend ? `injected:${backend.mode}` : "";
}

/**
 * Read a name's records, preferring a real resolver and falling back to the
 * issuing backend. Order matters: if the name resolves publicly we want the
 * public answer, because that is what a judge's wallet will see.
 */
export async function readRecords(
  name: string,
  extraKeys: string[] = [],
): Promise<ReadResult | null> {
  const backend = getEnsBackend();
  if (backend.mode !== "mock") {
    const client = ensPublicClient();
    if (client) {
      const viaResolver = await readViaResolver(name, client, extraKeys);
      if (viaResolver) return viaResolver;
    }
  }
  return backend.read(name);
}

/**
 * Records plus the ENSIP-25 attestation, resolved in two passes.
 *
 * Pass 1 gets the pointer record. Pass 2 asks for the exact
 * `agent-registration[...]` key it names — which is the only way to read it,
 * since resolvers cannot enumerate. Backends that return their whole record
 * map (the mock, NameStone) short-circuit after pass 1.
 */
export async function readRecordsWithRegistration(
  name: string,
): Promise<ReadResult | null> {
  const first = await readRecords(name);
  if (!first) return null;
  if (parseAgentRegistrations(first.texts).length > 0) return first;

  const pointer = first.texts[AGENTIC_ID_POINTER_KEY];
  if (!pointer) return first;
  const ref = parseAgenticIdPointer(pointer);
  if (!ref) return first;

  const key = agentRegistrationKey(ref.chainId, ref.registry, ref.tokenId);
  const second = await readRecords(name, [key]);
  if (!second) return first;
  return { ...second, texts: { ...first.texts, ...second.texts } };
}

export interface BindingVerification {
  name: string;
  /** The ENSIP-25 key that was looked for. */
  key: string;
  /** The name asserts the token (forward direction). */
  ensAssertsToken: boolean;
  /** `contenthash` is present and points at IPFS. */
  hasContenthash: boolean;
  /** `agent-context` is present (ENSIP-26). */
  hasAgentContext: boolean;
  /** `addr` is present — the app has a fundable wallet. */
  hasAddr: boolean;
  addr: Address | null;
  manifestUri: string | null;
}

/**
 * The offchain half of the mutual verification described in prd.md §8.
 *
 * This proves only that the **name owner** asserts the Agentic ID token. The
 * other half — that the **token owner** asserts the name — is
 * `MiniAppRegistry.verify(ensName, tokenId)` on 0G Chain. A client that gets
 * `true` from both has established that one principal controls the name and
 * the agent, which is the property that makes funding a mini app's wallet a
 * decision you can actually reason about.
 */
export async function verifyEnsSideOfBinding(
  name: string,
  agenticId: AgenticIdRef,
): Promise<BindingVerification> {
  const key = agentRegistrationKey(agenticId.chainId, agenticId.registry, agenticId.tokenId);
  // Targeted: the resolver must be asked for this exact key by name.
  const records = await readRecords(name, [key]);
  const texts = records?.texts ?? {};
  return {
    name,
    key,
    ensAssertsToken: Boolean(texts[key] && texts[key] !== ""),
    hasContenthash: Boolean(records?.contenthash),
    hasAgentContext: Boolean(texts["agent-context"]),
    hasAddr: Boolean(records?.addr),
    addr: records?.addr ?? null,
    manifestUri: records?.contenthash ?? null,
  };
}

/** Namehash + labelhash re-exported so callers do not add a second ENS dep. */
export { namehash, labelhash, keccak256 };
