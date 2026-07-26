"use client";

/**
 * The small panels that hang off the drawer's header buttons.
 *
 * Two of them now — share the app's URL, point an agent at the MCP server — and
 * they are the same object: an icon in the header chrome, a panel under it, one
 * value you are meant to copy. The behaviour that makes that panel bearable
 * (press elsewhere to dismiss, Escape without taking the drawer down with it, a
 * copy button that tells you it worked and then forgets) is written once here
 * rather than twice in each caller.
 *
 * These are popovers, not routes. Both errands take two seconds and neither is
 * worth navigating away from a running app to do.
 */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const COPIED_MS = 1600;

/** Nothing ever changes these; they are read once, on the client. */
const NEVER_CHANGES = () => () => {};

/**
 * The origin this page is actually being served from — empty during SSR, where
 * there is no host to name. Anything built from it is a link someone else has
 * to be able to open, so it has to name the host the sender is on: preview
 * deploys and localhost included, not a build-time env var.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => window.location.origin,
    () => "",
  );
}

/**
 * True where the OS has a share sheet — phones, mostly. The server snapshot is
 * false, so a button that needs it is never markup that hydrates into a dead
 * control.
 */
export function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => !!navigator.share,
    () => false,
  );
}

/** Copies `value`, and says so for a moment. */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  // The flag is a receipt, not state anything acts on — it expires.
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is refusable (insecure origin, denied permission).
      // Every caller also renders the value in a selectable field, so the
      // manual fallback is already on screen.
      setCopied(false);
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      className={cn("btn press flex items-center justify-center gap-1.5 px-2 py-1.5 text-[0.6875rem]", className)}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * A value you are meant to read or copy, shown in full.
 *
 * Readonly input rather than plain text: it stays selectable and, where the
 * clipboard API is blocked, still copyable by hand. Clicking selects all of it.
 */
export function CopyField({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <input
      readOnly
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.currentTarget.select()}
      aria-label={label}
      className="mono w-full rounded-lg border border-hairline bg-transparent px-2 py-1.5 text-[0.6875rem] outline-none"
    />
  );
}

export function HeaderPopover({
  icon,
  label,
  title,
  disabled = false,
  panelClassName,
  children,
}: {
  icon: React.ReactNode;
  /** Accessible name of the header button. */
  label: string;
  /** Accessible name of the panel it opens. */
  title: string;
  disabled?: boolean;
  panelClassName?: string;
  /** Given a `close` so an action inside can dismiss the panel it lives in. */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);

  // A press anywhere else dismisses. Pointerdown rather than click, so the
  // panel is gone before whatever you aimed at reacts.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Escape closes this panel and stops there. The drawer listens for Escape on
  // window too, and one keypress should not dismiss both layers — so this runs
  // in the capture phase and halts propagation before the drawer's bubble-phase
  // handler ever sees it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    // Static on a phone on purpose: the panel then positions against the
    // header instead of against a 32px button sitting near the sheet's right
    // edge, where a right-aligned panel wide enough to hold a config block
    // would hang off the left side of the screen and be clipped by the sheet's
    // `overflow-hidden`. Beside the desktop panel there is room, so there it
    // anchors to the button and stays visually attached to it.
    <div ref={rootRef} className="shrink-0 sm:relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        className="btn press grid h-8 w-8 shrink-0 place-items-center p-0"
      >
        {icon}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className={cn(
            "absolute top-[calc(100%+0.5rem)] z-10",
            // Phone: spans the sheet, inset from its edges.
            "inset-x-2",
            // Desktop: hangs from the button's right edge.
            "sm:inset-x-auto sm:right-0 sm:w-[min(20rem,calc(100vw-2rem))]",
            "rounded-xl border border-hairline bg-[var(--paper)] p-3 shadow-[var(--elev-3)]",
            panelClassName,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
