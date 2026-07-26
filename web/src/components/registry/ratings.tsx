"use client";

/**
 * Ratings — thumbs plus a short review, weighted by whether the rater actually
 * ran the app. The schema is deliberately trivial (appId, rater, score, text,
 * ranIt): this is ecosystem texture, not a product.
 *
 * ## The seeded thumbs are labelled here, and they were not before
 *
 * This panel rendered "97% positive · 147 ratings" and a list of reviews signed
 * `vega.eth` and `kaia.eth` with a "ran it" badge, and said nothing about any
 * of it being invented — which all of it is (prd.md §12, §14 #1a). The registry
 * CARD has carried a "Community · seeded" caption over the same numbers since
 * it was written, on the README's explicit condition that seeded figures are
 * disclosed where they are shown. The detail page's only disclosure lived in a
 * different panel further down (`app-runtime.tsx`, "Runs and forks on the
 * bundled apps are seeded texture…") — the wrong place, because a reader who
 * has stopped at "147 ratings" has already believed it and has no reason to
 * scroll to the correction.
 *
 * So the label is at the point of display now: in the head's note, and in a
 * line under it that says which parts are invented. §12 draws the line this
 * wording follows — **a made-up opinion about a real feature is set dressing; a
 * made-up event is a data claim** — so the note names the thumbs and the `.eth`
 * handles as invented while being clear that the opinions are about features
 * that exist. Nothing is removed: the seeded numbers are the texture §12 wants,
 * they are just no longer unmarked.
 *
 * A rating the user posts is untouched by all of this — it is real, and `score`
 * below counts it exactly as it did.
 *
 * ## "You ran this" was a claim about the reader, made out of a seed constant
 *
 * This panel decided whether the visitor had run the app with
 * `const ranIt = app.stats.runs > 0`. `stats.runs` is the app's DISPLAY total and
 * it opens at an invented figure on every bundled app — `aave-guard` 1,204,
 * `health-factor-watch` 5,120, named as seeded texture in prd.md §14 #1a — so the
 * expression was true for all sixteen of them before anyone had touched anything.
 * Two consequences, and the second is the worse one:
 *
 *   1. The form told a first-time visitor "you ran this — counts 3×". That is the
 *      product asserting an event in the reader's OWN history, which they can
 *      falsify from memory. §12's line puts it on the wrong side twice over: a
 *      run is an event, not an opinion, and it is an event attributed to them.
 *   2. `score()` then really did weight their rating 3×, and `rateApp` stored
 *      `ranIt: true` on the review. §12 specifies the weighting as "weighted by
 *      whether **the rater** actually ran the app", so a real person's real
 *      rating was being mis-weighted — and mislabelled in a record that outlives
 *      this render — on the strength of a number in `seed.ts`.
 *
 * The fix is not in this file's arithmetic, which was always right. It is that
 * the question now has a real answer to read: `ranHere(board, name)` in
 * `store.ts`, backed by `localRuns`, which only `runApp` writes and only when a
 * fan-out plus compose round trip actually came back. Seeded `runs` stays seeded,
 * stays displayed, stays labelled; it just no longer speaks for the reader.
 * `rateApp` derives `ranIt` itself now rather than accepting it as an argument,
 * because a call site cannot see the evidence and this one guessed.
 *
 * The 3× weight is specified behaviour and is unchanged. Only its trigger was
 * wrong. An app the visitor has genuinely run still weights 3× and still says so.
 */
import { useState } from "react";
import { isSeededReview } from "@/lib/seed";
import { fmtDate, fmtNum, localRunCount, rateApp, useApp, useBoard } from "@/lib/store";
import { Label, SectionHead } from "@/components/board/chrome";

/** A review from someone who ran it counts for three. */
const RAN_IT_WEIGHT = 3;

export function score(app: { reviews: { score: "up" | "down"; ranIt: boolean }[]; stats: { thumbsUp: number; thumbsDown: number } }): {
  pct: number;
  weighted: number;
  total: number;
} {
  const seeded = app.stats.thumbsUp + app.stats.thumbsDown;
  const up = app.stats.thumbsUp + app.reviews.filter((r) => r.score === "up").length;
  const total = seeded + app.reviews.length;
  const weighted = app.reviews.reduce(
    (sum, r) => sum + (r.score === "up" ? 1 : -1) * (r.ranIt ? RAN_IT_WEIGHT : 1),
    0,
  );
  return { pct: total === 0 ? 0 : Math.round((up / total) * 100), weighted, total };
}

export function Ratings({ appName }: { appName: string }) {
  const board = useBoard();
  const app = useApp(appName);
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<"up" | "down" | null>(null);

  if (!app) return null;
  const s = score(app);
  // THIS browser's completed runs of THIS app, not the app's lifetime total.
  // See the header: the total is part seed constant and cannot answer a question
  // about the reader. Zero is the correct and expected answer on a fresh board,
  // including on an app whose card reads "Runs 1,204".
  const myRuns = localRunCount(board, appName);
  const ranIt = myRuns > 0;
  // The invented half, counted the same way `score` counts it. Zero on an app
  // published in this browser, which is exactly when the disclosure below
  // should disappear — an app with no seeded thumbs has nothing to disclose,
  // and a standing "some of this is fake" note over ratings that are all real
  // would be its own kind of dishonesty.
  const seededThumbs = app.stats.thumbsUp + app.stats.thumbsDown;
  // Runs in the displayed total that this browser did not perform. On a bundled
  // app that is the seeded figure; on an app published or forked here it is
  // exactly zero, because `stats.runs` starts at 0 and only `runApp` moves it.
  // Computed as a difference rather than read off a "seeded" flag so it stays
  // true after the visitor adds runs of their own.
  const runsNotMine = app.stats.runs - myRuns;

  return (
    <section className="panel p-3">
      <SectionHead
        title="Ratings"
        note={
          s.total > 0
            ? `${s.pct}% positive · ${s.total} ratings${seededThumbs > 0 ? " · seeded" : ""}`
            : "no ratings yet"
        }
      />

      {seededThumbs > 0 ? (
        <p className="mono mt-2 text-[0.625rem] leading-snug text-[var(--muted-ink)]">
          {seededThumbs} of those {s.total} are seeded thumbs, and every review tagged{" "}
          <span className="uppercase tracking-[0.08em]">seeded</span> below is invented too —
          opinions about features that genuinely exist, not events that happened. Nobody has rated
          these. A rating you post is real, and counts from here.
        </p>
      ) : null}

      {/*
        The run counter, disclosed in the panel that weights a rating by it.
        Without this line the form says "you have not run this" on an app whose
        card says Runs 1,204, and the only way to reconcile the two is to already
        know which figures in this product are seeded. Rendered only when the
        total contains runs this browser did not perform, so it disappears on an
        app published here — where the counter is entirely real and there is
        nothing to disclose.
      */}
      {runsNotMine > 0 ? (
        <p className="mono mt-1 text-[0.625rem] leading-snug text-[var(--muted-ink)]">
          {ranIt
            ? `Of the ${fmtNum(app.stats.runs)} runs on this app, ${fmtNum(myRuns)} ${myRuns === 1 ? "is" : "are"} yours; the other ${fmtNum(runsNotMine)} are seeded. Only yours are why your rating counts ${RAN_IT_WEIGHT}×.`
            : `The ${fmtNum(app.stats.runs)} runs on this app are seeded on the same terms — not a record of anything you did, so they cannot make your rating count ${RAN_IT_WEIGHT}×. Press Run and they can.`}
        </p>
      ) : null}

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!choice) return;
          // No `ranIt` argument any more. The store derives it from its own
          // record of this browser's runs — this component used to pass
          // `stats.runs > 0` and was wrong on every seeded app.
          rateApp(appName, choice, text.trim() || (choice === "up" ? "Works." : "Did not work for me."), board.wallet ?? "unclaimed");
          setText("");
          setChoice(null);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {(["up", "down"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setChoice(v)}
              aria-pressed={choice === v}
              className="btn press px-2.5 py-1 text-xs"
              style={
                choice === v
                  ? { background: v === "up" ? "var(--gain)" : "var(--loss)", color: "#fff" }
                  : undefined
              }
            >
              {v === "up" ? "Works" : "Does not work"}
            </button>
          ))}
          <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
            {/*
              Says "in this browser" because that is the whole of what is known.
              There is no account, so a run is remembered in `localStorage` and
              nowhere else, and the honest sentence is the narrow one — the
              unqualified "you ran this" claimed a history the product cannot see
              even when it is true.
            */}
            {ranIt
              ? `you ran this ${myRuns === 1 ? "once" : `${fmtNum(myRuns)} times`} in this browser — counts ${RAN_IT_WEIGHT}×`
              : "you have not run this in this browser — counts 1×"}
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={140}
            placeholder="One line on what it did for you"
            aria-label="Review"
            className="min-w-0 flex-1 rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 text-xs outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] placeholder:text-[var(--muted-ink)]"
          />
          <button type="submit" disabled={!choice} className="btn press shrink-0 px-2.5 py-1 text-xs disabled:opacity-40">
            Post
          </button>
        </div>
      </form>

      <ul className="mt-3 border-t border-[var(--hairline)]">
        {app.reviews.map((r) => (
          <li key={r.id} className="border-b border-[var(--hairline)] py-2 last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className="mono text-[0.625rem] uppercase tracking-[0.08em]"
                style={{ color: r.score === "up" ? "var(--gain)" : "var(--loss)" }}
              >
                {r.score === "up" ? "works" : "does not"}
              </span>
              <span className="mono text-[0.625rem]">{r.rater}</span>
              {/*
                The row-level label, and it is what makes the "ran it" badge
                beside it readable. A seeded review may carry `ranIt: true` —
                §12 allows an invented rater to hold an invented opinion — but
                only if nobody can mistake it for a person, and until this tag
                existed the panel's only cue was "signed with an .eth handle",
                which misses `r5`, `r10` and `r12`, all signed `anon`. Derived
                from `SEEDED_REVIEW_IDS` in `seed.ts` rather than from a field on
                the record, so it is also correct for a board restored from
                localStorage that predates this change.
              */}
              {isSeededReview(r.id) ? (
                <span className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
                  seeded
                </span>
              ) : null}
              {r.ranIt ? (
                <span className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
                  ran it
                </span>
              ) : null}
              <span className="mono ml-auto text-[0.5625rem] text-[var(--muted-ink)]">{fmtDate(r.at)}</span>
            </div>
            <p className="mt-1 text-xs leading-snug">{r.text}</p>
          </li>
        ))}
        {app.reviews.length === 0 ? (
          <li className="py-3">
            <Label>Nobody has written one yet</Label>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
