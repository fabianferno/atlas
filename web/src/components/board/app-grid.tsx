"use client";

/**
 * The grid of your mini apps, sorted by tier.
 *
 * This is where Rule 1 pays off: scan fifteen cards and the chrome weight tells
 * you which ones hold wallets before you have read a single word.
 */
import Link from "next/link";
import type { MiniApp } from "@/lib/seed";
import { TIER_LABEL } from "@/lib/seed";
import { myApps, tierCounts, useBoard } from "@/lib/store";
import { Label, SectionHead, panelClass } from "@/components/board/chrome";
import { AppCardFace } from "./app-card-face";

export function AppGrid() {
  const board = useBoard();
  const apps = myApps(board);
  const counts = tierCounts(board);

  return (
    <section>
      <SectionHead
        title="Your mini apps"
        note={`${counts.autonomous} autonomous · ${counts.monitor} monitor · ${counts.readonly} read only`}
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
        <p className="mono py-8 text-center text-xs text-[var(--muted-ink)]">
          nothing published yet — describe something above
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

/** The tier legend. Says out loud what the chrome is already saying. */
export function TierLegend() {
  return (
    <div className="panel mt-auto ml-auto flex w-fit max-w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <Label>Depth is agency</Label>
      {(["readonly", "monitor", "autonomous"] as const).map((tier) => (
        <span key={tier} className="flex items-center gap-1.5">
          <span className={panelClass(tier, "h-4 w-7 shrink-0 rounded-[4px]")} aria-hidden />
          <span className="mono text-[0.625rem] uppercase tracking-[0.06em]">{TIER_LABEL[tier]}</span>
        </span>
      ))}
    </div>
  );
}
