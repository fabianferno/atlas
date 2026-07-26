/**
 * Signer tests — the choke point.
 *
 * The important ones are the last two: a caller that skips `runAction()` and
 * reaches `signer.execute()` directly still cannot sign outside the grant.
 * That is what "enforced at the signer" has to mean to be worth saying.
 */
import type { Action, Agency, Policy } from "@/lib/contracts/manifest";
import { assert, assertEqual, assertRejects, describe, itAsync } from "@/lib/kit/testing";
import { MemoryJournalStore } from "./journal";
import type { AgencyProposedAction } from "./policy";
import { assertWithinGrant, createStubSigner, runAction, type AgencySigner } from "./signer";
import { provisionWallet, type MiniAppWallet } from "./wallet";

const ROUTER = "0x94cc0aac535ccdb3c01d6787d6413c739ae12bc4";
const OTHER = "0x1111111111111111111111111111111111111111";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    wallet: "0x2222222222222222222222222222222222222222",
    maxSpendUsd: 100,
    maxPerTxUsd: 40,
    allowlist: [ROUTER],
    expiresAt: null,
    requireConfirm: false,
    killSwitch: true,
    halted: false,
    ...overrides,
  };
}

const swap: Action = { kind: "swap", target: ROUTER, params: { amountUsd: 25 }, label: "Derisk" };

function proposal(overrides: Partial<AgencyProposedAction> = {}): AgencyProposedAction {
  return { actionKey: "derisk", action: swap, target: ROUTER, amountUsd: 25, userInitiated: false, ...overrides };
}

async function fixture(p: Policy = policy()): Promise<{ wallet: MiniAppWallet; agency: Pick<Agency, "tier" | "policy"> }> {
  const wallet = await provisionWallet({ appId: "test-app", tier: "autonomous", policy: p, kind: "stub" });
  return { wallet: { ...wallet, grant: { ...wallet.grant, allowlist: p.allowlist, maxPerTxUsd: p.maxPerTxUsd, maxSpendUsd: p.maxSpendUsd, expiresAt: p.expiresAt } }, agency: { tier: "autonomous", policy: p } };
}

describe("signer", () => {
  itAsync("the stub signer produces a tx hash with no keys configured", async () => {
    const { wallet } = await fixture();
    const signer = createStubSigner(wallet);
    const { txHash } = await signer.execute(proposal());
    assert(/^0x[0-9a-f]{64}$/.test(txHash), `expected a 32-byte hash, got ${txHash}`);
    assertEqual(signer.simulated, true);
    assertEqual(signer.enforcement, "offchain", "we do not claim onchain enforcement we do not have");
  });

  itAsync("an allowed action yields a tx hash and a journalled ACTION entry", async () => {
    const { wallet, agency } = await fixture();
    const store = new MemoryJournalStore();
    const result = await runAction({ appId: "test-app", proposed: proposal(), agency, wallet, store });

    assert(result.decision.allowed, "expected the policy to allow this");
    assert(result.executed, "expected execution");
    assert(!!result.txHash, "expected a tx hash");
    const entries = await store.list("test-app");
    assertEqual(entries.length, 2, "one POLICY line and one ACTION line");
    assertEqual(entries[0]!.kind, "POLICY");
    assertEqual(entries[1]!.kind, "ACTION");
    assertEqual(entries[1]!.spentUsd, 25, "the ACTION line carries the spend");
    assertEqual(entries[1]!.txHash, result.txHash);
    assertEqual(await store.totalSpentUsd("test-app"), 25);
  });

  itAsync("a rejected action is journalled, spends nothing, and signs nothing", async () => {
    const { wallet, agency } = await fixture(policy({ allowlist: [] }));
    const store = new MemoryJournalStore();
    const result = await runAction({ appId: "test-app", proposed: proposal(), agency, wallet, store });

    assert(!result.decision.allowed, "empty allowlist must reject");
    if (!result.decision.allowed) assertEqual(result.decision.reason, "target_not_allowlisted");
    assertEqual(result.executed, false);
    assertEqual(result.txHash, undefined);
    const entries = await store.list("test-app");
    assertEqual(entries.length, 1, "the rejection is visible, and nothing else happened");
    assertEqual(entries[0]!.kind, "POLICY");
    assertEqual(entries[0]!.ok, false);
    assert(entries[0]!.message.includes("not on the allowlist") || entries[0]!.message.includes("Allowlist is empty"), "the log says why");
    assertEqual(await store.totalSpentUsd("test-app"), 0);
  });

  itAsync("the lifetime cap is metered from the journal across calls", async () => {
    const { wallet, agency } = await fixture(policy({ maxPerTxUsd: 40, maxSpendUsd: 100 }));
    const store = new MemoryJournalStore();
    for (const amount of [40, 40]) {
      const r = await runAction({ appId: "meter", proposed: proposal({ amountUsd: amount }), agency, wallet, store });
      assert(r.executed, `expected $${amount} to execute`);
    }
    assertEqual(await store.totalSpentUsd("meter"), 80);

    const third = await runAction({ appId: "meter", proposed: proposal({ amountUsd: 40 }), agency, wallet, store });
    assert(!third.decision.allowed, "80 + 40 > 100 must be rejected");
    if (!third.decision.allowed) assertEqual(third.decision.reason, "exceeds_lifetime_cap");
    assertEqual(await store.totalSpentUsd("meter"), 80, "a rejection does not move the meter");
  });

  itAsync("a signing failure is journalled as an ERROR and spends nothing", async () => {
    const { wallet, agency } = await fixture();
    const store = new MemoryJournalStore();
    const exploding: AgencySigner = {
      ...createStubSigner(wallet),
      async execute() {
        throw new Error("bundler unreachable");
      },
    };
    const result = await runAction({ appId: "boom", proposed: proposal(), agency, wallet, store, signer: exploding });

    assert(result.decision.allowed, "policy allowed it; execution is a separate failure");
    assertEqual(result.executed, false);
    assertEqual(result.error, "bundler unreachable");
    const entries = await store.list("boom");
    assertEqual(entries[1]!.kind, "ERROR");
    assertEqual(await store.totalSpentUsd("boom"), 0);
  });

  describe("defence in depth — the grant, checked at the signer itself", () => {
    itAsync("refuses a target outside the grant even when called directly", async () => {
      const { wallet } = await fixture();
      const signer = createStubSigner(wallet);
      await assertRejects(
        () => signer.execute(proposal({ target: OTHER })),
        "a direct call to execute() with a non-allowlisted target",
      );
    });

    itAsync("refuses an amount over the grant cap even when called directly", async () => {
      const { wallet } = await fixture();
      const signer = createStubSigner(wallet);
      await assertRejects(
        () => signer.execute(proposal({ amountUsd: 5_000 })),
        "a direct call to execute() over the per-tx cap",
      );
    });

    itAsync("refuses an expired grant", async () => {
      const { wallet } = await fixture(policy({ expiresAt: "2020-01-01T00:00:00.000Z" }));
      const signer = createStubSigner(wallet);
      await assertRejects(() => signer.execute(proposal()), "a direct call to execute() past expiry");
    });

    itAsync("refuses everything when the grant allowlist is empty", async () => {
      const { wallet } = await fixture(policy({ allowlist: [] }));
      const signer = createStubSigner(wallet);
      await assertRejects(() => signer.execute(proposal()), "empty grant allowlist");
    });

    itAsync("assertWithinGrant accepts exactly what the policy accepts", async () => {
      const { wallet } = await fixture();
      assertWithinGrant(proposal({ amountUsd: 40 }), wallet.grant);
    });
  });
});
