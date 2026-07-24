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
import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia, zeroGGalileoTestnet } from "viem/chains";
import type { ReactNode } from "react";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/** True when Privy is configured. UI can use this to hide login affordances. */
export const PRIVY_ENABLED = PRIVY_APP_ID.length > 0;

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
      {children}
    </PrivyProvider>
  );
}

export default AgencyPrivyProvider;
