"use client";

/**
 * The wallet control in the top bar.
 *
 * This used to call a store stub that toggled a hardcoded `0xd41a…7b09` — it
 * looked like a connect and authenticated nobody. Real login now, through the
 * Privy modal configured in `providers/privy.tsx`: email, Google, or an
 * external wallet, with an embedded wallet created for whoever arrives without
 * one.
 *
 * Two variants, picked once at module scope from the build-time
 * `PRIVY_ENABLED`. The hook variant would throw outside `PrivyProvider`, and
 * when Privy is unconfigured that provider is not in the tree at all — so the
 * disabled variant says the app is unconfigured rather than offering a button
 * that cannot work.
 */
import { usePrivy } from "@privy-io/react-auth";
import { Wallet } from "lucide-react";
import { PRIVY_ENABLED } from "@/components/providers/privy";
import { useBoard } from "@/lib/store";
import { cn } from "@/lib/utils";

const BTN = "btn shrink-0 px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.08em]";

/** `0x1234…cdef`. Full addresses are 42 chars and would wrap the top bar. */
function shortAddr(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function PrivyWalletButton({ className }: { className?: string }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const board = useBoard();

  // Prefer the mirrored store value so this button and the rest of the board
  // never disagree about who is signed in. `user.wallet` covers the beat before
  // the bridge's effect has run.
  const address = board.wallet ?? user?.wallet?.address ?? null;

  // Privy is still restoring its session. Rendering "Connect wallet" here would
  // flash a signed-out state at an already-signed-in user on every reload.
  if (!ready) {
    return (
      <button type="button" disabled className={cn(BTN, "opacity-50", className)}>
        <span className="fig normal-case">connecting…</span>
      </button>
    );
  }

  if (authenticated) {
    return (
      <button
        type="button"
        onClick={() => void logout()}
        className={cn(BTN, className)}
        title={address ? `${address} — click to disconnect` : "Click to sign out"}
        aria-label={address ? `Disconnect wallet ${address}` : "Sign out"}
      >
        {/* No wallet on an email-only account that declined one. Say that, do
            not render an empty button. */}
        <span className="fig normal-case">{address ? shortAddr(address) : "signed in"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => login()}
      className={cn(BTN, "inline-flex items-center gap-1.5", className)}
    >
      <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
      Connect wallet
    </button>
  );
}

function UnconfiguredWalletButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      disabled
      className={cn(BTN, "opacity-50", className)}
      title="Set NEXT_PUBLIC_PRIVY_APP_ID to enable sign-in"
    >
      Wallet off
    </button>
  );
}

export const WalletButton = PRIVY_ENABLED ? PrivyWalletButton : UnconfiguredWalletButton;
