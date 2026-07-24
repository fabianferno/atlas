/**
 * Policy engine tests — one for EVERY `RejectionReason`, plus the boundaries.
 *
 * `REASON_COVERAGE` below is typed as `Record<RejectionReason, ...>`, so adding
 * a rejection reason to the contract without adding a test for it is a
 * compile error, not an oversight.
 */
import type { Action, Policy } from "../contracts/manifest";
import type { PolicyDecision, RejectionReason } from "../contracts/policy";
import { assert, assertEqual, describe, it } from "./harness.test";
import { evaluatePolicy, remainingBudgetUsd, type AgencyProposedAction, type AgencyPolicyContext } from "./policy";

const ROUTER = "0x94Cc0AAC535CCDb3C01d6787D6413C739ae12bc4";
const OTHER = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-07-24T12:00:00.000Z");

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    wallet: "0x2222222222222222222222222222222222222222",
    maxSpendUsd: 250,
    maxPerTxUsd: 50,
    allowlist: [ROUTER],
    expiresAt: "2026-07-25T12:00:00.000Z",
    requireConfirm: false,
    killSwitch: true,
    halted: false,
    ...overrides,
  };
}

const swap: Action = {
  kind: "swap",
  target: ROUTER,
  params: { amountUsd: 25 },
  label: "Sell WETH into USDC",
};

function proposal(overrides: Partial<AgencyProposedAction> = {}): AgencyProposedAction {
  return {
    actionKey: "derisk",
    action: swap,
    target: ROUTER,
    amountUsd: 25,
    userInitiated: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<AgencyPolicyContext> = {}): AgencyPolicyContext {
  return { policy: policy(), spentUsd: 0, now: NOW, tier: "autonomous", ...overrides };
}

/** Asserts a specific rejection and returns the reason, for coverage tracking. */
function expectRejected(decision: PolicyDecision, reason: RejectionReason): void {
  assert(!decision.allowed, `expected a rejection with reason "${reason}", got allowed`);
  if (!decision.allowed) {
    assertEqual(decision.reason, reason, "wrong rejection reason");
    assert(decision.detail.length > 0, "rejection must carry a detail string");
  }
}

const covered = new Set<RejectionReason>();
function cover(reason: RejectionReason, decision: PolicyDecision): void {
  expectRejected(decision, reason);
  covered.add(reason);
}

describe("policy engine", () => {
  describe("allows", () => {
    it("a well-formed autonomous action", () => {
      const decision = evaluatePolicy(proposal(), ctx());
      assert(decision.allowed, `expected allowed, got ${JSON.stringify(decision)}`);
    });

    it("an amount exactly at the per-tx cap", () => {
      const decision = evaluatePolicy(proposal({ amountUsd: 50 }), ctx());
      assert(decision.allowed, "an amount equal to the cap is within the cap");
    });

    it("a spend that exactly exhausts the lifetime cap", () => {
      const decision = evaluatePolicy(proposal({ amountUsd: 50 }), ctx({ spentUsd: 200 }));
      assert(decision.allowed, "200 + 50 == 250 is within a 250 cap");
    });

    it("float noise just above the cap", () => {
      const decision = evaluatePolicy(proposal({ amountUsd: 50.0000000001 }), ctx());
      assert(decision.allowed, "IEEE-754 noise is not a policy violation");
    });

    it("a user-initiated action on a requireConfirm app", () => {
      const decision = evaluatePolicy(
        proposal({ userInitiated: true }),
        ctx({ policy: policy({ requireConfirm: true }), tier: "monitor" }),
      );
      assert(decision.allowed, "a human pressing the button IS the confirmation");
    });

    it("a trigger-proposed action a human then confirmed", () => {
      const decision = evaluatePolicy(
        proposal({ userInitiated: false, confirmed: true }),
        ctx({ policy: policy({ requireConfirm: true }), tier: "monitor" }),
      );
      assert(decision.allowed, "explicit confirmation satisfies requireConfirm");
    });

    it("a case-mismatched allowlist entry", () => {
      const decision = evaluatePolicy(
        proposal({ target: ROUTER.toUpperCase() }),
        ctx({ policy: policy({ allowlist: [ROUTER.toLowerCase()] }) }),
      );
      assert(decision.allowed, "addresses compare case-insensitively");
    });

    it("an action with no expiry set", () => {
      const decision = evaluatePolicy(proposal(), ctx({ policy: policy({ expiresAt: null }) }));
      assert(decision.allowed, "null expiresAt means no expiry");
    });
  });

  describe("rejects — one per RejectionReason", () => {
    it("not_autonomous: a trigger fired on a monitor-tier app", () => {
      cover(
        "not_autonomous",
        evaluatePolicy(
          proposal({ userInitiated: false }),
          ctx({ tier: "monitor", policy: policy({ requireConfirm: true }) }),
        ),
      );
    });

    it("not_autonomous: tier inferred from requireConfirm when absent", () => {
      cover(
        "not_autonomous",
        evaluatePolicy(
          proposal({ userInitiated: false }),
          { policy: policy({ requireConfirm: true }), spentUsd: 0, now: NOW },
        ),
      );
    });

    it("needs_confirm: autonomous but requireConfirm, nobody confirmed", () => {
      cover(
        "needs_confirm",
        evaluatePolicy(
          proposal({ userInitiated: false, confirmed: false }),
          ctx({ tier: "autonomous", policy: policy({ requireConfirm: true }) }),
        ),
      );
    });

    it("target_not_allowlisted: empty allowlist means NO actions", () => {
      cover(
        "target_not_allowlisted",
        evaluatePolicy(proposal(), ctx({ policy: policy({ allowlist: [] }) })),
      );
    });

    it("target_not_allowlisted: empty allowlist blocks even a human", () => {
      cover(
        "target_not_allowlisted",
        evaluatePolicy(proposal({ userInitiated: true }), ctx({ policy: policy({ allowlist: [] }) })),
      );
    });

    it("target_not_allowlisted: target is a different contract", () => {
      cover("target_not_allowlisted", evaluatePolicy(proposal({ target: OTHER }), ctx()));
    });

    it("target_not_allowlisted: no target at all", () => {
      cover("target_not_allowlisted", evaluatePolicy(proposal({ target: "" }), ctx()));
    });

    it("target_not_allowlisted: allowlisted proposal smuggling a different action target", () => {
      cover(
        "target_not_allowlisted",
        evaluatePolicy(
          proposal({ target: ROUTER, action: { ...swap, target: OTHER } }),
          ctx(),
        ),
      );
    });

    it("exceeds_per_tx_cap: over the cap", () => {
      cover("exceeds_per_tx_cap", evaluatePolicy(proposal({ amountUsd: 50.01 }), ctx()));
    });

    it("exceeds_per_tx_cap: NaN fails closed", () => {
      cover("exceeds_per_tx_cap", evaluatePolicy(proposal({ amountUsd: Number.NaN }), ctx()));
    });

    it("exceeds_per_tx_cap: Infinity fails closed", () => {
      cover(
        "exceeds_per_tx_cap",
        evaluatePolicy(proposal({ amountUsd: Number.POSITIVE_INFINITY }), ctx()),
      );
    });

    it("exceeds_per_tx_cap: a negative amount is not a refund", () => {
      cover("exceeds_per_tx_cap", evaluatePolicy(proposal({ amountUsd: -100 }), ctx()));
    });

    it("exceeds_per_tx_cap: a zero cap permits nothing", () => {
      cover(
        "exceeds_per_tx_cap",
        evaluatePolicy(proposal({ amountUsd: 0.01 }), ctx({ policy: policy({ maxPerTxUsd: 0 }) })),
      );
    });

    it("exceeds_lifetime_cap: within per-tx, over the budget", () => {
      cover("exceeds_lifetime_cap", evaluatePolicy(proposal({ amountUsd: 50 }), ctx({ spentUsd: 201 })));
    });

    it("exceeds_lifetime_cap: budget already exhausted", () => {
      cover("exceeds_lifetime_cap", evaluatePolicy(proposal({ amountUsd: 1 }), ctx({ spentUsd: 250 })));
    });

    it("exceeds_lifetime_cap: an unusable spend total fails closed", () => {
      cover("exceeds_lifetime_cap", evaluatePolicy(proposal(), ctx({ spentUsd: Number.NaN })));
    });

    it("expired: expiry is in the past", () => {
      cover(
        "expired",
        evaluatePolicy(proposal(), ctx({ policy: policy({ expiresAt: "2026-07-24T11:59:59.000Z" }) })),
      );
    });

    it("expired: expiry exactly now is expired", () => {
      cover(
        "expired",
        evaluatePolicy(proposal(), ctx({ policy: policy({ expiresAt: NOW.toISOString() }) })),
      );
    });

    it("expired: an unparseable expiry fails closed", () => {
      cover("expired", evaluatePolicy(proposal(), ctx({ policy: policy({ expiresAt: "soon" }) })));
    });

    it("expired: a human cannot act past expiry either", () => {
      cover(
        "expired",
        evaluatePolicy(
          proposal({ userInitiated: true }),
          ctx({ policy: policy({ expiresAt: "2020-01-01T00:00:00.000Z" }) }),
        ),
      );
    });

    it("halted: the kill switch blocks everything", () => {
      cover("halted", evaluatePolicy(proposal(), ctx({ policy: policy({ halted: true }) })));
    });

    it("halted: including user-initiated actions — there is no override", () => {
      cover(
        "halted",
        evaluatePolicy(proposal({ userInitiated: true, confirmed: true }), ctx({ policy: policy({ halted: true }) })),
      );
    });

    it("no_wallet: nothing to sign with", () => {
      cover("no_wallet", evaluatePolicy(proposal(), ctx({ policy: policy({ wallet: null }) })));
    });

    it("no_wallet: a fork inherits no spending authority", () => {
      // forkManifest() sets wallet to null; this is what that produces here.
      cover("no_wallet", evaluatePolicy(proposal({ userInitiated: true }), ctx({ policy: policy({ wallet: "  " }) })));
    });
  });

  describe("precedence", () => {
    it("reports halted first when everything is wrong at once", () => {
      const decision = evaluatePolicy(
        proposal({ amountUsd: 1e9, target: OTHER }),
        ctx({ policy: policy({ halted: true, wallet: null, allowlist: [], expiresAt: "2000-01-01T00:00:00.000Z" }) }),
      );
      expectRejected(decision, "halted");
    });

    it("reports no_wallet before any money check", () => {
      const decision = evaluatePolicy(
        proposal({ amountUsd: 1e9, target: OTHER }),
        ctx({ policy: policy({ wallet: null, allowlist: [] }) }),
      );
      expectRejected(decision, "no_wallet");
    });
  });

  describe("budget meter", () => {
    it("never goes negative", () => {
      assertEqual(remainingBudgetUsd({ policy: policy(), spentUsd: 900, now: NOW }), 0);
    });
    it("reports what is left", () => {
      assertEqual(remainingBudgetUsd({ policy: policy(), spentUsd: 100, now: NOW }), 150);
    });
  });

  describe("coverage", () => {
    it("has a test for every RejectionReason in the contract", () => {
      // Adding a reason to the contract without a test breaks compilation here.
      const REASON_COVERAGE: Record<RejectionReason, true> = {
        not_autonomous: true,
        needs_confirm: true,
        target_not_allowlisted: true,
        exceeds_per_tx_cap: true,
        exceeds_lifetime_cap: true,
        expired: true,
        halted: true,
        no_wallet: true,
      };
      const all = Object.keys(REASON_COVERAGE) as RejectionReason[];
      const missing = all.filter((r) => !covered.has(r));
      assert(missing.length === 0, `no test exercised: ${missing.join(", ")}`);
    });
  });
});
