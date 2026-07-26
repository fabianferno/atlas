/**
 * What isn't built.
 *
 * Deliberately the same heading weight, type size and rhythm as Receipts. This
 * is not a footnote and must not be styled as one: for the reader this page's
 * second act is written for, it is the most persuasive section on it, because
 * it is the only one that costs something to publish.
 *
 * If a later edit makes this section quieter than Receipts, that edit has
 * changed the argument, not the layout.
 */
import { SectionHead } from "@/components/board/chrome";

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-hairline py-5">
      <h3 className="display text-sm">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted-ink)]">{children}</p>
    </div>
  );
}

export function NotBuiltSection() {
  return (
    <section className="py-16 sm:py-24">
      <SectionHead title="What isn't built" note="stated here rather than left ambiguous" />

      <div className="mt-6 max-w-[52rem]">
        <Item title="x402 is implemented and has paid for nothing">
          The 402 challenge is parsed for real and answered with a real EIP-3009 signature at the
          published price. But <span className="fig">X402_PRIVATE_KEY</span> is unset, so no query
          has actually been paid for this way — every row on this board arrived over the API-key
          gateway.
        </Item>

        <Item title="One session key signs for every mini app">
          <span className="fig">AGENT_SESSION_PRIVATE_KEY</span> is process-wide. Register two
          different mini apps and both come back with the same address. &ldquo;A wallet per
          app&rdquo; is true of the manifest and not true of custody — a record says where a name
          points, and custody is not a property of a record.
        </Item>

        <Item title="Subgraph MCP is not wired">
          <span className="fig">GRAPH_MCP_URL</span> is an environment variable nothing in{" "}
          <span className="fig">src/</span> calls. Schema resolution runs off the local registry plus
          a live health check, so discovery beyond that registry is a real gap. Distinct from{" "}
          <em>our</em> MCP server, which is served and listed below.
        </Item>

        <Item title="Three of the eight issued subnames point at manifest bytes that no longer exist">
          The names resolve. What they resolve to is gone.
        </Item>

        <Item title="The Substreams success path is unexercised inside the app">
          The free tier allows two concurrent streams and the account is at its quota, so{" "}
          <span className="fig">POST /api/stream</span> reaches the endpoint and is refused —
          a real failure of a real call, rendered as one. The subscription is verified end to end by{" "}
          <span className="fig">scripts/substreams-verify.ts</span>, and verified only as far as the
          endpoint&rsquo;s answer in the product itself.
        </Item>
      </div>
    </section>
  );
}
