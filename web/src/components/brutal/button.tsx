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
  default: "bg-[var(--card-b)] text-ink",
  primary: "bg-ink text-[var(--card-b)]",
  spend: "btn--spend",
  danger: "btn--danger",
  quiet: "bg-transparent text-ink shadow-none border-hairline",
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
        disabled && "cursor-not-allowed opacity-40 shadow-none active:translate-x-0 active:translate-y-0",
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
        "fig w-full border-2 border-rule bg-[var(--card-b)] px-2.5 py-2 text-[1rem] outline-none",
        "placeholder:text-[var(--muted-ink)]",
        className,
      )}
      {...rest}
    />
  );
}
