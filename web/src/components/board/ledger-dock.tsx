"use client";

/**
 * The Ledger, docked.
 *
 * The receipts used to hold a column on the board, which spent a third of the
 * widest surface on something you only read when you want to check the agents'
 * work. So it collapses to a pill in the bottom-left corner and grows back on
 * a click, the way a chat box does.
 *
 * Two decisions worth keeping:
 *
 * - It mounts in the root layout, not per page. That is what makes it sticky in
 *   the real sense — the panel stays open and the unseen count keeps its place
 *   as you move between the board, the registry and a running mini app.
 * - It is deliberately NOT modal. No scrim, no focus trap, no scroll lock.
 *   Leaving it open while you work the deck is the point: agents keep spending
 *   whether or not anyone is looking, and this is where that shows up.
 *
 * WHAT THIS DOCK NO LONGER CLAIMS. Its header carried a pulsing `--live`
 * "streaming" lamp whenever the board was not halted, and the collapsed pill
 * carried a bare `.live-dot`. Neither was backed by anything: `POST /api/stream`
 * — the only call that opens a Substreams subscription — had no caller in the
 * product at all, and the ledger lines that appeared to corroborate the lamp were
 * manufactured client-side by a ticker that invented block numbers, tx hashes and
 * dollar amounts every few seconds. That ticker is gone, so the ledger is now
 * empty until something real happens, and the lamp had to go with it. §6 Rule 2:
 * `--live` means live, and a dock is a place receipts land, not a stream.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { LedgerBody, ledgerLines } from "@/components/board/ledger";
import { SectionHead } from "@/components/board/chrome";
import { useBoard } from "@/lib/store";
import { cn } from "@/lib/utils";

const LIMIT = 60;
const BADGE_MAX = 99;

export function LedgerDock() {
  const board = useBoard();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Watermark for "what have you already read", held as a timestamp rather than
  // the id of the last-seen line: store.ts trims the ledger to LEDGER_MAX, so an
  // id watermark would eventually point at a line that no longer exists and the
  // count would have nothing to measure from.
  //
  // Mount time, so a first visit doesn't arrive with a badge counting seed data
  // nobody has missed. Every seeded line predates this on the server and on the
  // client alike, so both render the same empty badge and hydration stays quiet.
  const [seenTs, setSeenTs] = useState(() => Date.now());

  // Open means read: nothing is unseen while you are looking at it, and closing
  // resets the watermark so the lines you just watched land don't come back as
  // a count. No effect needed — closing is the only moment the mark can move.
  const close = useCallback(() => {
    setSeenTs(Date.now());
    setOpen(false);
  }, []);

  const unseen = open
    ? 0
    : board.ledger.reduce((n, l) => (Date.parse(l.ts) > seenTs ? n + 1 : n), 0);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Deliberately no click-outside-to-close. That is a menu's behaviour, and it
  // would undo the whole point of a non-modal panel: opening a card or crossing
  // to the registry is a click outside, so the receipts would vanish the moment
  // you did anything. It closes when you close it.

  // Focus follows the panel and hands itself back on close. No trap: this is a
  // non-modal surface, so tabbing out of it and on into the page is correct.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const id = window.requestAnimationFrame(() => panelRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  const lineCount = ledgerLines(board, LIMIT).length;

  return (
    // Above the app panel (z-50), not under it. The Board's panel opens on the
    // left and would otherwise bury this corner, and a ledger you cannot reach
    // while an agent is spending is the wrong half of the trade. Floating over
    // the running app is already the arrangement everywhere else — the runtime
    // reserves bottom padding for exactly this pill.
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex flex-col items-start gap-2">
      {/* Kept in the tree at all times so the grow-in has something to
          transition from — only the contents are conditional. */}
      <div
        ref={panelRef}
        id="ledger-dock-panel"
        role="region"
        aria-label="Ledger"
        aria-hidden={!open}
        tabIndex={-1}
        className={cn(
          "panel flex w-[min(380px,calc(100vw-2rem))] flex-col p-3 outline-none",
          "h-[min(520px,calc(100dvh-9rem))]",
          "origin-bottom-left shadow-[var(--elev-3)]",
          "transition-[opacity,transform] duration-200 ease-out will-change-transform",
          open
            ? "pointer-events-auto scale-100 opacity-100 translate-y-0"
            : "pointer-events-none scale-[0.98] opacity-0 translate-y-2",
        )}
      >
        {open ? (
          <>
            <SectionHead
              title="Ledger"
              note={`${lineCount} lines`}
              right={
                <span className="flex items-center gap-3">
                  {/* Was `<LiveDot label="streaming" />` on `!board.halted`. A halt
                      flag being false is not a subscription. What is true here is
                      whether the log is empty, and that a global halt blocks every
                      action — both facts the board actually holds. */}
                  {board.halted ? null : lineCount === 0 ? (
                    <span className="mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
                      nothing recorded yet
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close ledger"
                    className="btn btn--quiet -my-1 p-1.5"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              }
            />
            <LedgerBody limit={LIMIT} />
          </>
        ) : null}
      </div>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls="ledger-dock-panel"
        className="btn pointer-events-auto gap-2 px-3 py-2 text-[0.6875rem] uppercase tracking-[0.08em]"
      >
        {board.halted ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: "var(--loss)" }}
            aria-hidden
          />
        ) : (
          /* Was `.live-dot` — a pulsing `--live` lamp on a button, which is Rule 2's
             "decorative" case exactly. The pill's job is to say how many receipts
             are waiting; the unseen badge below already does that. */
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background: "var(--ink)",
              boxShadow: "inset 0 -1px 1px rgba(0,0,0,0.30)",
            }}
            aria-hidden
          />
        )}
        Ledger
        {unseen > 0 ? (
          <span
            className="fig rounded-full px-1.5 py-0.5 text-[0.625rem] leading-none normal-case tracking-normal"
            style={{ background: "var(--spend)", color: "#fff" }}
          >
            {unseen > BADGE_MAX ? `${BADGE_MAX}+` : unseen}
            <span className="sr-only"> new lines</span>
          </span>
        ) : null}
      </button>
    </div>
  );
}
