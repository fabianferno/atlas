/**
 * The Board — the home surface.
 *
 * Answers "what do I have and what is it doing?" in one screen: the Studio
 * input at the top, the live ledger beside it, and the grid of mini apps
 * underneath with chrome weight doing the talking.
 */
import { AppGrid, TierLegend } from "@/components/board/app-grid";
import { Ledger, LedgerTicker } from "@/components/board/ledger";
import { StudioInput } from "@/components/board/studio-input";
import { TopBar } from "@/components/board/top-bar";

export default function BoardPage() {
  return (
    <>
      <TopBar active="board" />
      <LedgerTicker />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-5 sm:py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="min-w-0 space-y-4">
            <StudioInput />
            <TierLegend />
            <AppGrid />
          </div>

          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <Ledger />
          </aside>
        </div>
      </main>

      <footer className="mt-6 border-t border-hairline px-3 py-3 sm:px-5">
        <p className="mono mx-auto max-w-[1400px] text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
          data via The Graph — standardized subgraphs, Subgraph MCP, Substreams, x402 · names on
          ENS · inference and Agentic ID on 0G
        </p>
      </footer>
    </>
  );
}
