/**
 * W6 — PER-MINI-APP WALLET PROVISIONING.
 *
 * Each mini app gets its own wallet. Never a shared one, never a root key.
 *
 * Four modes, all behind the same `Signer` interface (see `./signer.ts`):
 *
 *   stub          — deterministic address, simulated tx hash. No keys needed,
 *                   so the whole loop is demoable before anything is funded.
 *   session-eoa   — a session key EOA. Real transactions. Policy enforced by
 *                   OUR PROCESS: "the policy stopped it" means our server chose
 *                   not to sign.
 *   smart-account — ERC-4337 account (viem's Coinbase Smart Account) whose
 *                   session key is an OWNER. Real transactions through a
 *                   bundler, and still no onchain scoping — an owner key has
 *                   full authority over the account.
 *   smart-session — ERC-7579 account + Rhinestone Smart Sessions validator. The
 *                   session key is NOT an owner: it is a scoped permission, and
 *                   the account itself rejects a call outside the allowlist or
 *                   past expiry. This is the mode where a compromised backend
 *                   cannot exceed the grant.
 *
 * `enforcementReport(wallet)` states, per constraint, whether the chain or this
 * process is enforcing it. Nothing in this file claims onchain enforcement it
 * has not verified by reading the chain — see `onchainEnforced`, which is the
 * result of an `isSessionEnabled()` call, not a constant.
 *
 * TESTNET BY DEFAULT, and mainnet is not reachable by configuration accident:
 * `resolveChain()` refuses any chain that does not declare `testnet: true`.
 *
 * prd.md §7.
 */
import { getAddress, keccak256, numberToHex, pad, toHex, type Chain } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
// Not `zeroGGalileoTestnet` from viem/chains — see SUPPORTED_CHAINS below for
// the chain id that made the difference. This is a plain server-side import:
// `agentic-id.ts` opens with `node:crypto` and reads the deployer key, which is
// why the client-side twin of this fix (`components/providers/privy.tsx`) had to
// restate the chain inline instead. Nothing in that file's import graph reaches
// back here — `agentic-id.ts` imports only `./ipfs` and `contracts/manifest` —
// so there is no cycle and no reason for a second definition.
import { zeroGTestnet } from "../identity/agentic-id";
import {
  OWNABLE_VALIDATOR_ADDRESS,
  encodeValidationData,
  getEnableSessionsAction,
  getPermissionId,
  getSpendingLimitsPolicy,
  getTimeFramePolicy,
  getUniversalActionPolicy,
  getValueLimitPolicy,
  isSessionEnabled,
  type Session as SmartSession,
} from "@rhinestone/module-sdk";
import type { Agency, AgencyTier, DataPlan, Policy } from "@/lib/contracts/manifest";

/**
 * Read this out loud when a judge asks "what if your server is owned?".
 *
 * With a session-key EOA — and with a smart account whose session key is a
 * plain owner — the cap lives in this repo. A compromised backend can propose
 * whatever it likes and sign it. With an onchain session-key permission module
 * (ERC-7579 Smart Sessions), the account itself rejects a call outside the
 * allowlist or past expiry, and a compromised backend cannot exceed it.
 *
 * `smart-session` mode is that second thing. The other three modes are the
 * first, and they say so: `onchainEnforced` is the return value of an
 * `isSessionEnabled()` call against the Smart Sessions validator, so it is a
 * fact read from the chain rather than a claim made in a README.
 */
export const SESSION_KEY_ENFORCEMENT_NOTE =
  "Policy is enforced at the signer (server-side). The session-key grant is not " +
  "installed as an onchain permission module in this mode, so a compromised backend " +
  "could exceed these limits. onchainEnforced=false reflects that. Use " +
  "AGENCY_WALLET_MODE=smart-session for onchain scoping.";

export type WalletKind = "stub" | "session-eoa" | "smart-account" | "smart-session";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/**
 * One (contract, function) pair the session key may call. Smart Sessions scopes
 * permissions per action, not per address — a target with no declared selector
 * cannot be expressed onchain at all.
 *
 * `amountParamOffset` is the byte offset of the amount argument within the
 * calldata (0 for the first word after the selector, 32 for the second, ...).
 * When it is declared, the per-tx cap becomes an onchain parameter rule. When
 * it is not, the per-tx cap stays server-side and `enforcementReport()` says so.
 */
export interface GrantAction {
  target: Address;
  selector: Hex;
  amountParamOffset?: number;
}

/**
 * How a USD cap becomes an onchain number. There is no price oracle in the
 * validator, so the USD figure is converted here, once, at provisioning time.
 * The chain enforces the resulting TOKEN amount; the USD figure it came from is
 * our arithmetic. Anyone reading `enforcementReport()` is told exactly that.
 */
export interface SpendToken {
  address: Address;
  symbol: string;
  decimals: number;
  /** USD per whole token. 1 for a dollar stablecoin. */
  usdPerUnit: number;
}

/**
 * The authority delegated to the session key. The first four fields are the
 * same limits the policy engine checks, because this object is what the onchain
 * permission module is initialised with. The last three are what makes that
 * initialisation possible.
 */
export interface SessionKeyGrant {
  chainId: number;
  allowlist: string[];
  maxPerTxUsd: number;
  maxSpendUsd: number;
  expiresAt: string | null;
  /** (target, selector) pairs. Required for `smart-session`. */
  actions?: GrantAction[];
  /** The token the caps are denominated in onchain. */
  token?: SpendToken;
  /** Native value the session key may attach to a call. Zero by default. */
  nativeValueLimitWei?: bigint;
}

export type EnforcementSite = "onchain" | "server";

/**
 * Per-constraint truth. This is the object to put on screen next to the trade
 * log, and the answer to "which of these does the chain actually enforce?".
 */
export interface EnforcementReport {
  mode: WalletKind;
  /** Verified by reading the Smart Sessions validator, not assumed. */
  verifiedOnchain: boolean;
  allowlist: EnforcementSite;
  expiry: EnforcementSite;
  perTxCap: EnforcementSite;
  lifetimeCap: EnforcementSite;
  /** Tier and requireConfirm are our concepts; no validator models them. */
  confirmation: EnforcementSite;
  /** Server-side flag. Its onchain counterpart is removing the session. */
  killSwitch: EnforcementSite;
  notes: string[];
}

export interface MiniAppWallet {
  appId: string;
  /** The mini app's wallet — what ENS `addr` points at, what gets funded. */
  address: Address;
  kind: WalletKind;
  chainId: number;
  chainName: string;
  /** The key that actually signs. Never a root key, always revocable. */
  sessionKeyAddress: Address;
  grant: SessionKeyGrant;
  /**
   * True only when the Smart Sessions validator confirmed, on chain, that this
   * permission is enabled for this account. Never set optimistically.
   */
  onchainEnforced: boolean;
  /** Smart Sessions permission id — the onchain handle for this grant. */
  permissionId?: Hex;
  /**
   * Whether this key is this app's alone. Read from configuration at
   * provisioning time and carried on the wallet so every surface reports the
   * same answer — the autonomous panel used to assert "this key is shared" as
   * static copy, which was true then and would have gone stale the moment it
   * stopped being. See `sessionKeyScope`.
   */
  keyScope: KeyScope;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Chains — testnet only, enforced.
 * ------------------------------------------------------------------ */

/**
 * THE 0G ENTRY USED TO BE viem's `zeroGGalileoTestnet`, AND THAT IS THE WRONG
 * CHAIN. viem pins it at id **16601** (`node_modules/viem/_esm/chains/
 * definitions/0gGalileoTestnet.js`, `id: 16_601`) — the earlier Galileo V3
 * launch that still shows up on ChainList and in stale configs. Every 0G
 * contract this project actually deployed is on **16602**: `ZEROG_CHAIN_ID` in
 * `.env.local`, `GET /api/publish` answering `"chainId":16602`, and the
 * AgenticId / MiniAppRegistry addresses it reports. `identity/agentic-id.ts`
 * already had this right and says so in a comment; it is now the one definition,
 * imported rather than restated, so the two cannot drift again.
 *
 * WHY IT WAS INVISIBLE: the RPC URL and the block explorer are byte-identical
 * between the two definitions (`https://evmrpc-testnet.0g.ai`,
 * `https://chainscan-galileo.0g.ai`) — only the id and the native currency
 * differ (viem says `A0GI`, the live network is `0G`). So nothing would 404 or
 * fail to connect. A transaction signed for 16601 and posted to the 16602 node
 * is rejected by EIP-155 replay protection, which fails closed, but it fails
 * with an unrecognisable chain-id error rather than "you are on the wrong
 * network" — and a read against the right RPC would have looked perfectly fine.
 *
 * WHAT THIS DOES NOT CHANGE, stated so the fix is not read as bigger than it is:
 * nothing signs on 0G today. `resolveChain` defaults to `base-sepolia`,
 * `NEXT_PUBLIC_AGENCY_CHAIN` is unset, and the running `session-eoa` mode
 * provisions on Base Sepolia (chainId 84532) — which is what
 * `POST /api/agency/register` returns for every app. This entry is reachable only
 * by setting that env var, so the correction removes a trap rather than repairing
 * a live break.
 */
export const SUPPORTED_CHAINS = {
  "base-sepolia": baseSepolia,
  "0g-galileo": zeroGTestnet,
} as const satisfies Record<string, Chain>;

export type SupportedChainKey = keyof typeof SUPPORTED_CHAINS;

export const DEFAULT_CHAIN_KEY: SupportedChainKey = "base-sepolia";

export class MainnetRefused extends Error {
  constructor(chain: string) {
    super(
      `Refusing to operate on "${chain}": mini app wallets are testnet-only by default. ` +
        `Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}.`,
    );
    this.name = "MainnetRefused";
  }
}

/**
 * Resolves a chain key to a chain, refusing anything that is not a testnet.
 * The refusal is a throw, not a fallback, so a misconfigured env var fails the
 * request instead of quietly moving real money.
 */
export function resolveChain(key?: string): Chain {
  const wanted = (key ?? process.env.NEXT_PUBLIC_AGENCY_CHAIN ?? DEFAULT_CHAIN_KEY) as string;
  const chain = (SUPPORTED_CHAINS as Record<string, Chain>)[wanted];
  if (!chain) throw new MainnetRefused(wanted);
  if (chain.testnet !== true) throw new MainnetRefused(wanted);
  return chain;
}

/* ------------------------------------------------------------------ *
 * Default policies per agency tier.
 * ------------------------------------------------------------------ */

/**
 * Conservative defaults. Note what every tier shares: an EMPTY ALLOWLIST. A
 * freshly provisioned app can do nothing until its owner names the contracts it
 * may touch. That is the intended first-run experience.
 */
export function defaultPolicyForTier(tier: AgencyTier, wallet: string | null = null): Policy {
  const base: Policy = {
    wallet,
    maxSpendUsd: 0,
    maxPerTxUsd: 0,
    allowlist: [],
    expiresAt: null,
    requireConfirm: true,
    killSwitch: true,
    halted: false,
  };
  switch (tier) {
    case "readonly":
      // No wallet, no spend. A read-only app has nothing to enforce.
      return { ...base, wallet: null };
    case "monitor":
      // May hold a wallet and propose, but every action needs a human.
      return { ...base, maxSpendUsd: 100, maxPerTxUsd: 25, requireConfirm: true };
    case "autonomous":
      // Acts on triggers without a human — hence the expiry, which is the
      // limit you cannot forget to set.
      return {
        ...base,
        maxSpendUsd: 250,
        maxPerTxUsd: 50,
        requireConfirm: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
  }
}

export function grantFromPolicy(policy: Policy, chainId: number): SessionKeyGrant {
  return {
    chainId,
    allowlist: [...policy.allowlist],
    maxPerTxUsd: policy.maxPerTxUsd,
    maxSpendUsd: policy.maxSpendUsd,
    expiresAt: policy.expiresAt,
  };
}

/* ------------------------------------------------------------------ *
 * Provisioning.
 * ------------------------------------------------------------------ */

/** Stable per-app pseudo-address so the demo looks the same on every reload. */
export function deterministicAddress(seed: string): Address {
  return getAddress(`0x${keccak256(toHex(`atlas:${seed}`)).slice(-40)}`);
}

/** Whether one key signs for every app, or each app holds its own. */
export type KeyScope = "per-app" | "shared" | "ephemeral";

/**
 * WHOSE KEY SIGNS — the answer prd §4 P3, §7 and §14 #1b are all about.
 *
 * The file header says "Each mini app gets its own wallet. Never a shared one",
 * and until this function existed that was the design and not the behaviour:
 * `provisionWallet` read `AGENT_SESSION_PRIVATE_KEY` — one process-wide value —
 * so every app returned the same signer and every published name's `addr` record
 * pointed at the same address. §8's case for an ENS name as a SAFETY primitive
 * is that you can verify a funded address before funding it; with one key,
 * funding one app funds all of them and revoking one revokes all of them.
 *
 * The plumbing was already per-app — `sessionSecrets` and `SESSION_KEYS` are
 * both keyed by `appId`, and `ProvisionOptions.sessionPrivateKey` exists — so
 * the only thing missing was a per-app SOURCE of key material that survives a
 * restart. That is what this is: a domain-separated keccak of a master seed and
 * the app id. A 32-byte digest is a valid secp256k1 scalar, derivation is
 * deterministic so an address survives redeploys, and one secret in the
 * environment still yields a distinct funded address per app.
 *
 * PRECEDENCE, and why it is this way round rather than simply replacing the old
 * variable. Deriving from an existing `AGENT_SESSION_PRIVATE_KEY` would change
 * every app's address, which would strand whatever Base Sepolia balance is
 * already sitting on the shared one and break a funded demo silently — the exact
 * class of failure this codebase keeps auditing itself for. So:
 *
 *   AGENT_SESSION_MASTER_SEED   set → per-app derivation. The correct mode.
 *   AGENT_SESSION_PRIVATE_KEY   set → one shared key, unchanged behaviour, and
 *                                     `keyScope: "shared"` says so out loud
 *                                     rather than a UI banner asserting it.
 *   neither                     → a random key per app. Isolated, but unfunded
 *                                     and gone on restart, so it signs nothing
 *                                     real. `ephemeral`, and reported as such.
 *
 * What this does NOT do: make the policy onchain-enforced. The master seed still
 * compromises every derived key, so this is isolation between apps, not custody.
 * `smart-session` is the mode where the account itself refuses — see the header.
 */
export function sessionKeyScope(): KeyScope {
  if (process.env.AGENT_SESSION_MASTER_SEED) return "per-app";
  if (process.env.AGENT_SESSION_PRIVATE_KEY) return "shared";
  return "ephemeral";
}

function sessionKeyForApp(appId: string): Hex {
  const seed = process.env.AGENT_SESSION_MASTER_SEED;
  if (seed) {
    // Domain-separated so this digest cannot collide with `deterministicAddress`
    // above, which hashes `atlas:<seed>` for the keyless display addresses.
    return keccak256(toHex(`atlas:session-key:${seed}:${appId}`));
  }
  const shared = process.env.AGENT_SESSION_PRIVATE_KEY as Hex | undefined;
  if (shared) return shared;
  return generatePrivateKey();
}

/**
 * Session private keys live here and nowhere else — never in a manifest, never
 * in a journal entry, never in an API response. Server process only.
 */
const SESSION_KEYS = new Map<string, Address>();
const sessionSecrets = new Map<string, `0x${string}`>();

export function getSessionPrivateKey(appId: string): `0x${string}` | null {
  if (typeof window !== "undefined") return null; // never on the client
  return sessionSecrets.get(appId) ?? null;
}

/** The public half — safe to display, safe to put in an ENS text record. */
export function getSessionKeyAddress(appId: string): Address | null {
  return SESSION_KEYS.get(appId) ?? null;
}

/**
 * Revocation. Drops the key from the process; the app cannot sign again until
 * it is re-provisioned. The onchain counterpart (removing the session key from
 * the account) is the integrator step that makes this binding rather than
 * cooperative.
 */
export function revokeSessionKey(appId: string): boolean {
  const had = sessionSecrets.delete(appId);
  SESSION_KEYS.delete(appId);
  return had;
}

export interface ProvisionOptions {
  appId: string;
  tier: AgencyTier;
  policy?: Policy;
  chainKey?: SupportedChainKey;
  /** Defaults to `stub` unless AGENCY_WALLET_MODE says otherwise. */
  kind?: WalletKind;
  /** Session key for a real signer. Generated when absent (dev only). */
  sessionPrivateKey?: `0x${string}`;
  /**
   * `smart-session` only: the already-deployed ERC-7579 account the session is
   * scoped against. It is owned by the user (via Privy), NOT by the session key
   * — that separation is the entire security property. Falls back to
   * AGENCY_ACCOUNT_ADDRESS.
   */
  accountAddress?: Address;
  /** (contract, selector) pairs the session may call. Required for `smart-session`. */
  actions?: GrantAction[];
  /** Token the onchain caps are denominated in. Defaults to `defaultSpendToken()`. */
  token?: SpendToken;
}

function resolveWalletKind(explicit?: WalletKind): WalletKind {
  if (explicit) return explicit;
  const mode = process.env.AGENCY_WALLET_MODE;
  if (mode === "session-eoa" || mode === "smart-account" || mode === "smart-session" || mode === "stub") {
    return mode;
  }
  return "stub";
}

/**
 * Provisions the wallet for one mini app.
 *
 * Deliberately never throws for missing keys: without configuration it returns
 * a `stub` wallet, and the whole propose → policy → sign → journal loop still
 * runs end to end. Nothing about the enforcement path changes between modes.
 */
export async function provisionWallet(opts: ProvisionOptions): Promise<MiniAppWallet> {
  const chain = resolveChain(opts.chainKey);
  const kind = resolveWalletKind(opts.kind);
  const policy = opts.policy ?? defaultPolicyForTier(opts.tier);
  const createdAt = new Date().toISOString();

  if (opts.tier === "readonly") {
    // A read-only app is given a wallet-shaped nothing: an address for display,
    // a grant with an empty allowlist, and no key anywhere.
    return {
      appId: opts.appId,
      address: deterministicAddress(`${opts.appId}:readonly`),
      kind: "stub",
      chainId: chain.id,
      chainName: chain.name,
      sessionKeyAddress: deterministicAddress(`${opts.appId}:readonly:key`),
      grant: { ...grantFromPolicy(policy, chain.id), allowlist: [], maxPerTxUsd: 0, maxSpendUsd: 0 },
      onchainEnforced: false,
      // No key exists at this tier, so isolation is trivially true.
      keyScope: "per-app",
      createdAt,
    };
  }

  if (kind === "stub") {
    const address = deterministicAddress(opts.appId);
    const sessionKeyAddress = deterministicAddress(`${opts.appId}:session`);
    SESSION_KEYS.set(opts.appId, sessionKeyAddress);
    return {
      appId: opts.appId,
      address,
      kind,
      chainId: chain.id,
      chainName: chain.name,
      sessionKeyAddress,
      grant: grantFromPolicy(policy, chain.id),
      onchainEnforced: false,
      // `deterministicAddress(appId)` — derived per app and signs nothing.
      keyScope: "per-app",
      createdAt,
    };
  }

  // Real key material from here down.
  const pk = opts.sessionPrivateKey ?? sessionKeyForApp(opts.appId);
  // An explicitly-passed key is this app's by construction, whatever the
  // environment is doing.
  const keyScope: KeyScope = opts.sessionPrivateKey ? "per-app" : sessionKeyScope();
  const sessionAccount = privateKeyToAccount(pk);
  sessionSecrets.set(opts.appId, pk);
  SESSION_KEYS.set(opts.appId, sessionAccount.address);

  let address: Address = sessionAccount.address;
  let onchainEnforced = false;
  let permissionId: Hex | undefined;

  if (kind === "smart-session") {
    // The strict mode. It refuses to produce a wallet it cannot scope: no
    // account, no RPC, or no declared (target, selector) pairs is an error, not
    // a quiet fall-through to a mode with weaker guarantees.
    const accountAddress =
      opts.accountAddress ?? (process.env.AGENCY_ACCOUNT_ADDRESS as Address | undefined);
    if (!accountAddress) {
      throw new SessionScopeIncomplete(
        "smart-session mode needs the ERC-7579 account address (opts.accountAddress or AGENCY_ACCOUNT_ADDRESS). " +
          "The account is owned by the user; the session key is only a scoped permission on it.",
      );
    }
    const grant: SessionKeyGrant = {
      ...grantFromPolicy(policy, chain.id),
      actions: opts.actions ?? [],
      token: opts.token ?? defaultSpendToken(chain.id),
      nativeValueLimitWei: 0n,
    };
    const { permissionId: pid } = buildSmartSession(grant, sessionAccount.address);
    permissionId = pid;
    address = accountAddress;
    // The truth check. Not a constant, not an assumption: ask the validator.
    onchainEnforced = await isSmartSessionEnabled(chain, accountAddress, pid);

    return {
      appId: opts.appId,
      address,
      kind,
      chainId: chain.id,
      chainName: chain.name,
      sessionKeyAddress: sessionAccount.address,
      grant,
      onchainEnforced,
      permissionId,
      keyScope,
      createdAt,
    };
  }

  if (kind === "smart-account") {
    // Counterfactual address of the ERC-4337 account the session key owns.
    // Requires an RPC; if we cannot reach one we say so rather than pretending
    // a smart account exists.
    const smart = await tryCoinbaseSmartAccountAddress(chain, pk);
    if (smart) {
      address = smart;
    }
    // Still false: the session key is an OWNER of the account, not a scoped
    // permission. Flip this only when a Smart Sessions module is installed.
    onchainEnforced = false;
  }

  return {
    appId: opts.appId,
    address,
    kind,
    keyScope,
    chainId: chain.id,
    chainName: chain.name,
    sessionKeyAddress: sessionAccount.address,
    grant: grantFromPolicy(policy, chain.id),
    onchainEnforced,
    permissionId,
    createdAt,
  };
}

/**
 * Best-effort counterfactual smart-account address. Returns null (never a fake
 * address) when there is no RPC to ask.
 */
async function tryCoinbaseSmartAccountAddress(
  chain: Chain,
  sessionPrivateKey: `0x${string}`,
): Promise<Address | null> {
  const rpcUrl = process.env.AGENCY_RPC_URL;
  if (!rpcUrl) return null;
  try {
    const { createPublicClient, http } = await import("viem");
    const { toCoinbaseSmartAccount } = await import("viem/account-abstraction");
    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    const account = await toCoinbaseSmartAccount({
      client,
      owners: [privateKeyToAccount(sessionPrivateKey)],
      version: "1.1",
    });
    return account.address;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * ERC-7579 Smart Sessions — the grant, expressed onchain.
 * ------------------------------------------------------------------ */

/** Thrown when a grant cannot be expressed onchain. Never downgraded silently. */
export class SessionScopeIncomplete extends Error {
  constructor(detail: string) {
    super(`Cannot scope this session onchain: ${detail}`);
    this.name = "SessionScopeIncomplete";
  }
}

/**
 * USDC on Base Sepolia (Circle testnet issuance). Override with
 * AGENCY_SPEND_TOKEN / _DECIMALS / _USD for anything else. A dollar stablecoin
 * is what makes a USD cap expressible onchain without an oracle.
 */
export const BASE_SEPOLIA_USDC: SpendToken = {
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  symbol: "USDC",
  decimals: 6,
  usdPerUnit: 1,
};

export function defaultSpendToken(chainId: number): SpendToken | undefined {
  const address = process.env.AGENCY_SPEND_TOKEN as Address | undefined;
  if (address) {
    return {
      address,
      symbol: process.env.AGENCY_SPEND_TOKEN_SYMBOL ?? "TOKEN",
      decimals: Number(process.env.AGENCY_SPEND_TOKEN_DECIMALS ?? 18),
      usdPerUnit: Number(process.env.AGENCY_SPEND_TOKEN_USD ?? 1),
    };
  }
  return chainId === baseSepolia.id ? BASE_SEPOLIA_USDC : undefined;
}

/** USD -> token base units, at the rate recorded on the grant. Rounds down. */
export function toTokenUnits(usd: number, token: SpendToken): bigint {
  if (!Number.isFinite(usd) || usd < 0) return 0n;
  if (!Number.isFinite(token.usdPerUnit) || token.usdPerUnit <= 0) return 0n;
  const whole = usd / token.usdPerUnit;
  const scaled = Math.floor(whole * 10 ** token.decimals);
  return BigInt(scaled);
}

/**
 * Deterministic fingerprint of everything in a grant that affects what the
 * session key may do.
 *
 * This exists because of a sharp edge in Smart Sessions: `getPermissionId()`
 * hashes only (sessionValidator, sessionValidatorInitData, salt). It does NOT
 * cover the policies. So two sessions with the same key and wildly different
 * spending limits share a permission id, and `isSessionEnabled(permissionId)`
 * would answer `true` for a grant whose limits were never the ones enabled on
 * chain.
 *
 * Feeding the fingerprint into the salt closes that. Widen the allowlist, raise
 * a cap or move the expiry and the permission id changes, `isSessionEnabled`
 * goes false, and the signer refuses until the owner enables the new grant. The
 * chain and this process cannot drift apart without it being visible.
 */
export function grantFingerprint(grant: SessionKeyGrant, sessionKeyAddress: Address): Hex {
  const canonical = {
    chainId: grant.chainId,
    key: sessionKeyAddress.toLowerCase(),
    allowlist: [...grant.allowlist].map((a) => a.toLowerCase()).sort(),
    actions: [...(grant.actions ?? [])]
      .map((a) => `${a.target.toLowerCase()}:${a.selector.toLowerCase()}:${a.amountParamOffset ?? "-"}`)
      .sort(),
    maxPerTxUsd: grant.maxPerTxUsd,
    maxSpendUsd: grant.maxSpendUsd,
    expiresAt: grant.expiresAt,
    token: grant.token
      ? `${grant.token.address.toLowerCase()}:${grant.token.decimals}:${grant.token.usdPerUnit}`
      : null,
    nativeValueLimitWei: (grant.nativeValueLimitWei ?? 0n).toString(),
  };
  return keccak256(toHex(`atlas:grant:${JSON.stringify(canonical)}`));
}

/** 16 empty param rules, as the UniversalActionPolicy ABI requires. */
function emptyParamRules() {
  const EMPTY = {
    condition: 0, // ParamCondition.EQUAL
    offset: 0n,
    isLimited: false,
    ref: `0x${"0".repeat(64)}` as Hex,
    usage: { limit: 0n, used: 0n },
  };
  return Array.from({ length: 16 }, () => ({ ...EMPTY, usage: { ...EMPTY.usage } }));
}

/**
 * Builds the ERC-7579 Session that expresses this grant, and its permission id.
 *
 * Pure and offline — no RPC, no keys. Two mini apps with the same grant and the
 * same session key produce the same permission id, which is what makes the
 * onchain check in `provisionWallet` meaningful.
 *
 * The mapping, stated exactly:
 *   allowlist    -> `actions[]` (target + selector). Enforced by the validator.
 *   expiry       -> TimeFramePolicy as a userOp policy. Enforced.
 *   lifetime cap -> SpendingLimitsPolicy on the spend token. Enforced, in TOKEN
 *                   units converted from USD here, offchain, at a fixed rate.
 *   per-tx cap   -> UniversalActionPolicy param rule, but ONLY for actions that
 *                   declare `amountParamOffset`. Without it there is nothing in
 *                   the calldata we can safely point at, and the per-tx cap
 *                   stays server-side.
 *   native value -> ValueLimitPolicy, zero by default: a token-swap session has
 *                   no business attaching ETH to a call.
 *
 * Note what is deliberately NOT used: SMART_SESSIONS_FALLBACK_TARGET_FLAG would
 * make the session valid for any target. That is an allowlist of everything.
 */
export function buildSmartSession(
  grant: SessionKeyGrant,
  sessionKeyAddress: Address,
): { session: SmartSession; permissionId: Hex } {
  const actions = grant.actions ?? [];
  if (actions.length === 0) {
    throw new SessionScopeIncomplete(
      "no (target, selector) pairs were declared. Smart Sessions scopes permissions per action, " +
        "so an address-only allowlist cannot be expressed onchain.",
    );
  }
  const allowlist = grant.allowlist.map((a) => a.toLowerCase());
  for (const action of actions) {
    if (!allowlist.includes(action.target.toLowerCase())) {
      throw new SessionScopeIncomplete(
        `action target ${action.target} is not in the policy allowlist — the onchain session must never be wider than the policy`,
      );
    }
  }

  const validUntil = grant.expiresAt ? Math.floor(Date.parse(grant.expiresAt) / 1000) : 0;
  const userOpPolicies = validUntil > 0 ? [getTimeFramePolicy({ validUntil, validAfter: 0 })] : [];

  const perTxUnits = grant.token ? toTokenUnits(grant.maxPerTxUsd, grant.token) : 0n;
  const lifetimeUnits = grant.token ? toTokenUnits(grant.maxSpendUsd, grant.token) : 0n;

  const session: SmartSession = {
    // ECDSA over the session key. The key proves it is the session; the
    // policies decide what the session may do.
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({ threshold: 1, owners: [sessionKeyAddress] }),
    // The salt carries the grant fingerprint, so the permission id changes
    // whenever the grant does. See `grantFingerprint` for why that is load-
    // bearing rather than cosmetic.
    salt: grantFingerprint(grant, sessionKeyAddress),
    userOpPolicies,
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: actions.map((action) => {
      const actionPolicies = [
        getValueLimitPolicy({ limit: grant.nativeValueLimitWei ?? 0n }),
      ];
      if (grant.token && lifetimeUnits > 0n) {
        actionPolicies.push(
          getSpendingLimitsPolicy([{ token: grant.token.address, limit: lifetimeUnits }]),
        );
      }
      if (grant.token && action.amountParamOffset !== undefined && perTxUnits > 0n) {
        const rules = emptyParamRules();
        rules[0] = {
          condition: 4, // ParamCondition.LESS_THAN_OR_EQUAL
          offset: BigInt(action.amountParamOffset),
          isLimited: false,
          ref: pad(numberToHex(perTxUnits), { size: 32 }),
          usage: { limit: 0n, used: 0n },
        };
        actionPolicies.push(
          getUniversalActionPolicy({
            valueLimitPerUse: grant.nativeValueLimitWei ?? 0n,
            // The SDK types this tuple as exactly 16 entries; `emptyParamRules`
            // builds exactly 16, but TS cannot see the length through Array.from.
            paramRules: { length: 1n, rules: rules as never },
          }),
        );
      }
      return {
        actionTarget: action.target,
        actionTargetSelector: action.selector,
        actionPolicies,
      };
    }),
    permitERC4337Paymaster: true,
    chainId: BigInt(grant.chainId),
  };

  return { session, permissionId: getPermissionId({ session }) };
}

/** Asks the Smart Sessions validator whether this permission is live. */
export async function isSmartSessionEnabled(
  chain: Chain,
  accountAddress: Address,
  permissionId: Hex,
): Promise<boolean> {
  const rpcUrl = process.env.AGENCY_RPC_URL ?? defaultRpcUrl(chain);
  if (!rpcUrl) return false;
  try {
    const { createPublicClient, http } = await import("viem");
    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    return await isSessionEnabled({
      // module-sdk types `client` as viem's PublicClient with default generics;
      // ours is parameterised by chain, which is assignable at runtime.
      client: client as never,
      account: accountAddress,
      permissionId,
    });
  } catch {
    // Unreachable RPC means unverified, and unverified means not enforced.
    return false;
  }
}

function defaultRpcUrl(chain: Chain): string | undefined {
  return chain.rpcUrls.default.http[0];
}

/**
 * The transaction the ACCOUNT OWNER must send to turn the grant on. We cannot
 * send it — that is the point. Hand this to the owner's wallet (Privy) and the
 * session becomes real.
 */
export function getSessionEnableCall(
  grant: SessionKeyGrant,
  sessionKeyAddress: Address,
): { to: Address; data: Hex; value: bigint } {
  const { session } = buildSmartSession(grant, sessionKeyAddress);
  const execution = getEnableSessionsAction({ sessions: [session] });
  return { to: execution.target as Address, data: execution.callData as Hex, value: 0n };
}

/**
 * Per-constraint enforcement truth for one wallet. This is what the UI should
 * render next to the spend meter, and what to read out when a judge asks which
 * limits survive a compromised backend.
 */
export function enforcementReport(wallet: MiniAppWallet): EnforcementReport {
  const server: EnforcementReport = {
    mode: wallet.kind,
    verifiedOnchain: false,
    allowlist: "server",
    expiry: "server",
    perTxCap: "server",
    lifetimeCap: "server",
    confirmation: "server",
    killSwitch: "server",
    notes: [SESSION_KEY_ENFORCEMENT_NOTE],
  };

  if (wallet.kind !== "smart-session") return server;

  if (!wallet.onchainEnforced) {
    return {
      ...server,
      notes: [
        "smart-session mode, but the Smart Sessions validator reports this permission is NOT enabled " +
          "for this account. The signer will refuse to sign until the account owner sends the enable " +
          "transaction (getSessionEnableCall). Nothing is enforced onchain in the meantime.",
      ],
    };
  }

  const hasToken = Boolean(wallet.grant.token);
  const hasPerTxRule = (wallet.grant.actions ?? []).some((a) => a.amountParamOffset !== undefined);
  const notes: string[] = [
    "Verified onchain: isSessionEnabled() returned true for this permission id.",
    "Allowlist and expiry are enforced by the account itself. A compromised backend cannot call " +
      "an undeclared contract or act past expiry.",
  ];
  if (hasToken) {
    notes.push(
      `Caps are enforced in ${wallet.grant.token!.symbol} units, converted from USD offchain at ` +
        `${wallet.grant.token!.usdPerUnit} USD/unit. The chain enforces the token amount, not the dollar figure.`,
    );
  } else {
    notes.push("No spend token configured, so the USD caps remain server-side only.");
  }
  if (!hasPerTxRule) {
    notes.push(
      "No action declared amountParamOffset, so the per-transaction cap is still server-side. " +
        "The lifetime cap is onchain and bounds total loss regardless.",
    );
  }
  notes.push(
    "requireConfirm, agency tier and the kill switch flag are our concepts and stay server-side. " +
      "The kill switch's onchain counterpart is removing the session (getRemoveSessionAction).",
  );

  return {
    mode: wallet.kind,
    verifiedOnchain: true,
    allowlist: "onchain",
    expiry: wallet.grant.expiresAt ? "onchain" : "server",
    perTxCap: hasToken && hasPerTxRule ? "onchain" : "server",
    lifetimeCap: hasToken ? "onchain" : "server",
    confirmation: "server",
    killSwitch: "server",
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * App registry — server-side source of truth for "what is this app
 * allowed to do". Policies NEVER come from the request body.
 * ------------------------------------------------------------------ */

export interface RegisteredApp {
  appId: string;
  agency: Agency;
  wallet: MiniAppWallet;
  /**
   * The app's query plan, held server-side for the same reason the policy is:
   * a stream trigger re-reads its metrics from HERE, so a client cannot supply
   * the number that decides whether an autonomous app spends. Absent for the
   * cold-start demo app, which has no data plane.
   */
  data?: DataPlan | null;
  /** Free text from the manifest, used to label journal lines. */
  intent?: string;
}

const REGISTRY_KEY = "__atlas_app_registry__";
const REGISTRY_INSTANCE_KEY = "__atlas_app_registry_instance__";
type RegistryGlobal = typeof globalThis & {
  [REGISTRY_KEY]?: Map<string, RegisteredApp>;
  [REGISTRY_INSTANCE_KEY]?: string;
};

function registry(): Map<string, RegisteredApp> {
  const g = globalThis as RegistryGlobal;
  g[REGISTRY_KEY] ??= new Map<string, RegisteredApp>();
  return g[REGISTRY_KEY];
}

/**
 * THE REGISTRY IS PROCESS-LOCAL, AND THAT IS A DEPLOYMENT-SHAPED HOLE.
 *
 * `globalThis` above is one JavaScript process. This app is deployed to Vercel
 * (https://atlas-mini-apps.vercel.app), where each serverless invocation may
 * land on a different instance, and instances are recycled without notice. So
 * `POST /api/agency/register` can succeed on instance A and the very next
 * `POST /api/act` or `POST /api/stream` can hit instance B, which has never seen
 * that app and answers `404 unknown mini app` mid-demo. In `pnpm dev` this never
 * reproduces — one process, and the map even survives HMR because it hangs off
 * `globalThis` — which is exactly why it went undisclosed for so long: nothing
 * in the code, the UI or the README said it, and the only symptom is an
 * intermittent 404 that looks like a bug in the caller.
 *
 * WHY THERE IS NO DATABASE HERE. Persisting the registry would mean persisting
 * a policy, and the policy currently arrives from the client (see the TRUST
 * BOUNDARY note in `app/api/agency/register/route.ts`). Writing a client-supplied
 * spending limit to durable storage makes a temporary honesty problem permanent:
 * the correct fix is to register from the pinned manifest CID, not to give the
 * current, client-fed policy a longer life. So the process-local map stays, and
 * what changes is that it now says out loud what it is.
 *
 * `instanceId` is a fresh random per process. A client that keeps the value it
 * saw last can tell "the registry moved instances" apart from "my app was never
 * registered", which is a distinction THIS PROCESS cannot make on its own — from
 * in here, an unknown app id and an app registered on a sibling instance are the
 * same absence.
 */
export interface RegistryScope {
  /** Where the registry lives. `process` means: gone on redeploy, not shared. */
  scope: "process";
  /** Random per process. Changes ⇒ you are talking to a different instance. */
  instanceId: string;
  /** Survives a restart, a redeploy, or a second serverless instance? No. */
  durable: false;
  /** Apps this instance currently holds. Zero is normal on a cold instance. */
  registeredApps: number;
  note: string;
}

export function registryScope(): RegistryScope {
  const g = globalThis as RegistryGlobal;
  g[REGISTRY_INSTANCE_KEY] ??= Math.random().toString(36).slice(2, 10);
  return {
    scope: "process",
    instanceId: g[REGISTRY_INSTANCE_KEY],
    durable: false,
    registeredApps: registry().size,
    note:
      "The app registry is an in-memory Map on globalThis, scoped to ONE server process. " +
      "On a serverless deployment a register call and the act/stream call that follows it " +
      "can land on different instances, and the second one will answer 404 until the client " +
      "re-registers. Re-POST the manifest to /api/agency/register and retry; that is the " +
      "documented recovery and the client already does it on a 404.",
  };
}

export function registerApp(app: RegisteredApp): RegisteredApp {
  registry().set(app.appId, app);
  return app;
}

export function getApp(appId: string): RegisteredApp | undefined {
  return registry().get(appId);
}

export function listApps(): RegisteredApp[] {
  return [...registry().values()];
}

/** Trips the kill switch. Irreversible from the app's side by design. */
export function haltApp(appId: string): boolean {
  const app = registry().get(appId);
  if (!app) return false;
  app.agency.policy.halted = true;
  return true;
}

export function resumeApp(appId: string): boolean {
  const app = registry().get(appId);
  if (!app) return false;
  app.agency.policy.halted = false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Re-registration — what a second POST of the same app id may change
 * ------------------------------------------------------------------ */

/**
 * Order-independent JSON, so "the same plan" does not read as a divergence just
 * because two clients serialised their object keys in a different order.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function differs(a: unknown, b: unknown): boolean {
  return canonicalJson(a) !== canonicalJson(b);
}

/**
 * What a re-registration changed, and — more importantly — what it did NOT.
 *
 * WHY THIS TYPE EXISTS. `/api/agency/register` is first-write-wins, and used to
 * answer a re-register with a bare `alreadyRegistered: true`. That is not enough
 * information to be safe with: the caller learns that ITS manifest was discarded
 * but not that the server is now running a DIFFERENT one. That is precisely how
 * the aave-guard break stayed invisible — the server was still holding a data
 * plan from an older build of the seed data (`aave-v3-arbitrum@v0.4.1`,
 * `map_reserve_updates`, both of which have not existed in `lib/seed.ts` for
 * several commits), the app page rendered the CORRECT package from its own local
 * manifest, and the only symptom was `POST /api/stream` returning
 * `Failed to parse URL from aave-v3-arbitrum@v0.4.1` with no hint that the two
 * sides disagreed about what this app streams.
 *
 * `ignored` is the field a UI must render. It means: your copy is not what runs.
 */
export interface PlanDivergence {
  /** True when the posted manifest differed from what this instance held. */
  diverged: boolean;
  /**
   * Non-policy fields that differed and were TAKEN from the posted manifest.
   * After this call the client and the server agree about them.
   */
  refreshed: string[];
  /**
   * Fields that differed and were REFUSED. The first registration still runs.
   * Non-empty means the UI and the server disagree and the UI is wrong.
   */
  ignored: string[];
  /** One sentence, safe to render verbatim. Empty when nothing diverged. */
  summary: string;
}

/**
 * The manifest half a re-registration is allowed to touch.
 *
 * THE SPLIT, AND WHY IT IS DRAWN EXACTLY HERE. A stream package is a CLOCK, not
 * a metric. `stream-runner.ts` says it, `enrich.ts` says it, and `seed.ts` says
 * it in the comment above `SEED_SPKG`: the Substreams tick decides *when* a
 * trigger re-evaluates, and the numbers it compares are re-read server-side from
 * `data.sources` / `data.queries` on every block, with the tick payload
 * namespaced under `block` so it can never shadow one of ours. So:
 *
 *   REFRESHABLE — `data.stream` and `intent`. Neither can raise a cap, add an
 *   allowlist entry, move an expiry, clear `halted`, change a tier, or change a
 *   number a condition compares. The worst a hostile re-register achieves is
 *   pointing the clock at a package that fails to parse or never ticks: a denial
 *   of service against an app, not an escalation of what it may spend. It buys
 *   no new reach either — any client can already register a FRESH app id with an
 *   arbitrary package URL, so the set of URLs this server will fetch is
 *   unchanged by allowing the refresh.
 *
 *   NOT REFRESHABLE — everything else in `data` (`sources`, `queries`,
 *   `variables`, `schemas`, `networks`, `transport`) and ALL of `agency`. Those
 *   decide the value a condition is tested against and the limits that bound the
 *   result. Letting a re-register replace `sources` would hand a hostile client
 *   the number that decides whether an autonomous app spends — the single thing
 *   `/api/act` and `/api/stream` both refuse to accept in a request body. It
 *   would be the same hole through a slower door.
 *
 * When in doubt the answer was "not refreshable". `sources` is genuinely the
 * other half of the stale-plan problem and it is deliberately left stale-and-
 * reported rather than stale-and-fixed, because reporting cannot widen a grant
 * and refreshing can.
 *
 * Compares a posted manifest against what this instance already holds, applies
 * the refreshable half, and describes both halves. Pure apart from the mutation
 * of the registered app's `data.stream` / `intent`.
 *
 * Callers must treat a non-empty `ignored` as a fact to display, not a warning
 * to log: the whole point is that the client's manifest is NOT what runs.
 */
export function reconcileRegistration(
  appId: string,
  posted: { agency: Agency; data?: DataPlan | null; intent?: string },
): PlanDivergence {
  const app = registry().get(appId);
  if (!app) {
    return { diverged: false, refreshed: [], ignored: [], summary: "" };
  }

  const refreshed: string[] = [];
  const ignored: string[] = [];

  /* ---- the refreshable half ------------------------------------- */

  // The clock. `resolveStreamTarget` reads only `package` and `module`; `filter`
  // travels with them so the block stays one object rather than two half-updated
  // ones.
  const postedStream = posted.data?.stream ?? null;
  const heldStream = app.data?.stream ?? null;
  if (posted.data && differs(heldStream, postedStream)) {
    if (app.data) {
      app.data = { ...app.data, stream: postedStream };
      refreshed.push("data.stream");
    } else {
      // The app was registered WITHOUT a server-side data plan at all — the
      // cold-start demo app is the case, and `/api/stream` deliberately skips
      // enrichment for it rather than inventing metrics. Adopting the posted
      // plan here would mean adopting `sources` along with the clock, which is
      // the half that is not ours to take. So this is a refusal, reported.
      ignored.push("data (this instance holds no data plan for this app; the clock alone cannot be grafted onto one)");
    }
  }

  // A label on journal lines and the string handed to `planFromDataPlan`. It
  // cannot gate a spend.
  if (posted.intent !== undefined && posted.intent !== app.intent) {
    app.intent = posted.intent;
    refreshed.push("intent");
  }

  /* ---- the refused half ------------------------------------------ */

  // Policy first, because it is the one a reader most needs to see refused.
  //
  // `policy.wallet` is deliberately NOT in this list. It is a client-side claim
  // about a server-held key — `provisionWallet` overwrites it on registration and
  // the app page has rendered the server's address rather than the manifest's
  // since the seed apps were caught claiming hand-written 40-hex addresses nobody
  // holds the key to. Comparing it would flag a divergence on literally every
  // re-register (the manifest carries `null`, the registry carries the provisioned
  // address), and a field that always cries wolf trains a UI to stop reading it.
  const heldPolicy = app.agency.policy;
  const postedPolicy = posted.agency.policy;
  for (const field of [
    "maxSpendUsd",
    "maxPerTxUsd",
    "allowlist",
    "expiresAt",
    "requireConfirm",
    "killSwitch",
    "halted",
  ] as const) {
    if (differs(heldPolicy[field], postedPolicy[field])) ignored.push(`agency.policy.${field}`);
  }
  if (app.agency.tier !== posted.agency.tier) ignored.push("agency.tier");
  if (differs(app.agency.triggers, posted.agency.triggers)) ignored.push("agency.triggers");
  if (differs(app.agency.actions, posted.agency.actions)) ignored.push("agency.actions");

  // The metric half of the data plan. Stale here means the trigger compares a
  // number read through the first registration's sources — worth saying, not
  // worth silently replacing.
  if (posted.data && app.data) {
    for (const field of [
      "sources",
      "queries",
      "variables",
      "schemas",
      "networks",
      "transport",
    ] as const) {
      if (differs(app.data[field], posted.data[field])) ignored.push(`data.${field}`);
    }
  }

  const diverged = refreshed.length > 0 || ignored.length > 0;
  const parts: string[] = [];
  if (refreshed.length > 0) {
    parts.push(`Refreshed from the posted manifest: ${refreshed.join(", ")}.`);
  }
  if (ignored.length > 0) {
    parts.push(
      `NOT refreshed — this instance keeps the values it was first registered with, ` +
        `so your copy is not what runs: ${ignored.join(", ")}. ` +
        `Policy and the metric half of the data plan are first-write-wins on purpose: ` +
        `a re-registration that could change them could raise its own spending limit.`,
    );
  }

  return { diverged, refreshed, ignored, summary: parts.join(" ") };
}

/**
 * Uniswap V3 SwapRouter02 on Base Sepolia — the demo seed's single allowlisted
 * contract. Testnet, and the only address the demo app can touch.
 */
export const BASE_SEPOLIA_SWAP_ROUTER = "0x94cc0aac535ccdb3c01d6787d6413c739ae12bc4";

/**
 * `exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))`
 * on SwapRouter02. The demo's one allowlisted (target, selector) pair — this is
 * the granularity Smart Sessions works at, and the reason a bare address
 * allowlist cannot be expressed onchain.
 */
export const SWAP_ROUTER_EXACT_INPUT_SINGLE: Hex = "0x04e45aaf";

export const DEMO_GRANT_ACTIONS: GrantAction[] = [
  {
    target: BASE_SEPOLIA_SWAP_ROUTER,
    selector: SWAP_ROUTER_EXACT_INPUT_SINGLE,
    // `amountIn` is the 5th word of the struct: 4 * 32 bytes in.
    amountParamOffset: 128,
  },
];

/**
 * Seeds one autonomous demo app so `POST /api/act` works on a cold start with
 * zero configuration. Idempotent.
 *
 * THIS IS THE ONLY APP THAT CAN RECOVER ITSELF, and the reason is worth stating
 * because it is also the argument for why every OTHER app must fail loudly when
 * this instance has never seen it (see `registryScope()` above for the
 * serverless split-brain that makes that a routine event, not a corner case).
 *
 * `demo`'s policy is a constant IN THIS FILE: the allowlist, the $50 per-tx cap
 * and the $250 lifetime cap below are written by the server and cannot be
 * influenced by a caller. So re-deriving them on a cold instance restores
 * exactly the grant that was there before — recovery with no trust transfer.
 *
 * A published mini app has no such server-side source. Its policy exists only in
 * the manifest the client holds. The only "graceful degradation" available to
 * `/api/act` or `/api/stream` on a cold instance would be to accept a manifest
 * in the ACTION request and provision from it — which is precisely the thing
 * both routes exist to refuse, because a caller that can attach a policy to the
 * request that spends is a caller that sets its own spending limit. Recovering
 * quietly would be worse than a 404: the 404 is a demo hiccup, the recovery is a
 * hole. So the routes 404, and they say what to do about it: re-POST the
 * manifest to `/api/agency/register`, which is a separate, explicit,
 * first-write-wins call, and then retry. `lib/store.ts` already does exactly
 * that on a 404 for both endpoints.
 */
export async function ensureDemoApp(appId = "demo"): Promise<RegisteredApp> {
  const existing = getApp(appId);
  if (existing) return existing;

  const policy: Policy = {
    ...defaultPolicyForTier("autonomous"),
    allowlist: [BASE_SEPOLIA_SWAP_ROUTER],
    maxPerTxUsd: 50,
    maxSpendUsd: 250,
  };
  const wallet = await provisionWallet({
    appId,
    tier: "autonomous",
    policy,
    // Carried in every mode: in `stub` they are unused, in `smart-session` they
    // are what makes the grant expressible onchain. The demo app is therefore
    // upgradeable to real enforcement by an env var alone.
    actions: DEMO_GRANT_ACTIONS,
  });
  policy.wallet = wallet.address;

  const agency: Agency = {
    tier: "autonomous",
    triggers: [
      {
        on: "stream",
        when: "healthFactor < 1.15",
        run: "derisk",
        intervalSec: undefined,
      },
      { on: "manual", when: null, run: "derisk", intervalSec: undefined },
    ],
    actions: {
      derisk: {
        kind: "swap",
        target: BASE_SEPOLIA_SWAP_ROUTER,
        params: { amountUsd: 25, tokenIn: "WETH", tokenOut: "USDC" },
        label: "Sell WETH into USDC to restore the health factor",
      },
    },
    policy,
  };

  return registerApp({
    appId,
    agency,
    wallet: {
      ...wallet,
      grant: { ...wallet.grant, ...grantFromPolicy(policy, wallet.chainId), actions: DEMO_GRANT_ACTIONS },
    },
  });
}
