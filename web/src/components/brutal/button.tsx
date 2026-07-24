"use client";

/**
 * The pressable primitive. `.btn` + `.raise-sm` from globals.css.
 *
 * The hard offset shadow is reserved for things you can act on, so this is one
 * of the only places it appears. `intent="spend"` paints violet and is only
 * legal when pressing the button moves value out of a wallet (Rule 2).
 */

import { cn } from "@/lib/utils";

export type ButtonIntent = "default" | "primary" | "spend" | "danger" | "quiet";

const intentClass: Record<ButtonIntent, string> = {
  default: "",
  primary: "btn--primary",
  spend: "btn--spend",
  danger: "btn--danger",
  quiet: "btn--quiet",
};

export interface BrutalButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: ButtonIntent;
  size?: "sm" | "md";
  full?: boolean;
  /** React 19 passes refs as an ordinary prop — no forwardRef needed. */
  ref?: React.Ref<HTMLButtonElement>;
}

export function BrutalButton({
  intent = "default",
  size = "md",
  full = false,
  className,
  disabled,
  children,
  ref,
  ...rest
}: BrutalButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        "btn inline-flex items-center justify-center gap-2 uppercase tracking-[0.04em]",
        size === "sm" ? "px-2.5 py-1 text-[0.6875rem]" : "px-4 py-2 text-[0.8125rem]",
        intentClass[intent],
        full && "w-full",
        disabled && "cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Bare text input, brutalist. No radius, black rule, mono value. */
export function BrutalInput({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "fig w-full bg-[var(--card-b)] px-2.5 py-2 text-[1rem] outline-none",
        "rounded-[calc(var(--radius)*0.6)] border border-hairline",
        "shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] placeholder:text-[var(--muted-ink)]",
        "focus-visible:border-[color:var(--action)]",
        className,
      )}
      {...rest}
    />
  );
}
