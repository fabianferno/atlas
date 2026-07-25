/**
 * The Board — the home surface.
 *
 * Answers "what do I have and what is it doing?" in one screen: your mini apps
 * get the whole width, and chrome weight does the talking. The ledger no longer
 * holds a column here — it lives in the dock, bottom-left, on every surface.
 * Making something new happens in the Studio, which lives on the Registry.
 */
import { TierLegend } from "@/components/board/app-grid";
import { AppDeck } from "@/components/board/app-deck";
import { LedgerTicker } from "@/components/board/ledger";
import { TopBar } from "@/components/board/top-bar";

export default function BoardPage() {
  return (
    <>
      <TopBar active="board" />
      <LedgerTicker />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <AppDeck />
          <TierLegend />
        </div>
      </main>

      {/* Left padding clears the docked ledger pill, which floats over this
          corner once the page is scrolled to the bottom. */}
      <footer className="mt-6 border-t border-hairline px-3 pt-3 pb-20 sm:px-5 sm:pb-16 lg:pl-52">
        <p className="mono mx-auto max-w-[1400px] text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
          data via The Graph — standardized subgraphs, Subgraph MCP, Substreams, x402 · names on
          ENS · inference and Agentic ID on 0G
        </p>
      </footer>
    </>
  );
}
