/**
 * A registry record joined to what its name actually resolves to.
 *
 * `published.ts` answers "what is in the registry". This answers "what is on
 * the board", which is that record joined against ENS and IPFS. It is the only
 * place a chain record becomes something renderable, and therefore the only
 * place that could quietly invent one — so every branch below that fails to
 * obtain a manifest returns `manifest: null` with a sentence saying why, and
 * none of them substitutes a value.
 *
 * The contenthash/registry disagreement is the subtle one. When the name's
 * contenthash points at a different CID from the registry entry, the bytes may
 * fetch perfectly well — and must still not be rendered. Two records disagree
 * about what this app IS, and picking one is picking a side in a conflict the
 * reader is entitled to see. prd.md §8 makes agreement between the name and the
 * registry the thing a human verifies before funding; rendering through a
 * disagreement would spend that guarantee to avoid an empty card.
 */
import type { Address } from "viem";
import type { Manifest } from "@/lib/contracts/manifest";
import type { RegisteredApp } from "@/lib/identity/published";
import { resolveWithReport, type ResolveReport } from "@/lib/identity/publish";

export interface BoardEntry {
  /** The chain record, verbatim. Never edited, never defaulted. */
  registered: RegisteredApp;
  /** The plan this app runs, or null when it could not be obtained. */
  manifest: Manifest | null;
  /** The `addr` record — the address this name points at. Not proof of custody. */
  address: Address | null;
  mutuallyVerified: boolean;
  /**
   * Null when the app is runnable. Otherwise one sentence naming what is
   * missing or contradictory, in the resolver's own words where there are any.
   */
  unavailable: string | null;
}

export type ResolveFn = (ensName: string) => Promise<ResolveReport>;

/**
 * One entry per record, always. A record that cannot be resolved stays on the
 * board carrying its reason — dropping it would make `totalApps()` and the
 * board disagree, which is the class of defect this whole change removes.
 */
export async function assembleBoard(
  apps: RegisteredApp[],
  resolveFn: ResolveFn = resolveWithReport,
): Promise<BoardEntry[]> {
  return Promise.all(apps.map((record) => one(record, resolveFn)));
}

async function one(record: RegisteredApp, resolveFn: ResolveFn): Promise<BoardEntry> {
  let report: ResolveReport;
  try {
    report = await resolveFn(record.ensName);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      registered: record,
      manifest: null,
      address: null,
      mutuallyVerified: false,
      unavailable: `${record.ensName} did not resolve: ${detail}`,
    };
  }

  const base = {
    registered: record,
    address: report.address,
    mutuallyVerified: report.verification?.mutuallyVerified ?? false,
  };

  if (report.manifestCid !== null && report.manifestCid !== record.manifestCid) {
    return {
      ...base,
      manifest: null,
      unavailable:
        `the name's contenthash (${report.manifestCid}) disagrees with the registry ` +
        `(${record.manifestCid}), so what this app is cannot be established from either alone`,
    };
  }

  if (report.manifest === null) {
    return {
      ...base,
      manifest: null,
      unavailable: `the manifest at ${record.manifestCid} could not be fetched, so the plan behind this name is unavailable`,
    };
  }

  return { ...base, manifest: report.manifest, unavailable: null };
}
