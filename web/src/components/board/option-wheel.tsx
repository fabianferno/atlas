"use client";

/**
 * OptionWheel — a vertical, curved wheel selector.
 *
 * Adapted from the React Bits "OptionWheel" component. The original rendered
 * plain text labels sized by `fontSize * spacing`; this version renders arbitrary
 * React nodes (mini-app cards) laid out on a uniform, explicit `rowHeight`.
 *
 * ALL of the original motion physics are preserved: the single frame-rate
 * independent easing loop, the circular layout (tilt -> radius -> sin/cos), the
 * per-item opacity/blur/`--ow-p` proximity, wheel + drag + keyboard input, the
 * snap debounce, and the optional throttled tick sound.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import type { ReactNode, CSSProperties, JSX, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

type Side = "left" | "right";

/** One row of the wheel. `node` is rendered as-is; `key` identifies it. */
export interface WheelItem {
  key: string;
  node: ReactNode;
}

export interface OptionWheelProps {
  items: WheelItem[];
  /** px — uniform height of each row (card height incl. its vertical gap). */
  rowHeight: number;
  /** Index centered on first render. Default 0. */
  defaultSelected?: number;
  /** Fires when the wheel settles on a new centered item. */
  onChange?: (index: number, key: string) => void;
  /** Fires on a click that was NOT a drag. */
  onItemClick?: (index: number, key: string) => void;
  /** Which way the wheel curves away from the viewer. Default 'left'. */
  side?: Side;
  /** How far the curve pushes rows sideways. Default 0.6 (subtle for cards). */
  curve?: number;
  /** Degrees of rotation between neighbours. Default 3 (subtle, keeps text legible). */
  tilt?: number;
  /** px of blur applied per unit of distance from center. Default 1. */
  blur?: number;
  /** Opacity falloff per unit of distance from center. Default 0.28. */
  fade?: number;
  /** Floor opacity for far rows. Default 0.15. */
  minOpacity?: number;
  /** Easing time-constant in ms. Default 200. */
  smoothing?: number;
  /** Horizontal padding (px) applied to each row so cards don't touch the edges. Default 0. */
  inset?: number;
  /** Wrap around at the ends. Default false. */
  loop?: boolean;
  /** Allow pointer dragging. Default true. */
  draggable?: boolean;
  /** Optional tick sound URL. Default ''. */
  soundUrl?: string;
  /** Tick volume 0..1. Default 0.5. */
  soundVolume?: number;
  className?: string;
}

/** Internal snapshot of the resolved config, read inside the rAF loop. */
interface WheelConfig {
  count: number;
  rowH: number;
  side: Side;
  curve: number;
  tilt: number;
  blur: number;
  fade: number;
  minOpacity: number;
  smoothing: number;
  inset: number;
  loop: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function OptionWheel({
  items,
  rowHeight,
  defaultSelected = 0,
  onChange,
  onItemClick,
  side = "left",
  curve = 0.6,
  tilt = 3,
  blur = 1,
  fade = 0.28,
  minOpacity = 0.15,
  smoothing = 200,
  inset = 0,
  loop = false,
  draggable = true,
  soundUrl = "",
  soundVolume = 0.5,
  className = "",
}: OptionWheelProps): JSX.Element {
  const count = items.length;

  // --- refs -----------------------------------------------------------------
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const posRef = useRef<number>(defaultSelected); // current (animated) position
  const targetRef = useRef<number>(defaultSelected); // where we're easing to
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0); // timestamp of previous frame
  const cfgRef = useRef<WheelConfig>({
    count,
    rowH: rowHeight,
    side,
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    smoothing,
    inset,
    loop,
  });
  const onChangeRef = useRef<OptionWheelProps["onChange"]>(onChange);
  const onItemClickRef = useRef<OptionWheelProps["onItemClick"]>(onItemClick);
  const selectedRef = useRef<number>(defaultSelected);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const dragMovedRef = useRef<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>("");
  const lastTickRef = useRef<number>(0);

  const [selectedIndex, setSelectedIndex] = useState<number>(defaultSelected);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Keep the mutable config/callback refs in sync with the latest props so the
  // rAF loop always reads current values without re-subscribing. Synced in an
  // effect (not during render) to satisfy the refs rule; the useRef initializers
  // above seed first-render values, so the loop never reads a stale config.
  useEffect(() => {
    cfgRef.current = {
      count,
      rowH: rowHeight,
      side,
      curve,
      tilt,
      blur,
      fade,
      minOpacity,
      smoothing,
      inset,
      loop,
    };
    onChangeRef.current = onChange;
    onItemClickRef.current = onItemClick;
  });

  // --- audio (optional tick) ------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!soundUrl) {
      audioRef.current = null;
      audioUrlRef.current = "";
      return;
    }
    if (audioUrlRef.current !== soundUrl) {
      const a = new Audio(soundUrl);
      a.preload = "auto";
      audioRef.current = a;
      audioUrlRef.current = soundUrl;
    }
    if (audioRef.current) audioRef.current.volume = clamp(soundVolume, 0, 1);
  }, [soundUrl, soundVolume]);

  const playTick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastTickRef.current < 70) return; // throttle: >=70ms apart
    lastTickRef.current = now;
    try {
      a.currentTime = 0;
      void a.play().catch(() => {}); // swallow autoplay/gesture errors
    } catch {
      // ignore
    }
  }, []);

  // Holds the latest frame function so the loop can reschedule itself without
  // `runFrame` referencing its own name (which the immutability rule forbids).
  const frameRef = useRef<(now: number) => void>(() => {});

  // --- the frame loop -------------------------------------------------------
  const runFrame = useCallback((now: number) => {
    const cfg = cfgRef.current;
    const { count: n, rowH } = cfg;

    // frame-rate-independent exponential smoothing
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const tau = Math.max(cfg.smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    const cur = posRef.current;
    const target = targetRef.current;
    const next = cur + (target - cur) * k;
    const settled = Math.abs(target - next) < 0.001;
    posRef.current = settled ? target : next;

    const p = posRef.current;
    const mirror = cfg.side === "right" ? -1 : 1;
    const tiltRad = (cfg.tilt * Math.PI) / 180;
    const R = tiltRad > 0.0005 ? rowH / tiltRad : 0;

    for (let i = 0; i < n; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;

      // signed distance from center, loop-wrapped to the shortest path
      let d = i - p;
      if (cfg.loop && n > 0) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      const dist = Math.abs(d);

      let x = 0;
      let y: number;
      let rot = 0;
      if (R > 0) {
        const ang = clamp(d * tiltRad, -Math.PI / 2, Math.PI / 2);
        y = R * Math.sin(ang);
        x = -mirror * R * (1 - Math.cos(ang)) * cfg.curve;
        rot = (mirror * ang * 180) / Math.PI;
      } else {
        y = d * rowH;
      }

      el.style.transform = `translate(${x}px, calc(${y}px - 50%)) rotate(${rot}deg)`;
      el.style.opacity = String(Math.max(cfg.minOpacity, 1 - dist * cfg.fade));
      el.style.filter = cfg.blur > 0 ? `blur(${dist * cfg.blur}px)` : "none";
      // 0..1 proximity to center, so cards can emphasize the active row via CSS
      el.style.setProperty("--ow-p", String(Math.max(0, 1 - Math.min(dist, 1))));
    }

    if (!settled) {
      rafRef.current =
        typeof requestAnimationFrame !== "undefined"
          ? requestAnimationFrame((t) => frameRef.current(t))
          : null;
    } else {
      rafRef.current = null;
    }
  }, []);

  // Publish the latest frame function for the self-rescheduling loop.
  useEffect(() => {
    frameRef.current = runFrame;
  }, [runFrame]);

  /** Kick the rAF loop if it isn't already running. */
  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    if (typeof requestAnimationFrame === "undefined" || typeof performance === "undefined") return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame((t) => frameRef.current(t));
  }, []);

  /**
   * Move the wheel toward `value`. When `snap` is true the target is rounded to
   * the nearest row. Fires onChange (+ tick) when the centered index changes.
   */
  const applyTarget = useCallback(
    (value: number, snap: boolean) => {
      const cfg = cfgRef.current;
      const n = cfg.count;
      if (n <= 0) return;

      let v = value;
      if (!cfg.loop) v = clamp(v, 0, n - 1);
      if (snap) v = Math.round(v);
      targetRef.current = v;

      const idx = (((Math.round(v) % n) + n) % n);
      if (idx !== selectedRef.current) {
        selectedRef.current = idx;
        setSelectedIndex(idx);
        onChangeRef.current?.(idx, items[idx]?.key ?? "");
        playTick();
      }
      startLoop();
    },
    [items, playTick, startLoop]
  );

  // --- wheel (non-passive so we can preventDefault) -------------------------
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cfg = cfgRef.current;
      const step = clamp(e.deltaY / cfg.rowH, -1, 1);
      applyTarget(targetRef.current + step, false);

      // debounce a snap once the user stops scrolling
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        applyTarget(targetRef.current, true);
      }, 140);
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget]);

  // --- pointer dragging -----------------------------------------------------
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggable) return;
      dragRef.current = { y: e.clientY, start: targetRef.current, id: e.pointerId };
      dragMovedRef.current = false;
      setIsDragging(true);
    },
    [draggable]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!dragMovedRef.current && Math.abs(dy) > 4) {
        dragMovedRef.current = true;
        try {
          e.currentTarget.setPointerCapture(drag.id);
        } catch {
          // ignore
        }
      }
      if (dragMovedRef.current) {
        const cfg = cfgRef.current;
        applyTarget(drag.start - dy / cfg.rowH, false);
      }
    },
    [applyTarget]
  );

  const handlePointerEnd = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (drag && dragMovedRef.current) {
      applyTarget(targetRef.current, true);
    }
  }, [applyTarget]);

  // --- click (only when it wasn't a drag) -----------------------------------
  const handleItemClick = useCallback(
    (index: number) => {
      if (dragMovedRef.current) return; // it was a drag, not a click
      const cfg = cfgRef.current;
      const n = cfg.count;
      if (n <= 0) return;

      const cur = targetRef.current;
      let d = index - cur;
      if (cfg.loop) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      applyTarget(cur + d, true);
      onItemClickRef.current?.(index, items[index]?.key ?? "");
    },
    [applyTarget, items]
  );

  // --- keyboard -------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      let delta = 0;
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -1;
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = 1;
      else return;
      e.preventDefault();
      applyTarget(Math.round(targetRef.current) + delta, true);
    },
    [applyTarget]
  );

  // --- re-apply when layout-affecting config changes; cleanup on unmount ----
  useEffect(() => {
    applyTarget(targetRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight, side, curve, tilt, blur, fade, minOpacity, smoothing, inset, loop, count]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // --- render ---------------------------------------------------------------
  const rootStyle: CSSProperties = {
    cursor: draggable ? (isDragging ? "grabbing" : "grab") : "default",
  };

  return (
    <div
      ref={rootRef}
      role="listbox"
      aria-label="Mini app wheel"
      tabIndex={0}
      className={`relative h-full w-full select-none overflow-hidden outline-none [touch-action:none] ${className}`}
      style={rootStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          role="option"
          aria-selected={i === selectedIndex}
          className="absolute top-1/2 w-full will-change-[transform,opacity,filter]"
          style={{
            left: 0,
            right: 0,
            height: rowHeight,
            transformOrigin: "center",
            paddingLeft: inset > 0 ? inset : undefined,
            paddingRight: inset > 0 ? inset : undefined,
          }}
          onClick={() => handleItemClick(i)}
        >
          {item.node}
        </div>
      ))}
    </div>
  );
}
