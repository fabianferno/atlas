/**
 * W7 — manifest pinning.
 *
 * A published mini app's manifest is the thing the ENS `contenthash` points
 * at, so pinning has to work with zero configuration or the whole identity
 * layer stalls behind an API key. Three backends, selected by `IPFS_MODE`:
 *
 *   pinata  — Pinata pinJSONToIPFS (PINATA_JWT)
 *   w3s     — web3.storage / Storacha HTTP bridge (W3S_TOKEN + W3S_PROOF)
 *   local   — no network. Computes a *real* CIDv1 (raw, sha2-256) over the
 *             canonical bytes and keeps them in memory.
 *
 * The local CID is not a fake string: it is the correct content identifier for
 * those exact bytes under `dag-pb`-free raw addressing, so it is deterministic,
 * verifiable offline, and identical to what a raw-leaf pin would produce. It
 * simply is not *announced* to the public DHT.
 *
 * See prd.md §8 (contenthash) and §12 (fork provenance).
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Manifest } from "@/lib/contracts/manifest";

export type IpfsMode = "pinata" | "w3s" | "local";

export interface PinResult {
  /** Base32 CIDv1, e.g. `bafkrei...`. Always set. */
  cid: string;
  /** `ipfs://<cid>` — the value written to the ENS contenthash record. */
  uri: string;
  /** An HTTP gateway URL a judge can click. */
  gatewayUrl: string;
  mode: IpfsMode;
  /** False when the bytes only exist in this process (local mode). */
  pinned: boolean;
  bytes: number;
}

export interface IpfsBackend {
  readonly mode: IpfsMode;
  pinJson(value: unknown): Promise<PinResult>;
  fetchJson(cid: string): Promise<unknown | null>;
}

const GATEWAY = process.env.IPFS_GATEWAY ?? "https://ipfs.io/ipfs";

/* -------------------------------------------------------------------------- */
/* CID                                                                        */
/* -------------------------------------------------------------------------- */

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC-4648 base32, lowercase, unpadded — multibase prefix `b`. */
function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * CIDv1 / raw (0x55) / sha2-256 (0x12, 32 bytes), multibase base32.
 * <version=0x01><codec=0x55><hash-fn=0x12><len=0x20><digest>
 */
export function cidV1Raw(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest();
  const prefixed = new Uint8Array(4 + digest.length);
  prefixed.set([0x01, 0x55, 0x12, 0x20], 0);
  prefixed.set(digest, 4);
  return `b${base32(prefixed)}`;
}

/**
 * Canonical JSON: object keys sorted at every depth, no incidental whitespace.
 * Two clients that build the same manifest must produce the same CID, and
 * `JSON.stringify` key order is insertion order, which is not stable across
 * the planner, a fork, and a round-trip through a database.
 */
export function canonicalJson(value: unknown): string {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const src = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) out[key] = walk(src[key]);
      return out;
    }
    return node;
  };
  return JSON.stringify(walk(value));
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

/** The CID a manifest *will* have, without pinning it. Used by mint preflight. */
export function manifestCid(manifest: Manifest): string {
  return cidV1Raw(canonicalBytes(manifest));
}

function gatewayUrl(cid: string): string {
  return `${GATEWAY.replace(/\/$/, "")}/${cid}`;
}

/* -------------------------------------------------------------------------- */
/* local                                                                      */
/* -------------------------------------------------------------------------- */

/** Process-local content store. Survives a resolve within the same server. */
const memory = new Map<string, string>();

/**
 * Disk mirror for local mode.
 *
 * In-memory alone made published names *decay*: the ENS records and the onchain
 * CID survived a restart, the bytes they point at did not, so `resolve()`
 * returned a name with a manifestCid, a wallet and an Agentic ID — and a null
 * manifest. The demo beat where a name is pasted into a different agent and the
 * app runs is exactly this path, and it broke on every rebuild.
 *
 * Content-addressed, so a flat directory of `<cid>.json` is the whole design.
 * This is still not IPFS: it makes a name durable on THIS machine, not
 * retrievable from another one. Only a real pin (`PINATA_JWT` / `W3S_TOKEN`)
 * does that, and publish keeps warning until one is set.
 */
const localDir = process.env.IPFS_LOCAL_DIR ?? path.join(process.cwd(), ".atlas", "ipfs");

function localPath(cid: string): string | null {
  // A CID reaches this from a URL, so it is untrusted input and must never be
  // able to walk out of the directory.
  if (!/^[A-Za-z0-9]+$/.test(cid)) return null;
  return path.join(localDir, `${cid}.json`);
}

class LocalBackend implements IpfsBackend {
  readonly mode = "local" as const;

  async pinJson(value: unknown): Promise<PinResult> {
    const json = canonicalJson(value);
    const bytes = new TextEncoder().encode(json);
    const cid = cidV1Raw(bytes);
    memory.set(cid, json);

    // Best effort. A read-only filesystem is a reason to lose durability, not
    // a reason to fail a publish that has already minted onchain.
    const file = localPath(cid);
    if (file) {
      try {
        await fs.mkdir(localDir, { recursive: true });
        await fs.writeFile(file, json, "utf8");
      } catch (err) {
        console.warn(`[ipfs] local mirror write failed for ${cid}:`, err);
      }
    }

    return {
      cid,
      uri: `ipfs://${cid}`,
      gatewayUrl: gatewayUrl(cid),
      mode: "local",
      pinned: false,
      bytes: bytes.length,
    };
  }

  async fetchJson(cid: string): Promise<unknown | null> {
    const hit = memory.get(cid);
    if (hit !== undefined) return JSON.parse(hit);

    const file = localPath(cid);
    if (file) {
      try {
        const json = await fs.readFile(file, "utf8");
        memory.set(cid, json);
        return JSON.parse(json);
      } catch {
        // Not on disk either — fall through to the gateway.
      }
    }

    // Even in local mode, try the public gateway — a CID pinned by a previous
    // live run is still resolvable and resolve() should not lie about it.
    return fetchFromGateway(cid);
  }
}

async function fetchFromGateway(cid: string): Promise<unknown | null> {
  try {
    const res = await fetch(gatewayUrl(cid), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* pinata                                                                     */
/* -------------------------------------------------------------------------- */

class PinataBackend implements IpfsBackend {
  readonly mode = "pinata" as const;
  constructor(private readonly jwt: string) {}

  /**
   * `pinFileToIPFS`, NOT `pinJSONToIPFS`.
   *
   * The difference is the CID. `pinJSONToIPFS` wraps the document as a UnixFS
   * file, so even at `cidVersion: 1` it returns a **dag-pb** CID (`bafybei…`).
   * `local` mode addresses the same bytes as a **raw** block (`bafkrei…`). Same
   * content, different multicodec, different CID — which would mean the CID a
   * manifest gets depends on which backend happened to pin it, and switching
   * `IPFS_MODE` would silently orphan every `contenthash` already written.
   *
   * A single-block upload through `pinFileToIPFS` with `cidVersion: 1` uses raw
   * leaves and reproduces the local CID exactly. Verified against a published
   * manifest: both paths return
   * `bafkreiagp25njrnk42kixxjo4tctw6v2go23dmo6lzwihg7sfcsiv4opxu`.
   *
   * So the CID stays a function of the bytes, which is the only thing content
   * addressing is for.
   */
  async pinJson(value: unknown): Promise<PinResult> {
    const json = canonicalJson(value);
    const bytes = new TextEncoder().encode(json);

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/json" }), "manifest.json");
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { authorization: `Bearer ${this.jwt}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`pinata: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const body = (await res.json()) as { IpfsHash?: string };
    if (!body.IpfsHash) throw new Error("pinata: response had no IpfsHash");

    // The CID must be the hash of the bytes we just sent. If Pinata ever returns
    // something else, the manifest is addressed by a name we did not compute and
    // cannot verify offline — fail loudly rather than write it into an ENS record.
    const expected = cidV1Raw(bytes);
    if (body.IpfsHash !== expected) {
      throw new Error(
        `pinata returned ${body.IpfsHash} but these bytes hash to ${expected} — ` +
          "refusing to publish a CID we did not derive.",
      );
    }

    return {
      cid: body.IpfsHash,
      uri: `ipfs://${body.IpfsHash}`,
      gatewayUrl: gatewayUrl(body.IpfsHash),
      mode: "pinata",
      pinned: true,
      bytes: bytes.length,
    };
  }

  fetchJson(cid: string): Promise<unknown | null> {
    return fetchFromGateway(cid);
  }
}

/* -------------------------------------------------------------------------- */
/* web3.storage / storacha                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Storacha's HTTP bridge takes raw bytes and returns the CID in a header.
 * Kept deliberately thin — if the token is absent we never construct this.
 */
class W3sBackend implements IpfsBackend {
  readonly mode = "w3s" as const;
  constructor(
    private readonly token: string,
    private readonly proof: string,
  ) {}

  async pinJson(value: unknown): Promise<PinResult> {
    const json = canonicalJson(value);
    const bytes = new TextEncoder().encode(json);
    const res = await fetch("https://up.storacha.network/bridge", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-secret": this.token,
        authorization: this.proof,
      },
      body: json,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`w3s: ${res.status} ${await res.text().catch(() => "")}`);
    }
    // The bridge echoes the CID; fall back to computing it ourselves, which is
    // correct for raw blocks and keeps publish() from failing on a header change.
    const cid = res.headers.get("x-ipfs-cid") ?? cidV1Raw(bytes);
    return {
      cid,
      uri: `ipfs://${cid}`,
      gatewayUrl: gatewayUrl(cid),
      mode: "w3s",
      pinned: true,
      bytes: bytes.length,
    };
  }

  fetchJson(cid: string): Promise<unknown | null> {
    return fetchFromGateway(cid);
  }
}

/* -------------------------------------------------------------------------- */
/* selection                                                                  */
/* -------------------------------------------------------------------------- */

export function resolveIpfsMode(): IpfsMode {
  const explicit = process.env.IPFS_MODE as IpfsMode | undefined;
  if (explicit === "pinata" || explicit === "w3s" || explicit === "local") {
    return explicit;
  }
  if (process.env.PINATA_JWT) return "pinata";
  if (process.env.W3S_TOKEN && process.env.W3S_PROOF) return "w3s";
  return "local";
}

/** Never throws. A missing key silently degrades to `local` rather than 500ing. */
export function getIpfsBackend(): IpfsBackend {
  const mode = resolveIpfsMode();
  if (mode === "pinata" && process.env.PINATA_JWT) {
    return new PinataBackend(process.env.PINATA_JWT);
  }
  if (mode === "w3s" && process.env.W3S_TOKEN && process.env.W3S_PROOF) {
    return new W3sBackend(process.env.W3S_TOKEN, process.env.W3S_PROOF);
  }
  return new LocalBackend();
}

/** Pin a manifest. Falls back to local rather than failing a publish. */
export async function pinManifest(manifest: Manifest): Promise<PinResult> {
  const backend = getIpfsBackend();
  try {
    return await backend.pinJson(manifest);
  } catch (err) {
    if (backend.mode === "local") throw err;
    console.warn(`[ipfs] ${backend.mode} pin failed, falling back to local:`, err);
    return new LocalBackend().pinJson(manifest);
  }
}

/** Read a manifest's raw JSON back out of IPFS. */
export async function fetchManifestJson(cid: string): Promise<unknown | null> {
  return getIpfsBackend().fetchJson(cid);
}

/** Accepts `ipfs://<cid>`, a bare CID, or a gateway URL. */
export function cidFromUri(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("ipfs://")) return trimmed.slice("ipfs://".length).split("/")[0];
  const gateway = trimmed.match(/\/ipfs\/([A-Za-z0-9]+)/);
  if (gateway) return gateway[1];
  if (/^(b[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/.test(trimmed)) return trimmed;
  return null;
}
