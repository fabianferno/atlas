/**
 * Why a surface like this did not already exist.
 *
 * The one section that has to make a stranger care, so it argues rather than
 * enumerates. The three figures under it are read from `facts.ts` — the same
 * registry the resolver queries — because a claim about breadth that a reader
 * cannot check is just an adjective.
 */
import { SectionHead } from "@/components/board/chrome";
import { SponsorMark } from "@/components/brand/sponsor-mark";
import { REGISTRY } from "./facts";

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
        {label}
      </dt>
      <dd className="fig mt-1 text-2xl">{value}</dd>
    </div>
  );
}

export function WhySection() {
  return (
    <section className="py-16 sm:py-24">
      <SectionHead
        title={
          <>
            <SponsorMark of="graph" size={17} className="mx-0.5 -translate-y-[2px]" /> The Graph had
            everything it needed to be crypto&rsquo;s consumer layer.
          </>
        }
      />

      <div className="mt-6 max-w-[46rem] space-y-4 text-sm leading-relaxed">
        <p>
          More chains, more protocols, real time, decentralized — and it only ever shipped for
          developers. Every consumer surface built on it was made by hand, one dashboard at a time,
          so only the questions worth a developer&rsquo;s week ever got an interface.
        </p>
        <p>
          Atlas generates the interface per question. An app exists the moment you ask for it,
          including for the long tail nobody would ever build by hand.
        </p>
      </div>

      <dl className="mt-8 grid max-w-[46rem] grid-cols-3 gap-4 border-t border-hairline pt-4">
        <Figure value={REGISTRY.familiesLive} label="schema families" />
        <Figure value={REGISTRY.verified} label="verified deployments" />
        <Figure value={REGISTRY.networks.length} label="networks" />
      </dl>

      <p className="mt-4 max-w-[46rem] text-sm text-[var(--muted-ink)]">
        The resolver picks a schema <em>family</em>, never a subgraph id — which is why a question
        nobody anticipated still resolves. {REGISTRY.networks.join(" · ")}.
      </p>
    </section>
  );
}
