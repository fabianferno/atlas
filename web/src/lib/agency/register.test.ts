/**
 * RE-REGISTRATION TESTS — the trust boundary, and the stale plan it was hiding.
 *
 * `/api/agency/register` is first-write-wins because the policy it stores comes
 * from the client, and a client that could re-register could raise its own
 * spending limit. That is the whole reason the route has the shape it has, and
 * the first suite below is there to make any future "just let it re-register"
 * refactor fail out loud instead of quietly widening a live grant.
 *
 * The second suite is the defect that motivated splitting the rule. First-write-
 * wins used to discard the ENTIRE posted manifest, including the query plan, so
 * a server holding `aave-v3-arbitrum@v0.4.1` / `map_reserve_updates` from an
 * older build of `lib/seed.ts` kept streaming it forever while the app page
 * rendered the correct `.spkg` URL from its own manifest. The only symptom was
 * `POST /api/stream` answering 502 `Failed to parse URL from
 * aave-v3-arbitrum@v0.4.1`. These tests pin both halves of the new rule: the
 * clock refreshes, the metrics do not, and whatever is refused is REPORTED.
 *
 * Everything here is offline — `kind: "stub"` needs no key and signs nothing.
 */
import type { Agency, DataPlan } from "../contracts/manifest";
import { assert, assertEqual, describe, it, itAsync } from "./harness.test";
import {
  getApp,
  provisionWallet,
  reconcileRegistration,
  registerApp,
  registryScope,
} from "./wallet";

const ROUTER = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";
const ATTACKER_ROUTER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

/** The package every seed app carries today. A real URL, one verified module. */
const GOOD_SPKG = "https://spkg.io/streamingfast/ethereum-explorer-v0.1.2.spkg";
/** The invented package name the polluted registry was still holding. */
const STALE_SPKG = "aave-v3-arbitrum@v0.4.1";

function agency(overrides: Partial<Agency> = {}): Agency {
  return {
    tier: "autonomous",
    triggers: [{ on: "stream", when: "lending.totalBorrowBalanceUSD > 115000000", run: "rebalance" }],
    actions: {
      rebalance: { kind: "swap", target: ROUTER, params: { amountUsd: 25 }, label: "De-risk" },
    },
    policy: {
      wallet: null,
      maxSpendUsd: 500,
      maxPerTxUsd: 50,
      allowlist: [ROUTER],
      expiresAt: "2026-08-25T00:00:00.000Z",
      requireConfirm: true,
      killSwitch: true,
      halted: false,
    },
    ...overrides,
  };
}

function dataPlan(overrides: Partial<DataPlan> = {}): DataPlan {
  return {
    schemas: ["lending-cdp@3.1.0"],
    networks: ["arbitrum-one"],
    sources: [
      {
        subgraphId: "honest-source",
        schema: "lending-cdp@3.1.0",
        network: "arbitrum-one",
        healthCheckedAt: "2026-07-25T12:00:00.000Z",
        healthy: true,
      },
    ],
    queries: { lending: "{ marketDailySnapshots { totalBorrowBalanceUSD } }" },
    variables: {},
    stream: { package: STALE_SPKG, module: "map_reserve_updates", filter: {} },
    transport: "gateway",
    ...overrides,
  };
}

/** Registers one app under a unique id so suites cannot contaminate each other. */
async function seed(appId: string, over: { agency?: Agency; data?: DataPlan } = {}) {
  const wallet = await provisionWallet({ appId, tier: "autonomous", kind: "stub" });
  return registerApp({
    appId,
    agency: over.agency ?? agency(),
    wallet,
    data: over.data ?? dataPlan(),
    intent: "watch the market and de-risk",
  });
}

/* ------------------------------------------------------------------ *
 * The property that must survive every future refactor
 * ------------------------------------------------------------------ */

describe("re-registration cannot widen a live grant", () => {
  itAsync("refuses every policy field a hostile client would want", async () => {
    const appId = "widen-attempt";
    await seed(appId);

    // Everything an attacker would post: a bigger budget, its own router in the
    // allowlist, an expiry a year out, confirmation off, the kill switch removed,
    // and `halted` cleared in case the app had been stopped.
    const hostile = agency({
      tier: "autonomous",
      policy: {
        wallet: null,
        maxSpendUsd: 1_000_000,
        maxPerTxUsd: 999_999,
        allowlist: [ROUTER, ATTACKER_ROUTER],
        expiresAt: "2099-01-01T00:00:00.000Z",
        requireConfirm: false,
        killSwitch: false,
        halted: false,
      },
    });

    const divergence = reconcileRegistration(appId, { agency: hostile, data: dataPlan() });
    const app = getApp(appId);
    assert(app !== undefined, "app should still be registered");

    const policy = app!.agency.policy;
    assertEqual(policy.maxSpendUsd, 500, "lifetime cap must not move");
    assertEqual(policy.maxPerTxUsd, 50, "per-tx cap must not move");
    assertEqual(policy.allowlist.length, 1, "allowlist must not gain an entry");
    assertEqual(policy.allowlist[0], ROUTER, "allowlist entry must be the original");
    assertEqual(policy.expiresAt, "2026-08-25T00:00:00.000Z", "expiry must not extend");
    assertEqual(policy.requireConfirm, true, "requireConfirm must not be switched off");
    assertEqual(policy.killSwitch, true, "killSwitch must not be removed");

    // And the refusal is reported, field by field, not merely performed.
    for (const field of [
      "agency.policy.maxSpendUsd",
      "agency.policy.maxPerTxUsd",
      "agency.policy.allowlist",
      "agency.policy.expiresAt",
      "agency.policy.requireConfirm",
      "agency.policy.killSwitch",
    ]) {
      assert(divergence.ignored.includes(field), `${field} should be reported as ignored`);
    }
  });

  itAsync("cannot clear the halt flag", async () => {
    const appId = "halt-clear-attempt";
    const seeded = await seed(appId);
    seeded.agency.policy.halted = true; // as `haltApp` would leave it

    const divergence = reconcileRegistration(appId, {
      agency: agency({ policy: { ...agency().policy, halted: false } }),
      data: dataPlan(),
    });

    assertEqual(getApp(appId)!.agency.policy.halted, true, "kill switch must stay tripped");
    assert(divergence.ignored.includes("agency.policy.halted"), "the refusal must be reported");
  });

  itAsync("cannot escalate the tier, retarget an action, or add a trigger", async () => {
    const appId = "tier-attempt";
    await seed(appId, { agency: agency({ tier: "monitor" }) });

    const divergence = reconcileRegistration(appId, {
      agency: agency({
        tier: "autonomous",
        triggers: [
          { on: "stream", when: null, run: "rebalance" },
          { on: "manual", when: null, run: "rebalance" },
        ],
        actions: {
          rebalance: {
            kind: "swap",
            target: ATTACKER_ROUTER,
            params: { amountUsd: 25 },
            label: "De-risk",
          },
        },
      }),
      data: dataPlan(),
    });

    const app = getApp(appId)!;
    assertEqual(app.agency.tier, "monitor", "tier must not escalate");
    assertEqual(app.agency.actions["rebalance"]!.target, ROUTER, "action target must not move");
    assertEqual(app.agency.triggers.length, 1, "triggers must not be replaced");
    assert(divergence.ignored.includes("agency.tier"), "tier change must be reported");
    assert(divergence.ignored.includes("agency.actions"), "action change must be reported");
    assert(divergence.ignored.includes("agency.triggers"), "trigger change must be reported");
  });

  itAsync("cannot swap the sources a trigger reads its number from", async () => {
    // The subtler escalation: leave the policy alone, replace the data plan's
    // metric half, and the app spends up to its cap on a number you chose. This
    // is why the refresh below is narrow.
    const appId = "source-swap-attempt";
    await seed(appId);

    const divergence = reconcileRegistration(appId, {
      agency: agency(),
      data: dataPlan({
        sources: [
          {
            subgraphId: "attacker-controlled",
            schema: "lending-cdp@3.1.0",
            network: "arbitrum-one",
            healthCheckedAt: null,
            healthy: true,
          },
        ],
        queries: { lending: "{ whatever { totalBorrowBalanceUSD } }" },
      }),
    });

    const app = getApp(appId)!;
    assertEqual(app.data!.sources[0]!.subgraphId, "honest-source", "sources must not be replaced");
    assert(divergence.ignored.includes("data.sources"), "source divergence must be reported");
    assert(divergence.ignored.includes("data.queries"), "query divergence must be reported");
  });
});

/* ------------------------------------------------------------------ *
 * The stale plan, and the disclosure that replaces silence
 * ------------------------------------------------------------------ */

describe("stale data plan", () => {
  itAsync("refreshes the stream clock, which is what the 502 was", async () => {
    const appId = "stale-clock";
    await seed(appId);
    assertEqual(getApp(appId)!.data!.stream!.package, STALE_SPKG, "precondition: stale package");

    const divergence = reconcileRegistration(appId, {
      agency: agency(),
      data: dataPlan({ stream: { package: GOOD_SPKG, module: "map_block_meta", filter: {} } }),
    });

    const stream = getApp(appId)!.data!.stream!;
    assertEqual(stream.package, GOOD_SPKG, "the package the client posted must now run");
    assertEqual(stream.module, "map_block_meta", "and its module with it");
    assert(divergence.refreshed.includes("data.stream"), "the refresh must be reported");
    assert(divergence.diverged, "a changed plan is a divergence");
  });

  itAsync("refreshes the intent label, which cannot gate a spend", async () => {
    const appId = "stale-intent";
    await seed(appId);
    const divergence = reconcileRegistration(appId, {
      agency: agency(),
      data: dataPlan({ stream: { package: STALE_SPKG, module: "map_reserve_updates", filter: {} } }),
      intent: "a newer sentence",
    });
    assertEqual(getApp(appId)!.intent, "a newer sentence");
    assertEqual(divergence.refreshed.join(","), "intent", "only the intent changed");
  });

  itAsync("reports nothing when the posted manifest matches what runs", async () => {
    const appId = "identical";
    await seed(appId);
    const divergence = reconcileRegistration(appId, {
      agency: agency(),
      data: dataPlan(),
      intent: "watch the market and de-risk",
    });
    assertEqual(divergence.diverged, false, "identical manifests must not diverge");
    assertEqual(divergence.refreshed.length, 0);
    assertEqual(divergence.ignored.length, 0);
    assertEqual(divergence.summary, "", "and there is nothing to render");
  });

  itAsync("key order is not a divergence", async () => {
    // A client that serialises `{module, package}` is posting the same clock.
    // Reporting that as a disagreement would train a UI to ignore the field.
    const appId = "key-order";
    await seed(appId);
    const reordered = { module: "map_reserve_updates", package: STALE_SPKG, filter: {} };
    const divergence = reconcileRegistration(appId, {
      agency: agency(),
      data: dataPlan({ stream: reordered }),
      intent: "watch the market and de-risk",
    });
    assertEqual(divergence.diverged, false, "the same object in another order is the same object");
  });

  itAsync("a refused field always comes with a sentence a UI can render", async () => {
    const appId = "summary-shape";
    await seed(appId);
    const divergence = reconcileRegistration(appId, {
      agency: agency({ policy: { ...agency().policy, maxSpendUsd: 999_999 } }),
      data: dataPlan({ stream: { package: GOOD_SPKG, module: "map_block_meta", filter: {} } }),
    });
    assert(divergence.ignored.length > 0, "precondition: something was refused");
    assert(divergence.summary.length > 0, "a refusal with no summary is a silent refusal");
    assert(
      divergence.summary.includes("agency.policy.maxSpendUsd"),
      "the summary must name the field, not just gesture at one",
    );
    assert(divergence.summary.includes("data.stream"), "and it must say what it did refresh");
  });

  itAsync("an unknown app is not a divergence — it is an absence", async () => {
    const divergence = reconcileRegistration("never-registered-here", {
      agency: agency(),
      data: dataPlan(),
    });
    assertEqual(divergence.diverged, false);
    assertEqual(divergence.summary, "");
  });
});

/* ------------------------------------------------------------------ *
 * Half B — the disclosure itself
 * ------------------------------------------------------------------ */

describe("registry scope disclosure", () => {
  it("never claims to be durable", () => {
    const scope = registryScope();
    assertEqual(scope.scope, "process");
    assertEqual(scope.durable, false, "a Map on globalThis is not durable and must not say it is");
    assert(scope.note.includes("404"), "the note must name the symptom a reader will actually hit");
    assert(scope.note.includes("/api/agency/register"), "and the recovery");
  });

  it("carries an instance id stable within a process", () => {
    // Stable here, different on the next instance. That difference is the only
    // way a client can tell "the registry moved" from "my app never existed" —
    // the server itself cannot distinguish the two.
    assertEqual(registryScope().instanceId, registryScope().instanceId);
    assert(registryScope().instanceId.length > 0, "an empty id discloses nothing");
  });

  itAsync("counts what this instance actually holds", async () => {
    // Registered in here rather than relying on the suites above: `itAsync`
    // bodies are started, not awaited, at import time, so a synchronous
    // assertion about the map's size would be reading it before anything landed.
    await seed("scope-count");
    assert(registryScope().registeredApps >= 1, "a registered app must be counted");
  });
});
