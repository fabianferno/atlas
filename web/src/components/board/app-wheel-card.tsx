import type { MiniApp } from "@/lib/seed";
import { TIER_LABEL } from "@/lib/seed";
import { fmtNum, fmtUsd, isArmed, useFigure } from "@/lib/store";
import { ArmedLamp, Fig, panelClass } from "@/components/board/chrome";
import { AppGlyph } from "@/components/board/app-glyph";
import { SponsorMark } from "@/components/brand/sponsor-mark";
import { cn } from "@/lib/utils";

/**
 * The card face the wheel rides on — a different animal from the grid card.
 *
 * A grid gives every card the same generous box, so `AppCardFace` can spend it
 * on stats. The wheel shows five cards at once and asks a narrower question:
 * *which one?* So a resting card says only what you choose between — name, tier,
 * whether it is armed — and the centered one unfolds the numbers.
 *
 * The unfold is driven entirely by `--ow-p`, the 0..1 proximity-to-center the
 * wheel writes on each row every frame. Height and reveal are `calc()` off that
 * variable, so the card tracks the scroll continuously instead of snapping on a
 * React state change — no re-render per frame.
 */

/** px — height of a resting (off-center) card. The wheel's row pitch is built on this. */
export const WHEEL_CARD_HEIGHT = 60;
/** px — extra height the centered card claims. The wheel pushes its neighbours out by this. */
export const WHEEL_CARD_EXPAND = 112;

export function AppWheelCard({
  app,
  active,
  open,
  owned,
  className,
}: {
  app: MiniApp;
  /** Centered in the wheel right now. Moves with every scroll. */
  active?: boolean;
  /** Running in the panel beside the wheel. Only a click moves this. */
  open?: boolean;
  /**
   * Whose this is, decided by `isMine`/`isUnclaimed` in `store.ts` — never by
   * the card, which cannot see the connected wallet.
   *
   *   "yours"      `manifest.author` is the address currently signed in.
   *   "made-here"  drafted or forked in this browser and never claimed. It is
   *                NOT the same statement and must not render as if it were:
   *                nobody has signed for it, and publishing is what would.
   *   null         somebody else's, or nobody's. The Board is full of these now
   *                and that is the normal case, so it gets no mark at all.
   */
  owned?: "yours" | "made-here" | null;
  className?: string;
}): React.JSX.Element {
  const m = app.manifest;
  const tier = m.agency.tier;
  const halted = m.agency.policy.halted;
  const spentPct =
    m.agency.policy.maxSpendUsd > 0 ? app.stats.spentUsd / m.agency.policy.maxSpendUsd : 0;
  const figure = useFigure(m.name);

  return (
    <div
      className={panelClass(
        tier,
        cn(
          "box-border flex min-w-0 flex-col overflow-hidden",
          // Two different states, so two different weights. Centered is a hint
          // that a click would land here; open is a fact about what the panel is
          // showing, and it has to survive being scrolled three rows away —
          // blurred, faded and turned — so it takes the solid ring.
          open
            ? "ring-2 ring-[var(--action)] shadow-[var(--elev-3)]"
            : active
              ? "ring-1 ring-[var(--action)]/40 shadow-[var(--elev-2)]"
              : "",
          className,
        ),
      )}
      style={{
        height: `calc(${WHEEL_CARD_HEIGHT}px + ${WHEEL_CARD_EXPAND}px * var(--ow-p, 0))`,
      }}
    >
      {/* The resting face. Everything a card says when it isn't the one you're on. */}
      <div
        className="flex shrink-0 items-center gap-2 px-3"
        style={{ height: WHEEL_CARD_HEIGHT }}
      >
        <AppGlyph manifest={m} />
        <div className="min-w-0 flex-1">
          {/*
            The name is the subject: an app is its ENS name, and the human title
            is what that name currently resolves to. Kept lowercase — display
            type is uppercase by default, and an ENS name isn't.

            When there is no ENS name it leads with the manifest slug and says
            `unpublished` beside it. It used to synthesise
            `${m.name}.atlas-apps.eth`, and none of those subnames was ever
            issued — five exist under the parent on Sepolia, no seed app among
            them. §8 makes the name the thing a human verifies *before funding a
            wallet*, so a plausible name that resolves nowhere is the one failure
            mode that section is written to stop. The slug is a real local fact
            and reads as one; a dotted eth name would not.
          */}
          <div className="flex min-w-0 items-baseline gap-1.5">
            {/* Rides the name only when the name is an ENS name. When this line
                is falling back to the manifest slug there is no subname to
                attribute, and a mark here would assert one. */}
            {m.identity.ens ? <SponsorMark of="ens" size={11} className="translate-y-[1px]" /> : null}
            <h3 className="display min-w-0 flex-1 truncate text-[0.8125rem] normal-case leading-tight">
              {m.identity.ens ?? m.name}
            </h3>
            {m.identity.ens ? null : (
              <span className="mono shrink-0 text-[0.5rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
                unpublished
              </span>
            )}
            {/* Two marks, two weights, because they are two different claims —
                see the `owned` prop. "yours" is signed for, so it takes the
                action colour; "made here" is only provenance, so it sits in the
                muted register beside "unpublished", which it usually is. */}
            {owned === "yours" ? (
              <span
                className="mono shrink-0 text-[0.5rem] uppercase tracking-[0.08em]"
                style={{ color: "var(--action)" }}
              >
                yours
              </span>
            ) : owned === "made-here" ? (
              <span className="mono shrink-0 text-[0.5rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
                made here
              </span>
            ) : null}
          </div>
          <p className="mono mt-0.5 truncate text-[0.5625rem] text-[var(--muted-ink)]">
            <span className="uppercase tracking-[0.08em]">{TIER_LABEL[tier]}</span>
            {" · "}
            {m.title}
          </p>
        </div>
        {/* Says which one the panel is showing, in words, for the rows too far
            from center for a ring to survive the blur. It sits beside the armed
            and halted marks rather than replacing them — an open app is still
            armed, or still stopped, and you want both facts. */}
        {open ? (
          <span
            className="mono shrink-0 text-[0.5625rem] uppercase tracking-[0.08em]"
            style={{ color: "var(--action)" }}
          >
            open
          </span>
        ) : null}
        {halted ? (
          <span
            className="mono shrink-0 text-[0.5625rem] uppercase tracking-[0.08em]"
            style={{ color: "var(--loss)" }}
          >
            halted
          </span>
        ) : isArmed(app) ? (
          // Armed, not live. A resting row has no width for the word, so the
          // lamp carries it alone and `TierLegend` on the Board is where the
          // mark is named — see the note in `app-card-face.tsx`.
          <ArmedLamp />
        ) : null}
      </div>

      {/*
        The unfold. Fades in over the back half of the approach so a card that is
        merely passing through doesn't flash text at you — only the one arriving
        at center resolves into numbers.
      */}
      <div
        className="flex min-h-0 flex-1 flex-col px-3 pb-3"
        style={{ opacity: "clamp(0, calc((var(--ow-p, 0) - 0.5) * 2), 1)" }}
        aria-hidden={!active}
      >
        <p className="line-clamp-2 text-[0.75rem] leading-snug text-[var(--muted-ink)]">
          {m.intent}
        </p>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--hairline)] pt-2">
          {/* Only the two measurements go through `figure` — `Runs` is disclosed
              seeded texture and `Spent` is hard-zeroed at the source. See the
              matching note in `app-card-face.tsx`. */}
          <Stat k="Runs" v={fmtNum(app.stats.runs)} />
          <Stat k="Sources" v={figure(`${app.stats.sourcesHealthy}/${app.stats.sourcesQueried}`)} />
          {tier === "autonomous" ? (
            <Stat
              k="Spent"
              v={fmtUsd(app.stats.spentUsd)}
              accent={app.stats.spentUsd > 0 ? "spend" : "ink"}
            />
          ) : (
            <Stat k="Per run" v={figure(`$${app.stats.costPerRunUsd.toFixed(3)}`)} />
          )}
          <span className="mono truncate text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
            {m.data.networks
              .slice(0, 2)
              .map((n) => n.replace("-one", ""))
              .join(" ")}
          </span>
        </div>

        {/* Only a wallet-holding app has a budget to draw down, so only it gets a bar. */}
        {tier === "autonomous" ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1" style={{ background: "var(--hairline)" }}>
              <div
                className="h-full"
                style={{ width: `${Math.min(100, spentPct * 100)}%`, background: "var(--spend)" }}
              />
            </div>
            <span className="mono shrink-0 text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
              cap {fmtUsd(m.agency.policy.maxSpendUsd)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A label-over-figure pair. Stacked, so three fit across a narrow card. */
function Stat({ k, v, accent }: { k: string; v: string; accent?: "spend" | "ink" }) {
  return (
    <div className="min-w-0">
      <span className="mono block text-[0.5625rem] uppercase leading-none tracking-[0.08em] text-[var(--muted-ink)]">
        {k}
      </span>
      <Fig className="mt-1 block text-[0.6875rem] font-medium leading-none" accent={accent}>
        {v}
      </Fig>
    </div>
  );
}
