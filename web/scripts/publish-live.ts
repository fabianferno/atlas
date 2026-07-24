/**
 * Drives one real publish through the live path, the same way `store.ts` does:
 * plan + fan-out + composed A2UI are read off disk (produced by the API routes),
 * assembled into a manifest, and POSTed to /api/publish.
 *
 *   pnpm dlx tsx scripts/publish-live.ts <label> [intent]
 *
 * This is a verification harness, not product code. It exists so "the Agentic
 * ID is minted" is a transaction hash rather than an assertion.
 */
import { readFileSync } from "node:fs";
import { draftFromIntent } from "@/lib/seed";
import type { Manifest, Source } from "@/lib/contracts/manifest";

const label = process.argv[2] ?? "aave-dex-watch";
const intent =
  process.argv[3] ??
  "Watch Aave lending markets on Arbitrum and Optimism and compare them to DEX liquidity";

const plan = JSON.parse(readFileSync("/tmp/plan.json", "utf8"));
const data = JSON.parse(readFileSync("/tmp/data.json", "utf8"));
const composed = JSON.parse(readFileSync("/tmp/composed.json", "utf8"));

const local = draftFromIntent(intent);

const manifest: Manifest = {
  ...local.manifest,
  intent,
  data: {
    ...local.manifest.data,
    schemas: plan.schemas,
    networks: plan.networks,
    sources: (data.resolution?.sources as Source[] | undefined) ?? local.manifest.data.sources,
    queries: plan.queries,
    variables: plan.variables,
  },
  ui: composed.ui,
  agency: { ...local.manifest.agency, tier: plan.tier },
  provenance: {
    model: plan.model,
    compute: plan.attestationRef ? "0g-private-computer" : "local",
    attestationRef: plan.attestationRef ?? null,
    generatedAt: new Date().toISOString(),
  },
};

async function main() {
const base = process.env.BASE_URL ?? "http://localhost:3000";
const res = await fetch(`${base}/api/publish`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ manifest, options: { name: label, tier: plan.tier } }),
});

const report = await res.json();
if (!res.ok) {
  console.error("publish failed", res.status, JSON.stringify(report, null, 2).slice(0, 2000));
  process.exit(1);
}

console.log("name            ", report.name);
console.log("ensMode         ", report.ensMode);
console.log("ipfsMode        ", report.ipfsMode);
console.log("agenticIdMode   ", report.agenticIdMode);
console.log("manifest CID    ", report.manifest?.identity?.manifestCid ?? report.cid);
console.log("agenticId       ", JSON.stringify(report.manifest?.identity?.agenticId ?? null));
console.log("contract        ", report.agenticIdContract);
console.log("mint tx         ", report.mintTxHash);
console.log("registry tx     ", report.registryTxHash);
console.log("explorer        ", report.agenticIdExplorerUrl);
console.log("ENSIP-25 key    ", report.agentRegistrationKey);
console.log("warnings        ", JSON.stringify(report.warnings));
console.log("\nrecords:");
for (const [k, v] of Object.entries(report.records ?? {})) {
  console.log("  ", k, "=", typeof v === "string" ? v.slice(0, 120) : JSON.stringify(v).slice(0, 120));
}
}

void main();
