"use client";

/**
 * THE REGISTRY — browse and fork.
 *
 * prd.md §12 asks for four figures on a card — "times forked, times run, total
 * value transacted, creator" — and closes with "vanity metrics are worse than
 * none". Three of the four ship. The fourth was the vanity metric.
 *
 * ## Why `valueTransactedUsd` is gone from this file
 *
 * It was a card cell, a sort key and a header total. Its only writer was a
 * client-side ledger ticker that every 4.2 seconds invented a swap amount from
 * the policy cap and added it to both `spentUsd` and `valueTransactedUsd` — see
 * the "NO LEDGER TICKER" note in `store.ts`. With the ticker deleted and the
 * seeds zeroed, nothing writes the field at all, and nothing server-side reports
 * notional volume as a quantity distinct from spend.
 *
 * A permanently-zero column is not the honest empty state, because zero is a
 * measurement: "$0 transacted" says *this app has moved no money*, when the
 * truth is *we do not measure notional volume*. Those are different claims and
 * only one of them is true. So the column, the sort option and the header total
 * are removed rather than dashed out. What replaced them is measured:
 *
 *   Spent of cap    `stats.spentUsd` — the server's own `totalSpentUsd(appId)`,
 *                   the figure the lifetime cap is metered against (§7). It has
 *                   a real writer in `dispatchAction`, so $0.00 here genuinely
 *                   means nothing has been signed yet.
 *   Sources live    `sourcesHealthy / sourcesQueried` from the fan-out. §13
 *                   argues the honest ratio *is* the Track 3 point.
 *   Cost per run    `costPerRunUsd`, what the last round trip cost.
 *
 * Creator earnings are not shown anywhere on this surface, and must not be.
 * §12 specifies an x402 facilitator settling to a creator's wallet; the README's
 * "Not in scope" records that no such facilitator exists and the number is
 * display-only. A price in the manifest is a *configured price*, never realised
 * income, and there is no honest way to render it beside a run count without
 * reading as revenue.
 *
 * ## Seeded texture versus measured fact
 *
 * `runs`, `forks` and the thumb counts stay: the README discloses them as
 * deliberate ecosystem texture, and it argues — correctly — that inventing a
 * fan-out is a data claim while inventing a fork count is set dressing. But a
 * reader cannot be expected to hold that distinction in their head, so the card
 * splits the two into captioned groups and says which is which. Anything under
 * "measured" has a writer that went over the wire.
 *
 * ## The name
 *
 * A card renders `identity.ens` or says the app is unpublished. It never
 * synthesises one — see the note at the ENS line.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { AgencyTier, Network, SchemaFamily } from "@/lib/contracts/manifest";
import type { MiniApp } from "@/lib/seed";
import { TIER_BLURB, TIER_LABEL, tierRank } from "@/lib/seed";
import { fmtNum, fmtUsd, isArmed, useBoard, useBoardSweep, useFigure } from "@/lib/store";
import { ArmedLamp, Fig, Label, SectionHead, TierTag, panelClass } from "@/components/board/chrome";
import { AppGlyph } from "@/components/board/app-glyph";
import { ForkDialog } from "@/components/registry/fork-dialog";
import { score } from "@/components/registry/ratings";
import { SponsorMark } from "@/components/brand/sponsor-mark";
import { NO_LIVE_SOURCE, familiesWithNoLiveSource } from "@/lib/schema-coverage";
import { cn } from "@/lib/utils";

/**
 * No `value` key. It sorted on `stats.valueTransactedUsd`, which nothing writes
 * — so the option promised an ordering it could not produce, and offering it
 * would have implied the field is populated for somebody. Every key left here
 * orders on a field that has a value: `forks`/`runs` from the disclosed seed
 * texture, `rating` from seeded thumbs plus real reviews, `new` from
 * `createdAt`.
 */
type Sort = "forks" | "runs" | "rating" | "new";


const SORTS: { key: Sort; label: string }[] = [
  { key: "forks", label: "Most forked" },
  { key: "runs", label: "Most run" },
  { key: "rating", label: "Best rated" },
  { key: "new", label: "Newest" },
];

export function RegistryGrid() {
  const board = useBoard();
  // Every card below prints two measured figures; this is what puts a
  // measurement behind them. Idempotent across surfaces — arriving here from the
  // board finds the sweep already done or already running.
  useBoardSweep();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<AgencyTier | "all">("all");
  const [chain, setChain] = useState<Network | "all">("all");
  const [schema, setSchema] = useState<SchemaFamily | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("forks");
  const [forking, setForking] = useState<MiniApp | null>(null);

  const apps = board.apps;

  /*
   * Every option list below is derived from the apps actually loaded, which is
   * what keeps the filter bar from overstating coverage: a chain or a schema
   * appears here only because a manifest in this browser names it.
   *
   * That matters for the schema select in particular. prd.md §13 declares eleven
   * standardized families but verified only NINE with live deployments anywhere
   * — `dex-aggregator@1.0.2` and `network@1.2.0` have zero, and `nft-marketplace`
   * is mainnet-only — and it is explicit that the demo claims nine, not eleven.
   * So no family count is printed on this page, and none should be: a number
   * beside a select would be read as coverage, and the defensible figure belongs
   * next to the deployment audit that earned it, not next to a dropdown.
   */
  const chains = useMemo(
    () => Array.from(new Set(apps.flatMap((a) => a.manifest.data.networks))).sort(),
    [apps],
  );
  const schemas = useMemo(
    () => Array.from(new Set(apps.flatMap((a) => a.manifest.data.schemas))).sort(),
    [apps],
  );

  /**
   * The label the select carries, and now the card chips too.
   *
   * An unqualified option implies the registry can filter to apps with data in
   * that family, and it never can — every match would be an app whose only source
   * for it is a placeholder. So the option is labelled rather than removed: the
   * honest claim is nine families, not eleven, and this is where a reader would
   * otherwise count eleven. The rule itself is `familiesWithNoLiveSource` in
   * `lib/schema-coverage.ts`, shared with the app page so the two cannot answer
   * the same question differently; see its header for why it lives there.
   */
  const noLiveSource = useMemo(() => familiesWithNoLiveSource(apps), [apps]);
  const categories = useMemo(
    () => Array.from(new Set(apps.map((a) => a.manifest.category))).sort(),
    [apps],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return apps
      .filter((a) => {
        const m = a.manifest;
        if (tier !== "all" && m.agency.tier !== tier) return false;
        if (chain !== "all" && !m.data.networks.includes(chain)) return false;
        if (schema !== "all" && !m.data.schemas.includes(schema)) return false;
        if (category !== "all" && m.category !== category) return false;
        if (!needle) return true;
        return (
          m.title.toLowerCase().includes(needle) ||
          m.name.includes(needle) ||
          m.intent.toLowerCase().includes(needle) ||
          m.tags.some((t) => t.includes(needle)) ||
          (m.author ?? "").toLowerCase().includes(needle)
        );
      })
      .slice()
      .sort((a, b) => {
        switch (sort) {
          case "forks":
            return b.stats.forks - a.stats.forks;
          case "runs":
            return b.stats.runs - a.stats.runs;
          case "rating":
            return score(b).pct - score(a).pct || b.stats.thumbsUp - a.stats.thumbsUp;
          case "new":
            return Date.parse(b.manifest.createdAt) - Date.parse(a.manifest.createdAt);
        }
      });
  }, [apps, q, tier, chain, schema, category, sort]);

  /*
   * The header totals, and what each one is allowed to claim.
   *
   * `canSpend` is a fact about manifests: how many of the apps in this browser
   * are at the autonomous tier and therefore hold standing authority (§7). It
   * cannot drift, because it is recomputed from the tier on every render.
   *
   * `totalSpent` sums `stats.spentUsd`, whose only writer is the server's
   * `totalSpentUsd(appId)` read back through `dispatchAction`. $0.00 is therefore
   * a real reading and not a placeholder — no app in this browser has signed a
   * value-moving action yet. This replaced a "Value transacted" total that summed
   * a field with no writer at all; see the note at the top of the file.
   */
  const canSpend = apps.filter((a) => a.manifest.agency.tier === "autonomous").length;
  const totalSpent = apps.reduce((s, a) => s + a.stats.spentUsd, 0);
  /*
   * How many apps carry an ENS name, counted rather than assumed. It is zero for
   * the seed set and for every fork, and it goes up the moment `publishApp`
   * returns a name — so the section head cannot go stale in either direction. The
   * alternative, a literal "none published", would have become a lie the first
   * time the Studio published something in this browser.
   */
  const named = apps.filter((a) => a.manifest.identity.ens !== null).length;

  return (
    <>
      <section className="panel p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            {/* h2: the Studio above it is the page's leading heading. */}
            <h2 className="display text-lg leading-none sm:text-2xl">Registry</h2>
            {/*
              It used to open "every published mini app", which is two claims this
              surface cannot make. There is no shared index: the board is a
              `localStorage` snapshot per browser (`STORAGE_KEY` in store.ts), so
              this grid is the seed set plus whatever you published here, and an
              app someone else published is invisible to it. And these apps are
              not published — `identity.ens` is null on all sixteen, which is why
              the cards say so. The five subnames that do resolve are in the
              strip above, read live off Sepolia.
            */}
            <p className="mt-1.5 text-xs text-[var(--muted-ink)]">
              What this browser knows about — the seed set plus anything you published here. There is
              no shared index; the board is <span className="mono">localStorage</span>. Fork one and
              you get a local copy: no name, no wallet, no inherited spending authority.
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1">
            <Stat k="Apps" v={fmtNum(apps.length)} note="this browser" />
            <Stat k="Can spend" v={fmtNum(canSpend)} note="autonomous tier" />
            <Stat k="Spent of caps" v={fmtUsd(totalSpent)} note="metered at the signer" />
          </dl>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--hairline)] pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, intent, tag or creator"
            aria-label="Search the registry"
            className="min-w-0 rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 text-xs outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] placeholder:text-[var(--muted-ink)] sm:col-span-2 lg:col-span-1"
          />
          <Select label="Tier" value={tier} onChange={(v) => setTier(v as AgencyTier | "all")} options={["all", "autonomous", "monitor", "readonly"]} render={(v) => (v === "all" ? "Any tier" : TIER_LABEL[v as AgencyTier])} />
          <Select label="Chain" value={chain} onChange={(v) => setChain(v as Network | "all")} options={["all", ...chains]} render={(v) => (v === "all" ? "Any chain" : v)} />
          <Select
            label="Schema"
            value={schema}
            onChange={(v) => setSchema(v as SchemaFamily | "all")}
            options={["all", ...schemas]}
            render={(v) =>
              v === "all"
                ? "Any schema"
                : noLiveSource.has(v)
                  ? `${v} — ${NO_LIVE_SOURCE}`
                  : v
            }
          />
          <Select label="Category" value={category} onChange={setCategory} options={["all", ...categories]} render={(v) => (v === "all" ? "Any category" : v)} />
          <Select label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS.map((s) => s.key)} render={(v) => SORTS.find((s) => s.key === v)?.label ?? v} />
        </div>

        {/*
          §12's "vanity metrics are worse than none" is the standard this
          paragraph is here to meet. The compromise the README argues for is that
          social texture stays and is *disclosed*, because inventing a fork count
          is set dressing while inventing a fan-out is a data claim. Disclosure
          only counts if it is on the screen with the numbers, so it is here and
          repeated as a caption on every card.

          The last sentence is the replacement for the "Value transacted" column
          and the "$0 earned" figure. Saying a thing is not measured is the only
          honest option when the alternative is a zero that reads as a reading.
        */}
        <p className="mt-3 border-t border-[var(--hairline)] pt-2 text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
          Forks, runs and thumbs are seeded texture — there is no network yet, and the README says so.
          Sources live, cost per run and spend against a cap are measured, each with a writer that went
          over the wire. Notional volume and creator earnings appear nowhere: nothing measures the first
          and no facilitator settles the second, so there is no figure to print.
        </p>
      </section>

      <section className="mt-4">
        {/*
          Not "Published". None of these apps is: `identity.ens` is null on all
          sixteen and a fork gets nothing either, so the old heading asserted the
          one thing §8 makes safety-critical to get right. The published set has
          its own strip on this page and it resolves every name it shows.
        */}
        <SectionHead
          title="Mini apps"
          note={
            named === 0
              ? `${filtered.length} of ${apps.length} · none published`
              : `${filtered.length} of ${apps.length} · ${named} published`
          }
          right={
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
              sorted by {SORTS.find((s) => s.key === sort)?.label.toLowerCase()}
            </span>
          }
        />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((app, i) => (
            <RegistryCard
              key={app.manifest.name}
              app={app}
              index={i}
              /* Passed down rather than recomputed per card: the answer is a
                 property of the whole loaded set, and sixteen cards each deriving
                 it from `apps` would be sixteen chances to pass a different list. */
              noLiveSource={noLiveSource}
              onFork={() => setForking(app)}
            />
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="mono py-10 text-center text-xs text-[var(--muted-ink)]">
            nothing matches those filters
          </p>
        ) : null}
      </section>

      {forking ? <ForkDialog app={forking} onClose={() => setForking(null)} /> : null}
    </>
  );
}

function RegistryCard({
  app,
  index,
  noLiveSource,
  onFork,
}: {
  app: MiniApp;
  index: number;
  /** Families with nothing healthy behind them anywhere — see the export. */
  noLiveSource: Set<string>;
  onFork: () => void;
}) {
  const m = app.manifest;
  const tier = m.agency.tier;
  const s = score(app);
  const figure = useFigure(m.name);

  return (
    <article
      className={panelClass(tier, "snap-in flex min-w-0 flex-col")}
      style={{ ["--i" as string]: Math.min(index, 9) } as React.CSSProperties}
    >
      {tier === "autonomous" ? (
        <div className="policy-strip">
          <span>autonomous</span>
          <span className="opacity-50">·</span>
          <span>cap {fmtUsd(m.agency.policy.maxSpendUsd)}</span>
          <span className="opacity-50">·</span>
          <span>per tx {fmtUsd(m.agency.policy.maxPerTxUsd)}</span>
          <span className="ml-auto">{m.agency.policy.allowlist.length} allowlisted</span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <AppGlyph manifest={m} className="mt-px" />
            <div className="min-w-0">
              <Link href={`/a/${m.name}`} className="display block text-[0.8125rem] leading-tight no-underline hover:underline">
                {m.title}
              </Link>
              {/*
                NO FABRICATED NAME.
                This line used to read `m.identity.ens ?? `${m.name}.atlas-apps.eth``,
                which printed a plausible subname on all sixteen cards. Not one of
                those was ever issued: five subnames exist under `atlas-apps.eth`
                on Sepolia and no seed app is among them, and `identity.ens` is
                now null on every seed, so this fallback was the only thing
                manufacturing them.

                §8 is why that is not a wording nit. The ENS name is a *safety
                primitive* — the thing a human resolves to check what an app is
                and where its wallet is BEFORE funding it. A name that looks
                issued and resolves nowhere is precisely the failure §8 exists to
                prevent, and it is worse here than elsewhere because the card
                beside it offers a Fork button.

                So: the name when there is one, otherwise the manifest slug — a
                real local fact, undotted, so it cannot be mistaken for a
                resolvable name — labelled unpublished. Same vocabulary as
                `app-card-face.tsx` and `app-wheel-card.tsx`.
              */}
              <p className="mono mt-1 flex min-w-0 items-center gap-1.5 text-[0.625rem] text-[var(--muted-ink)]">
                {/* Follows the same rule as the fallback above it: the mark
                    rides an issued ENS name and never the manifest slug. On a
                    card that offers a Fork button, an ENS logo over an
                    unpublished slug would be the §8 failure with a logo on it. */}
                {m.identity.ens ? <SponsorMark of="ens" size={11} /> : null}
                <span className="min-w-0 flex-1 truncate">{m.identity.ens ?? m.name}</span>
                {m.identity.ens ? null : (
                  <span className="shrink-0 uppercase tracking-[0.08em]">unpublished</span>
                )}
              </p>
            </div>
          </div>
          {/*
            Armed, not live. `app.running` is a configuration boolean; nothing on
            the client knows whether a Substreams run is open, and `--live` plus
            the `.live-dot` blip are reserved for one that is (see the "ARMED IS
            NOT LIVE" note in `app-card-face.tsx`; `isArmed` lives in `store.ts`
            beside `armedCount` and the lamp in `chrome.tsx`, both reused here). A
            registry card is the last place that should imply a subscription: it
            is the surface a stranger judges the app on.
          */}
          {isArmed(app) ? <ArmedLamp label="" /> : null}
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-snug text-[var(--muted-ink)]">{m.intent}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TierTag tier={tier} />
          {/*
            A DECLARED FAMILY IS NOT A DATA SOURCE, and this row used to print the
            two as one thing. `m.data.schemas` is what the app ASKED for;
            `m.data.sources` is what the health check ANSWERED. For
            `dex-aggregator@1.0.2` and `network@1.2.0` the answer is nothing —
            §13 checked 86 deployment ids and found neither family deployed on any
            network — so three of these cards were presenting a family as coverage
            while the only qualification on the page sat inside a closed select.

            The declaration stays; it is the honest record of the request, and the
            select derives its own label from it. What changes is that the chip now
            carries the answer beside the ask, in the same words the select uses.
          */}
          {m.data.schemas.slice(0, 2).map((sch) => {
            const dead = noLiveSource.has(sch);
            return (
              <span
                key={sch}
                className={cn(
                  "mono text-[0.5625rem] uppercase tracking-[0.06em]",
                  dead ? "text-loss" : "text-[var(--muted-ink)]",
                )}
                title={
                  dead
                    ? "This app declares this standardized family, and no deployment for it is healthy anywhere in this browser's set — the resolver answers with a placeholder marked dead and the fan-out skips it."
                    : undefined
                }
              >
                {sch}
                {dead ? ` — ${NO_LIVE_SOURCE}` : ""}
              </span>
            );
          })}
        </div>

        {/*
          Two captioned groups instead of one undifferentiated grid of four.
          §12 wants forks, runs and a creator on the card and the README keeps the
          seeded ones on the explicit condition that they are disclosed as
          seeded — so the caption does the disclosing, per card, where the numbers
          are. Everything under "measured" came back from a request.
        */}
        <div
          className="mt-3 border-t border-[var(--hairline)] pt-2"
          title="Seeded texture, disclosed in the README: there is no network yet, so nobody has forked or run these. Ratings you leave in this browser are added to the seeded thumbs."
        >
          <Label className="text-[0.5625rem] tracking-[0.08em]">Community · seeded</Label>
          <dl className="mt-1 grid grid-cols-3 gap-x-3">
            <Cell k="Forked" v={fmtNum(app.stats.forks)} />
            <Cell k="Run" v={fmtNum(app.stats.runs)} />
            <Cell k="Rated" v={s.total > 0 ? `${s.pct}% · ${s.total}` : "—"} />
          </dl>
        </div>

        <div
          className="mt-2 border-t border-[var(--hairline)] pt-2"
          title="Read from the wire: source health and cost come from the fan-out that produced this app's body; spend is the server's own lifetime total, the figure the policy cap is metered against."
        >
          <Label className="text-[0.5625rem] tracking-[0.08em]">Measured</Label>
          <dl className="mt-1 grid grid-cols-2 gap-x-3">
            {/* The section says "Measured" and the tooltip says these came off
                the wire, so they may not be printed before this session has put
                them there — see `useFigure`. On a cold board they were the
                build-time snapshot's, under that same heading. */}
            <Cell
              k="Sources live"
              v={figure(`${fmtNum(app.stats.sourcesHealthy)} / ${fmtNum(app.stats.sourcesQueried)}`)}
            />
            {tier === "autonomous" ? (
              /* Spend against the cap — real, and the one money figure this
                 surface can stand behind. `fmtUsd` on both halves so the cap is
                 not mistaken for the amount moved. */
              <Cell
                k="Spent of cap"
                v={`${fmtUsd(app.stats.spentUsd)} / ${fmtUsd(m.agency.policy.maxSpendUsd)}`}
                accent={app.stats.spentUsd > 0 ? "spend" : undefined}
              />
            ) : (
              /* No wallet at this tier, so there is no spend to report and a $0
                 would be answering a question nobody asked. What it does cost is
                 the data. */
              <Cell k="Cost per run" v={figure(`$${app.stats.costPerRunUsd.toFixed(3)}`)} />
            )}
          </dl>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-2">
          <span className="mono min-w-0 truncate text-[0.625rem] text-[var(--muted-ink)]">
            by {m.author ?? "unclaimed"}
            {m.forkedFrom ? ` · fork of ${m.forkedFrom}` : ""}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Link href={`/a/${m.name}`} className="btn press px-2 py-0.5 text-[0.6875rem] no-underline">
              Open
            </Link>
            <button type="button" onClick={onFork} className="btn press px-2 py-0.5 text-[0.6875rem]">
              Fork
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Cell({ k, v, accent }: { k: string; v: string; accent?: "spend" }) {
  return (
    <div className="py-0.5">
      <dt className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{k}</dt>
      <dd>
        <Fig className="text-[0.6875rem] font-medium" accent={accent}>
          {v}
        </Fig>
      </dd>
    </div>
  );
}

/**
 * A header total. `note` is not decoration: each of these three figures counts
 * something different in kind — a local collection, a manifest property, a
 * server reading — and a bare number in a row of three invites the reader to
 * treat them alike. One word under each says which is which.
 */
function Stat({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div>
      <dt className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{k}</dt>
      <dd>
        <Fig className="text-sm font-semibold">{v}</Fig>
      </dd>
      {note ? (
        <dd className="mono text-[0.5625rem] leading-none text-[var(--muted-ink)]">{note}</dd>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  render,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render: (v: string) => string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
      <Label className="shrink-0">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("mono min-w-0 flex-1 bg-transparent text-[0.6875rem] outline-none")}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {render(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Tier legend, restated here so the registry stands on its own. */
export function RegistryLegend() {
  return (
    <div className="panel mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <Label>Depth is agency</Label>
      {(["readonly", "monitor", "autonomous"] as const)
        .slice()
        .sort((a, b) => tierRank(a) - tierRank(b))
        .map((tier) => (
          <span key={tier} className="flex items-center gap-1.5">
            <span className={panelClass(tier, "h-4 w-7 shrink-0 rounded-[4px]")} aria-hidden />
            <span className="mono text-[0.625rem] uppercase tracking-[0.06em]">{TIER_LABEL[tier]}</span>
            <span className="hidden text-[0.6875rem] text-[var(--muted-ink)] sm:inline">{TIER_BLURB[tier]}</span>
          </span>
        ))}
    </div>
  );
}
