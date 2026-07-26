/**
 * The Board — the home surface.
 *
 * Answers "what is here and what is it doing?" in one screen: every mini app on
 * the board gets the whole width, and chrome weight does the talking. It used to
 * ask the narrower question — "what do I have" — over `myApps()`, which was a
 * seed constant rather than anything about the reader; see the ownership note in
 * `store.ts`. A card says whose it is; the surface is for browsing. The ledger
 * no longer
 * holds a column here — it lives in the dock, bottom-left, on every surface.
 * Making something new happens in the Studio, which lives on the Registry.
 */
import { TierLegend } from "@/components/board/app-grid";
import { AppDeck } from "@/components/board/app-deck";
import { TopBar } from "@/components/board/top-bar";
import { SponsorMark } from "@/components/brand/sponsor-mark";

export default function BoardPage() {
  return (
    <>
      <TopBar active="board" />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <AppDeck />
          <TierLegend />
        </div>
      </main>

      {/* Left padding clears the docked ledger pill, which floats over this
          corner once the page is scrolled to the bottom. */}
      <footer className="mt-6 border-t border-hairline px-3 pt-3 pb-20 sm:px-5 sm:pb-16 lg:pl-52">
        {/* This line used to credit four Graph products. Two of them were not
            running: Subgraph MCP is an env var nothing calls, and x402 parses a
            real 402 challenge and signs a real EIP-3009 payment but has never
            paid for a query (`X402_PRIVATE_KEY` is unset), so every row on this
            board arrived over the API-key gateway. prd.md §14 #6 needs two Graph
            products, not four — so claiming the two that run clears the bar and
            costs nothing, while claiming four spends the credibility of the
            Substreams argument in §10 that the rest of the build rests on.
            The MCP server named here is ours (`/api/mcp`, 6 tools), which is a
            different thing from The Graph's Subgraph MCP. */}
        {/* The three marks go on the three clauses that name a protocol, not in
            a "powered by" row of their own. This line is a careful inventory of
            what runs and what does not — the x402 clause in the middle says it
            has paid for nothing — and a logo strip beside it would flatten all
            of that back into sponsorship. Inline, each mark inherits the
            qualification of the sentence it sits in. */}
        <p className="mono mx-auto max-w-[1400px] text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
          data via <SponsorMark of="graph" size={12} className="mx-0.5" /> The Graph — standardized
          subgraphs and Substreams, both live · x402 signing is built but has paid for nothing yet ·
          names on <SponsorMark of="ens" size={12} className="mx-0.5" /> ENS · inference and Agentic
          ID on <SponsorMark of="zerog" size={12} className="mx-0.5" /> 0G · this board is reachable
          by an agent at <span className="fig">/api/mcp</span>
        </p>
      </footer>
    </>
  );
}
