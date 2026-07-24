/**
 * PHASE 0 CONTRACT — the policy engine.
 *
 * Enforced at the signer, never suggested to the model. Every action passes
 * through this gate regardless of whether a human clicked or a trigger fired.
 *
 * Treat all indexed onchain data as untrusted input: token names, ENS text
 * records and memos are attacker-controlled. Query results must never reach
 * the planner as instructions.
 *
 * See prd.md §7.
 */
import type { Action, Policy } from "./manifest";

export type RejectionReason =
  | "not_autonomous"
  | "needs_confirm"
  | "target_not_allowlisted"
  | "exceeds_per_tx_cap"
  | "exceeds_lifetime_cap"
  | "expired"
  | "halted"
  | "no_wallet";

export interface ProposedAction {
  actionKey: string;
  action: Action;
  target: string;
  amountUsd: number;
  /** True when a human pressed the button; false when a trigger fired. */
  userInitiated: boolean;
}

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: RejectionReason; detail: string };

export interface PolicyContext {
  policy: Policy;
  /** Cumulative spend already recorded against this mini app. */
  spentUsd: number;
  now: Date;
}

/**
 * Pure and synchronous on purpose — it must be trivially testable and
 * impossible to make network-dependent. W6's definition of done includes a
 * test for every rejection path.
 */
export type EvaluatePolicy = (
  proposed: ProposedAction,
  ctx: PolicyContext,
) => PolicyDecision;

/** One entry in the action journal. Backs the on-screen trade log (W8). */
export interface JournalEntry {
  ts: string;
  kind: "QUERY" | "STREAM" | "TRIGGER" | "POLICY" | "ACTION" | "ERROR";
  message: string;
  /** Set when this line moved value — renders in --spend violet. */
  spentUsd?: number;
  txHash?: string;
  ok: boolean;
}

export interface Signer {
  /** Session key bound to a smart account. Policy is enforced onchain by the
   *  account itself, so a compromised backend still cannot exceed the cap. */
  address: string;
  execute(proposed: ProposedAction): Promise<{ txHash: string }>;
}
