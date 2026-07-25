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
import { baseSepolia, zeroGGalileoTestnet } from "viem/chains";
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
import type { Agency, AgencyTier, DataPlan, Policy } from "../contracts/manifest";

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
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Chains — testnet only, enforced.
 * ------------------------------------------------------------------ */

export const SUPPORTED_CHAINS = {
  "base-sepolia": baseSepolia,
  "0g-galileo": zeroGGalileoTestnet,
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
  return getAddress(`0x${keccak256(toHex(`graphmini:${seed}`)).slice(-40)}`);
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
      createdAt,
    };
  }

  // Real key material from here down.
  const pk = opts.sessionPrivateKey ?? (process.env.AGENT_SESSION_PRIVATE_KEY as Address | undefined) ?? generatePrivateKey();
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
  return keccak256(toHex(`graphmini:grant:${JSON.stringify(canonical)}`));
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

const REGISTRY_KEY = "__graphminis_app_registry__";
type RegistryGlobal = typeof globalThis & { [REGISTRY_KEY]?: Map<string, RegisteredApp> };

function registry(): Map<string, RegisteredApp> {
  const g = globalThis as RegistryGlobal;
  g[REGISTRY_KEY] ??= new Map<string, RegisteredApp>();
  return g[REGISTRY_KEY];
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
