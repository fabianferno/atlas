import type { MiniApp } from "@/lib/seed";
import { fmtNum, fmtUsd, isArmed } from "@/lib/store";
import { ArmedLamp, Fig, TierTag, panelClass } from "@/components/board/chrome";
import { AppGlyph } from "@/components/board/app-glyph";
import { cn } from "@/lib/utils";

/** Uniform fixed height (px) of a card face — the wheel uses this as its rowHeight base. */
export const APP_CARD_HEIGHT = 172;

/* ------------------------------------------------------------------ *
 * ARMED IS NOT LIVE.
 *
 * `MiniApp.running` used to be documented as "subscribed to a stream right
 * now", and the board rendered it as `N live` behind a pulsing `--live` lamp.
 * Nothing was subscribed. `POST /api/stream` — the one call that opens a
 * Substreams run — had no caller anywhere in the app, and the matching "block
 * NNN matched" ledger lines came from a client-side ticker that made block
 * numbers up. So ten seed apps asserted ten open subscriptions on the strength
 * of a boolean literal in `seed.ts`.
 *
 * That is not a wording nit. prd.md §10 rests the entire Substreams argument on
 * per-block evaluation versus polling — "polling a subgraph means your
 * liquidation guard is up to 5 minutes late. That's the difference between
 * working and not." A board that says "live" with nothing subscribed spends the
 * credibility of the one claim the project most needs to be believed.
 *
 * So the flag is re-cut as ARMED, and the two facts are kept apart:
 *
 *   ARMED  published, not halted, tier is not `readonly` — it *would* act if a
 *          trigger fired. A checkable statement about configuration, and still
 *          the interesting one at the autonomous tier: an armed agent holds
 *          standing authority (§7) whether or not a block is arriving.
 *   LIVE   a bounded Substreams run is open at this moment. Only `watchBlocks`
 *          in `store.ts` produces that, and only for the seconds it runs.
 *          Nothing else in this codebase may render as live.
 *
 * Rule 2 (§6, "colour is semantic, never decorative") is what forces the split
 * visually: `--live` means live, so armed cannot borrow it and cannot borrow the
 * `.live-dot` blip either. See `ArmedLamp` below.
 * ------------------------------------------------------------------ */

/* `isArmed` now lives in `store.ts` beside `armedCount`, and `ArmedLamp` in
 * `chrome.tsx` beside `LiveDot`. They were defined here only because both of
 * those files were owned by other agents when the armed/live split landed.
 * Shared chrome duplicated across component files is how this codebase ended up
 * with two competing `LiveDot`s, one of which drifted — so these went home. */

/**
 * The presentational card face for a mini app. No navigation — the visual only.
 *
 * This is where Rule 1 pays off: scan fifteen cards and depth tells you which
 * ones hold wallets before you have read a single word. (Depth, not border
 * weight — §6's banner records that the shipped skin re-expressed Rule 1 as
 * elevation; `panelClass` is the one place that decides.)
 */
export function AppCardFace({
  app,
  active,
  className,
  style,
}: {
  app: MiniApp;
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const m = app.manifest;
  const tier = m.agency.tier;
  const halted = m.agency.policy.halted;
  const spentPct = m.agency.policy.maxSpendUsd > 0 ? app.stats.spentUsd / m.agency.policy.maxSpendUsd : 0;

  return (
    <div
      className={panelClass(
        tier,
        cn(
          "box-border flex min-w-0 flex-col overflow-hidden",
          active ? "ring-1 ring-[var(--action)]/40 shadow-[var(--elev-2)]" : "",
          className,
        ),
      )}
      style={{ height: APP_CARD_HEIGHT, ...style }}
    >
      {tier === "autonomous" ? (
        <div className="policy-strip">
          <span>wallet</span>
          <span className="fig normal-case">{m.agency.policy.wallet ? `${m.agency.policy.wallet.slice(0, 6)}…${m.agency.policy.wallet.slice(-4)}` : "not funded"}</span>
          <span className="opacity-50">·</span>
          <span>cap</span>
          <span className="fig normal-case">{fmtUsd(m.agency.policy.maxSpendUsd)}</span>
          <span className="opacity-50">·</span>
          <span>per tx</span>
          <span className="fig normal-case">{fmtUsd(m.agency.policy.maxPerTxUsd)}</span>
          {halted ? (
            <span className="ml-auto" style={{ color: "var(--loss)" }}>
              halted
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-3">
        {/* The glyph spans the title and the ENS name — one block, one subject. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <AppGlyph manifest={m} className="mt-px" />
            <div className="min-w-0">
              <h3 className="display text-[0.8125rem] leading-tight">{m.title}</h3>
              {/*
                No fabricated name. This line used to fall back to
                `${m.name}.atlas-apps.eth`, and those subnames were never issued —
                five exist under the parent on Sepolia and not one is a seed app.
                §8 makes the ENS name a *safety primitive*: it is the thing a human
                verifies before funding a wallet. A name that looks issued and
                resolves nowhere is precisely the failure that section exists to
                prevent, so an unnamed app says so.
              */}
              <p className="mono mt-1 truncate text-[0.625rem] text-[var(--muted-ink)]">
                {m.identity.ens ?? "not published — no ENS name"}
              </p>
            </div>
          </div>
          {/* Armed, not live — see the note at the top of this file. */}
          {isArmed(app) ? <ArmedLamp label="armed" /> : null}
        </div>

        <p className="mt-2 line-clamp-2 text-xs leading-snug text-[var(--muted-ink)]">{m.intent}</p>

        <div className="mb-3 mt-3 flex flex-wrap items-center gap-1.5">
          <TierTag tier={tier} />
          {m.data.networks.slice(0, 2).map((n) => (
            <span key={n} className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
              {n.replace("-one", "")}
            </span>
          ))}
        </div>

        <dl className="cells mt-auto border-t border-[var(--hairline)] pt-2">
          <Row k="Runs" v={fmtNum(app.stats.runs)} />
          <Row k="Sources live" v={`${app.stats.sourcesHealthy} / ${app.stats.sourcesQueried}`} />
          {tier === "autonomous" ? (
            <Row k="Spent" v={fmtUsd(app.stats.spentUsd)} accent={app.stats.spentUsd > 0 ? "spend" : "ink"} />
          ) : (
            <Row k="Cost per run" v={`$${app.stats.costPerRunUsd.toFixed(3)}`} />
          )}
        </dl>

        {tier === "autonomous" ? (
          <div className="mt-2 h-1.5 w-full" style={{ background: "var(--hairline)" }}>
            <div className="h-full" style={{ width: `${Math.min(100, spentPct * 100)}%`, background: "var(--spend)" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: "spend" | "ink" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <dt className="mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{k}</dt>
      <dd>
        <Fig className="text-[0.6875rem] font-medium" accent={accent}>
          {v}
        </Fig>
      </dd>
    </div>
  );
}
