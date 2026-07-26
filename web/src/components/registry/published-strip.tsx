"use client";

/**
 * THE PUBLISHED STRIP — the subnames that actually exist.
 *
 * The list of names is read from `GET /api/registry/published`, which
 * enumerates `MiniAppRegistry` on 0G and filters to the configured ENS parent.
 * Each name is then resolved through `GET /api/resolve/<name>` on mount.
 * Nothing about the set is stored in this file, and there is no fallback: if
 * either call fails the strip says so and renders no rows.
 *
 * That is a correction, not a preference. This file used to carry a literal
 * array of five labels, defended in this comment as "a fact about the parent
 * name, not data". It had drifted from every other record of the same fact —
 * the contract held nine entries, contracts/deployments/ens-sepolia.json held
 * eight — and three of the five it did show had manifests that no longer
 * fetch. See docs/superpowers/specs/2026-07-26-published-strip-live-
 * enumeration-design.md.
 *
 * `retired`, in the footer, is the count of registry entries whose name does
 * not end in the current parent. Today that is entries still naming this
 * project's parent from before the Atlas rebrand — the ENS records were
 * re-issued under the new parent, but the token↔name binding in
 * `MiniAppRegistry` is immutable by design, so the old registry entries were
 * never re-pointed and cannot be. That is *why* today's retired entries exist;
 * it is not a claim this file can make about every entry the count will ever
 * include, which is why the rendered sentence only states the count and does
 * not narrate a cause.
 *
 * ## What it proves (prd.md §5, §8, §14 #8 and #9)
 *
 * That an ENS name here is not a label but an executable, fundable artifact.
 * One lookup returns `addr` — the address the name points at, which is what §8
 * says you verify *before* funding rather than the proof that you should — plus
 * `contenthash` → the manifest CID, the ENSIP-25 `agent-registration` binding
 * to an Agentic ID token on 0G, and the two-directional check that says
 * whether the name and the token agree about each other. The manifest at that
 * CID is a *plan*, so a resolved name re-runs against live subgraph data; that
 * is the difference between a resolved mini app and a cached screenshot.
 *
 * ## What it does NOT prove, and does not claim
 *
 * - It is not a health check of the app behind the name. Nothing here runs a
 *   query, composes a surface or reads a subgraph. Resolution only.
 * - "manifest fetched" means *this server* reached the bytes at that CID on
 *   this request. It is not a claim that a public gateway holds them. Some
 *   names were published while `IPFS_MODE=local`, whose store was the sole
 *   provider of their bytes; those bytes are gone and `ipfs.io` returns 504 for
 *   their CIDs permanently, because a CID is the hash of its bytes and
 *   regenerating the manifest yields a different one that no longer matches the
 *   chain. `IPFS_MODE` is now `pinata` so it cannot recur. Which names are
 *   affected is not asserted here — the row says whether the fetch worked on
 *   this request, and that is the only honest count.
 * - A row says nothing about whether the wallet at `addr` is funded, or what
 *   the app is allowed to spend. Policy lives with the running app.
 * - **It does not prove anyone holds the key for `addr`.** A resolver returns
 *   whatever address the record names; custody is not a property of a record.
 *   That is not pedantry here — these names were issued across more than one
 *   signer regime, and `POST /api/agency/register` now returns a single
 *   process-wide session key for every app, which matches only one of these
 *   records. So `addr` is "the address this name points at", and the stronger
 *   reading — "the address you should fund" — is exactly the one §8 says a
 *   human must verify rather than assume. `app-runtime.tsx` can make that
 *   comparison for an app on the board, because it knows the server's signer;
 *   this strip resolves arbitrary names and cannot.
 * - It does not show every name ever issued under the parent. It shows what is
 *   in the registry. A name whose ENS records landed but whose registry write
 *   did not — `aave-guard-fork`, whose `registerFork` reverted `ParentUnknown`
 *   — is absent, and correctly so: it was never published. The incident is
 *   recorded in contracts/deployments/ens-sepolia.json.
 *
 * ## Reading the colour (prd §6 rule 2 — semantic only, never decorative)
 *
 *   --gain   both directions verified · manifest bytes fetched
 *   --risk   degraded, but a disclosed and expected condition
 *   --loss   a resolve that failed, or a binding that contradicts itself
 *   muted    a record that is simply ABSENT
 *
 * The last one is the important discipline: a missing record is not a failure
 * and must never be coloured like one, and must never be back-filled with a
 * plausible-looking value. A name with no `addr` reads "no addr record" — it
 * does not read as an address.
 *
 * Depth (prd §6 rule 1, as shipped): this strip cannot act on anything, so it
 * sits flush in the readonly groove. Depth is reserved for agency, and reading
 * records is not agency.
 */

import { useEffect, useState } from "react";
import type { IdentityStatus, ResolveReport } from "@/lib/identity/publish";
import type { RegisteredApp } from "@/lib/identity/published";
import { Fig, Label, LiveDot, SectionHead, panelClass } from "@/components/board/chrome";
import { SponsorMark } from "@/components/brand/sponsor-mark";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* state                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Resolution is a network call, so it has three states and all three are
 * rendered. A failed resolve is real information — the name may genuinely not
 * resolve — so `reason` carries the server's own message verbatim rather than
 * a friendlier substitute.
 */
type RowState =
  | { phase: "loading" }
  | { phase: "failed"; reason: string; status: number | null }
  | { phase: "resolved"; report: ResolveReport };

/** Only the fields of `GET /api/publish` this strip needs to build a URL. */
type ChainRef = Pick<IdentityStatus["zeroG"], "chainId" | "explorer"> & {
  agenticId: string;
};

/**
 * The name list itself is a network call, so it has the same three states the
 * rows do. `failed` carries the route's own message: a registry that will not
 * answer is information, and substituting a remembered list for it is the
 * exact bug this component was rewritten to remove.
 */
type CatalogState =
  | { phase: "loading" }
  | { phase: "failed"; reason: string }
  | { phase: "ready"; parent: string; apps: RegisteredApp[]; total: number; retired: number };

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A figure that is truncated on screen but never truncated in fact.
 *
 * `Fig` in chrome.tsx takes no `title`, and that file is shared — so the full
 * value hangs on a wrapper instead of widening the primitive. Truncation is a
 * layout decision; the value itself always stays reachable.
 */
function FigFull({
  value,
  display,
  accent,
}: {
  /** The whole thing, on hover. */
  value: string;
  /** What fits. */
  display: string;
  accent?: "gain" | "risk" | "loss";
}) {
  return (
    <span className="block min-w-0 truncate" title={value}>
      <Fig accent={accent} className="text-[0.8125rem]">
        {display}
      </Fig>
    </span>
  );
}

export function PublishedStrip({ className }: { className?: string }) {
  /* The set of names, read from the registry. There is no prop to override it
     and no default to fall back to — either the chain answers or the strip
     says it did not. */
  const [catalog, setCatalog] = useState<CatalogState>({ phase: "loading" });

  /* Results are keyed by name, so a row that has not landed yet needs no
     stored placeholder — absence IS the loading state.
     `key` stamps the map with the name set it was built for. `catalog`
     settling a second time (a retry affordance, say) must not let a name
     that appears in both sets render its previous resolution instead of
     restarting in `loading` — that is the exact staleness this rewrite
     exists to remove, so a map from a superseded set is discarded rather
     than merged into. */
  const [rows, setRows] = useState<{ key: string; map: ReadonlyMap<string, RowState> }>({
    key: "",
    map: new Map(),
  });
  const [chain, setChain] = useState<ChainRef | null>(null);

  /* The 0G explorer base and the Agentic ID contract, asked of the server
     rather than assumed. Without both, a token id renders unlinked — a guessed
     explorer URL is exactly the kind of invented value this strip exists to
     refuse. */
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/publish", { signal: controller.signal, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<IdentityStatus>) : null))
      .then((body) => {
        const zg = body?.zeroG;
        if (!zg?.explorer || !zg.agenticId) return;
        setChain({ chainId: zg.chainId, explorer: zg.explorer, agenticId: zg.agenticId });
      })
      .catch(() => {
        // A failed probe is not a claim about the chain. Stay unlinked.
      });
    return () => controller.abort();
  }, []);

  /* Which names exist. Read once per mount from the registry rather than
     compiled into this file. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/registry/published", {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const body: unknown = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok) {
          const message =
            body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
              ? (body as { error: string }).error
              : `registry returned HTTP ${res.status}`;
          setCatalog({ phase: "failed", reason: message });
          return;
        }
        const parsed = body as {
          parent?: unknown;
          apps?: unknown;
          total?: unknown;
          retired?: unknown;
        } | null;
        const appsOk =
          !!parsed &&
          Array.isArray(parsed.apps) &&
          parsed.apps.every((a) => a !== null && typeof a === "object" && typeof (a as { ensName?: unknown }).ensName === "string");
        // `total`/`retired` missing is not the same fact as zero of either — a
        // missing figure has no writer, and inventing one narrows the
        // denominator or suppresses the retired disclosure exactly the way
        // this route was rewritten to stop doing.
        if (
          !parsed ||
          !appsOk ||
          typeof parsed.parent !== "string" ||
          typeof parsed.total !== "number" ||
          typeof parsed.retired !== "number"
        ) {
          setCatalog({ phase: "failed", reason: "the registry route returned an unexpected body" });
          return;
        }
        setCatalog({
          phase: "ready",
          parent: parsed.parent,
          apps: parsed.apps as RegisteredApp[],
          total: parsed.total,
          retired: parsed.retired,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setCatalog({ phase: "failed", reason: reasonOf(err) });
      }
    })();
    return () => controller.abort();
  }, []);

  const names = catalog.phase === "ready" ? catalog.apps.map((a) => a.ensName) : [];
  const nameKey = names.join(",");

  useEffect(() => {
    if (nameKey === "") return;
    const controller = new AbortController();
    const key = nameKey;

    /* Independent lookups, each landing on its own. One slow name must not
       hold the others back, and one dead name must not blank the strip.
       `rows` is not reset here — clearing synchronously inside an effect is
       the pattern this repo's lint config flags — but `settle` writes through
       `key`, so a result landing for a superseded name set starts a fresh map
       instead of merging into the old one. */
    for (const name of key.split(",")) {
      void (async () => {
        const settle = (state: RowState) => {
          if (controller.signal.aborted) return;
          setRows((prev) =>
            prev.key === key
              ? { key, map: new Map(prev.map).set(name, state) }
              : { key, map: new Map([[name, state]]) },
          );
        };
        try {
          const res = await fetch(`/api/resolve/${encodeURIComponent(name)}`, {
            signal: controller.signal,
            headers: { accept: "application/json" },
          });
          const body: unknown = await res.json().catch(() => null);
          if (!res.ok) {
            const message =
              body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
                ? (body as { error: string }).error
                : `resolver returned HTTP ${res.status}`;
            settle({ phase: "failed", reason: message, status: res.status });
            return;
          }
          if (!body || typeof body !== "object") {
            settle({ phase: "failed", reason: "resolver returned a body that is not JSON", status: res.status });
            return;
          }
          settle({ phase: "resolved", report: body as ResolveReport });
        } catch (err) {
          if (controller.signal.aborted) return;
          settle({ phase: "failed", reason: reasonOf(err), status: null });
        }
      })();
    }

    return () => controller.abort();
  }, [nameKey]);

  const landed = rows.key === nameKey ? rows.map : null;
  const states = names.map((name) => landed?.get(name) ?? { phase: "loading" as const });
  const pending = states.filter((s) => s.phase === "loading").length;
  const resolved = states.filter((s) => s.phase === "resolved").length;

  const note =
    catalog.phase === "loading"
      ? "reading the registry"
      : catalog.phase === "failed"
        ? "registry list unusable"
        : names.length === 0
          ? "nothing registered under this parent"
          : pending > 0
            ? `${names.length} names · reading`
            : `${resolved} of ${names.length} resolved · read live on mount`;

  const busy = catalog.phase === "loading" || pending > 0;

  return (
    <section className={cn(panelClass("readonly", "mt-4"), className)}>
      <div className="px-3 pt-3 sm:px-4">
        <SectionHead
          title="Published names"
          note={note}
          right={busy ? <LiveDot label={catalog.phase === "loading" ? "reading" : "resolving"} /> : undefined}
        />
      </div>

      {catalog.phase === "failed" ? (
        /* The route's own words. No list is rendered — a remembered set served
           during an outage is a claim nobody can check at the moment they most
           need to. */
        <p className="px-3 pt-2 pb-3 text-[0.6875rem] leading-snug sm:px-4">
          <Fig accent="loss" className="text-[0.6875rem] uppercase tracking-[0.06em]">
            registry unreadable
          </Fig>{" "}
          <span className="text-[var(--muted-ink)]">{catalog.reason}</span>
        </p>
      ) : catalog.phase === "ready" && names.length === 0 ? (
        <p className="px-3 pt-2 pb-3 text-[0.6875rem] leading-snug text-[var(--muted-ink)] sm:px-4">
          No apps are registered under <span className="mono">{catalog.parent}</span> yet. Publishing one from
          the Studio adds it here — this list is read from the registry, not maintained by hand.
        </p>
      ) : (
        <ul className="px-3 sm:px-4">
          {names.map((name, i) => (
            <NameRow key={name} name={name} state={states[i]} chain={chain} first={i === 0} />
          ))}
        </ul>
      )}

      <p className="border-t border-hairline px-3 pt-2 pb-3 text-[0.6875rem] leading-snug text-[var(--muted-ink)] sm:px-4">
        The set of names comes from <span className="mono">GET /api/registry/published</span>, which enumerates
        MiniAppRegistry on 0G; each one is then read live from{" "}
        <span className="mono">GET /api/resolve/&lt;name&gt;</span> on mount. Nothing here is stored, and a record
        that is absent from the name renders as absent.
        {catalog.phase === "ready" && catalog.retired > 0 ? (
          <>
            {" "}
            {catalog.retired} of {catalog.total} registry entries name a parent other than this one and are not
            shown.
          </>
        ) : null}{" "}
        The CID and the wallet are shown rather than linked: <span className="mono">GET /api/publish</span> reports
        the IPFS mode but no public gateway base, and an <span className="mono">addr</span> record carries no chain
        id, so either link would have to be guessed.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* one name                                                                   */
/* -------------------------------------------------------------------------- */

function NameRow({
  name,
  state,
  chain,
  first,
}: {
  name: string;
  state: RowState;
  chain: ChainRef | null;
  first: boolean;
}) {
  const href = `/api/resolve/${encodeURIComponent(name)}`;

  if (state.phase === "loading") {
    return (
      <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5", !first && "border-t border-hairline")}>
        <span className="mono truncate text-[0.8125rem]" title={name}>
          {name}
        </span>
        {/* One lamp for the whole strip, in the head. A row in flight states
            itself in words rather than adding a dot per row. */}
        <span className="mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
          resolving
        </span>
      </li>
    );
  }

  if (state.phase === "failed") {
    return (
      <li className={cn("py-2.5", !first && "border-t border-hairline")}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <a className="mono truncate text-[0.8125rem] underline decoration-hairline" href={href} title={name}>
            {name}
          </a>
          <Fig accent="loss" className="text-[0.6875rem] uppercase tracking-[0.06em]">
            did not resolve
          </Fig>
        </div>
        {/* The resolver's own words. A failed lookup is information about the
            name, so it is quoted rather than paraphrased into reassurance. */}
        <p className="mt-1 text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
          {state.reason}
          {state.status !== null ? ` · HTTP ${state.status}` : ""}
        </p>
      </li>
    );
  }

  const { report } = state;
  const token = report.agenticId.length > 0 ? report.agenticId[0] : null;
  const binding = readBinding(report.verification, token?.tokenId ?? null);
  const notes = [binding.note, manifestNote(report)].filter((n): n is string => n !== null);

  return (
    <li className={cn("py-2.5", !first && "border-t border-hairline")}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.2fr)]">
        {/* the name itself, linked to the lookup that produced this row */}
        <div className="min-w-0">
          <Label>name</Label>
          {/* The mark is on the resolved row only. The `failed` branch above
              renders the same string and deliberately gets no mark: a name that
              did not resolve is a question, and §8 makes resolving the whole
              point of showing it. */}
          <a
            className="mono mt-1 flex items-center gap-1.5 text-[0.8125rem] underline decoration-hairline"
            href={href}
            title={`${report.name} — resolved via ${href}`}
          >
            <SponsorMark of="ens" size={13} />
            <span className="min-w-0 truncate">{report.name}</span>
          </a>
        </div>

        {/* addr — the address the record names. NOT "the address you should
            fund": custody is not a property of a record, and these names span
            more than one signer regime. Labelled `addr · points at` rather than
            `addr · wallet` for that reason. Never a plausible substitute. */}
        <div className="min-w-0">
          <Label>addr · points at</Label>
          <div className="mt-1 truncate">
            {report.address ? (
              <FigFull value={report.address} display={short(report.address, 6, 4)} />
            ) : (
              <span className="mono text-[0.75rem] text-[var(--muted-ink)]">no addr record</span>
            )}
          </div>
        </div>

        {/* contenthash — the CID, and whether the bytes actually arrived */}
        <div className="min-w-0">
          <Label>contenthash · manifest</Label>
          <div className="mt-1 truncate">
            {report.manifestCid ? (
              <FigFull
                value={report.manifestCid}
                display={short(report.manifestCid, 10, 6)}
                accent={report.manifest ? "gain" : "risk"}
              />
            ) : (
              <span className="mono text-[0.75rem] text-[var(--muted-ink)]">no contenthash</span>
            )}
          </div>
          <span className="mono block truncate text-[0.625rem] text-[var(--muted-ink)]">
            {report.manifestCid
              ? report.manifest
                ? `manifest fetched${report.source ? ` · via ${report.source}` : ""}`
                : "CID present, manifest did not fetch"
              : "nothing to fetch"}
          </span>
        </div>

        {/* Agentic ID on 0G, linked only when the server told us where */}
        <div className="min-w-0">
          <Label>agentic id</Label>
          <div className="mt-1 truncate">
            {token ? (
              <TokenRef token={token} chain={chain} />
            ) : (
              <span className="mono text-[0.75rem] text-[var(--muted-ink)]">no registration</span>
            )}
          </div>
        </div>

        {/* the two-directional check */}
        <div className="min-w-0">
          <Label>mutual verification</Label>
          <div className="mt-1 truncate">
            <FigFull value={binding.title} display={binding.verdict} accent={binding.accent} />
          </div>
          {report.verification?.owner ? (
            <span className="mono block truncate text-[0.625rem] text-[var(--muted-ink)]" title={report.verification.owner}>
              owner {short(report.verification.owner, 6, 4)}
            </span>
          ) : null}
        </div>
      </div>

      {notes.length > 0 ? (
        <div className="mt-1.5 space-y-0.5">
          {notes.map((note) => (
            <p key={note} className="text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The token id, linked to the 0G explorer only when `GET /api/publish` gave us
 * both an explorer base and the Agentic ID contract, AND the chain id on the
 * ENSIP-25 record matches the chain that explorer covers. A record pointing at
 * a different chain gets no link — the explorer we know about would show the
 * wrong token, which is worse than no link at all.
 */
function TokenRef({
  token,
  chain,
}: {
  token: ResolveReport["agenticId"][number];
  chain: ChainRef | null;
}) {
  const title = `token ${token.tokenId} · eip155:${token.chainId} · registry ${token.registry}`;
  const linkable = chain !== null && chain.chainId === token.chainId;

  if (!linkable) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <SponsorMark of="zerog" size={12} />
        <FigFull value={title} display={`#${token.tokenId}`} />
      </span>
    );
  }

  // Same shape as `explorerTokenUrl()` in src/lib/identity/agentic-id.ts, and
  // the URL prd §14 #13 records for token 10.
  const url = `${chain.explorer.replace(/\/$/, "")}/token/${chain.agenticId}?a=${token.tokenId}`;
  return (
    <a
      className="fig inline-flex items-center gap-1.5 text-[0.8125rem] underline decoration-hairline"
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${title} · ${url}`}
    >
      {/* The mark rides the token, so it appears in both branches of this
          component and in neither branch of the caller's "no registration"
          fallback — a real token id is the only thing it is allowed to sit
          beside. */}
      <SponsorMark of="zerog" size={12} />#{token.tokenId}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* reading the verification                                                   */
/* -------------------------------------------------------------------------- */

interface BindingRead {
  verdict: string;
  /** Undefined leaves the figure in ink — an absence, not a fault. */
  accent?: "gain" | "risk" | "loss";
  title: string;
  /** One short line, or null when the cell already says everything. */
  note: string | null;
}

/**
 * `mutuallyVerified: false` is not one condition, and rendering it as one
 * scary cross would be dishonest in the other direction.
 *
 * prd §14 #13: tokens minted before the ENS rename still carry the parent they
 * were minted under, so `AgenticId.ensNameOf(token)` and therefore
 * `MiniAppRegistry.verify(name, token)` disagree with the current name — while
 * the ENS side still asserts the token correctly. That binding is immutable by
 * design, which is the property working rather than a defect. It is derived
 * here from the live triple (`ensAssertsToken` true, `tokenAssertsName` false,
 * `checked` true) rather than keyed off a label, so a token that is later
 * re-minted will stop showing the disclosure on its own.
 *
 * Everything else that is false is either unchecked (claim neither direction)
 * or a genuine contradiction between the two sides, and is coloured as such.
 */
function readBinding(
  verification: ResolveReport["verification"],
  tokenId: string | null,
): BindingRead {
  if (!verification) {
    return {
      verdict: "no token bound",
      title: "The name carries no ENSIP-25 agent-registration record, so there is nothing to verify against.",
      note: null,
    };
  }

  const { ensAssertsToken, registryAssertsName, tokenAssertsName, mutuallyVerified, checked } = verification;

  if (mutuallyVerified) {
    return {
      verdict: "both directions",
      accent: "gain",
      title: "The ENS record asserts the token and the 0G registry asserts the name. Read off both chains on this request.",
      note: null,
    };
  }

  if (!checked) {
    return {
      verdict: "not checked",
      title: "The 0G side did not answer, so neither direction is claimed.",
      note: "The 0G registry did not answer on this request, so neither direction of the binding is claimed here — this is unknown, not false.",
    };
  }

  if (ensAssertsToken && !tokenAssertsName && !registryAssertsName) {
    return {
      verdict: "ens side only",
      accent: "risk",
      title: "The ENS record asserts the token; the token does not carry this name back, so the registry's check against it returns false.",
      note: `The name asserts token ${tokenId ?? "?"}, but that token's registry entry carries the parent it was minted under, not this one, so MiniAppRegistry.verify() rejects the pair. Both bindings are immutable by design — prd §14 #13 discloses this, it is not a break.`,
    };
  }

  if (ensAssertsToken && tokenAssertsName && !registryAssertsName) {
    return {
      verdict: "registry disagrees",
      accent: "loss",
      title: "The token carries this name but MiniAppRegistry.verify() rejects the pair.",
      note: "The token carries this exact name, yet the registry rejects the pair — the two onchain records disagree with each other, which is a real inconsistency and not a known condition.",
    };
  }

  if (!ensAssertsToken && (registryAssertsName || tokenAssertsName)) {
    return {
      verdict: "ens side missing",
      accent: "loss",
      title: "The onchain side names this name, but the ENS record does not assert the token.",
      note: "The onchain side names this name, but the ENS record does not assert the token back — one-sided, so it proves nothing about who controls the name.",
    };
  }

  return {
    verdict: "neither direction",
    accent: "loss",
    title: "The name lists a token, but neither side confirms the binding.",
    note: "The name lists a token, but neither the ENS side nor the 0G side confirms the binding.",
  };
}

/** The manifest disclosure, only when there is something to disclose. */
function manifestNote(report: ResolveReport): string | null {
  if (report.manifestCid && !report.manifest) {
    return "The contenthash is on the record, but this server could not fetch a valid manifest from that CID on this request — so the plan behind this name is not proven runnable here.";
  }
  if (!report.manifestCid) {
    return "No contenthash and no registry CID, so this name resolves to records but not to a manifest.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */

/** Truncate for layout only; every call site keeps the full value in `title`. */
function short(value: string, head: number, tail: number): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
