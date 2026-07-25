/**
 * Re-issue the mini-app subnames under the new Atlas parent (atlas-apps.eth).
 *
 * The old `*.graphminis.eth` subnames are still fully intact on-chain — the
 * rebrand only registered a NEW parent, it did not touch the old one. So rather
 * than re-run the whole publish/mint pipeline, this reads each old record set
 * off-chain and replays it verbatim under the new parent (substituting the
 * parent domain in any text value that embeds it).
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/ens-reissue-subnames.ts
 *          add --execute to actually mint + write records (default: dry run)
 *          pass labels to override the default list
 *
 * Requires ENS_REGISTRAR_MODE=onchain and ENS_PARENT_DOMAIN=atlas-apps.eth,
 * with the wrapped parent owned by ENS_REGISTRAR_PRIVATE_KEY.
 */
import {
  getEnsBackend,
  readRecords,
  expectedTextKeys,
  resolveRegistrarMode,
  parentDomain,
  agentRegistrationKey,
  parseAgenticIdPointer,
  AGENT_REGISTRATION_VALUE,
} from "@/lib/identity/ens";
import type { EnsRecordSet } from "@/lib/identity/ens";

const OLD_PARENT = "graphminis.eth";
const DEFAULT_LABELS = [
  "aave-health-guard",
  "wallet-bound-guard",
  "attested-market-guard",
  "durable-market-guard",
];

const EXECUTE = process.argv.includes("--execute");
const labels = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TARGETS = labels.length > 0 ? labels : DEFAULT_LABELS;

function fail(m: string): never {
  console.error(`\n❌ ${m}\n`);
  process.exit(1);
}

// The old on-chain records still use the pre-rebrand key names. Map them to
// the atlas.* keys the code reads now; the values are brand-independent.
const OLD_KEY_PREFIX = "graphmini.";
const NEW_KEY_PREFIX = "atlas.";
const BASE_KEYS = [
  "url", "description", "avatar", "agent-context",
  "agent-endpoint[web]", "agent-endpoint[mcp]", "agent-endpoint[a2a]",
];
const OLD_BRAND_KEYS = ["tier", "schemas", "version", "forked-from", "agentic-id"].map((s) => OLD_KEY_PREFIX + s);

/** Rewrite the brand tokens embedded inside a record VALUE. */
function rewriteValue(v: string): string {
  return v.split("graphmini/2").join("atlas/2").split(OLD_PARENT).join(parentDomain());
}

/**
 * Read the complete old record set for a label under the old parent and return
 * it keyed for the new parent: base keys carried through, graphmini.* renamed
 * to atlas.*, and the ENSIP-25 agent-registration attestation reconstructed
 * from the agentic-id pointer and preserved.
 */
async function readOld(label: string): Promise<EnsRecordSet | null> {
  const oldName = `${label}.${OLD_PARENT}`;
  const pass1 = await readRecords(oldName, [...BASE_KEYS, ...OLD_BRAND_KEYS]);
  if (!pass1) return null;

  const src = pass1.texts;
  const texts: Record<string, string> = {};

  // Base keys, value-rewritten.
  for (const k of BASE_KEYS) if (src[k] != null) texts[k] = rewriteValue(src[k]);

  // graphmini.* -> atlas.* (values are brand-independent, but rewrite anyway).
  for (const k of OLD_BRAND_KEYS) {
    if (src[k] == null) continue;
    texts[NEW_KEY_PREFIX + k.slice(OLD_KEY_PREFIX.length)] = rewriteValue(src[k]);
  }

  // ENSIP-25 attestation: reconstruct the exact key from the agentic-id pointer
  // and confirm it is present on the old name before replaying it.
  const pointerVal = src[OLD_KEY_PREFIX + "agentic-id"];
  const ref = pointerVal ? parseAgenticIdPointer(pointerVal) : null;
  if (ref) {
    const regKey = agentRegistrationKey(ref.chainId, ref.registry, ref.tokenId);
    const pass2 = await readRecords(oldName, [regKey]);
    if (pass2?.texts[regKey]) texts[regKey] = pass2.texts[regKey] || AGENT_REGISTRATION_VALUE;
  }

  return { addr: pass1.addr, contenthash: pass1.contenthash, texts };
}

async function main() {
  const mode = resolveRegistrarMode();
  const parent = parentDomain();
  console.log(`\nRe-issue subnames`);
  console.log(`mode             ${EXECUTE ? "🚨 EXECUTE" : "dry run"}`);
  console.log(`registrar        ${mode}`);
  console.log(`new parent       ${parent}`);
  console.log(`old parent       ${OLD_PARENT}`);
  console.log(`targets          ${TARGETS.join(", ")}\n`);

  if (mode !== "onchain") fail(`ENS_REGISTRAR_MODE is "${mode}", expected "onchain".`);
  if (parent !== "atlas-apps.eth") fail(`parent is "${parent}", expected "atlas-apps.eth".`);

  const backend = getEnsBackend();
  const results: Array<{ label: string; ok: boolean; note: string }> = [];

  for (const label of TARGETS) {
    process.stdout.write(`• ${label} … reading old records `);
    const records = await readOld(label);
    if (!records) {
      console.log(`❌ no records under ${OLD_PARENT} — skipping`);
      results.push({ label, ok: false, note: "no source records" });
      continue;
    }
    const textCount = Object.keys(records.texts).length;
    console.log(`✅ addr=${records.addr ? "yes" : "—"} contenthash=${records.contenthash ? "yes" : "—"} texts=${textCount}`);

    if (!EXECUTE) {
      results.push({ label, ok: true, note: `${textCount} texts (dry run)` });
      continue;
    }

    try {
      const r = await backend.issue(label, records);
      console.log(`    ↳ issued ${r.name}  tx ${r.txHash}`);
      // Verify by reading the new name back off-chain.
      const back = await readRecords(r.name, expectedTextKeys());
      const okBack = Boolean(back && (back.contenthash || back.addr || Object.keys(back.texts).length));
      console.log(`    ↳ read-back ${okBack ? "✅" : "⚠️  empty"}  contenthash=${back?.contenthash ?? "—"}`);
      results.push({ label, ok: okBack, note: r.txHash ?? "" });
    } catch (e) {
      console.log(`    ↳ ❌ ${e instanceof Error ? e.message : e}`);
      results.push({ label, ok: false, note: "issue failed" });
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.label}  ${r.note}`);
  const good = results.filter((r) => r.ok).length;
  console.log(`\n${good}/${results.length} ${EXECUTE ? "issued" : "ready"}.`);
  if (!EXECUTE) console.log(`Re-run with --execute to mint + write records on-chain.\n`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
