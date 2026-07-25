/**
 * The Registry — describe, browse, filter and fork.
 *
 * Dune's fork button was the whole flywheel. This ships on day one. The Studio
 * leads the page because describing something new and forking someone else's
 * are the same job: both end with a mini app that is yours.
 */
import type { Metadata } from "next";
import { LedgerTicker } from "@/components/board/ledger";
import { StudioInput } from "@/components/board/studio-input";
import { TopBar } from "@/components/board/top-bar";
import { RegistryGrid, RegistryLegend } from "@/components/registry/registry-grid";

export const metadata: Metadata = {
  title: "Registry — Graph Mini Apps",
  description:
    "Describe an onchain app, or browse and fork a published one. Every fork gets a fresh wallet and name.",
};

export default function RegistryPage() {
  return (
    <>
      <TopBar active="registry" />
      <LedgerTicker />
      {/* Bottom padding clears the docked ledger pill floating over this corner. */}
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pt-4 pb-24 sm:px-5 sm:pt-6">
        <StudioInput />
        <div className="mt-4">
          <RegistryGrid />
        </div>
        <RegistryLegend />
      </main>
    </>
  );
}
