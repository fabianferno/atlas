/**
 * W12 — put the seed registry on live data.
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/seed-live.ts
 *   ... --only=dex-volume-arb,tvl-crosschain     just those apps
 *   ... --max-per-pair=3                         deployments probed per (schema, network)
 *
 * WHY THIS EXISTS. Matrix #1 says no mocks anywhere in the demo, and the risk
 * register rates "seed content is mistaken for live data" as fatal. The 16 seed
 * apps shipped with invented subgraph ids (`5zvR82Q`) and invented figures. This
 * script replaces both: for every app it resolves REAL deployments for the
 * schema families the app declares, health-checks them, fans out, and composes
 * the result into a real A2UI document — the same four calls the Studio makes.
 *
 * The output is a generated snapshot, not a live call at page load. Two reasons:
 * the registry must render with no network and no key, and a demo should not
 * re-roll its numbers between the rehearsal and the take. The snapshot carries
 * `generatedAt` and per-app provenance so anyone can re-run it and diff.
 *
 * WHAT IT CANNOT FIX, and will tell you about: an app whose display is about one
 * user's position — a health-factor gauge, a position card — cannot be sourced
 * from the standardized fan-out, which reads protocol-level entities. Those apps
 * come back `live: false` with a reason, and stay visibly illustrative rather
 * than being quietly dressed up in real-looking numbers.
 */
import { writeFileSync } from "node:fs";
import { compose } from "@/lib/kit/composer";
import { fanOutDetailed } from "@/lib/kit/fanout";
import { resolveSourcesDetailed } from "@/lib/kit/resolver";
import { isLive } from "@/lib/kit/gateway";
import { SEED_APPS } from "@/lib/seed";
import type { PlanResult } from "@/lib/contracts/api";
import type { Source } from "@/lib/contracts/manifest";

const OUT = "src/lib/kit/seed-live.generated.json";

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}

const only = (flag("only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const maxPerPair = Number.parseInt(flag("max-per-pair") ?? "3", 10) || 3;

export interface LiveSeedEntry {
  /** True only when a real gateway answered and rows came back. */
  live: boolean;
  /** Present when `live` is false — why, in words a demo can read out. */
  reason?: string;
  generatedAt: string;
  sources: Source[];
  sourcesQueried: number;
  sourcesHealthy: number;
  rows: number;
  rowsSuspect: number;
  costUsd: number;
  elapsedMs: number;
  failures: { label: string; reason: string }[];
  /** The composed A2UI document. Replaces the fixture body when present. */
  ui?: unknown;
  componentsUsed?: string[];
}

function planOf(app: (typeof SEED_APPS)[number]): PlanResult {
  const m = app.manifest;
  return {
    intent: m.intent,
    schemas: m.data.schemas,
    networks: m.data.networks,
    queries: m.data.queries,
    variables: m.data.variables,
    tier: m.agency.tier,
    attestationRef: null,
    model: "seed-live",
  };
}

async function runOne(app: (typeof SEED_APPS)[number]): Promise<LiveSeedEntry> {
  const name = app.manifest.name;
  const generatedAt = new Date().toISOString();
  const plan = planOf(app);

  const resolution = await resolveSourcesDetailed(plan.schemas, plan.networks, { maxPerPair });
  if (resolution.sources.length === 0) {
    return {
      live: false,
      reason:
        `no live deployment for ${plan.schemas.join(", ")} on ${plan.networks.join(", ")} ` +
        `(${resolution.checked.length} probed, all dead or absent)`,
      generatedAt,
      sources: resolution.checked,
      sourcesQueried: resolution.checked.length,
      sourcesHealthy: 0,
      rows: 0,
      rowsSuspect: 0,
      costUsd: 0,
      elapsedMs: 0,
      failures: [],
    };
  }

  const data = await fanOutDetailed(plan, resolution.sources, {
    transport: "gateway",
    maxCostUsd: 0.5,
  });

  const base: LiveSeedEntry = {
    live: data.live && data.rows.length > 0,
    generatedAt,
    sources: resolution.checked,
    sourcesQueried: data.sourcesQueried,
    sourcesHealthy: data.sourcesHealthy,
    rows: data.rows.length,
    rowsSuspect: data.rowsSuspect,
    costUsd: data.costUsd,
    elapsedMs: data.elapsedMs,
    failures: data.failures.map((f) => ({ label: f.label, reason: f.reason })),
  };

  if (!base.live) {
    return {
      ...base,
      reason: data.live
        ? "every healthy deployment returned zero rows for this query shape"
        : "the fan-out answered from fixtures — no GRAPH_API_KEY",
    };
  }

  const composed = await compose(plan, data);
  console.log(
    `  ${name.padEnd(22)} ${String(data.sourcesHealthy).padStart(2)}/${String(data.sourcesQueried).padEnd(2)} live · ` +
      `${String(data.rows.length).padStart(3)} rows · $${data.costUsd.toFixed(4)} · ` +
      `${data.rowsSuspect} suspect · ${composed.componentsUsed.join(", ")}`,
  );

  return { ...base, ui: composed.ui, componentsUsed: composed.componentsUsed };
}

async function main(): Promise<void> {
  if (!isLive("gateway")) {
    console.error(
      "GRAPH_API_KEY is not set. Every app would come back from fixtures, which is " +
        "exactly the thing this script exists to remove. Set the key and re-run.",
    );
    process.exit(1);
  }

  const apps = SEED_APPS.filter((a) => only.length === 0 || only.includes(a.manifest.name));
  console.log(`SEED LIVE — ${apps.length} app(s), ≤${maxPerPair} deployments per (schema, network)\n`);

  const entries: Record<string, LiveSeedEntry> = {};
  // Sequential on purpose: the fan-out is already parallel inside, and running
  // 16 of them at once is how you get rate-limited into a false dead-source rate.
  for (const app of apps) {
    const name = app.manifest.name;
    try {
      entries[name] = await runOne(app);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`  ${name.padEnd(22)} FAILED — ${reason}`);
      entries[name] = {
        live: false,
        reason,
        generatedAt: new Date().toISOString(),
        sources: [],
        sourcesQueried: 0,
        sourcesHealthy: 0,
        rows: 0,
        rowsSuspect: 0,
        costUsd: 0,
        elapsedMs: 0,
        failures: [],
      };
    }
  }

  const live = Object.values(entries).filter((e) => e.live);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    note:
      "Generated by scripts/seed-live.ts. Every `live: true` entry is a real " +
      "resolve → health-check → fan-out → compose against The Graph's gateway. " +
      "Entries with `live: false` carry the reason and keep their fixture body.",
    appsLive: live.length,
    appsTotal: Object.keys(entries).length,
    totalCostUsd: Number(live.reduce((sum, e) => sum + e.costUsd, 0).toFixed(4)),
    apps: entries,
  };

  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);

  console.log("");
  console.log(`  ${live.length}/${Object.keys(entries).length} apps on live data · $${snapshot.totalCostUsd} total`);
  for (const [name, entry] of Object.entries(entries)) {
    if (!entry.live) console.log(`  NOT LIVE  ${name.padEnd(22)} ${entry.reason ?? "(no reason)"}`);
  }
  console.log(`\n  wrote ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
