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

const HEALTHY = 1.9;
const BREACHING = 1.2;

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
  console.log(
    `  metric    ${breachOn > 0 ? `INJECTED — tick ${breachOn} reports healthFactor ${BREACHING} (breaching)` : "INJECTED — healthy on every tick, nothing should fire"}`,
  );
  console.log("");

  const app = await ensureDemoApp("substreams-verify");
  console.log(`  app       ${app.appId} · tier ${app.agency.tier} · wallet ${app.wallet.address}`);
  console.log(`  trigger   ${app.agency.triggers.map((t) => `${t.on}: ${t.when ?? "(always)"} → ${t.run}`).join("  |  ")}`);
  console.log(`  policy    max $${app.agency.policy.maxPerTxUsd}/tx, $${app.agency.policy.maxSpendUsd} lifetime, ${app.agency.policy.allowlist.length} allowlisted target(s)`);
  console.log("");

  let seen = 0;
  const enrich = (tick: StreamTick) => {
    seen += 1;
    const healthFactor = seen === breachOn ? BREACHING : HEALTHY;
    console.log(
      `  block ${tick.blockNumber} ${tick.blockId.slice(0, 10)}… ${tick.at.toISOString()} ` +
        `${tick.final ? "final" : "unfinal"} · healthFactor ${healthFactor} (INJECTED)`,
    );
    return { healthFactor };
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
