"use client";

/**
 * The top bar. Wordmark, armed agent count, stream mode, global halt, wallet.
 * Halt is always reachable — it is the one control that must never be more
 * than one press away, on any surface, at any width.
 *
 * This used to read `N live` behind a pulsing `--live` lamp, off `liveCount()`.
 * It was the board's loudest claim and nothing backed it: no code path in the
 * app had ever called `POST /api/stream`, so no mini app had ever been
 * subscribed to anything. prd.md §10 stakes the whole Substreams argument on
 * per-block evaluation beating a 5-minute poll, and a header asserting ten open
 * subscriptions spends that argument's credibility to decorate a number.
 *
 * Two facts now, kept apart — `isArmed` in `store.ts` carries the full
 * note:
 *   ARMED   a count of configurations that would act if a trigger fired. True,
 *           checkable, and the interesting one for the autonomous tier.
 *           "Checkable" was aspirational until this pass: `isArmed` did not check
 *           published, so this bar read "8 ARMED" off eight hand-written booleans
 *           in `seed.ts` while every app under it said "unpublished". The
 *           definition is now enforced in the predicate, the honest count on a
 *           fresh board is 0, and the zero state below drops the lamp rather than
 *           lighting one over nothing.
 *   STREAM  read from `GET /api/stream`, never asserted. And read *precisely*:
 *           `mode: "substreams"` means a token is present, i.e. **capable of**
 *           per-block evaluation. It does not mean anything is subscribed, and
 *           the copy below refuses to round that up.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Square } from "lucide-react";
import { armedCount, fmtUsd, setHalted, spentToday, useBoard } from "@/lib/store";
import { ArmedLamp } from "@/components/board/chrome";
import { SkinToggle } from "@/components/board/skin-toggle";
import { WalletButton } from "@/components/board/wallet-button";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

/**
 * Whether the server *could* evaluate triggers per block, asked of the server
 * rather than assumed. Same probe and same posture as `useStreamMode()` in
 * `app-runtime.tsx` — a failed probe is not a claim of either mode, so it stays
 * null and this bar says nothing at all.
 *
 * Duplicated deliberately rather than imported: `app-runtime.tsx` is a heavy
 * client module owned elsewhere, and one shared hook belongs in a lib, not in a
 * cross-import between two components. Noted in the report.
 */
function useStreamCapability(): { mode: "substreams" | "interval"; reason: string } | null {
  const [state, setState] = useState<{ mode: "substreams" | "interval"; reason: string } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    void fetch("/api/stream")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { mode?: "substreams" | "interval"; reason?: string } | null) => {
        if (!alive || !body?.mode) return;
        setState({ mode: body.mode, reason: body.reason ?? "" });
      })
      .catch(() => {
        // Silence is the honest answer when the probe failed.
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function TopBar({ active }: { active?: "board" | "registry" }) {
  const board = useBoard();
  // Computed here rather than through `liveCount()`, which counts the same set
  // under a name that overstates it. Belongs in the store as `armedCount` —
  // flagged in the report rather than added, since that file is owned elsewhere.
  const armed = armedCount(board);
  const spent = spentToday(board);
  const stream = useStreamCapability();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-[var(--paper)] shadow-[var(--elev-1)]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-5 sm:py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {/* currentColor, so the mark picks up --ink and follows the skin
              swap without a per-skin asset. */}
          <BrandMark className="h-7 w-7 text-[var(--ink)] sm:h-8 sm:w-8" />
          <span className="display text-[0.9375rem] leading-none sm:text-[1.0625rem]">
            Atlas
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-3">
          <Link
            href="/"
            className="mono text-[0.6875rem] uppercase tracking-[0.08em]"
            style={{ borderBottom: active === "board" ? "2px solid var(--ink)" : "2px solid transparent" }}
          >
            Board
          </Link>
          <Link
            href="/registry"
            className="mono text-[0.6875rem] uppercase tracking-[0.08em]"
            style={{ borderBottom: active === "registry" ? "2px solid var(--ink)" : "2px solid transparent" }}
          >
            Registry
          </Link>
        </nav>

        <div className="order-last flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--hairline)] pt-2 sm:order-none sm:ml-auto sm:w-auto sm:flex-nowrap sm:border-0 sm:pt-0">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {board.halted ? (
              <span className="mono text-[0.6875rem] uppercase tracking-[0.08em]" style={{ color: "var(--loss)" }}>
                halted
              </span>
            ) : (
              <>
                {/*
                  ZERO GETS NO LAMP. `armedCount` reads 0 on a fresh board and
                  that is the true answer — `isArmed` now requires an issued ENS
                  name (store.ts), and no seed app has one, so none of them holds
                  standing authority to act.

                  It read "8 ARMED" behind a lit lamp until this pass. The 8 came
                  from a hand-written `running: true` on eight seed apps and
                  nothing else; the same sixteen cards below it all say
                  "unpublished — no ENS subname issued". A lamp is the loudest
                  mark in the system after `--live`, and lighting one over a count
                  of none would just move the overstatement rather than remove it
                  — so at zero the lamp is dropped and the row states the reason
                  in muted ink. Publish an app and the lamp comes back, counting
                  something real.
                */}
                {armed > 0 ? (
                  <ArmedLamp label={`${armed} armed`} labelClassName="text-[0.6875rem]" />
                ) : (
                  <span
                    className="mono whitespace-nowrap text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]"
                    title="Armed means published, not halted, and holding standing authority to act if a trigger fires. Nothing on this board is published — no ENS subname has been issued — so nothing is armed."
                  >
                    nothing armed
                  </span>
                )}
                {/*
                  The qualification, and the point of the whole re-cut: a token
                  being present is a capability, not a subscription. Hidden below
                  `md` because the bar is already three rows deep at that width —
                  what is hidden is a *narrowing* of the armed claim, never an
                  upgrade of it, so a narrow viewport still overstates nothing.
                  `title` carries the server's own `reason` verbatim.
                */}
                {stream ? (
                  <span
                    className="mono hidden whitespace-nowrap text-[0.625rem] text-[var(--muted-ink)] md:inline"
                    title={
                      stream.reason
                        ? `GET /api/stream — ${stream.reason}`
                        : "read from GET /api/stream"
                    }
                  >
                    {stream.mode === "substreams"
                      ? "substreams ready · nothing subscribed"
                      : "no substreams token · interval polling"}
                  </span>
                ) : null}
              </>
            )}
          </div>

          <span className="mono shrink-0 whitespace-nowrap text-[0.6875rem] text-[var(--muted-ink)]">
            spent today{" "}
            <span className="fig" style={{ color: spent > 0 ? "var(--spend)" : "var(--muted-ink)" }}>
              {fmtUsd(spent)}
            </span>
          </span>

          {/* The theme swap. Sits next to halt because both are client-held
              controls the agent cannot reach — see skin-toggle.tsx. The button
              names the active skin; a press rolls to a random other one. */}
          <SkinToggle className="ml-auto sm:ml-0" />

          <button
            type="button"
            onClick={() => setHalted(!board.halted)}
            className={cn(
              "btn inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.08em]",
              !board.halted && "btn--danger",
            )}
            aria-pressed={board.halted}
          >
            {!board.halted && <Square className="h-3.5 w-3.5" aria-hidden="true" />}
            {board.halted ? "Release halt" : "Halt all"}
          </button>

          {/* Real Privy login — see wallet-button.tsx. */}
          <WalletButton />
        </div>
      </div>

      {board.halted ? (
        <div
          className="border-t border-hairline px-3 py-1.5 text-center sm:px-5"
          style={{ background: "var(--loss)", color: "#fff" }}
        >
          <span className="mono text-[0.6875rem] uppercase tracking-[0.1em]">
            Global halt engaged — every action in every mini app is blocked
          </span>
        </div>
      ) : null}
    </header>
  );
}
