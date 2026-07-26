/**
 * Point already-published ENS names at the live origin.
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/ens-reorigin.ts \
 *     --to=https://atlas.vercel.app --dry-run
 *   ... drop --dry-run to write
 *   ... [name ...]   override the default name list
 *
 * WHY THIS EXISTS. The subnames were issued while the app ran on localhost, so
 * `url`, `agent-endpoint[web]`, `agent-endpoint[mcp]` and the `run:` block inside
 * `agent-context` all resolve to `http://localhost:3000` — a machine nobody else
 * can reach. Matrix #15 is the live-demo requirement, and it *gates the quality*
 * of #8/#9: an ENS name that resolves to localhost is a claim, not a demo.
 *
 * WHY IT REWRITES RATHER THAN REPUBLISHES. Regenerating the record set from the
 * manifest would also regenerate everything else in `agent-context` — the healthy
 * deployment count especially, which moves every time a source goes down. That
 * would make this operation quietly lossy. So this reads the CURRENT records,
 * substitutes the origin in the values that carry it, and writes those back.
 * `addr`, `contenthash`, `agent-registration` and every other text key are
 * untouched, byte for byte.
 *
 * Safe to re-run: substituting an origin that is already correct is a no-op, and
 * the script skips a name when nothing would change.
 */
import { getEnsBackend, readRecords, resolveRegistrarMode, splitName, fullName } from "@/lib/identity/ens";
import type { EnsRecordSet } from "@/lib/identity/ens";
import { listRegisteredApps, selectUnderParent } from "@/lib/identity/published";

/**
 * The default set is READ, not listed.
 *
 * This was a hardcoded array of four labels, and by the time it was used it had
 * drifted: five more names had been issued under the parent and the script
 * would have silently left every one of them pointing at localhost. A run that
 * reports "0 failed" while skipping names nobody told it about is worse than a
 * run that errors.
 *
 * So the default now comes from `MiniAppRegistry`, the same enumeration the
 * Registry page uses. One consequence to know: a name whose ENS records landed
 * but whose registry write did not — `aave-guard-fork` — is NOT in the registry
 * and so is NOT in this default. Names in that state have to be passed as args.
 */
async function defaultNames(): Promise<string[]> {
  const parent = getEnsBackend().parent;
  const { apps } = selectUnderParent(await listRegisteredApps(), parent);
  return apps.map((a) => splitName(a.ensName).label);
}

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}

const from = flag("from") ?? "http://localhost:3000";
const to = flag("to") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
const dryRun = flag("dry-run") !== undefined;
const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/** Replace every occurrence of the old origin in a text value. */
function reorigin(value: string): string {
  return value.split(from).join(to);
}

async function main(): Promise<void> {
  if (!to) {
    console.error(
      "Nothing to point at. Pass --to=https://your-origin or set NEXT_PUBLIC_APP_URL.",
    );
    process.exit(2);
  }
  if (to === from) {
    console.error(`--from and --to are both ${from}. Nothing to do.`);
    process.exit(2);
  }

  const mode = resolveRegistrarMode();
  const backend = getEnsBackend();

  /* Resolved here rather than at module load so the "nothing to point at"
     check above still exits fast without a chain read. */
  const targets = (names.length > 0 ? names : await defaultNames()).map(
    (n) => splitName(fullName(n)).label,
  );
  if (targets.length === 0) {
    console.error(
      "No names to rewrite. The registry has nothing under this parent, and none were passed as arguments.",
    );
    process.exit(2);
  }

  console.log("ENS RE-ORIGIN");
  console.log(`  mode        ${mode}${backend.configured ? "" : "  ⚠ NOT CONFIGURED — writes will not land"}`);
  console.log(`  parent      ${backend.parent}`);
  console.log(`  from        ${from}`);
  console.log(`  to          ${to}`);
  console.log(
    `  names       ${targets.join(", ")}` +
      (names.length > 0 ? "  (from args)" : "  (read from MiniAppRegistry)"),
  );
  console.log(`  ${dryRun ? "DRY RUN — nothing will be written" : "WRITING — each name costs one transaction"}`);
  console.log("");

  if (!dryRun && !backend.configured) {
    console.error(
      `The "${mode}" backend is not configured, so a write would silently do nothing.\n` +
        "Set ENS_REGISTRAR_MODE=onchain plus ENS_REGISTRAR_PRIVATE_KEY and ENS_RPC_URL.",
    );
    process.exit(1);
  }

  let changed = 0;
  let skipped = 0;
  let failed = 0;

  for (const label of targets) {
    const name = fullName(label);
    let current;
    try {
      current = await readRecords(name);
    } catch (err) {
      console.log(`  ${name}\n      READ FAILED — ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
      continue;
    }
    if (!current) {
      console.log(`  ${name}\n      does not resolve — never issued, or the resolver is unset`);
      skipped += 1;
      continue;
    }

    // Only text values can carry an origin. addr and contenthash are left alone.
    const texts: Record<string, string> = {};
    const touched: string[] = [];
    for (const [key, value] of Object.entries(current.texts)) {
      const next = reorigin(value);
      texts[key] = next;
      if (next !== value) touched.push(key);
    }

    if (touched.length === 0) {
      console.log(`  ${name}\n      already points at ${to} — nothing to change`);
      skipped += 1;
      continue;
    }

    console.log(`  ${name}`);
    console.log(`      rewriting ${touched.length} record(s): ${touched.join(", ")}`);

    if (dryRun) {
      changed += 1;
      continue;
    }

    const records: EnsRecordSet = {
      addr: current.addr,
      contenthash: current.contenthash,
      texts,
    };

    try {
      const { txHash } = await backend.setRecords(label, records);
      console.log(`      ✅ ${txHash ?? "(no tx hash returned)"}`);
      changed += 1;
    } catch (err) {
      console.log(`      ❌ ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  console.log("");
  console.log(`  ${changed} ${dryRun ? "would change" : "rewritten"} · ${skipped} skipped · ${failed} failed`);
  if (!dryRun && changed > 0) {
    console.log("");
    console.log("  Verify from a client that is not ours:");
    console.log(`    curl -s ${to}/api/resolve/${targets[0]} | head -c 400`);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
