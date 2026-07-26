/**
 * W6 — THE SIGNER, and the one choke point that reaches it.
 *
 * `runAction()` is the only supported way to execute anything. It runs the
 * policy gate, journals the decision either way, signs only if allowed, and
 * journals the result. A human clicking a Button and a Substreams trigger
 * firing both arrive here, and neither gets a shortcut.
 *
 * Defence in depth: every `AgencySigner` re-checks the proposal against its own
 * `SessionKeyGrant` before it signs. So even a caller that skips `runAction()`
 * — a bug, a future refactor, a compromised code path — still cannot sign
 * outside the allowlist, over the per-tx cap, or past expiry.
 *
 * In `stub`, `session-eoa` and `smart-account` modes that in-process check is
 * the ONLY thing standing between a compromised backend and the funds. In
 * `smart-session` mode it is a convenience: the ERC-7579 Smart Sessions
 * validator holds the same allowlist and expiry, and rejects a violating
 * userOp regardless of what this process decides to sign.
 *
 * prd.md §7.
 */
import { keccak256, toHex } from "viem";
import type { Agency } from "@/lib/contracts/manifest";
import type { JournalEntry, PolicyDecision, ProposedAction, Signer } from "@/lib/contracts/policy";
import { getJournal, journal, type JournalStore } from "./journal";
import {
  describeDecision,
  evaluatePolicy,
  type AgencyPolicyContext,
  type AgencyProposedAction,
} from "./policy";
import {
  buildSmartSession,
  getSessionPrivateKey,
  resolveChain,
  type MiniAppWallet,
  type SessionKeyGrant,
} from "./wallet";

/** Thrown when a caller hands the signer something the grant does not cover. */
export class GrantViolation extends Error {
  constructor(detail: string) {
    super(`Session key grant violation: ${detail}`);
    this.name = "GrantViolation";
  }
}

/**
 * Thrown when `smart-session` mode is asked to sign for a permission the chain
 * has not enabled. Deliberately fatal: the alternative is signing with weaker
 * authority than the caller believes they have.
 */
export class SessionNotEnabled extends Error {
  constructor(detail: string) {
    super(`Smart session not enabled: ${detail}`);
    this.name = "SessionNotEnabled";
  }
}

export interface AgencySigner extends Signer {
  kind: MiniAppWallet["kind"];
  /**
   * "offchain" — this process decides whether to sign.
   * "onchain"  — the account rejects an out-of-grant call itself.
   *
   * Only `smart-session` can report "onchain", and only after the validator
   * confirmed the permission is enabled. `enforcementReport(wallet)` breaks it
   * down per constraint, because the answer is not uniform: with a smart
   * session the allowlist and expiry are onchain while `requireConfirm` never
   * can be.
   */
  enforcement: "offchain" | "onchain";
  grant: SessionKeyGrant;
  /** True when no real key is involved and the tx hash is simulated. */
  simulated: boolean;
}

/**
 * The signer's own copy of the gate. Intentionally duplicates the policy engine
 * rather than calling it: this check is bound to the GRANT the key was issued
 * under, not to whatever policy object the caller happens to be holding.
 */
export function assertWithinGrant(
  proposed: ProposedAction,
  grant: SessionKeyGrant,
  now: Date = new Date(),
): void {
  const allowlist = grant.allowlist.map((a) => a.trim().toLowerCase()).filter(Boolean);
  const target = (proposed.target ?? "").trim().toLowerCase();
  if (allowlist.length === 0) throw new GrantViolation("grant has an empty allowlist");
  if (!target || !allowlist.includes(target)) {
    throw new GrantViolation(`target ${proposed.target} is not in the grant allowlist`);
  }
  if (!Number.isFinite(proposed.amountUsd) || proposed.amountUsd < 0) {
    throw new GrantViolation(`amount is not a usable number: ${String(proposed.amountUsd)}`);
  }
  if (proposed.amountUsd > grant.maxPerTxUsd + 1e-9) {
    throw new GrantViolation(`$${proposed.amountUsd} exceeds the grant per-tx cap of $${grant.maxPerTxUsd}`);
  }
  if (grant.expiresAt) {
    const expiry = Date.parse(grant.expiresAt);
    if (!Number.isFinite(expiry) || now.getTime() >= expiry) {
      throw new GrantViolation(`grant expired at ${grant.expiresAt}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Implementations
 * ------------------------------------------------------------------ */

/**
 * No keys, no network, no funds — and the full loop still runs. The hash is
 * derived from the proposal so it is stable and obviously fake to anyone who
 * looks it up, which beats a random hash that looks real.
 */
export function createStubSigner(wallet: MiniAppWallet): AgencySigner {
  return {
    address: wallet.sessionKeyAddress,
    kind: "stub",
    enforcement: "offchain",
    simulated: true,
    grant: wallet.grant,
    async execute(proposed: ProposedAction) {
      assertWithinGrant(proposed, wallet.grant);
      const payload = JSON.stringify({
        app: wallet.appId,
        key: proposed.actionKey,
        target: proposed.target,
        amountUsd: proposed.amountUsd,
        kind: proposed.action.kind,
        at: Date.now(),
      });
      return { txHash: keccak256(toHex(payload)) };
    },
  };
}

/** Optional calldata carried on the action. Hex only, validated. */
function calldataFrom(proposed: ProposedAction): `0x${string}` {
  const raw = proposed.action.params?.["data"];
  if (typeof raw === "string" && /^0x([0-9a-fA-F]{2})*$/.test(raw)) return raw as `0x${string}`;
  return "0x";
}

/**
 * Session-key EOA. Real transactions on a testnet.
 *
 * Say the limitation out loud: with this signer, "the policy stopped it" means
 * our server chose not to sign.
 */
export function createSessionKeyEoaSigner(wallet: MiniAppWallet): AgencySigner {
  return {
    address: wallet.sessionKeyAddress,
    kind: "session-eoa",
    enforcement: "offchain",
    simulated: false,
    grant: wallet.grant,
    async execute(proposed: ProposedAction) {
      assertWithinGrant(proposed, wallet.grant);
      const pk = getSessionPrivateKey(wallet.appId);
      if (!pk) throw new Error("No session key available for this mini app");
      const rpcUrl = process.env.AGENCY_RPC_URL;
      if (!rpcUrl) throw new Error("AGENCY_RPC_URL is not set");

      const { createWalletClient, http } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const chain = resolveChain();
      const client = createWalletClient({
        account: privateKeyToAccount(pk),
        chain,
        transport: http(rpcUrl),
      });
      const txHash = await client.sendTransaction({
        to: proposed.target as `0x${string}`,
        data: calldataFrom(proposed),
        value: 0n,
      });
      return { txHash };
    },
  };
}

/**
 * ERC-4337 smart account (viem's Coinbase Smart Account), session key as owner,
 * transactions sent as user operations through a bundler.
 *
 * `enforcement` stays "offchain", permanently: an OWNER key has full authority
 * over the account, so this mode buys gas abstraction and nothing else
 * security-wise. It is kept because it works with a bundler and no ERC-7579
 * account. For actual onchain scoping use `createSmartSessionSigner` — that is
 * the mode where the account, not this process, holds the allowlist.
 */
export function createSmartAccountSigner(wallet: MiniAppWallet): AgencySigner {
  return {
    address: wallet.sessionKeyAddress,
    kind: "smart-account",
    enforcement: "offchain",
    simulated: false,
    grant: wallet.grant,
    async execute(proposed: ProposedAction) {
      assertWithinGrant(proposed, wallet.grant);
      const pk = getSessionPrivateKey(wallet.appId);
      if (!pk) throw new Error("No session key available for this mini app");
      const rpcUrl = process.env.AGENCY_RPC_URL;
      const bundlerUrl = process.env.AGENCY_BUNDLER_URL;
      if (!rpcUrl || !bundlerUrl) {
        throw new Error("AGENCY_RPC_URL and AGENCY_BUNDLER_URL are both required for smart-account mode");
      }

      const { createPublicClient, http } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const { createBundlerClient, toCoinbaseSmartAccount } = await import("viem/account-abstraction");
      const chain = resolveChain();
      const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
      const account = await toCoinbaseSmartAccount({
        client: publicClient,
        owners: [privateKeyToAccount(pk)],
        version: "1.1",
      });
      const bundler = createBundlerClient({
        account,
        client: publicClient,
        transport: http(bundlerUrl),
      });
      const userOpHash = await bundler.sendUserOperation({
        calls: [{ to: proposed.target as `0x${string}`, data: calldataFrom(proposed), value: 0n }],
      });
      const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash });
      return { txHash: receipt.receipt.transactionHash };
    },
  };
}

/**
 * ERC-7579 account + Rhinestone Smart Sessions. The session key is a SCOPED
 * PERMISSION on the account, not an owner of it.
 *
 * This is the mode where the answer to "what if your server is compromised?"
 * stops being a promise. The validator holds the allowlist, the expiry and the
 * token spending limit; an attacker with this process's memory can sign
 * whatever they like and the account will reject anything outside the grant.
 *
 * Two rules this implementation follows without exception:
 *
 *  1. It VERIFIES before it claims. Every execution re-reads
 *     `isSessionEnabled()` from the validator. `enforcement: "onchain"` is only
 *     ever reported for a permission the chain confirmed.
 *  2. It REFUSES rather than downgrades. If the session is not enabled, it
 *     throws — it does not quietly sign as an account owner instead. A silent
 *     downgrade here would be the exact failure this mode exists to prevent.
 */
export function createSmartSessionSigner(wallet: MiniAppWallet): AgencySigner {
  return {
    address: wallet.sessionKeyAddress,
    kind: "smart-session",
    // Reflects what provisioning verified. `execute` re-checks before signing,
    // so this can only ever be stale in the safe direction.
    enforcement: wallet.onchainEnforced ? "onchain" : "offchain",
    simulated: false,
    grant: wallet.grant,
    async execute(proposed: ProposedAction) {
      // Belt. The validator is the braces — but a request the server can
      // already tell is out of grant should never reach a bundler.
      assertWithinGrant(proposed, wallet.grant);

      const pk = getSessionPrivateKey(wallet.appId);
      if (!pk) throw new Error("No session key available for this mini app");
      const rpcUrl = process.env.AGENCY_RPC_URL;
      const bundlerUrl = process.env.AGENCY_BUNDLER_URL;
      if (!rpcUrl || !bundlerUrl) {
        throw new Error("AGENCY_RPC_URL and AGENCY_BUNDLER_URL are both required for smart-session mode");
      }

      const { createPublicClient, http } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const { createBundlerClient, entryPoint07Address, getUserOperationHash } = await import(
        "viem/account-abstraction"
      );
      const { toNexusSmartAccount } = await import("permissionless/accounts");
      const {
        SMART_SESSIONS_ADDRESS,
        SmartSessionMode,
        encodeSmartSessionSignature,
        encodeValidatorNonce,
        getAccount,
        getOwnableValidatorMockSignature,
        isSessionEnabled,
      } = await import("@rhinestone/module-sdk");

      const chain = resolveChain();
      const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
      const sessionKey = privateKeyToAccount(pk);
      const { permissionId } = buildSmartSession(wallet.grant, sessionKey.address);

      // Rule 1: verify, every time. A session can be revoked between
      // provisioning and now, and revocation must take effect immediately.
      const enabled = await isSessionEnabled({
        client: publicClient as never,
        account: wallet.address,
        permissionId,
      });
      if (!enabled) {
        // Rule 2: refuse. Do not sign as an owner instead.
        throw new SessionNotEnabled(
          `permission ${permissionId} is not enabled on ${wallet.address}. ` +
            "The account owner must send getSessionEnableCall() first. Refusing to sign.",
        );
      }

      const account = await toNexusSmartAccount({
        client: publicClient,
        owners: [sessionKey],
        version: "1.0.0",
        address: wallet.address,
      });
      const bundler = createBundlerClient({ account, client: publicClient, transport: http(bundlerUrl) });

      // The nonce key selects the validator that will check this userOp — the
      // Smart Sessions module, not the account's ownable validator.
      const nonce = encodeValidatorNonce({
        account: getAccount({ address: wallet.address, type: "nexus" }),
        validator: SMART_SESSIONS_ADDRESS,
      });

      const mockSignature = encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature: getOwnableValidatorMockSignature({ threshold: 1 }),
      });

      const userOperation = await bundler.prepareUserOperation({
        account,
        calls: [{ to: proposed.target as `0x${string}`, data: calldataFrom(proposed), value: 0n }],
        nonce,
        // Gas estimation needs a signature of the right shape, not a real one.
        signature: mockSignature,
      });

      const userOpHash = getUserOperationHash({
        chainId: chain.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation: userOperation as never,
      });
      const signature = await sessionKey.signMessage({ message: { raw: userOpHash } });
      userOperation.signature = encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature,
      });

      const sentHash = await bundler.sendUserOperation(userOperation as never);
      const receipt = await bundler.waitForUserOperationReceipt({ hash: sentHash });
      return { txHash: receipt.receipt.transactionHash };
    },
  };
}

/** Picks the implementation that matches how the wallet was provisioned. */
export function createSigner(wallet: MiniAppWallet): AgencySigner {
  switch (wallet.kind) {
    case "session-eoa":
      return createSessionKeyEoaSigner(wallet);
    case "smart-account":
      return createSmartAccountSigner(wallet);
    case "smart-session":
      return createSmartSessionSigner(wallet);
    case "stub":
    default:
      return createStubSigner(wallet);
  }
}

/* ------------------------------------------------------------------ *
 * runAction — propose, gate, sign, journal.
 * ------------------------------------------------------------------ */

export interface RunActionInput {
  appId: string;
  proposed: AgencyProposedAction;
  agency: Pick<Agency, "tier" | "policy">;
  wallet: MiniAppWallet;
  /** Defaults to the process journal. */
  store?: JournalStore;
  /** Defaults to the signer matching `wallet.kind`. */
  signer?: AgencySigner;
  now?: Date;
  /** Extra context for the journal line, e.g. which trigger proposed this. */
  source?: string;
}

export interface RunActionResult {
  decision: PolicyDecision;
  /** True only when a signature actually happened. */
  executed: boolean;
  txHash?: string;
  /** Set when the policy allowed it but signing threw. */
  error?: string;
  /** Everything appended during this call, in order. */
  entries: JournalEntry[];
  /** Cumulative spend after this call. */
  spentUsd: number;
  enforcement: AgencySigner["enforcement"];
  simulated: boolean;
}

export async function runAction(input: RunActionInput): Promise<RunActionResult> {
  const store = input.store ?? getJournal();
  const signer = input.signer ?? createSigner(input.wallet);
  const now = input.now ?? new Date();
  const entries: JournalEntry[] = [];
  const spentBefore = await store.totalSpentUsd(input.appId);

  const ctx: AgencyPolicyContext = {
    policy: input.agency.policy,
    spentUsd: spentBefore,
    now,
    tier: input.agency.tier,
  };

  const decision = evaluatePolicy(input.proposed, ctx);
  const prefix = input.source ? `[${input.source}] ` : "";
  entries.push(
    await journal.policy(store, input.appId, prefix + describeDecision(input.proposed, decision), decision.allowed),
  );

  if (!decision.allowed) {
    // A rejected action is exactly what we want visible. It is not an error and
    // it is not hidden — it is the product working.
    return {
      decision,
      executed: false,
      entries,
      spentUsd: spentBefore,
      enforcement: signer.enforcement,
      simulated: signer.simulated,
    };
  }

  try {
    const { txHash } = await signer.execute(input.proposed);
    entries.push(
      await journal.action(
        store,
        input.appId,
        `${prefix}${input.proposed.action.label || input.proposed.action.kind} — $${input.proposed.amountUsd} via ${input.proposed.target}` +
          (signer.simulated ? " (simulated)" : ""),
        { spentUsd: input.proposed.amountUsd, txHash, ok: true },
      ),
    );
    return {
      decision,
      executed: true,
      txHash,
      entries,
      spentUsd: await store.totalSpentUsd(input.appId),
      enforcement: signer.enforcement,
      simulated: signer.simulated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    entries.push(await journal.error(store, input.appId, `${prefix}Signing failed: ${message}`));
    // A failed signature spends nothing, so it is journalled without spentUsd
    // and the lifetime meter is untouched. The decision stays "allowed" —
    // policy permitted it, execution failed, and conflating the two would make
    // the log lie.
    return {
      decision,
      executed: false,
      error: message,
      entries,
      spentUsd: spentBefore,
      enforcement: signer.enforcement,
      simulated: signer.simulated,
    };
  }
}
