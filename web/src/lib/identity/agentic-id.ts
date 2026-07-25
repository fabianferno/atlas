/**
 * W7/W10 — ERC-7857 "Agentic ID" minting on 0G Chain.
 *
 * Every published mini app is minted as an Agentic ID. A mini app is an agent,
 * an agent is ownable, and **forking one is literally an ERC-7857 clone** —
 * the standard was designed for exactly this shape. See prd.md §9.
 *
 * ## Which ERC-7857?
 *
 * There are three incompatible interfaces in circulation under this number.
 * We implement the V2 `eip-7857-draft` shape that 0G's own developer docs link
 * to — `mint(bytes[],string[],address)`, `transfer(address,uint256,bytes[])`,
 * `clone(address,uint256,bytes[])` — because its `Verifier` proof format is
 * specified precisely enough to produce genuinely valid proofs offchain. See
 * the long comment at the top of `contracts/src/interfaces/IERC7857.sol` and
 * the "real vs scoped" table in `contracts/README.md`.
 *
 * ## What is genuinely implemented here
 *
 * - **AES-256-GCM encryption** of the metadata blob. Real, with a random
 *   96-bit IV and the auth tag retained.
 * - **`dataHash = keccak256(ciphertext)`** — the value the token commits to.
 * - **Proofs that the onchain verifier actually accepts**: the 190/146-byte
 *   layout, the 48-byte single-use nonce, and an ECDSA signature over the
 *   exact digest `AgenticIdVerifier.digestFor` computes. The Foundry test
 *   `test_ProofLayoutIsStable` pins both sides.
 * - **Mint, clone, and the registry write**, against a live 0G RPC.
 *
 * ## What is scoped down — stated plainly
 *
 * - **The TEE oracle.** 0G publishes no attestation-verifier address and no
 *   prover endpoint. The signer here is the deployer key, not an enclave. The
 *   verifier has a `strictOracle` mode and an attestor registry ready for a
 *   real key; nothing else changes when one exists.
 * - **0G Storage upload.** The encrypted blob goes to the configured content
 *   store (IPFS/local). Moving it to 0G Storage needs `@0gfoundation/0g-
 *   storage-ts-sdk` and a merkle-segment upload; the *hash commitment* the
 *   token holds is identical either way, so this is a transport swap.
 * - **Key re-sealing to the receiver's public key.** The `sealedKey` field is
 *   16 bytes by the standard's own layout, which cannot hold an ECIES-wrapped
 *   AES-256 key. We publish a 16-byte key *reference* and carry the wrapped
 *   key alongside the ciphertext envelope. Documented, not hidden.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Manifest } from "@/lib/contracts/manifest";
import { canonicalBytes, getIpfsBackend } from "./ipfs";

/* ========================================================================== */
/* chains                                                                     */
/* ========================================================================== */

/**
 * 0G Galileo testnet. Chain id **16602** — 16601 is the earlier Galileo V3
 * launch that still shows up on ChainList and in stale configs, and it is not
 * this network.
 */
export const zeroGTestnet = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: {
    default: { name: "0G Chainscan", url: "https://chainscan-galileo.0g.ai" },
  },
  testnet: true,
});

export const zeroGMainnet = defineChain({
  id: 16661,
  name: "0G Chain",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
  blockExplorers: { default: { name: "0G Chainscan", url: "https://chainscan.0g.ai" } },
});

/** Testnet unless the chain id says otherwise. Never inferred from a key. */
export function zeroGChain() {
  const id = Number(process.env.ZEROG_CHAIN_ID ?? zeroGTestnet.id);
  return id === zeroGMainnet.id ? zeroGMainnet : zeroGTestnet;
}

export function explorerTokenUrl(contract: Address, tokenId: number | bigint): string {
  const base = zeroGChain().blockExplorers.default.url.replace(/\/$/, "");
  return `${base}/token/${contract}?a=${tokenId}`;
}

export function explorerTxUrl(hash: string): string {
  const base = zeroGChain().blockExplorers.default.url.replace(/\/$/, "");
  return `${base}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  const base = zeroGChain().blockExplorers.default.url.replace(/\/$/, "");
  return `${base}/address/${address}`;
}

/* ========================================================================== */
/* ABIs                                                                       */
/* ========================================================================== */

export const AGENTIC_ID_ABI = [
  {
    type: "function",
    name: "mintAgent",
    stateMutability: "payable",
    inputs: [
      { name: "_proofs", type: "bytes[]" },
      { name: "_dataDescriptions", type: "string[]" },
      { name: "_to", type: "address" },
      { name: "ensName", type: "string" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      { name: "_proofs", type: "bytes[]" },
      { name: "_dataDescriptions", type: "string[]" },
      { name: "_to", type: "address" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "clone",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_tokenId", type: "uint256" },
      { name: "_proofs", type: "bytes[]" },
    ],
    outputs: [{ name: "_newTokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_tokenId", type: "uint256" },
      { name: "_proofs", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "bindEnsName",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "ensName", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "ensNameOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "tokenIdByEnsName",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "dataHashesOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "mintFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "_tokenId", type: "uint256", indexed: true },
      { name: "_creator", type: "address", indexed: true },
      { name: "_owner", type: "address", indexed: true },
      { name: "_dataHashes", type: "bytes32[]", indexed: false },
      { name: "_dataDescriptions", type: "string[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Cloned",
    inputs: [
      { name: "_tokenId", type: "uint256", indexed: true },
      { name: "_newTokenId", type: "uint256", indexed: true },
      { name: "_from", type: "address", indexed: false },
      { name: "_to", type: "address", indexed: false },
    ],
  },
] as const;

export const MINI_APP_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ensName", type: "string" },
      { name: "manifestCID", type: "string" },
      { name: "attestationHash", type: "bytes32" },
      { name: "ensNode", type: "bytes32" },
      { name: "tokenId", type: "uint256" },
      { name: "appVersion", type: "string" },
    ],
    outputs: [{ name: "key", type: "bytes32" }],
  },
  {
    type: "function",
    name: "registerFork",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ensName", type: "string" },
      { name: "manifestCID", type: "string" },
      { name: "attestationHash", type: "bytes32" },
      { name: "ensNode", type: "bytes32" },
      { name: "tokenId", type: "uint256" },
      { name: "appVersion", type: "string" },
      { name: "parentKey", type: "bytes32" },
    ],
    outputs: [{ name: "key", type: "bytes32" }],
  },
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [
      { name: "ensName", type: "string" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "owner", type: "address" },
      { name: "manifestCID", type: "string" },
    ],
  },
  {
    // Reads a record by key. Present so `registerMiniApp` can ask whether a fork's
    // parent is registered BEFORE calling `registerFork`, which reverts
    // `ParentUnknown` if it is not — see the comment there.
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "ensName", type: "string" },
          { name: "manifestCID", type: "string" },
          { name: "attestationHash", type: "bytes32" },
          { name: "ensNode", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "forkedFrom", type: "bytes32" },
          { name: "appVersion", type: "string" },
          { name: "registeredAt", type: "uint64" },
          { name: "updatedAt", type: "uint64" },
          { name: "revision", type: "uint32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getByName",
    stateMutability: "view",
    inputs: [{ name: "ensName", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "ensName", type: "string" },
          { name: "manifestCID", type: "string" },
          { name: "attestationHash", type: "bytes32" },
          { name: "ensNode", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "forkedFrom", type: "bytes32" },
          { name: "appVersion", type: "string" },
          { name: "registeredAt", type: "uint64" },
          { name: "updatedAt", type: "uint64" },
          { name: "revision", type: "uint32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "nameKey",
    stateMutability: "pure",
    inputs: [{ name: "ensName", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

/* ========================================================================== */
/* encryption                                                                 */
/* ========================================================================== */

export interface EncryptedBlob {
  /** `AES-256-GCM`. */
  alg: "AES-256-GCM";
  /** base64 ciphertext. */
  ciphertext: string;
  /** base64 96-bit IV. */
  iv: string;
  /** base64 128-bit GCM auth tag. */
  tag: string;
  /** keccak256 of the raw ciphertext bytes — what the token commits to. */
  dataHash: Hex;
  /** Human label stored in `dataDescriptionsOf`. */
  description: string;
}

export interface EncryptResult {
  blob: EncryptedBlob;
  /** The 256-bit content key. Never leaves the server, never goes onchain. */
  key: Buffer;
}

/**
 * AES-256-GCM. Real encryption, not a base64 wrapper — the manifest of an
 * autonomous mini app contains its allowlist and its spend caps, and an
 * ERC-7857 token that "owns encrypted metadata" had better actually own
 * encrypted metadata.
 */
export function encryptMetadata(
  plaintext: Uint8Array,
  description: string,
  key: Buffer = randomBytes(32),
): EncryptResult {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    key,
    blob: {
      alg: "AES-256-GCM",
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      dataHash: keccak256(toHex(ciphertext)),
      description,
    },
  };
}

export function decryptMetadata(blob: EncryptedBlob, key: Buffer): Uint8Array {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
}

/* ========================================================================== */
/* proofs                                                                     */
/* ========================================================================== */

/**
 * The digest `AgenticIdVerifier.digestFor` computes.
 *
 *   inner  = keccak256(newDataHash [|| oldDataHash] || nonce)
 *   digest = personal_sign over the **0x-prefixed hex string** of `inner`
 *
 * Signing the hex string rather than the raw bytes is what the reference
 * verifier does (`Strings.toHexString(uint256(inner), 32)` inside a
 * `\x19Ethereum Signed Message:\n66` envelope), and it is exactly what
 * `viem.signMessage({ message: "0x…" })` produces for a plain string.
 */
function innerHash(newDataHash: Hex, oldDataHash: Hex | null, nonce: Uint8Array): Hex {
  const parts: string[] = [newDataHash.slice(2)];
  if (oldDataHash && oldDataHash !== ZERO_HASH) parts.push(oldDataHash.slice(2));
  parts.push(Buffer.from(nonce).toString("hex"));
  return keccak256(`0x${parts.join("")}` as Hex);
}

const ZERO_HASH = `0x${"00".repeat(32)}` as Hex;
const ZERO_ADDRESS = `0x${"00".repeat(20)}` as Address;

/** Local to this module; `publish.ts` has its own copy for the same reason. */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function newProofNonce(): Uint8Array {
  return randomBytes(48);
}

function concatHex(...parts: string[]): Hex {
  return `0x${parts.map((p) => p.replace(/^0x/, "")).join("")}` as Hex;
}

/** Flags byte: bit 0x80 = ZKP (we always use TEE=0), bit 0x40 = private data. */
const FLAG_TEE_PRIVATE = "40";

/**
 * A preimage proof — used at mint and at metadata update.
 * Layout: `flags(1) | sig(65) | nonce(48) | dataHash(32)` = 146 bytes.
 *
 * The signer must be the wallet receiving the token: `AgenticId._mintAgent`
 * enforces `prover == _to`. That makes a mint an assertion by the receiving
 * wallet that it holds the content key, not something a third party can do on
 * its behalf.
 */
export async function buildPreimageProof(
  account: PrivateKeyAccount,
  dataHash: Hex,
  nonce: Uint8Array = newProofNonce(),
): Promise<Hex> {
  const message = innerHash(dataHash, null, nonce);
  const signature = await account.signMessage({ message });
  return concatHex(
    FLAG_TEE_PRIVATE,
    signature,
    Buffer.from(nonce).toString("hex"),
    dataHash,
  );
}

/**
 * A transfer/clone proof.
 * Layout: `flags(1) | sig(65) | nonce(48) | newHash(32) | oldHash(32) | sealedKey(16)`
 * = 194 bytes.
 *
 * The signature must be by the **receiver** — the verifier recovers it and
 * `AgenticId` requires it to equal `_to`. You cannot push an Agentic ID onto a
 * wallet that has not signed for it.
 */
export async function buildTransferProof(
  receiver: PrivateKeyAccount,
  newDataHash: Hex,
  oldDataHash: Hex,
  sealedKeyRef: Hex,
  nonce: Uint8Array = newProofNonce(),
): Promise<Hex> {
  const message = innerHash(newDataHash, oldDataHash, nonce);
  const signature = await receiver.signMessage({ message });
  const sealed = sealedKeyRef.replace(/^0x/, "").padStart(32, "0").slice(-32);
  return concatHex(
    FLAG_TEE_PRIVATE,
    signature,
    Buffer.from(nonce).toString("hex"),
    newDataHash,
    oldDataHash,
    sealed,
  );
}

/**
 * A 16-byte reference to the sealed content key.
 *
 * ERC-7857 V2 types `sealedKey` as `bytes16`, which cannot hold an
 * ECIES-wrapped AES-256 key — 16 bytes is not enough for any real key
 * envelope. We publish `keccak256(key)[0:16]` as a commitment, and carry the
 * actual wrapped key next to the ciphertext. Anyone can check the published
 * reference against the key they were handed; nobody can derive the key from
 * it. Where the standard's own field is too small, saying so beats pretending.
 */
export function sealedKeyRef(key: Buffer): Hex {
  return `0x${keccak256(toHex(key)).slice(2, 34)}` as Hex;
}

/* ========================================================================== */
/* config + clients                                                           */
/* ========================================================================== */

export type AgenticIdMode = "live" | "mock";

export interface AgenticIdConfig {
  mode: AgenticIdMode;
  chainId: number;
  agenticIdAddress: Address | null;
  registryAddress: Address | null;
  verifierAddress: Address | null;
  rpcUrl: string;
}

export function agenticIdConfig(): AgenticIdConfig {
  const chain = zeroGChain();
  const agenticIdAddress = asAddress(process.env.ZEROG_AGENTIC_ID_ADDRESS);
  const registryAddress = asAddress(process.env.ZEROG_REGISTRY_ADDRESS);
  const rpcUrl = process.env.ZEROG_RPC || chain.rpcUrls.default.http[0];
  const hasKey = Boolean(process.env.ZEROG_DEPLOYER_KEY);
  return {
    mode: agenticIdAddress && registryAddress && hasKey ? "live" : "mock",
    chainId: chain.id,
    agenticIdAddress,
    registryAddress,
    verifierAddress: asAddress(process.env.ZEROG_VERIFIER_ADDRESS),
    rpcUrl,
  };
}

function asAddress(v: string | undefined): Address | null {
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null;
}

/**
 * The ENSIP-25 registry address, or a deterministic stand-in.
 *
 * The `agent-registration` key is the single most important record we write —
 * it is what binds the name to the token — so a publish with no 0G deployment
 * must still produce a *well-formed, correctly encoded* key rather than
 * silently omitting it. The stand-in is derived from the chain id, so it is
 * stable across restarts and obviously not a real deployment; `mocked` is
 * surfaced all the way up to `PublishReport.warnings`.
 *
 * The moment `ZEROG_REGISTRY_ADDRESS` is set, the real address is used and
 * nothing else about the record changes.
 */
export function ensip25Registry(): { address: Address; mocked: boolean } {
  const real = asAddress(process.env.ZEROG_REGISTRY_ADDRESS);
  if (real) return { address: real, mocked: false };
  const derived = keccak256(toHex(`atlas:unregistered-registry:${zeroGChain().id}`));
  return { address: `0x${derived.slice(26)}` as Address, mocked: true };
}

export function zeroGPublicClient(): PublicClient {
  const chain = zeroGChain();
  return createPublicClient({
    chain,
    transport: http(process.env.ZEROG_RPC || chain.rpcUrls.default.http[0]),
    // Cast: viem's PublicClient is invariant over its transport/chain generics
    // and we only use chain-agnostic actions.
  }) as unknown as PublicClient;
}

/**
 * Wait for a receipt by polling to a deadline.
 *
 * NOT `waitForTransactionReceipt`, deliberately. On 0G Galileo that action
 * abandons a perfectly good transaction after ~3-5 seconds regardless of
 * `retryCount`, `retryDelay` or `timeout`: the RPC answers `getTransaction`
 * with a pending tx (`blockNumber: null`), viem's replacement-detection path
 * treats the still-missing receipt as terminal, and throws
 * `TransactionReceiptNotFoundError`. Measured against a fresh broadcast, a
 * plain `getTransactionReceipt` poll returned the receipt 150ms after that
 * throw — the transaction was never in doubt, only viem's heuristic was.
 *
 * The consequence of getting this wrong is the worst kind: three mints
 * succeeded onchain while `publish` reported "Agentic ID mint failed",
 * discarded the token id, and skipped the registry write that binds the ENS
 * name to the token — leaving a name and a token that cannot verify each
 * other. A broadcast transaction is not failed just because the first poll
 * missed it.
 */
async function awaitReceipt(client: PublicClient, hash: Hex) {
  const intervalMs = 2_000;
  const deadline = Date.now() + 180_000;
  for (;;) {
    const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return receipt;
    if (Date.now() >= deadline) {
      throw new Error(
        `receipt for ${hash} did not appear within 180s — the transaction may still land, ` +
          `check the explorer before assuming it failed`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function deployerAccount(): PrivateKeyAccount {
  const raw = process.env.ZEROG_DEPLOYER_KEY;
  if (!raw) throw new Error("ZEROG_DEPLOYER_KEY is required to write to 0G Chain");
  return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
}

function zeroGWalletClient() {
  const chain = zeroGChain();
  return createWalletClient({
    account: deployerAccount(),
    chain,
    transport: http(process.env.ZEROG_RPC || chain.rpcUrls.default.http[0]),
  });
}

/* ========================================================================== */
/* mint                                                                       */
/* ========================================================================== */

export interface MintInput {
  manifest: Manifest;
  /** Fully qualified ENS name, bound at mint so the claim is never stale. */
  ensName: string;
  /** `ipfs://<cid>` of the *public* manifest, used as the token URI. */
  tokenUri: string | null;
  /** Owner of the resulting token. Defaults to the deployer. */
  owner?: Address;
}

export interface MintResult {
  mode: AgenticIdMode;
  chainId: number;
  contract: Address | null;
  tokenId: number;
  txHash: string | null;
  owner: Address | null;
  /** keccak256 of the encrypted manifest — the token's data commitment. */
  dataHash: Hex;
  /** Where the encrypted blob was stored. */
  encryptedBlobUri: string | null;
  explorerUrl: string | null;
  /** The AES key, base64. The caller decides where this goes; it is a secret. */
  contentKeyB64: string;
  sealedKeyRef: Hex;
}

/**
 * Deterministic token id for mock mode.
 *
 * Derived from the ENS name so a mocked publish and a later live publish of
 * the same app do not silently disagree about which token they mean, and so
 * the ENSIP-25 record key is stable across a demo restart.
 */
export function mockTokenId(ensName: string): number {
  const h = keccak256(toHex(ensName));
  return Number(BigInt(h) % 900_000n) + 100_000;
}

/**
 * Mint an Agentic ID for a mini app.
 *
 * Live path: encrypt the manifest → store the ciphertext → build a preimage
 * proof signed by the receiving wallet → `mintAgent(...)` → read the token id
 * out of the `Minted` event.
 *
 * Mock path: identical encryption and hashing, deterministic token id, no
 * chain. The manifest is still really encrypted and the data hash is still the
 * real commitment, so switching to live changes only where it is written.
 */
export async function mintAgenticId(input: MintInput): Promise<MintResult> {
  const config = agenticIdConfig();
  const plaintext = canonicalBytes(input.manifest);
  const { blob, key } = encryptMetadata(
    plaintext,
    `manifest:${input.manifest.name}@${input.manifest.appVersion}`,
  );

  // Store the ciphertext envelope. The token commits to keccak256(ciphertext),
  // so the storage location is a transport detail — 0G Storage, IPFS, or a
  // local store all satisfy the commitment identically.
  let encryptedBlobUri: string | null = null;
  try {
    const pin = await getIpfsBackend().pinJson(blob);
    encryptedBlobUri = pin.uri;
  } catch (err) {
    console.warn("[agentic-id] could not store encrypted metadata:", err);
  }

  const contentKeyB64 = key.toString("base64");
  const keyRef = sealedKeyRef(key);

  if (config.mode === "mock" || !config.agenticIdAddress) {
    return {
      mode: "mock",
      chainId: config.chainId,
      contract: config.agenticIdAddress,
      tokenId: mockTokenId(input.ensName),
      txHash: null,
      owner: input.owner ?? null,
      dataHash: blob.dataHash,
      encryptedBlobUri,
      explorerUrl: null,
      contentKeyB64,
      sealedKeyRef: keyRef,
    };
  }

  const wallet = zeroGWalletClient();
  const publicClient = zeroGPublicClient();
  const owner = input.owner ?? wallet.account.address;

  // The prover must be the receiving wallet. When minting to a third party we
  // cannot sign on their behalf — that is the point of the check — so the
  // token is minted to the deployer and transferred by the caller afterwards.
  if (owner.toLowerCase() !== wallet.account.address.toLowerCase()) {
    throw new Error(
      "mintAgenticId: the receiving wallet must sign its own preimage proof. " +
        "Mint to the deployer and use transfer(), or have the owner sign.",
    );
  }

  const proof = await buildPreimageProof(wallet.account, blob.dataHash);
  const mintFee = await publicClient
    .readContract({
      address: config.agenticIdAddress,
      abi: AGENTIC_ID_ABI,
      functionName: "mintFee",
    })
    .catch(() => 0n);

  const txHash = await wallet.writeContract({
    address: config.agenticIdAddress,
    abi: AGENTIC_ID_ABI,
    functionName: "mintAgent",
    args: [[proof], [blob.description], owner, input.ensName, input.tokenUri ?? ""],
    value: mintFee,
    chain: zeroGChain(),
  });

  const receipt = await awaitReceipt(publicClient, txHash);
  const logs = parseEventLogs({
    abi: AGENTIC_ID_ABI,
    eventName: "Minted",
    logs: receipt.logs,
  });
  const tokenId = logs[0] ? Number(logs[0].args._tokenId) : 0;

  return {
    mode: "live",
    chainId: config.chainId,
    contract: config.agenticIdAddress,
    tokenId,
    txHash,
    owner,
    dataHash: blob.dataHash,
    encryptedBlobUri,
    explorerUrl: explorerTokenUrl(config.agenticIdAddress, tokenId),
    contentKeyB64,
    sealedKeyRef: keyRef,
  };
}

/* ========================================================================== */
/* clone (fork)                                                               */
/* ========================================================================== */

export interface CloneResult {
  mode: AgenticIdMode;
  tokenId: number;
  txHash: string | null;
  explorerUrl: string | null;
}

/**
 * Fork a mini app = clone its Agentic ID.
 *
 * The parent keeps its token, its wallet and its authorizations; the child
 * gets a fresh token with `clonedFrom` set. Nothing about spending authority
 * is inherited — `forkManifest()` strips it offchain and the contract copies
 * nothing but the re-attested data hashes (prd.md §12).
 */
export async function cloneAgenticId(
  parentTokenId: number,
  childManifest: Manifest,
  childEnsName: string,
): Promise<CloneResult> {
  const config = agenticIdConfig();
  if (config.mode === "mock" || !config.agenticIdAddress) {
    return {
      mode: "mock",
      tokenId: mockTokenId(childEnsName),
      txHash: null,
      explorerUrl: null,
    };
  }

  const wallet = zeroGWalletClient();
  const publicClient = zeroGPublicClient();
  const receiver = wallet.account;

  const current = await publicClient.readContract({
    address: config.agenticIdAddress,
    abi: AGENTIC_ID_ABI,
    functionName: "dataHashesOf",
    args: [BigInt(parentTokenId)],
  });

  const { blob, key } = encryptMetadata(
    canonicalBytes(childManifest),
    `manifest:${childManifest.name}@${childManifest.appVersion}`,
  );
  await getIpfsBackend().pinJson(blob).catch(() => null);

  const proofs: Hex[] = [];
  for (let i = 0; i < current.length; i++) {
    // Every slot must be re-attested against the hash the token holds now.
    const newHash = i === 0 ? blob.dataHash : keccak256(toHex(`${blob.dataHash}:${i}`));
    proofs.push(await buildTransferProof(receiver, newHash, current[i], sealedKeyRef(key)));
  }

  const txHash = await wallet.writeContract({
    address: config.agenticIdAddress,
    abi: AGENTIC_ID_ABI,
    functionName: "clone",
    args: [receiver.address, BigInt(parentTokenId), proofs],
    chain: zeroGChain(),
  });
  const receipt = await awaitReceipt(publicClient, txHash);
  const logs = parseEventLogs({
    abi: AGENTIC_ID_ABI,
    eventName: "Cloned",
    logs: receipt.logs,
  });
  const tokenId = logs[0] ? Number(logs[0].args._newTokenId) : 0;

  return {
    mode: "live",
    tokenId,
    txHash,
    explorerUrl: explorerTokenUrl(config.agenticIdAddress, tokenId),
  };
}

/* ========================================================================== */
/* registry                                                                   */
/* ========================================================================== */

export interface RegisterInput {
  ensName: string;
  manifestCid: string;
  attestationRef: string | null;
  /** ENS namehash of `ensName`, so onchain consumers can join without strings. */
  ensNode: Hex;
  tokenId: number;
  appVersion: string;
  /** keccak256 of the parent's ENS name, for forks. */
  parentKey?: Hex | null;
}

export interface RegisterResult {
  mode: AgenticIdMode;
  txHash: string | null;
  registry: Address | null;
  nameKey: Hex;
  explorerUrl: string | null;
  /**
   * Set when a fork was registered WITHOUT its `forkedFrom` link, because the
   * parent is not in the registry. The app is registered and mutual verification
   * still holds; only the onchain attribution is missing. Null when there was no
   * parent to record, or when the link was written.
   */
  lineageSkipped: string | null;
}

export function miniAppNameKey(ensName: string): Hex {
  return keccak256(toHex(ensName));
}

/** Write the name→manifest→token binding. This is the reverse half of ENSIP-25. */
export async function registerMiniApp(input: RegisterInput): Promise<RegisterResult> {
  const config = agenticIdConfig();
  const nameKey = miniAppNameKey(input.ensName);
  if (config.mode === "mock" || !config.registryAddress) {
    return { mode: "mock", txHash: null, registry: config.registryAddress, nameKey, explorerUrl: null, lineageSkipped: null };
  }

  const wallet = zeroGWalletClient();
  const publicClient = zeroGPublicClient();
  const attestationHash = input.attestationRef
    ? keccak256(toHex(input.attestationRef))
    : ZERO_HASH;

  /**
   * WHY THE PARENT IS CHECKED FIRST, and why falling back is the right answer.
   *
   * `MiniAppRegistry.registerFork` opens with
   * `if (_records[parentKey].author == address(0)) revert ParentUnknown(parentKey)`
   * — deliberately, so attribution cannot be faked against a name nobody
   * published. Correct contract, and it made publishing a fork fail in a way that
   * looked like it had worked:
   *
   *   every bundled app is unpublished, so its `nameKey` is absent from the
   *   registry → `registerFork` reverts → the caller in `publish.ts` catches it as
   *   "registry write failed" → the ENS records and the Agentic ID mint have
   *   ALREADY landed, so the name resolves, the token exists, and only the 0G half
   *   of the mutual proof is missing. Result: `mutuallyVerified: false` on every
   *   published fork, which is exactly the property prd.md §14 rows 9 and 13 rest
   *   on, lost to a silent revert.
   *
   * So: ask the registry the same question its guard asks, and if the parent is
   * genuinely unknown, register the app WITHOUT the lineage link rather than not
   * registering it at all. Losing `forkedFrom` costs onchain attribution, which is
   * recoverable — the manifest still carries `forkedFrom` and §12's credit story
   * survives. Losing the registration costs mutual verification, which is the
   * safety primitive in §8. Given a forced choice, keep the one that decides
   * whether a stranger can verify a name before funding it, and say out loud that
   * the other was skipped — `lineageSkipped` carries that up to `warnings[]`.
   */
  let parentKey = input.parentKey;
  let lineageSkipped: string | null = null;
  if (parentKey) {
    try {
      const parent = await publicClient.readContract({
        address: config.registryAddress,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "get",
        args: [parentKey],
      });
      if (!parent || (parent as { author: Address }).author === ZERO_ADDRESS) {
        lineageSkipped =
          `parent ${parentKey} is not in the registry, so onchain fork attribution was skipped — ` +
          `the app is registered and mutually verifiable, but its forkedFrom link exists only in the manifest. ` +
          `Publish the parent first to record lineage onchain.`;
        parentKey = null;
      }
    } catch (err) {
      // A failed READ is not evidence the parent is absent. But calling
      // registerFork on an unverified parent risks the whole registration on a
      // revert, and registration is the more valuable half — so degrade, and say so.
      lineageSkipped =
        `could not confirm parent ${parentKey} is registered (${errText(err)}), so onchain fork ` +
        `attribution was skipped rather than risking the registration on a ParentUnknown revert.`;
      parentKey = null;
    }
  }

  const txHash = parentKey
    ? await wallet.writeContract({
        address: config.registryAddress,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "registerFork",
        args: [
          input.ensName,
          input.manifestCid,
          attestationHash,
          input.ensNode,
          BigInt(input.tokenId),
          input.appVersion,
          parentKey,
        ],
        chain: zeroGChain(),
      })
    : await wallet.writeContract({
        address: config.registryAddress,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "register",
        args: [
          input.ensName,
          input.manifestCid,
          attestationHash,
          input.ensNode,
          BigInt(input.tokenId),
          input.appVersion,
        ],
        chain: zeroGChain(),
      });

  await awaitReceipt(publicClient, txHash);
  return {
    mode: "live",
    txHash,
    registry: config.registryAddress,
    nameKey,
    explorerUrl: explorerTxUrl(txHash),
    lineageSkipped,
  };
}

/* ========================================================================== */
/* verification                                                               */
/* ========================================================================== */

export interface OnchainBinding {
  /** The registry says this name is bound to this token. */
  registryAssertsName: boolean;
  /** The token itself carries the same name (`ensNameOf`). */
  tokenAssertsName: boolean;
  owner: Address | null;
  manifestCid: string | null;
  checked: boolean;
}

/**
 * The onchain half of the mutual verification (prd.md §8).
 *
 * Pairs with `verifyEnsSideOfBinding()` in `ens.ts`. Both true means one
 * principal controls the ENS name *and* the Agentic ID — which is what makes
 * "should I fund this mini app's wallet?" a question with an answer.
 */
export async function verifyOnchainSideOfBinding(
  ensName: string,
  tokenId: number,
): Promise<OnchainBinding> {
  const config = agenticIdConfig();
  if (!config.registryAddress || !config.agenticIdAddress) {
    return {
      registryAssertsName: false,
      tokenAssertsName: false,
      owner: null,
      manifestCid: null,
      checked: false,
    };
  }
  const client = zeroGPublicClient();
  try {
    const [verified, tokenName] = await Promise.all([
      client.readContract({
        address: config.registryAddress,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "verify",
        args: [ensName, BigInt(tokenId)],
      }),
      client
        .readContract({
          address: config.agenticIdAddress,
          abi: AGENTIC_ID_ABI,
          functionName: "ensNameOf",
          args: [BigInt(tokenId)],
        })
        .catch(() => ""),
    ]);
    const [ok, owner, manifestCid] = verified;
    return {
      registryAssertsName: ok,
      tokenAssertsName: tokenName.toLowerCase() === ensName.toLowerCase(),
      owner: ok ? owner : null,
      manifestCid: manifestCid || null,
      checked: true,
    };
  } catch {
    return {
      registryAssertsName: false,
      tokenAssertsName: false,
      owner: null,
      manifestCid: null,
      checked: false,
    };
  }
}
