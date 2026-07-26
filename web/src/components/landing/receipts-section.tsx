/**
 * The receipts.
 *
 * Every figure here comes from `facts.ts`, so nothing on this page can drift
 * from the snapshot it was measured in. Each group says what PRODUCED its
 * number rather than asserting it, and the ones that are a recorded run rather
 * than a live reading say so in the same breath — the morph's label points here
 * on that promise.
 *
 * Sponsor marks sit inline, on the clause that names the protocol, following
 * `page.tsx`'s footer. A logo strip would flatten a careful inventory back into
 * sponsorship, and the whole point of the next section is that this inventory
 * is not flattering.
 */
import { SectionHead } from "@/components/board/chrome";
import { SponsorMark } from "@/components/brand/sponsor-mark";
import {
  ENS_PARENT,
  ENS_RECORDS,
  ONCHAIN,
  REFERENCE_RUN,
  REGISTRY,
  SEED,
  SUBSTREAMS,
  ZEROG,
} from "./facts";

function Group({
  title,
  source,
  children,
}: {
  title: string;
  /** What produced the figures below. Never omitted — it is the point. */
  source: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="display text-sm">{title}</h3>
        <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{source}</span>
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mono overflow-x-auto rounded-[var(--radius)] border border-hairline bg-[var(--card-b)] p-3 text-[0.6875rem] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

export function ReceiptsSection() {
  const measured = SEED.measuredAt ? SEED.measuredAt.slice(0, 10) : "unmeasured";

  return (
    <section id="receipts" className="scroll-mt-8 py-16 sm:py-24">
      <SectionHead title="Receipts" note="each figure labelled with what produced it" />

      <div className="mt-6 max-w-[52rem]">
        <Group title="The registry" source="derived from SOURCE_REGISTRY at build time">
          <p>
            {REGISTRY.entries} entries, of which <span className="fig">{REGISTRY.verified}</span> are
            deployment ids confirmed by a network crawl. {REGISTRY.familiesLive} of{" "}
            {REGISTRY.familiesDeclared} schema families have a live deployment, across{" "}
            {REGISTRY.networks.join(", ")}. Resolving a <em>schema</em> rather than a subgraph id is
            what makes an unanticipated question resolvable — via{" "}
            <SponsorMark of="graph" size={12} className="mx-0.5" /> The Graph&rsquo;s standardized
            subgraphs.
          </p>
        </Group>

        <Group title="A fan-out run" source="recorded 2026-07-25 · not a live reading">
          <Mono>
            {`${REFERENCE_RUN.queried} sources queried → ${REFERENCE_RUN.healthy} healthy, ${REFERENCE_RUN.dead} dead skipped by health check → ${REFERENCE_RUN.rows} rows in ${REFERENCE_RUN.seconds}s → $${REFERENCE_RUN.costUsd}`}
          </Mono>
          <p className="text-[var(--muted-ink)]">
            That{" "}
            {Math.round((REFERENCE_RUN.dead / REFERENCE_RUN.queried) * 100)}% dead rate is real, and
            it is why sources are health-checked at generation time and frozen into the app&rsquo;s
            manifest rather than trusted at read time.
          </p>
        </Group>

        <Group title="The registry is built by the pipeline" source={`snapshot measured ${measured}`}>
          <p>
            All <span className="fig">{SEED.live}</span> of {SEED.declared} seed mini apps are
            produced by resolve → health-check → fan-out → compose, not written by hand.
            Re-measuring every one of them costs{" "}
            <span className="fig">${SEED.totalCostUsd}</span> in total.
          </p>
          {SEED.dropped.length > 0 ? (
            <p className="mono text-[0.6875rem] text-[var(--muted-ink)]">
              no live data in this snapshot: {SEED.dropped.join(", ")}
            </p>
          ) : null}
        </Group>

        <Group title="Substreams, verified both directions" source="scripts/substreams-verify.ts">
          <Mono>
            {`breach:  blocks ${SUBSTREAMS.breach.fromBlock} → ${SUBSTREAMS.breach.toBlock} in ${SUBSTREAMS.breach.seconds}s
         ${SUBSTREAMS.breach.breachBlock} → healthFactor ${SUBSTREAMS.breach.healthFactor} breaches "${SUBSTREAMS.trigger}"
         → TRIGGER fired
control: blocks ${SUBSTREAMS.control.fromBlock} → ${SUBSTREAMS.control.toBlock}, healthy throughout, ${SUBSTREAMS.control.firings} firings`}
          </Mono>
          <p className="text-[var(--muted-ink)]">
            Against {SUBSTREAMS.endpoint}, one tick per block. The control run is the half that
            proves anything — a harness that can only report a firing has not shown that it stays
            quiet when it should.
          </p>
        </Group>

        <Group title="A real transaction" source="scripts/substreams-verify.ts --real">
          <Mono>
            {`Arbitrum block ${ONCHAIN.arbitrumBlock} → trigger fired → POLICY OK
  → session key signed → ${ONCHAIN.txHash.slice(0, 10)}…${ONCHAIN.txHash.slice(-4)}
  → Base Sepolia block ${ONCHAIN.baseBlock}, allowance ${ONCHAIN.allowanceUsdc} USDC read back on chain`}
          </Mono>
          <p>
            <a
              href={ONCHAIN.basescanUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              View on Basescan
            </a>
            . It is an <span className="fig">{ONCHAIN.kind}</span>, and it is described as one:
            granting the router an allowance is genuinely the first step of a swap, and it is not a
            swap.
          </p>
        </Group>

        <Group title="Names" source="read from the deployed origin with no write key">
          <p>
            <SponsorMark of="ens" size={12} className="mx-0.5" />{" "}
            <span className="fig">{ENS_PARENT}</span>, registered and wrapped on Sepolia, issuing a
            subname per mini app. Records written per app:
          </p>
          <Mono>{ENS_RECORDS.join("\n")}</Mono>
        </Group>

        <Group title="Identity and inference" source="0G Galileo · scripts/publish-under-parent.ts">
          <p>
            Agentic ID token {ZEROG.tokenId} on{" "}
            <SponsorMark of="zerog" size={12} className="mx-0.5" /> {ZEROG.chainName} (chain{" "}
            {ZEROG.chainId}), planned on 0G Compute with model{" "}
            <span className="fig">{ZEROG.model}</span> and attestation{" "}
            <span className="fig">{ZEROG.attestation}</span>.
          </p>
        </Group>
      </div>
    </section>
  );
}
