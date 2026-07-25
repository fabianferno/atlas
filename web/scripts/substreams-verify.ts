/**
 * W2 verification harness — proves a block-level event fires a trigger.
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/substreams-verify.ts
 *
 * Flags:
 *   --network=arbitrum-one|optimism|base|mainnet   default arbitrum-one
 *   --blocks=3                                    ticks to consume before stopping
 *   --behind=20                                   cold-start this many blocks behind head
 *   --breach-on=2                                 which tick reports a breaching metric
 *   --no-breach                                   consume blocks, never trip the condition
 *
 * This is a verification harness, not product code. It exists so "Substreams
 * drives the trigger" is a block number and a journal line rather than an
 * assertion.
 *
 * WHAT IS REAL AND WHAT IS NOT, stated plainly because the whole point of this
 * script is to be quotable:
 *
 *   REAL  the subscription, the endpoint, the package, the per-block clock, the
 *         cursor, the trigger evaluation, the policy gate, the journal.
 *   NOT   the health factor. A live Aave position cannot be pushed under 1.4 on
 *         demand, so `--breach-on` injects the metric on a chosen tick. The
 *         script prints INJECTED next to it every time. The *event* is real; the
 *         number it carries is scripted, and no output here claims otherwise.
 *
 * Swap `enrich` for a real fan-out read and the injection disappears — that is
 * the only line that changes.
 */
import { runStream } from "@/lib/agency/stream-runner";
import { getJournal } from "@/lib/agency/journal";
import { ensureDemoApp } from "@/lib/agency/wallet";
import { isStreamLive, resolveStreamTarget, type StreamTick } from "@/lib/kit/substreams";
import { NETWORKS, type Network } from "@/lib/contracts/manifest";

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}

function intFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const networkRaw = flag("network") ?? "arbitrum-one";
if (!NETWORKS.includes(networkRaw as Network)) {
  console.error(`--network must be one of: ${NETWORKS.join(", ")}`);
  process.exit(2);
}
const network = networkRaw as Network;
const blocks = intFlag("blocks", 3);
const behind = intFlag("behind", 20);
const breachOn = flag("no-breach") !== undefined ? -1 : intFlag("breach-on", 2);

/**
 * Derive the injected metric from the app's OWN trigger condition.
 *
 * Hardcoding a "breaching" number is how this harness reported `W2 NOT satisfied`
 * against a working stream: it injected 1.2 against a demo app whose trigger is
 * `healthFactor < 1.15`, so the gate correctly declined and the failure looked
 * like the subscription's fault. Reading the threshold out of the condition means
 * the harness cannot disagree with the app it is testing.
 *
 * Returns the metric path plus a satisfying and a non-satisfying value.
 */
function metricFromCondition(when: string | null): {
  path: string;
  breaching: number;
  healthy: number;
} | null {
  if (!when) return null;
  const m = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(when);
  if (!m) return null;
  const [, path, op, raw] = m;
  const threshold = Number(raw);
  if (!Number.isFinite(threshold)) return null;
  // Step clear of the boundary so `<` and `<=` both behave as intended.
  const step = Math.max(Math.abs(threshold) * 0.1, 0.05);
  const below = threshold - step;
  const above = threshold + step;
  return op === "<" || op === "<="
    ? { path, breaching: below, healthy: above }
    : { path, breaching: above, healthy: below };
}

async function main(): Promise<void> {
  if (!isStreamLive()) {
    console.error(
      "SUBSTREAMS_API_TOKEN is not set.\n\n" +
        "  1. https://thegraph.market/dashboard → Create New Key\n" +
        "  2. copy the JWT from the API TOKEN section\n" +
        "  3. SUBSTREAMS_API_TOKEN=<jwt> in web/.env.local\n\n" +
        "Without it there is no subscription and this harness has nothing to verify.",
    );
    process.exit(1);
  }

  const target = resolveStreamTarget({ network });
  console.log("SUBSTREAMS VERIFY");
  console.log(`  network   ${network}`);
  console.log(`  endpoint  ${target.endpoint}`);
  console.log(`  package   ${target.spkg}`);
  console.log(`  module    ${target.module}`);
  console.log(`  start     ${behind} blocks behind head`);

  const app = await ensureDemoApp("substreams-verify");

  // The condition this app actually declares — not one this script assumes.
  const streamTrigger = app.agency.triggers.find((t) => t.on === "stream");
  const metric = metricFromCondition(streamTrigger?.when ?? null);
  if (!metric) {
    console.error(
      `\nCannot derive a metric from the app's stream trigger (${streamTrigger?.when ?? "none"}).\n` +
        "The harness injects the value the condition compares, so it needs a simple " +
        "`path <op> number` condition to work from.",
    );
    process.exit(2);
  }

  console.log(
    `  metric    INJECTED — ${metric.path}, ` +
      (breachOn > 0
        ? `${metric.breaching} on tick ${breachOn} (breaches "${streamTrigger?.when}"), ${metric.healthy} otherwise`
        : `${metric.healthy} throughout — nothing should fire`),
  );
  console.log("");
  console.log(`  app       ${app.appId} · tier ${app.agency.tier} · wallet ${app.wallet.address}`);
  console.log(`  trigger   ${app.agency.triggers.map((t) => `${t.on}: ${t.when ?? "(always)"} → ${t.run}`).join("  |  ")}`);
  console.log(`  policy    max $${app.agency.policy.maxPerTxUsd}/tx, $${app.agency.policy.maxSpendUsd} lifetime, ${app.agency.policy.allowlist.length} allowlisted target(s)`);
  console.log("");

  let seen = 0;
  const enrich = (tick: StreamTick) => {
    seen += 1;
    const value = seen === breachOn ? metric.breaching : metric.healthy;
    console.log(
      `  block ${tick.blockNumber} ${tick.blockId.slice(0, 10)}… ${tick.at.toISOString()} ` +
        `${tick.final ? "final" : "unfinal"} · ${metric.path} ${value} (INJECTED)`,
    );
    return { [metric.path]: value };
  };

  const started = Date.now();
  const summary = await runStream({
    appId: app.appId,
    network,
    enrich,
    maxTicks: blocks,
    startBlockNum: -Math.abs(behind),
    ignoreCursor: true,
    onTick: (tick, runs) => {
      for (const run of runs) {
        if (!run.firing.fired) continue;
        const decision = run.result?.decision;
        const verdict = decision?.allowed
          ? `ALLOWED${run.result?.txHash ? ` tx ${run.result.txHash}` : ""}${run.result?.simulated ? " (simulated)" : ""}`
          : `REJECTED ${decision && !decision.allowed ? `${decision.reason}: ${decision.detail}` : ""}`;
        console.log(`        └─ FIRED ${run.firing.triggerKey} at block ${tick.blockNumber} → ${verdict}`);
      }
    },
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log("");
  console.log("RESULT");
  console.log(`  blocks consumed     ${summary.ticks} (${summary.firstBlock} → ${summary.lastBlock}) in ${elapsed}s`);
  console.log(`  trigger firings     ${summary.firings} on ${summary.ticksWithFiring} block(s)`);
  console.log(`  executed            ${summary.executed}`);
  console.log(`  policy rejections   ${summary.rejected}${summary.rejections.length ? ` — ${summary.rejections.join(", ")}` : ""}`);
  console.log(`  reorgs              ${summary.undos}`);
  console.log(`  resume cursor       ${summary.lastCursor?.slice(0, 32) ?? "(none)"}…`);
  if (summary.txHashes.length > 0) console.log(`  tx hashes           ${summary.txHashes.join(", ")}`);

  console.log("");
  console.log("JOURNAL");
  for (const entry of await getJournal().list(app.appId)) {
    console.log(`  ${entry.ts} ${entry.kind.padEnd(7)} ${entry.ok ? " " : "✗"} ${entry.message}`);
  }

  // The definition of done is not "it streamed". It is that a block-level event
  // reached the trigger evaluator.
  const ok = summary.ticks > 0 && (breachOn < 0 ? summary.firings === 0 : summary.firings > 0);
  console.log("");
  console.log(
    ok
      ? "✅ W2 satisfied — a block-level event fired a trigger callback and the gate decided."
      : "❌ W2 NOT satisfied — see above.",
  );
  if (!ok) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
