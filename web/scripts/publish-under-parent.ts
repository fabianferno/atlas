/**
 * Publish one mini app through the real pipeline, end to end, in process.
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/publish-under-parent.ts \
 *     --name=atlas-market-guard --dry-run
 *   ... drop --dry-run to pin, issue, mint and register for real
 *
 * WHY THIS EXISTS. `scripts/publish-live.ts` assembles a manifest from
 * /tmp/plan.json + /tmp/data.json + /tmp/composed.json, which means you must
 * first hit three API routes by hand and keep the files in sync. This runs the
 * same four kit calls in process — plan → resolve → fan-out → compose — then
 * publishes, so one command exercises the whole path.
 *
 * WHAT IT IS FOR. The ENS parent was renamed to `atlas-apps.eth`, and the
 * name↔token binding is deliberately immutable: `AgenticId._bindEnsName` reverts
 * `EnsNameAlreadyBound` and `MiniAppRegistry.register` reverts
 * `TokenAlreadyBound`. That is a sound property — a binding you can silently
 * move is not a binding — but it means the four names published under the old
 * parent cannot be re-pointed. Their tokens still assert `…graphminis.eth`, so
 * `mutuallyVerified` reads false for them, correctly.
 *
 * Restoring the claim therefore requires a fresh publish: new subname, new
 * token, new registry record, all three agreeing. That is what this does, using
 * the product's own publish path rather than a bespoke fixup.
 */
import { compose } from "@/lib/kit/composer";
import { fanOutDetailed } from "@/lib/kit/fanout";
import { resolveSourcesDetailed } from "@/lib/kit/resolver";
import { plan as planIntent } from "@/lib/kit/planner";
import { isLive } from "@/lib/kit/gateway";
import { identityStatus, publishWithReport } from "@/lib/identity/publish";
import { fullName, parentDomain, resolveRegistrarMode } from "@/lib/identity/ens";
import type { Manifest } from "@/lib/contracts/manifest";

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}

const label = flag("name") ?? "atlas-market-guard";
const dryRun = flag("dry-run") !== undefined;
const intent =
  flag("intent") ??
  "Watch lending markets and DEX liquidity on Arbitrum and Optimism, and alert me when total value locked drops sharply.";

async function main(): Promise<void> {
  console.log("PUBLISH UNDER PARENT");
  console.log(`  label       ${label}`);
  console.log(`  full name   ${fullName(label)}`);
  console.log(`  parent      ${parentDomain()}`);
  console.log(`  ens mode    ${resolveRegistrarMode()}`);
  console.log(`  intent      ${intent}`);
  console.log("");

  const status = identityStatus();
  console.log("  identity backends:", JSON.stringify(status));
  if (!isLive("gateway")) {
    console.error("\nGRAPH_API_KEY is not set — the fan-out would answer from fixtures.");
    process.exit(1);
  }
  console.log("");

  /* 1 — plan. Runs on 0G Compute when ZEROG_API_KEY is set. */
  const p = await planIntent({ question: intent });
  console.log(`  1. plan     tier=${p.tier} schemas=${p.schemas.join(",")} networks=${p.networks.join(",")}`);
  console.log(`              model=${p.model} attestation=${p.attestationRef ?? "none"}`);

  /* 2 — resolve real deployments and health-check them. */
  const resolution = await resolveSourcesDetailed(p.schemas, p.networks, { maxPerPair: 3 });
  console.log(`  2. resolve  ${resolution.sources.length} live of ${resolution.checked.length} probed`);
  if (resolution.sources.length === 0) {
    console.error("\nNo live deployment for that plan. Nothing honest to publish.");
    process.exit(1);
  }

  /* 3 — fan out. */
  const data = await fanOutDetailed(p, resolution.sources, { transport: "gateway", maxCostUsd: 0.5 });
  console.log(`  3. fan-out  ${data.rows.length} rows, ${data.sourcesHealthy}/${data.sourcesQueried} healthy, $${data.costUsd.toFixed(4)}, ${data.rowsSuspect} suspect`);
  if (data.rows.length === 0) {
    console.error("\nZero rows. Publishing an empty app would be worse than not publishing.");
    process.exit(1);
  }

  /* 4 — compose. */
  const composed = await compose(p, data);
  console.log(`  4. compose  ${composed.componentsUsed.length} components: ${composed.componentsUsed.join(", ")}`);

  const now = new Date().toISOString();
  const manifest: Manifest = {
    spec: "atlas/2",
    name: label,
    title: "Atlas Market Guard — Arbitrum + Optimism",
    intent,
    category: "monitor",
    tags: ["lending", "dex", "tvl"],
    data: {
      schemas: p.schemas,
      networks: p.networks,
      sources: resolution.checked,
      queries: p.queries,
      variables: p.variables,
      stream: null,
      transport: "gateway",
    },
    ui: composed.ui,
    agency: {
      tier: "monitor",
      triggers: [{ on: "stream", when: null, run: "notify" }],
      actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
      policy: {
        wallet: null,
        maxSpendUsd: 0,
        maxPerTxUsd: 0,
        allowlist: [],
        expiresAt: null,
        requireConfirm: true,
        killSwitch: true,
        halted: false,
      },
    },
    identity: { ens: null, agenticId: null, manifestCid: null },
    provenance: {
      model: p.model,
      compute: p.attestationRef ? "0g-private-computer" : "local",
      attestationRef: p.attestationRef,
      generatedAt: now,
    },
    author: null,
    appVersion: "1.0.0",
    forkedFrom: null,
    pricing: null,
    createdAt: now,
    updatedAt: now,
  };

  if (dryRun) {
    console.log("\n  DRY RUN — pipeline ran, nothing pinned, issued, minted or registered.");
    console.log(`  Would publish ${fullName(label)} with ${data.rows.length} rows of live data.`);
    return;
  }

  /* 5 — pin, issue the subname, mint the Agentic ID, register. */
  console.log("\n  5. publish  pinning, issuing, minting, registering…");
  const report = await publishWithReport(manifest, { name: label, tier: "monitor" });

  console.log("");
  console.log("RESULT");
  console.log(`  ens              ${report.ens ?? "(none)"}   via ${report.ensMode}`);
  console.log(`  manifest cid     ${report.manifestCid ?? "(none)"}   via ${report.ipfsMode}`);
  console.log(`  agentic id       token ${report.agenticIdTokenId ?? "(none)"}   via ${report.agenticIdMode}`);
  console.log(`  explorer         ${report.agenticIdExplorerUrl ?? "(none)"}`);
  console.log(`  ens tx           ${report.ensTxHash ?? "(none)"}`);
  console.log(`  mint tx          ${report.mintTxHash ?? "(none)"}`);
  console.log(`  registry tx      ${report.registryTxHash ?? "(none)"}`);
  console.log(`  registration key ${report.agentRegistrationKey ?? "(none)"}`);
  if (report.warnings.length > 0) {
    console.log("\n  WARNINGS — each one is a path that degraded:");
    for (const w of report.warnings) console.log(`    · ${w}`);
  } else {
    console.log("\n  No warnings: every path ran live.");
  }

  console.log("");
  console.log("  Verify mutual verification from the deployed origin:");
  console.log(`    curl -s ${process.env.NEXT_PUBLIC_APP_URL ?? "https://atlas-mini-apps.vercel.app"}/api/resolve/${label}`);
}

main().catch((err: unknown) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
