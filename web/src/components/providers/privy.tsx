"use client";

/**
 * W6 — PRIVY PROVIDER.
 *
 * Privy handles the human: login, and an embedded wallet for the user who has
 * never held one. It is deliberately NOT the mini app's agent wallet — that is
 * provisioned per app in `lib/agency/wallet.ts` and signed for by a session key
 * that never leaves the server. Two wallets, two jobs:
 *
 *   Privy embedded wallet — the user's. Funds the mini app, presses Confirm.
 *   Mini app agent wallet — the app's. Holds the working balance, spends under
 *                           policy, revocable, expiring, capped.
 *
 * Chains are testnet only, and `defaultChain` is Base Sepolia. Mainnet is not
 * in `supportedChains` at all, so it cannot be selected by accident.
 *
 * Without `NEXT_PUBLIC_PRIVY_APP_ID` this renders children untouched, so the
 * whole app — including the policy loop — still runs with no keys configured.
 */
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { baseSepolia, zeroGGalileoTestnet } from "viem/chains";
import { useEffect, type ReactNode } from "react";
import { setWallet } from "@/lib/store";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/**
 * True when Privy is configured. A build-time constant — `NEXT_PUBLIC_*` is
 * inlined into the client bundle — so branching a component tree on it is
 * stable across renders and safe to gate hooks behind.
 */
export const PRIVY_ENABLED = PRIVY_APP_ID.length > 0;

/**
 * Publishes the authenticated user's address into board state, and clears it on
 * logout. Renders nothing.
 *
 * `user.wallet` is Privy's own primary wallet — the embedded one it created at
 * login, or the external one the user linked. `wallets[0]` is the fallback for
 * the window where a wallet is connected but the user record has not caught up.
 *
 * Gated on `ready`: until Privy has restored its session `authenticated` is
 * false for a beat, and mirroring that early would blank a connected wallet on
 * every reload.
 */
function PrivyWalletBridge() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const address = user?.wallet?.address ?? wallets[0]?.address ?? null;

  useEffect(() => {
    if (!ready) return;
    setWallet(authenticated ? address : null);
  }, [ready, authenticated, address]);

  return null;
}

export function AgencyPrivyProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_ENABLED) return <>{children}</>;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#7c5cff",
          landingHeader: "Sign in to fund a mini app",
          loginMessage: "Mini apps hold their own wallet. You decide what it may spend.",
          walletChainType: "ethereum-only",
        },
        loginMethods: ["email", "wallet", "google"],
        // Testnet only. There is no mainnet entry to fall back to.
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, zeroGGalileoTestnet],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <PrivyWalletBridge />
      {children}
    </PrivyProvider>
  );
}

export default AgencyPrivyProvider;
