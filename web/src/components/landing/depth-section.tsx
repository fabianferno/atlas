/**
 * Depth encodes agency.
 *
 * Illustrated with three REAL `Panel`s at their three real tiers rather than
 * pictures of them — `Panel`'s own `tier` prop exists for exactly this ("almost
 * never needed outside the demo grid", says its JSDoc). Drawing mock-ups here
 * would be the one thing this section must not do: it claims you can read a
 * thing's permissions off its chrome, so the chrome had better be the shipped
 * chrome. Press the skin toggle in the section below and these three re-express
 * together, still distinguishable — which is the claim's real test.
 */
import { SectionHead } from "@/components/board/chrome";
import { Panel } from "@/components/brutal";

export function DepthSection() {
  return (
    <section className="py-16 sm:py-24">
      <SectionHead
        title="You can see what a thing is allowed to do by looking at it."
        note="analytics · monitoring · autonomous"
      />

      <div className="mt-6 max-w-[46rem] space-y-4 text-sm leading-relaxed">
        <p>
          Analytics sits flush in the surface. Monitoring lifts, on a live-blue rim. Autonomous
          stands proud, orange, with a shadow under it.
        </p>
        <p>
          The tier is not decoration. An autonomous app always renders its policy strip, its kill
          switch and its trade log — and the renderer enforces that on screen rather than trusting
          the document to include them. A skin that hid which apps can spend would be a bug, not a
          theme.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Panel
          tier="readonly"
          title="Analytics"
          meta={<span className="mono text-[0.625rem]">read only</span>}
        >
          <p className="text-xs leading-relaxed text-[var(--muted-ink)]">
            Sits flush in the surface. Reads, renders, and can do nothing else.
          </p>
        </Panel>

        <Panel
          tier="monitor"
          title="Monitoring"
          meta={<span className="mono text-[0.625rem]">watches</span>}
        >
          <p className="text-xs leading-relaxed text-[var(--muted-ink)]">
            Lifts, on a live-blue rim. Evaluates its triggers and tells you — it still cannot spend.
          </p>
        </Panel>

        <Panel
          tier="autonomous"
          title="Autonomous"
          meta={<span className="mono text-[0.625rem]">holds a wallet</span>}
        >
          <p className="text-xs leading-relaxed text-[var(--muted-ink)]">
            Stands proud, orange, with a shadow under it. Signs — inside a policy it cannot talk its
            way past.
          </p>
        </Panel>
      </div>
    </section>
  );
}
