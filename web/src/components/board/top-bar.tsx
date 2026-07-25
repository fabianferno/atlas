"use client";

/**
 * The top bar. Wordmark, live agent count, global halt, wallet.
 * Halt is always reachable — it is the one control that must never be more
 * than one press away, on any surface, at any width.
 */
import Link from "next/link";
import { connectWallet, fmtUsd, liveCount, setHalted, spentToday, useBoard } from "@/lib/store";
import { LiveDot } from "@/components/board/chrome";
import { cn } from "@/lib/utils";

export function TopBar({ active }: { active?: "board" | "registry" }) {
  const board = useBoard();
  const live = liveCount(board);
  const spent = spentToday(board);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-[var(--paper)] shadow-[var(--elev-1)]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-5 sm:py-2.5">
        <Link href="/" className="display shrink-0 text-[0.9375rem] leading-none sm:text-[1.0625rem]">
          Graph Mini Apps
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
          <div className="flex shrink-0 items-center gap-2">
            {board.halted ? (
              <span className="mono text-[0.6875rem] uppercase tracking-[0.08em]" style={{ color: "var(--loss)" }}>
                halted
              </span>
            ) : (
              <LiveDot label={`${live} live`} />
            )}
          </div>

          <span className="mono shrink-0 whitespace-nowrap text-[0.6875rem] text-[var(--muted-ink)]">
            spent today{" "}
            <span className="fig" style={{ color: spent > 0 ? "var(--spend)" : "var(--muted-ink)" }}>
              {fmtUsd(spent)}
            </span>
          </span>

          <button
            type="button"
            onClick={() => setHalted(!board.halted)}
            className={cn(
              "btn ml-auto shrink-0 px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.08em] sm:ml-0",
              !board.halted && "btn--danger",
            )}
            aria-pressed={board.halted}
          >
            {board.halted ? "Release halt" : "Halt all"}
          </button>

          <button
            type="button"
            onClick={connectWallet}
            className="btn shrink-0 px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.08em]"
          >
            {board.wallet ? <span className="fig normal-case">{board.wallet}</span> : "Connect wallet"}
          </button>
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
