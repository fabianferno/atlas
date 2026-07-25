import type { MiniApp } from "@/lib/seed";
import { TIER_LABEL } from "@/lib/seed";
import { fmtNum, fmtUsd } from "@/lib/store";
import { Fig, LiveDot, panelClass } from "@/components/board/chrome";
import { cn } from "@/lib/utils";

/**
 * The card face the wheel rides on — a different animal from the grid card.
 *
 * A grid gives every card the same generous box, so `AppCardFace` can spend it
 * on stats. The wheel shows five cards at once and asks a narrower question:
 * *which one?* So a resting card says only what you choose between — name, tier,
 * whether it's live — and the centered one unfolds the numbers.
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
  className,
}: {
  app: MiniApp;
  active?: boolean;
  className?: string;
}): React.JSX.Element {
  const m = app.manifest;
  const tier = m.agency.tier;
  const halted = m.agency.policy.halted;
  const spentPct =
    m.agency.policy.maxSpendUsd > 0 ? app.stats.spentUsd / m.agency.policy.maxSpendUsd : 0;

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
      style={{
        height: `calc(${WHEEL_CARD_HEIGHT}px + ${WHEEL_CARD_EXPAND}px * var(--ow-p, 0))`,
      }}
    >
      {/* The resting face. Everything a card says when it isn't the one you're on. */}
      <div
        className="flex shrink-0 items-center gap-2 px-3"
        style={{ height: WHEEL_CARD_HEIGHT }}
      >
        <div className="min-w-0 flex-1">
          <h3 className="display truncate text-[0.8125rem] leading-tight">{m.title}</h3>
          <p className="mono mt-0.5 truncate text-[0.5625rem] text-[var(--muted-ink)]">
            <span className="uppercase tracking-[0.08em]">{TIER_LABEL[tier]}</span>
            {" · "}
            {m.identity.ens ?? `${m.name}.graphminis.eth`}
          </p>
        </div>
        {halted ? (
          <span
            className="mono shrink-0 text-[0.5625rem] uppercase tracking-[0.08em]"
            style={{ color: "var(--loss)" }}
          >
            halted
          </span>
        ) : app.running ? (
          <LiveDot label="" />
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
          <Stat k="Runs" v={fmtNum(app.stats.runs)} />
          <Stat k="Sources" v={`${app.stats.sourcesHealthy}/${app.stats.sourcesQueried}`} />
          {tier === "autonomous" ? (
            <Stat
              k="Spent"
              v={fmtUsd(app.stats.spentUsd)}
              accent={app.stats.spentUsd > 0 ? "spend" : "ink"}
            />
          ) : (
            <Stat k="Per run" v={`$${app.stats.costPerRunUsd.toFixed(3)}`} />
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
