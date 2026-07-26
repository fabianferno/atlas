"use client";

import type { MiniApp } from "@/lib/seed";
import type { SignerFacts } from "@/components/board/app-facts";
import { KV, Label, SectionHead } from "@/components/board/chrome";
import { SponsorMark } from "@/components/brand/sponsor-mark";
import { fmtDate } from "@/lib/store";
// One rule for "this family has nothing live behind it", shared with the
// registry's schema select — the control prd.md §14 #7 cites — rather than
// re-derived here. A second copy of that test would drift, and the direction it
// drifts is always towards claiming more. See `lib/schema-coverage.ts`.
import { NO_LIVE_SOURCE } from "@/lib/schema-coverage";

export function DataPlanPanel({
  app,
  signer,
  stream,
  noLiveSource,
}: {
  app: MiniApp;
  signer: SignerFacts | null;
  stream: { mode: "substreams" | "interval"; reason: string } | null;
  noLiveSource: ReadonlySet<string>;
}) {
  const m = app.manifest;
  return (
    <section className="panel p-3">
      {/* Health is a reading with a timestamp, not a property. These
          counts came from the last fan-out, which may be days old — a
          subgraph that died this morning still shows live until Run
          re-probes it. Dating the count is the difference between a
          measurement and a claim. */}
      {/* Every row under this head is about The Graph — the schemas are
          its standardized families, the sources are deployment ids on its
          network, and the stream is a Substreams package. One mark on the
          head says that once, instead of once per row. */}
      <SectionHead
        title="Data plan"
        note={`${app.stats.sourcesHealthy} of ${app.stats.sourcesQueried} deployments live · probed ${fmtDate(app.lastRunAt)}`}
        right={<SponsorMark of="graph" size={14} />}
      />
      {/*
        THE SERVER MAY NOT BE RUNNING THIS MANIFEST, and until now nothing
        said so. `/api/agency/register` is first-write-wins for the policy
        and for the metric half of the data plan — correct, since a
        re-registration that could replace `sources` could change the number
        a trigger compares and so raise what an app spends — but the
        consequence is that the rows directly below this line can describe a
        plan the server discarded. That is exactly how `aave-guard` came to
        stream `aave-v3-arbitrum@v0.4.1`, a package removed from the repo
        commits earlier: the page rendered the current one, the server held
        the old one, and the only symptom was a 502 from `Watch 3 blocks`.

        Rendered from `divergence.ignored`, not `divergence.diverged` — a
        REFRESHED field is now in agreement and there is nothing to warn
        about; only a refused one means the reader is looking at something
        that is not what runs. `--loss` and the same placement idiom as
        `walletClaimConflict` below, which is the same shape of problem: the
        manifest says one thing, the server does another, and the server wins.

        `summary` verbatim. It names its own fields and its own reason, and
        paraphrasing a server's account of what it refused is how a UI ends
        up describing a policy refusal as a data refresh.

        KNOWN GAP, stated rather than papered over: `useSigner` only fires
        for the autonomous tier — a read-only app has no wallet to ask about
        — so a monitor or read-only app with a stale server registration
        gets no banner here. The server would still answer with the
        divergence; nothing asks it. Closing that means registering every
        tier, which provisions signers for apps that will never sign, so it
        is a deliberate hole and not an oversight. The tier that can SPEND on
        a stale plan is the one covered.
      */}
      {signer?.divergence && signer.divergence.ignored.length > 0 ? (
        <p className="mt-2 text-[0.6875rem] leading-snug text-loss">
          {signer.divergence.summary}
        </p>
      ) : null}

      <dl className="cells mt-2">
        {/*
          DECLARED, NOT RESOLVED. This row was `m.data.schemas.join(" · ")`
          — a bare list, which reads as "these are my data sources". It is
          not: `data.schemas` is what the app ASKED for and `data.sources`,
          three rows down, is what the health check ANSWERED. For
          `dex-aggregator@1.0.2` and `network@1.2.0` the answer is nothing at
          all — prd.md §13 checked 86 deployment ids and found neither family
          deployed on any network — so the Sources list below correctly said
          "dead, skipped" while the line above it presented the family
          unqualified. Two panels, one contradiction, and §13's rule is that
          the qualification goes where the claim is.

          The declaration itself stays and must: it is the honest record of
          the request, the resolver's explicit placeholder is what makes the
          skip visible, and the registry derives its filter label from these
          same declarations.
        */}
        <KV
          k="Schemas"
          v={
            <span className="inline-flex flex-wrap justify-end gap-x-1.5">
              {m.data.schemas.map((f, i) => (
                <span key={f}>
                  {i > 0 ? <span className="text-[var(--muted-ink)]">· </span> : null}
                  {f}
                  {noLiveSource.has(f) ? (
                    <span className="text-loss"> — {NO_LIVE_SOURCE}</span>
                  ) : null}
                </span>
              ))}
            </span>
          }
        />
        <KV k="Networks" v={m.data.networks.join(" · ")} />
        {/* The manifest DECLARES a transport; it does not prove one was
            used. `X402_PRIVATE_KEY` is unset in this build (prd.md §14 row
            6 — x402 is coded and unexercised), and the measured cost of a
            run comes back at the gateway's blended plan rate rather than
            x402's $0.01 a query, which is how you can tell. So this row
            says "declared" and stops there. It used to read "the app's own
            wallet pays per query", which describes a payment that has never
            happened. */}
        <KV
          k="Transport"
          v={
            m.data.transport === "x402"
              ? "x402 declared — no x402 key in this build, so queries went over the gateway plan"
              : m.data.transport
          }
          accent={m.data.transport === "x402" ? "risk" : undefined}
        />
        <KV
          k="Stream"
          v={m.data.stream ? `${m.data.stream.package} · ${m.data.stream.module}` : "none — evaluated on open"}
        />
        {/* Latency is the point of Substreams, so name the mechanism, not
            the aspiration — and not in the present tense either.
            `GET /api/stream` reporting `substreams` means a token is
            configured and per-block evaluation is POSSIBLE. It does not
            mean anything is subscribed: the only thing that opens a
            subscription is the bounded Watch above, and it closes again
            when it returns. Hence `--gain` (configured, same idiom as the
            armed lamp) rather than `--live`, which §6 Rule 2 now reserves
            for a run that is actually open. */}
        <KV
          k="Evaluated"
          v={
            stream === null
              ? "checking…"
              : stream.mode === "substreams"
                ? "per block while a watch is open — token configured, nothing subscribed between runs"
                : "on an interval — no Substreams token, so polling"
          }
          accent={stream?.mode === "substreams" ? "gain" : stream ? "risk" : undefined}
        />
        {/* Attributed, not settled. `costOf()` in `lib/kit/gateway.ts`
            assigns a blended $0.0001 per gateway query because gateway
            usage is billed out of a plan, not per call — so this is what a
            run cost by attribution, and no invoice anywhere carries it. */}
        <KV k="Cost per run" v={`$${app.stats.costPerRunUsd.toFixed(4)} attributed`} />
      </dl>

      <div className="mt-3 border-t border-[var(--hairline)] pt-2">
        <Label>Sources</Label>
        <ul className="mt-1.5 space-y-1">
          {m.data.sources.map((s) => (
            <li key={s.subgraphId} className="flex items-baseline gap-2">
              <span
                className="mt-[3px] h-2 w-2 shrink-0 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.25)]"
                style={{ background: s.healthy ? "var(--gain)" : "var(--loss)" }}
                aria-hidden
              />
              <span className="mono min-w-0 flex-1 truncate text-[0.6875rem]">{s.label ?? s.subgraphId}</span>
              <span className="mono shrink-0 text-[0.625rem] text-[var(--muted-ink)]">{s.schema}</span>
              <span
                className="mono shrink-0 text-[0.5625rem] uppercase"
                style={{ color: s.healthy ? "var(--gain)" : "var(--loss)" }}
              >
                {s.healthy ? "live" : "dead, skipped"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
