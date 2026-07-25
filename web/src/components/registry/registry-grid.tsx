"use client";

/**
 * The Registry — browse and fork.
 *
 * Filter by tier, category, chain and schema. The numbers on a card are the
 * ones that mean something: times forked, times run, total value transacted,
 * creator. Vanity metrics are worse than none.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { AgencyTier, Network, SchemaFamily } from "@/lib/contracts/manifest";
import type { MiniApp } from "@/lib/seed";
import { TIER_BLURB, TIER_LABEL, tierRank } from "@/lib/seed";
import { fmtNum, fmtUsd, useBoard } from "@/lib/store";
import { Fig, Label, LiveDot, SectionHead, TierTag, panelClass } from "@/components/board/chrome";
import { AppGlyph } from "@/components/board/app-glyph";
import { ForkDialog } from "@/components/registry/fork-dialog";
import { score } from "@/components/registry/ratings";
import { cn } from "@/lib/utils";

type Sort = "forks" | "runs" | "value" | "rating" | "new";

const SORTS: { key: Sort; label: string }[] = [
  { key: "forks", label: "Most forked" },
  { key: "runs", label: "Most run" },
  { key: "value", label: "Value transacted" },
  { key: "rating", label: "Best rated" },
  { key: "new", label: "Newest" },
];

export function RegistryGrid() {
  const board = useBoard();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<AgencyTier | "all">("all");
  const [chain, setChain] = useState<Network | "all">("all");
  const [schema, setSchema] = useState<SchemaFamily | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("forks");
  const [forking, setForking] = useState<MiniApp | null>(null);

  const apps = board.apps;

  const chains = useMemo(
    () => Array.from(new Set(apps.flatMap((a) => a.manifest.data.networks))).sort(),
    [apps],
  );
  const schemas = useMemo(
    () => Array.from(new Set(apps.flatMap((a) => a.manifest.data.schemas))).sort(),
    [apps],
  );
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
          case "value":
            return b.stats.valueTransactedUsd - a.stats.valueTransactedUsd;
          case "rating":
            return score(b).pct - score(a).pct || b.stats.thumbsUp - a.stats.thumbsUp;
          case "new":
            return Date.parse(b.manifest.createdAt) - Date.parse(a.manifest.createdAt);
        }
      });
  }, [apps, q, tier, chain, schema, category, sort]);

  const totalValue = apps.reduce((s, a) => s + a.stats.valueTransactedUsd, 0);
  const totalForks = apps.reduce((s, a) => s + a.stats.forks, 0);

  return (
    <>
      <section className="panel p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            {/* h2: the Studio above it is the page's leading heading. */}
            <h2 className="display text-lg leading-none sm:text-2xl">Registry</h2>
            <p className="mt-1.5 text-xs text-[var(--muted-ink)]">
              Every published mini app. Fork one and it becomes yours — new wallet, new name, no
              inherited spending authority.
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1">
            <Stat k="Apps" v={fmtNum(apps.length)} />
            <Stat k="Forks" v={fmtNum(totalForks)} />
            <Stat k="Value transacted" v={fmtUsd(totalValue, { compact: true })} />
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
          <Select label="Schema" value={schema} onChange={(v) => setSchema(v as SchemaFamily | "all")} options={["all", ...schemas]} render={(v) => (v === "all" ? "Any schema" : v)} />
          <Select label="Category" value={category} onChange={setCategory} options={["all", ...categories]} render={(v) => (v === "all" ? "Any category" : v)} />
          <Select label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS.map((s) => s.key)} render={(v) => SORTS.find((s) => s.key === v)?.label ?? v} />
        </div>
      </section>

      <section className="mt-4">
        <SectionHead
          title="Published"
          note={`${filtered.length} of ${apps.length}`}
          right={
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
              sorted by {SORTS.find((s) => s.key === sort)?.label.toLowerCase()}
            </span>
          }
        />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((app, i) => (
            <RegistryCard key={app.manifest.name} app={app} index={i} onFork={() => setForking(app)} />
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

function RegistryCard({ app, index, onFork }: { app: MiniApp; index: number; onFork: () => void }) {
  const m = app.manifest;
  const tier = m.agency.tier;
  const s = score(app);

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
              <p className="mono mt-1 truncate text-[0.625rem] text-[var(--muted-ink)]">
                {m.identity.ens ?? `${m.name}.atlas-apps.eth`}
              </p>
            </div>
          </div>
          {app.running ? <LiveDot label="" /> : null}
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-snug text-[var(--muted-ink)]">{m.intent}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TierTag tier={tier} />
          {m.data.schemas.slice(0, 2).map((sch) => (
            <span key={sch} className="mono text-[0.5625rem] uppercase tracking-[0.06em] text-[var(--muted-ink)]">
              {sch}
            </span>
          ))}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 border-t border-[var(--hairline)] pt-2">
          <Cell k="Forked" v={fmtNum(app.stats.forks)} />
          <Cell k="Run" v={fmtNum(app.stats.runs)} />
          <Cell
            k="Value transacted"
            v={app.stats.valueTransactedUsd > 0 ? fmtUsd(app.stats.valueTransactedUsd, { compact: true }) : "—"}
            accent={app.stats.valueTransactedUsd > 0 ? "spend" : undefined}
          />
          <Cell k="Rated" v={s.total > 0 ? `${s.pct}% of ${s.total}` : "—"} />
        </dl>

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

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{k}</dt>
      <dd>
        <Fig className="text-sm font-semibold">{v}</Fig>
      </dd>
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
