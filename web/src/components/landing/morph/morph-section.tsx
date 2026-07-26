"use client";

/**
 * THE MORPH — a prompt becoming an interface, three times, on a loop.
 *
 * The argument this page has to make is that nobody drew these interfaces.
 * Reading that is not the same as watching it happen, so this is the watching:
 * the question types itself, four lines of pipeline print, and the surface
 * assembles out of the real catalog.
 *
 * ── What is real and what is not ────────────────────────────────────────────
 * The choreography is authored. The documents in `fixtures.ts` are authored
 * too — but through the composer's own `buildDocument`, and they render through
 * the real `A2uiRenderer` and the real client-held catalog, so the components
 * on screen are the product's own rather than pictures of them. The label under
 * the frame says "a demonstration" and points at the measured runs below,
 * because a page that argues for honest numbers cannot open with an unlabelled
 * reenactment.
 *
 * ── One clock ───────────────────────────────────────────────────────────────
 * A single `requestAnimationFrame` loop advances one number, `elapsed`, and
 * every visual state is derived from it. No timer per phase, no timer per
 * character, nothing to leave running when the reader scrolls away. The loop is
 * started and stopped by an `IntersectionObserver`, and it never starts at all
 * under `prefers-reduced-motion`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { A2uiRenderer } from "@/components/renderer";
import { SectionHead } from "@/components/board/chrome";
import { SCENES } from "./fixtures";
import { PromptLine } from "./prompt-line";
import { Trace } from "./trace";

/* ── the timeline, in ms from the start of a scene ──────────────────────── */

const TYPE_MS = 2200;
const TRACE_MS = 1600;
const ASSEMBLE_MS = 900;
const HOLD_MS = 3000;
const SCENE_MS = TYPE_MS + TRACE_MS + ASSEMBLE_MS + HOLD_MS;

const TRACE_END = TYPE_MS + TRACE_MS;
const ASSEMBLE_END = TRACE_END + ASSEMBLE_MS;

/**
 * Read once in an effect rather than during render: `window.matchMedia` does
 * not exist on the server, and a value that differed between the server HTML
 * and the first client paint would be a hydration mismatch on the page's
 * largest element.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function MorphSection() {
  const reduced = usePrefersReducedMotion();

  const rootRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Why refs and not state: the rAF loop reads all three every frame and must
  // not be torn down and rebuilt when any of them changes. `elapsed` is the one
  // value that IS state, because the render depends on it.
  const inViewRef = useRef(false);
  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const indexRef = useRef(0);

  const scene = SCENES[index];

  const goTo = useCallback((next: number) => {
    // Lands on the finished interface rather than replaying the typing: a
    // reader who clicked a dot asked to SEE that scene, not to wait for it.
    indexRef.current = next;
    elapsedRef.current = ASSEMBLE_END;
    setIndex(next);
    setElapsed(ASSEMBLE_END);
  }, []);

  /* One loop, started and stopped by visibility. */
  useEffect(() => {
    if (reduced) return;
    const el = rootRef.current;
    if (!el) return;

    let raf: number | null = null;
    let last: number | null = null;

    const frame = (now: number) => {
      if (last !== null && !pausedRef.current) {
        elapsedRef.current += now - last;
        if (elapsedRef.current >= SCENE_MS) {
          elapsedRef.current = 0;
          indexRef.current = (indexRef.current + 1) % SCENES.length;
          setIndex(indexRef.current);
        }
        setElapsed(elapsedRef.current);
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        if (entry.isIntersecting && raf === null) {
          last = null;
          raf = requestAnimationFrame(frame);
        } else if (!entry.isIntersecting && raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  /* ── derived visual state ─────────────────────────────────────────────── */

  const typing = !reduced && elapsed < TYPE_MS;
  const traceShown = reduced
    ? scene.trace.length
    : Math.max(0, Math.min(scene.trace.length, Math.floor(((elapsed - TYPE_MS) / TRACE_MS) * scene.trace.length) + 1));
  const surfaceVisible = reduced || elapsed >= TRACE_END;
  const assembling = !reduced && elapsed >= TRACE_END && elapsed < ASSEMBLE_END;

  /*
   * Which surface is on screen right now. Before this scene's trace finishes it
   * is still the PREVIOUS scene's — held dimmed rather than blanked, so the box
   * is never empty. `(index - 1 + n) % n` rather than `index - 1` because scene
   * 0's predecessor is the last scene, not index -1.
   */
  const shownScene = surfaceVisible
    ? scene
    : SCENES[(index - 1 + SCENES.length) % SCENES.length];

  /*
   * The frame is height-locked to the tallest scene so the page does not jump
   * as the loop advances. Measured rather than guessed: the three surfaces hold
   * different component counts, and a hardcoded height would be wrong the first
   * time anyone edits a scene.
   *
   * The measured element is the INNER wrapper, which never carries the lock;
   * the lock goes on the outer box. Measuring the locked element instead is a
   * feedback loop — its own `scrollHeight` can never fall below the `minHeight`
   * just written to it, so every observation ratchets the box taller. That bug
   * shipped for one commit and grew the frame 369 → 806px in twenty seconds.
   */
  const measureRef = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () =>
      setMinHeight((prev) => {
        const h = el.offsetHeight;
        return h > 0 && (prev === undefined || h > prev) ? h : prev;
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);
  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  const dots = useMemo(() => SCENES.map((s, i) => ({ s, i })), []);

  return (
    <section
      ref={rootRef}
      className="py-16 sm:py-24"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <SectionHead
        title="You didn't build this interface. You asked for it."
        note="three prompts · three interfaces"
      />

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-[var(--muted-ink)]">
            The composer reads the <em>shape</em> of what came back, not words in the prompt. A
            bounded ratio becomes a gauge. A ranked categorical becomes a leaderboard. Ask the same
            subject a different question and you get a different interface — and when the question
            asks for action, the frame that carries it stands up and shows its policy.
          </p>

          <div className="mt-6 border-t border-hairline pt-4">
            <PromptLine text={scene.prompt} durationMs={TYPE_MS} animate={typing} />
            <Trace lines={scene.trace} shown={traceShown} />
          </div>
        </div>

        <div className="mt-8 min-w-0 lg:mt-0">
          {/* Centred in the locked box rather than pinned to its top: the box is
              as tall as the TALLEST scene, so a shorter one would otherwise
              trail a few hundred pixels of dead space beneath it and read as a
              layout bug. Centred, the slack is split and looks deliberate. */}
          <div
            className="flex flex-col justify-center"
            style={minHeight ? { minHeight } : undefined}
          >
            <div ref={measureRef}>
              {/*
                The surface on screen is the one whose prompt has FINISHED —
                during the next prompt's typing and trace, the previous answer
                stays up, dimmed. An empty box for four seconds of every cycle
                reads as a broken render on a landing page, and dimming the last
                answer keeps the causality the section is arguing for: a new
                interface appears when the pipeline finishes, not while the
                question is still being asked.

                No `providedByHost`: this frame is not a runtime, so the
                document's own components are all there is. That is also what
                makes the autonomous scene's policy strip, trade log and kill
                switch meaningful — they are in the document, not chrome this
                page drew around it.
              */}
              <div
                key={shownScene.key}
                className={`transition-opacity duration-500 ${
                  surfaceVisible ? "opacity-100" : "opacity-30"
                } ${assembling ? "[&>*]:snap-in" : ""}`}
              >
                <A2uiRenderer document={shownScene.doc} />
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="mono text-[0.625rem] text-[var(--muted-ink)]">
              a demonstration —{" "}
              <a href="#receipts" className="underline underline-offset-2">
                the measured runs are below
              </a>
            </p>

            <div className="flex items-center gap-2">
              {dots.map(({ s, i }) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Show scene ${i + 1}: ${s.prompt}`}
                  aria-current={i === index}
                  className={`h-2 w-2 rounded-full border border-hairline transition-colors ${
                    i === index ? "bg-[var(--action)]" : "bg-transparent"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
