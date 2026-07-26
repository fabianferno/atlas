"use client";

/**
 * The grid of the board's mini apps, sorted by tier — plus `TierLegend`, which
 * is the only export the Board still mounts.
 *
 * `AppGrid`/`AppCard` are the pre-wheel browsing surface. `AppDeck` replaced
 * them on `/`, so nothing renders them today; they are kept because the same
 * card face is the obvious shape for a future registry grid. Noted rather than
 * left to look load-bearing.
 *
 * UNREACHABLE, MEASURED RATHER THAN ASSUMED — and this is the sentence to re-check
 * before trusting it. As of this pass the only import of anything in this file
 * anywhere in `src/` is `import { TierLegend } from "@/components/board/app-grid"`
 * in `app/page.tsx`; nothing imports `AppGrid` or `AppCard`, and no route mounts
 * them. So the file is live and the grid in it is not, which is an easy thing to
 * misread in either direction: a reader who sees the file imported assumes the
 * grid renders, and an agent doing an audit of on-screen claims can skip the file
 * entirely on the grounds that it is dead. Both are wrong, hence this note and
 * hence the denominator below being fixed anyway.
 *
 * The honest disposition is deletion of `AppGrid`/`AppCard` with `TierLegend`
 * moved to `chrome.tsx` beside `ArmedLamp` and `SectionHead`, which is where its
 * only consumer would look for it. Not done here: `TierLegend` is mounted by
 * `app/page.tsx` and `chrome.tsx` is another agent's file, so the move is a
 * handoff rather than something to do behind their back.
 *
 * This is where Rule 1 pays off: scan fifteen cards and depth tells you which
 * ones hold wallets before you have read a single word. (Depth, not border
 * weight — §6's banner records that the shipped skin re-expressed Rule 1 as
 * elevation.)
 */
import Link from "next/link";
import type { MiniApp } from "@/lib/seed";
import { TIER_BLURB, TIER_LABEL } from "@/lib/seed";
import { allApps, isMine, isUnclaimed, tierCounts, useBoard } from "@/lib/store";
import { ArmedLamp, Label, SectionHead, panelClass } from "@/components/board/chrome";
import { AppCardFace } from "./app-card-face";

export function AppGrid() {
  const board = useBoard();
  /*
   * EVERY app and the global heading, mirroring `AppDeck`.
   *
   * This grid had the identical defect and gets the identical fix: it rendered
   * `myApps()` under "Your mini apps", where "yours" was `MiniApp.mine`, a
   * boolean literal in `seed.ts` that no login and no logout could move. See the
   * ownership note in `store.ts`.
   *
   * Fixed here even though nothing mounts this component (see the header), and
   * fixed by copying `app-deck.tsx`'s expressions rather than writing a second
   * phrasing of the same fact. The reason is not that the string is on screen —
   * it is not — but that this file is kept as the shape a future grid would start
   * from, and the shape must not carry the defect. If it is revived with its own
   * wording, the product ends up stating one fact two ways.
   *
   * `board.apps.length`, not `SEED_DECLARED_COUNT`: the right count is what this
   * browser can actually show you, and `SEED_DECLARED_COUNT` counts apps the live
   * snapshot may have DROPPED, which are on no surface at all.
   */
  const apps = allApps(board);
  const counts = tierCounts(board);
  const total = board.apps.length;
  // Two counts, two words — see the note in `app-deck.tsx`. A single "N yours"
  // over a card marked "made here" claims a signature that does not exist.
  const yoursCount = board.apps.filter((a) => isMine(board, a) && !isUnclaimed(board, a)).length;
  const madeHereCount = board.apps.filter((a) => isUnclaimed(board, a)).length;

  return (
    <section>
      <SectionHead
        title="Explore mini apps on The Graph"
        note={[
          `${total} here`,
          yoursCount > 0 ? `${yoursCount} yours` : null,
          madeHereCount > 0 ? `${madeHereCount} made here` : null,
          `${counts.autonomous} autonomous · ${counts.monitor} monitor · ${counts.readonly} read only`,
        ]
          .filter(Boolean)
          .join(" · ")}
        right={
          <Link href="/registry" className="mono text-[0.6875rem] uppercase tracking-[0.08em] underline underline-offset-2">
            Registry
          </Link>
        }
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((app, i) => (
          <AppCard key={app.manifest.name} app={app} index={i} />
        ))}
      </div>
      {apps.length === 0 ? (
        // "describe something above" was true when the Studio input sat over
        // this grid. It moved to the Registry, so the instruction pointed at
        // nothing. And since the grid is scoped to everything, an empty one is a
        // missing board rather than an empty portfolio.
        <p className="mono py-8 text-center text-xs text-[var(--muted-ink)]">
          no mini apps on this board —{" "}
          <Link href="/registry" className="underline underline-offset-2">
            describe one in the Studio
          </Link>
        </p>
      ) : null}
    </section>
  );
}

export function AppCard({ app, index, href }: { app: MiniApp; index: number; href?: string }) {
  const m = app.manifest;
  return (
    <Link
      href={href ?? `/a/${m.name}`}
      className="no-underline"
      style={{ ["--i" as string]: Math.min(index, 8) } as React.CSSProperties}
    >
      <AppCardFace app={app} className="raise press snap-in h-full" />
    </Link>
  );
}

/**
 * What the tier blurb may claim, per tier. `TIER_BLURB` states the capability
 * the tier grants, which is true of the tier — but the README's "Not in scope"
 * bounds what any app on this board can actually do with it, and the legend is
 * where that belongs rather than in a footnote nobody reads:
 *
 *   autonomous  A real transaction has landed from a real trigger through the
 *               real gate (`session-eoa`, an `approve`), so "can spend" is not
 *               vapour. But the *swap* is not built, and every seed app has
 *               `policy.wallet: null` — an unfunded app cannot spend whatever
 *               its tier says, and its card reads "not funded" for that reason.
 *   monitor     Watches and alerts, and the watching is real — but only while a
 *               bounded `watchBlocks` run is open. There is no background
 *               worker, so "watches" means "watches when asked", and there is no
 *               notification channel: the alert surface is the trade log.
 *   readonly    Reads and cannot act. Nothing to qualify.
 */
const TIER_LIMIT: Record<"readonly" | "monitor" | "autonomous", string> = {
  readonly: "",
  monitor:
    " Per-block watching runs only while a bounded Substreams watch is open — there is no background worker, and the alert surface is the trade log.",
  autonomous:
    " Spending is gated by the policy engine, and an app with no wallet cannot spend at all — the card says so. A swap from a trigger is not built; the transaction that has landed is an approve.",
};

/**
 * The tier legend. Says out loud what the chrome is already saying — and now
 * also names the two indicator marks, because they look similar and mean
 * completely different things.
 */
export function TierLegend() {
  return (
    <div className="panel mt-auto ml-auto flex w-fit max-w-full flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Label>Depth is agency</Label>
        {(["readonly", "monitor", "autonomous"] as const).map((tier) => (
          <span key={tier} className="flex items-center gap-1.5" title={TIER_BLURB[tier] + TIER_LIMIT[tier]}>
            <span className={panelClass(tier, "h-4 w-7 shrink-0 rounded-[4px]")} aria-hidden />
            <span className="mono text-[0.625rem] uppercase tracking-[0.06em]">{TIER_LABEL[tier]}</span>
          </span>
        ))}
      </div>

      {/*
        The armed/live key. Both marks are small round lamps, so without this
        row the difference between "configured to act" and "a Substreams run is
        open right now" is a colour and a pulse nobody was told to read. §10 is
        the reason it earns the space: the per-block claim is the project's
        strongest technical argument, and it only survives if the board never
        implies a subscription it does not have.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--hairline)] pt-2">
        <Label>Marks</Label>
        <span className="flex items-center gap-1.5">
          <ArmedLamp />
          <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
            armed — would act if a trigger fired
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="live-dot" aria-hidden />
          <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
            live — a Substreams run is open right now
          </span>
        </span>
      </div>
    </div>
  );
}
