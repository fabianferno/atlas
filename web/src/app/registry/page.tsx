/**
 * The Registry — describe, browse, filter and fork.
 *
 * Dune's fork button was the whole flywheel. This ships on day one. The Studio
 * leads the page because describing something new and forking someone else's
 * are the same job: both end with a mini app that is yours.
 */
import type { Metadata } from "next";
import { StudioInput } from "@/components/board/studio-input";
import { TopBar } from "@/components/board/top-bar";
import { PublishedStrip } from "@/components/registry/published-strip";
import { RegistryGrid, RegistryLegend } from "@/components/registry/registry-grid";

export const metadata: Metadata = {
  title: "Registry — Atlas",
  description:
    "Describe an onchain app, or browse and fork a published one. Every fork gets a fresh wallet and name.",
};

export default function RegistryPage() {
  return (
    <>
      <TopBar active="registry" />
      {/* Bottom padding clears the docked ledger pill floating over this corner. */}
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pt-4 pb-24 sm:px-5 sm:pt-6">
        <StudioInput />
        {/* The names that are actually registered under the current ENS
            parent, enumerated from MiniAppRegistry on every mount rather than
            listed in the component. This sits above the grid on purpose: the
            grid's apps are unpublished, so the only names on this page that
            resolve should be the ones a judge can verify. It is also the app's
            only caller of `GET /api/resolve` — prd.md §5 argues a resolved name
            is a live plan and not a screenshot, and until this mounted, nothing
            in the product exercised that claim. */}
        <PublishedStrip />
        <div className="mt-4">
          <RegistryGrid />
        </div>
        <RegistryLegend />
      </main>
    </>
  );
}
