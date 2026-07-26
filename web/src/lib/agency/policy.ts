/**
 * W6 — THE POLICY ENGINE.
 *
 * Implements `EvaluatePolicy` from `contracts/policy.ts`. Pure, synchronous,
 * no I/O, no clock of its own (the caller passes `now`). Every proposed action
 * passes through this gate regardless of whether a human clicked a Button or a
 * Substreams trigger fired — see `runAction()` in `./signer.ts`, which is the
 * only place in the system allowed to reach a `Signer`.
 *
 * The model proposes; the policy disposes. Nothing in here reads model output
 * as instructions, and nothing in here is reachable from a prompt.
 *
 * prd.md §7.
 */
import type { AgencyTier } from "@/lib/contracts/manifest";
import type {
  EvaluatePolicy,
  PolicyContext,
  PolicyDecision,
  ProposedAction,
  RejectionReason,
} from "@/lib/contracts/policy";

/**
 * USD amounts arrive as IEEE-754 doubles, so `100.00000000000001 > 100` is
 * true for reasons that have nothing to do with policy. Compare with a
 * tolerance far below one cent — it forgives float noise and forgives nothing
 * else.
 */
export const USD_EPSILON = 1e-9;

/**
 * The contract's `ProposedAction`, plus one optional field: a human explicitly
 * approved *this* action after a trigger proposed it (the monitor-tier flow —
 * app notices something, human presses Confirm). Optional, so this type stays
 * assignable from a plain `ProposedAction`.
 */
export interface AgencyProposedAction extends ProposedAction {
  confirmed?: boolean;
}

/**
 * The contract's `PolicyContext`, plus the manifest's agency tier when the
 * caller knows it. When absent the tier is inferred from the policy itself
 * (`requireConfirm === false` is only ever written for an autonomous app), so
 * the engine is never *more* permissive for lack of information.
 */
export interface AgencyPolicyContext extends PolicyContext {
  tier?: AgencyTier;
}

const ALLOWED: PolicyDecision = { allowed: true };

function deny(reason: RejectionReason, detail: string): PolicyDecision {
  return { allowed: false, reason, detail };
}

/** Addresses are case-insensitive; allowlists are written by humans. */
function normalizeTarget(target: string): string {
  return target.trim().toLowerCase();
}

function isAutonomous(ctx: AgencyPolicyContext): boolean {
  if (ctx.tier) return ctx.tier === "autonomous";
  return ctx.policy.requireConfirm === false;
}

/**
 * Human-readable rejection copy. The UI and the journal both use this so the
 * user sees the same sentence the engine acted on.
 */
export const REJECTION_MESSAGE: Record<RejectionReason, string> = {
  not_autonomous: "App is not autonomous — this action needs a human",
  needs_confirm: "Policy requires explicit confirmation",
  target_not_allowlisted: "Target contract is not on the allowlist",
  exceeds_per_tx_cap: "Amount exceeds the per-transaction cap",
  exceeds_lifetime_cap: "Amount exceeds the remaining lifetime budget",
  expired: "Policy has expired",
  halted: "Kill switch is tripped",
  no_wallet: "App has no wallet",
};

/**
 * The gate.
 *
 * Order of checks. The prd lists the money checks in a specific order; the two
 * absolute blockers (`halted`, `no_wallet`) are hoisted above them on purpose.
 * A halted app must report `halted` — reporting `target_not_allowlisted` for an
 * app whose kill switch was pulled would be a true statement and a useless one.
 * Order is only observable when an action violates several rules at once; each
 * individual rule is enforced identically either way.
 *
 *   0. kill switch tripped?          -> halted
 *   1. wallet provisioned?           -> no_wallet
 *   2. policy still in date?         -> expired
 *   3. autonomous, or confirmed?     -> not_autonomous / needs_confirm
 *   4. target allowlisted?           -> target_not_allowlisted
 *   5. amount <= maxPerTxUsd?        -> exceeds_per_tx_cap
 *   6. spent + amount <= maxSpendUsd -> exceeds_lifetime_cap
 */
export function evaluatePolicy(
  proposed: AgencyProposedAction,
  ctx: AgencyPolicyContext,
): PolicyDecision {
  const { policy } = ctx;

  // 0. Kill switch. Tripped by the user or by a failed invariant; blocks
  //    everything, including user-initiated actions. No override path exists,
  //    which is the point of a kill switch.
  if (policy.halted) {
    return deny("halted", "Policy is halted — every action is blocked until it is reset");
  }

  // 1. No wallet, nothing to sign with. A forked app lands here by design:
  //    `forkManifest` strips the parent's wallet, so a fork inherits no
  //    spending authority until its owner provisions one.
  if (!policy.wallet || policy.wallet.trim() === "") {
    return deny("no_wallet", "No wallet is bound to this mini app");
  }

  // 2. Expiry. `null` means no expiry was set; an unparseable date fails closed.
  if (policy.expiresAt !== null) {
    const expiresAt = Date.parse(policy.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      return deny("expired", `Unparseable expiresAt: ${policy.expiresAt}`);
    }
    if (ctx.now.getTime() >= expiresAt) {
      return deny(
        "expired",
        `Policy expired at ${policy.expiresAt} (now ${ctx.now.toISOString()})`,
      );
    }
  }

  // 3. Authority to act without a human in the loop. `userInitiated` is the
  //    human pressing the button; `confirmed` is a human approving an action a
  //    trigger proposed. Either satisfies the confirmation requirement.
  const humanApproved = proposed.userInitiated || proposed.confirmed === true;
  if (!humanApproved) {
    if (!isAutonomous(ctx)) {
      return deny(
        "not_autonomous",
        `Tier "${ctx.tier ?? "monitor"}" may propose actions but not execute them`,
      );
    }
    if (policy.requireConfirm) {
      return deny(
        "needs_confirm",
        "Autonomous app with requireConfirm — a human must confirm this action",
      );
    }
  }

  // 4. Allowlist. An empty allowlist means no actions. No exceptions, and in
  //    particular no "well, it's a notify" carve-out.
  const allowlist = policy.allowlist.map(normalizeTarget).filter((t) => t !== "");
  if (allowlist.length === 0) {
    return deny("target_not_allowlisted", "Allowlist is empty — no actions permitted");
  }
  const target = normalizeTarget(proposed.target ?? "");
  if (target === "") {
    return deny("target_not_allowlisted", "Proposed action has no target");
  }
  if (!allowlist.includes(target)) {
    return deny("target_not_allowlisted", `Target ${proposed.target} is not on the allowlist`);
  }
  // The action carries its own target too (it came out of the manifest). If it
  // disagrees with the proposal, both must clear the allowlist — otherwise an
  // allowlisted `proposed.target` could smuggle a call to a different contract.
  const actionTarget = normalizeTarget(proposed.action.target ?? "");
  if (actionTarget !== "" && !allowlist.includes(actionTarget)) {
    return deny(
      "target_not_allowlisted",
      `Action target ${proposed.action.target} is not on the allowlist`,
    );
  }

  // 5. Per-transaction cap. A non-finite or negative amount is not a small
  //    problem to be normalised away — it fails closed here.
  const amount = proposed.amountUsd;
  if (!Number.isFinite(amount)) {
    return deny("exceeds_per_tx_cap", `Amount is not a finite number: ${String(amount)}`);
  }
  if (amount < 0) {
    return deny("exceeds_per_tx_cap", `Amount is negative: ${amount}`);
  }
  if (amount > policy.maxPerTxUsd + USD_EPSILON) {
    return deny(
      "exceeds_per_tx_cap",
      `$${amount} exceeds the per-tx cap of $${policy.maxPerTxUsd}`,
    );
  }

  // 6. Lifetime cap, against spend already journalled for this mini app.
  const spent = Number.isFinite(ctx.spentUsd) ? Math.max(0, ctx.spentUsd) : Number.POSITIVE_INFINITY;
  if (spent + amount > policy.maxSpendUsd + USD_EPSILON) {
    return deny(
      "exceeds_lifetime_cap",
      `$${amount} on top of $${spent} spent exceeds the lifetime cap of $${policy.maxSpendUsd}`,
    );
  }

  return ALLOWED;
}

/**
 * Compile-time proof that the implementation satisfies the frozen contract.
 * If `contracts/policy.ts` ever changes shape, this line fails the build.
 */
export const evaluatePolicyContract: EvaluatePolicy = evaluatePolicy;

/** One-line summary for the journal / trade log. */
export function describeDecision(
  proposed: ProposedAction,
  decision: PolicyDecision,
): string {
  const head = `${proposed.action.kind} ${proposed.actionKey} $${proposed.amountUsd} -> ${proposed.target}`;
  if (decision.allowed) return `POLICY OK  ${head}`;
  return `POLICY DENY ${head} — ${REJECTION_MESSAGE[decision.reason]} (${decision.detail})`;
}

/** Remaining budget, for the UI meter. Never negative. */
export function remainingBudgetUsd(ctx: PolicyContext): number {
  return Math.max(0, ctx.policy.maxSpendUsd - Math.max(0, ctx.spentUsd || 0));
}
