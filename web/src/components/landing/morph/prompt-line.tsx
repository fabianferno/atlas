"use client";

/**
 * The prompt, typing itself out.
 *
 * One rAF loop advancing a character index against elapsed time — not a timer
 * per character, which drifts under load and leaves N pending timeouts to clean
 * up when the reader scrolls away mid-word.
 */
import { useEffect, useRef, useState } from "react";

export function PromptLine({
  text,
  /** Whole-text duration in ms. Not per character — a longer prompt types faster. */
  durationMs,
  /** False parks the full text with no animation: paused, or reduced motion. */
  animate,
}: {
  text: string;
  durationMs: number;
  animate: boolean;
}) {
  const [shown, setShown] = useState(() => (animate ? 0 : text.length));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setShown(Math.round(p * text.length));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, durationMs, animate]);

  const done = shown >= text.length;

  return (
    /*
     * The full prompt is in the DOM from the first frame, hidden from sight but
     * not from a screen reader, and the animating copy is `aria-hidden`. A
     * reader on a screen reader gets the sentence once, whole — not a stream of
     * partial words as the index advances.
     */
    <p className="mono text-[0.8125rem] leading-relaxed sm:text-sm">
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        <span className="text-[var(--muted-ink)]">&gt;&nbsp;</span>
        {text.slice(0, shown)}
        {/* The caret stops blinking once the prompt is submitted, because a live
            caret on a locked line reads as "still waiting for you". */}
        <span
          className={
            done
              ? "opacity-0"
              : "ml-px inline-block w-[0.5ch] animate-pulse bg-[var(--action)] align-middle"
          }
        >
          &nbsp;
        </span>
      </span>
    </p>
  );
}
