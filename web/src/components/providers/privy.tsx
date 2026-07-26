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
import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";
import { useEffect, type ReactNode } from "react";
import { setWallet } from "@/lib/store";

/**
 * 0G Galileo testnet, chain id **16602**.
 *
 * This used to be viem's `zeroGGalileoTestnet`, which is **16601** — the
 * earlier Galileo V3 launch, not the network this project's contracts are on.
 * The mismatch was visible on every page load as `The configured chains are not
 * supported by Coinbase Smart Wallet: 16601` in the console, and it meant Privy
 * would have been offering the user a chain where none of our Agentic IDs
 * exist. `.env.local`'s `ZEROG_CHAIN_ID` is 16602 and `GET /api/publish`
 * reports 16602; those and this now agree.
 *
 * Restated here rather than imported from its source of truth,
 * `lib/identity/agentic-id.ts` (`zeroGTestnet`, and read its comment for why
 * 16601 keeps resurfacing): that module opens with `node:crypto`, reads
 * `ZEROG_*` env vars and holds the deployer private key. This is a
 * `"use client"` file, so importing it would pull a server module — key
 * handling and all — into the browser bundle. Two literals is the cheaper
 * mistake. If the chain id ever moves again, both have to move.
 */
const zeroGTestnet = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: {
    default: { name: "0G Chainscan", url: "https://chainscan-galileo.0g.ai" },
  },
  testnet: true,
});

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
        // 0G is the local `zeroGTestnet` above (16602), not viem's
        // `zeroGGalileoTestnet` (16601) — see the comment on it.
        supportedChains: [baseSepolia, zeroGTestnet],
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
