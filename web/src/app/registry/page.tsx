/**
 * The Registry — browse, filter and fork.
 *
 * Dune's fork button was the whole flywheel. This ships on day one.
 */
import type { Metadata } from "next";
import { LedgerTicker } from "@/components/board/ledger";
import { TopBar } from "@/components/board/top-bar";
import { RegistryGrid, RegistryLegend } from "@/components/registry/registry-grid";

export const metadata: Metadata = {
  title: "Registry — Graph Mini Apps",
  description: "Browse and fork published mini apps. Every fork gets a fresh wallet and name.",
};

export default function RegistryPage() {
  return (
    <>
      <TopBar active="registry" />
      <LedgerTicker />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-5 sm:py-6">
        <RegistryGrid />
        <RegistryLegend />
      </main>
    </>
  );
}
