/**
 * Pin every locally-stored manifest, so already-written contenthash records
 * start resolving from gateways that are not ours.
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/pin-backfill.ts
 *   ... --dry-run     list what would be pinned, upload nothing
 *   ... --verify      after pinning, read each CID back from a public gateway
 *
 * WHY A BACKFILL WORKS AT ALL. A CID is the hash of the bytes, so re-uploading
 * the same bytes yields the same CID — nothing needs republishing, no ENS record
 * changes, no transactions. The address was always correct; it just had no
 * provider. This gives it one.
 *
 * The one thing that would have broken that: Pinata's `pinJSONToIPFS` wraps the
 * document as UnixFS and returns a **dag-pb** CID (`bafybei…`), while local mode
 * addresses the raw block (`bafkrei…`). Same content, different CID. So this uses
 * `pinFileToIPFS` with `cidVersion: 1`, which uses raw leaves for a single block
 * and reproduces the local CID exactly — and it asserts that, per file, rather
 * than trusting it.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { cidV1Raw } from "@/lib/identity/ipfs";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const dryRun = flag("dry-run");
const verify = flag("verify");
const dir = process.env.IPFS_LOCAL_DIR ?? path.join(process.cwd(), ".atlas", "ipfs");
const gateway = "https://ipfs.io/ipfs";

interface Row {
  file: string;
  cid: string;
  bytes: number;
  /** True when the filename matches the hash of its own contents. */
  selfConsistent: boolean;
}

function scan(): Row[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = readFileSync(path.join(dir, f));
      return {
        file: f,
        cid: cidV1Raw(raw),
        bytes: raw.length,
        selfConsistent: cidV1Raw(raw) === f.replace(/\.json$/, ""),
      };
    });
}

async function pin(file: string, expected: string, jwt: string): Promise<string> {
  const bytes = readFileSync(path.join(dir, file));
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/json" }), file);
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const body = (await res.json()) as { IpfsHash?: string };
  if (!body.IpfsHash) throw new Error("response had no IpfsHash");
  if (body.IpfsHash !== expected) {
    // Refuse silently succeeding with a CID nothing points at.
    throw new Error(`pinned as ${body.IpfsHash}, expected ${expected}`);
  }
  return body.IpfsHash;
}

async function reachable(cid: string): Promise<boolean> {
  try {
    const res = await fetch(`${gateway}/${cid}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const jwt = process.env.PINATA_JWT;
  const rows = scan();

  console.log("PIN BACKFILL");
  console.log(`  store     ${dir}`);
  console.log(`  documents ${rows.length}`);
  console.log(`  ${dryRun ? "DRY RUN — nothing uploaded" : "UPLOADING to Pinata"}`);
  console.log("");

  const drift = rows.filter((r) => !r.selfConsistent);
  if (drift.length > 0) {
    // A file whose name is not its own hash cannot be served under that name.
    console.log("  ⚠ filename does not match content hash — not pinnable as named:");
    for (const r of drift) console.log(`      ${r.file} hashes to ${r.cid}`);
    console.log("");
  }

  if (!dryRun && !jwt) {
    console.error("PINATA_JWT is not set. Nothing can be announced to the network without it.");
    process.exit(1);
  }

  let pinned = 0;
  let failed = 0;
  for (const row of rows.filter((r) => r.selfConsistent)) {
    if (dryRun) {
      console.log(`  would pin  ${row.cid}  ${String(row.bytes).padStart(7)} bytes`);
      continue;
    }
    try {
      await pin(row.file, row.cid, jwt!);
      console.log(`  ✅ pinned  ${row.cid}  ${String(row.bytes).padStart(7)} bytes`);
      pinned += 1;
    } catch (err) {
      console.log(`  ❌ failed  ${row.cid}  ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  if (verify && !dryRun) {
    console.log("");
    console.log("VERIFY — reading each CID back from ipfs.io, a gateway that is not ours");
    let ok = 0;
    for (const row of rows.filter((r) => r.selfConsistent)) {
      // Freshly pinned content can take a moment to be announced.
      let up = await reachable(row.cid);
      if (!up) {
        await new Promise((r) => setTimeout(r, 4000));
        up = await reachable(row.cid);
      }
      console.log(`  ${up ? "✅" : "❌"} ${row.cid}`);
      if (up) ok += 1;
    }
    console.log(`\n  ${ok}/${rows.filter((r) => r.selfConsistent).length} retrievable from a public gateway`);
  }

  if (!dryRun) console.log(`\n  ${pinned} pinned · ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
