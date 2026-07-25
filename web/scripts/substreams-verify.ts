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
import {
  BASE_SEPOLIA_SWAP_ROUTER,
  BASE_SEPOLIA_USDC,
  defaultPolicyForTier,
  ensureDemoApp,
  getApp,
  provisionWallet,
  registerApp,
  type RegisteredApp,
} from "@/lib/agency/wallet";
import { isStreamLive, resolveStreamTarget, type StreamTick } from "@/lib/kit/substreams";
import { NETWORKS, type Agency, type Network, type Policy } from "@/lib/contracts/manifest";

/* ------------------------------------------------------------------ *
 * --real: a transaction that actually lands, and is exactly what it says
 *
 * WHY NOT THE DEMO APP'S SWAP. `calldataFrom` returns `0x` unless the action
 * declares explicit `data`, and `derisk` declares none — so a real run would
 * send a 0-value, empty-calldata call to Uniswap's SwapRouter02, whose
 * `receive()` requires `msg.sender == WETH9`. That reverts. A real tx hash for a
 * FAILED transaction is worse than an honest simulation: it puts a red entry on
 * Basescan in the middle of a demo.
 *
 * A successful swap needs testnet WETH, an approval, and correct
 * `exactInputSingle` params. That is a different piece of work.
 *
 * So `--real` registers a SEPARATE app whose action is a real
 * `approve(router, 25 USDC)` on Base Sepolia USDC. It is genuinely the first
 * step of the swap, it lands, it costs only gas (approving a zero balance is
 * legal), it is signed by the app's own session key, and it passes through the
 * same policy gate — the target must be allowlisted or it is refused.
 *
 * NARRATE IT AS AN APPROVAL. "The agent signed this itself, under its policy,
 * and here it is onchain" is true. "It executed a swap" is not.
 *
 * The product's `ensureDemoApp` is deliberately left untouched.
 * ------------------------------------------------------------------ */

/** `approve(address,uint256)` */
const APPROVE_SELECTOR = "0x095ea7b3";

function encodeApprove(spender: string, amount: bigint): string {
  const pad = (hex: string) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  return `${APPROVE_SELECTOR}${pad(spender)}${pad(amount.toString(16))}`;
}

async function signerBalance(): Promise<string> {
  const { createPublicClient, http, formatEther } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  const { privateKeyToAccount } = await import("viem/accounts");
  const pk = process.env.AGENT_SESSION_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) return "0";
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.AGENCY_RPC_URL ?? "https://sepolia.base.org"),
  });
  const balance = await client.getBalance({ address: privateKeyToAccount(pk).address });
  return formatEther(balance);
}

async function registerRealApp(): Promise<RegisteredApp> {
  const appId = "substreams-verify-real";
  const existing = getApp(appId);
  if (existing) return existing;

  // The token contract is the target, because `approve` is called ON the token.
  // It therefore has to be the allowlisted address, or the gate refuses it —
  // which is the gate working, not a loophole.
  const policy: Policy = {
    ...defaultPolicyForTier("autonomous"),
    allowlist: [BASE_SEPOLIA_USDC.address],
    maxPerTxUsd: 50,
    maxSpendUsd: 250,
  };
  const wallet = await provisionWallet({ appId, tier: "autonomous", policy });
  policy.wallet = wallet.address;

  const agency: Agency = {
    tier: "autonomous",
    triggers: [
      { on: "stream", when: "healthFactor < 1.15", run: "approveRouter", intervalSec: undefined },
    ],
    actions: {
      approveRouter: {
        kind: "approve",
        target: BASE_SEPOLIA_USDC.address,
        params: {
          amountUsd: 25,
          data: encodeApprove(BASE_SEPOLIA_SWAP_ROUTER, 25_000_000n), // 25 USDC, 6 decimals
        },
        label: "Approve the router to spend 25 USDC",
      },
    },
    policy,
  };

  return registerApp({ appId, agency, wallet });
}

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
/** Send a real Base Sepolia transaction instead of a simulated one. */
const real = flag("real") !== undefined;

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

  const app = real ? await registerRealApp() : await ensureDemoApp("substreams-verify");
  if (real) {
    const balance = await signerBalance();
    console.log(`  signer    ${app.wallet.sessionKeyAddress ?? app.wallet.address} · ${balance} ETH on ${app.wallet.chainName}`);
    if (balance === "0") {
      console.error(
        `\nThe session key holds no gas, so the transaction cannot be sent.\n` +
          `Fund ${app.wallet.sessionKeyAddress ?? app.wallet.address} with Base Sepolia ETH and re-run.`,
      );
      process.exit(1);
    }
  }

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

// Exit explicitly rather than waiting for the event loop to drain. The Connect
// transport pools its HTTP/2 session and there is no public handle to close it,
// so a successful run would otherwise sit open indefinitely — which is exactly
// how two completed runs held both FREE-tier slots for four hours.
main()
  .catch((err: unknown) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
