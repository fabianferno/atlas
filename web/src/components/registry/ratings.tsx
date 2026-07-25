"use client";

/**
 * Ratings — thumbs plus a short review, weighted by whether the rater actually
 * ran the app. The schema is deliberately trivial (appId, rater, score, text,
 * ranIt): this is ecosystem texture, not a product.
 */
import { useState } from "react";
import { fmtDate, rateApp, useApp, useBoard } from "@/lib/store";
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
  const ranIt = app.stats.runs > 0;

  return (
    <section className="panel p-3">
      <SectionHead
        title="Ratings"
        note={s.total > 0 ? `${s.pct}% positive · ${s.total} ratings` : "no ratings yet"}
      />

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!choice) return;
          rateApp(appName, choice, text.trim() || (choice === "up" ? "Works." : "Did not work for me."), ranIt, board.wallet ?? "unclaimed");
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
            {ranIt ? `you ran this — counts ${RAN_IT_WEIGHT}×` : "you have not run this — counts 1×"}
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
