"use client";

/**
 * PUBLISH — the forecast before the press, and the receipt after it.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SHARED MODULE AND NOT A SECOND COPY
 * ────────────────────────────────────────────────────────────────────────────
 *
 * These two components were written inside `studio-input.tsx`, where publishing
 * used to be the only thing that could happen. There are two publish surfaces
 * now — the Studio's bar for a fresh draft, and the panel on `/a/[name]` for an
 * app already on the board (a fork, most of the time) — and they must make the
 * same claims about the same deployment, because the claims are the product.
 *
 * The alternative was copying them, and this codebase has already paid for that
 * once: two competing `LiveDot` definitions existed, one drifted, and for a while
 * the same state rendered two different ways depending on which file you were
 * looking at. A forecast that says "every path live" on one screen and lists a
 * mocked backend on the other is the same bug with much worse consequences,
 * since the whole argument for this build is that it does not overstate.
 *
 * So: `forecast()` is computed in one place from `GET /api/publish`, and
 * `PublishReceipt` renders `PublishOutcome` in one place — `warnings[]` verbatim,
 * an `offline` branch that never reads as success, and a `refused` branch that
 * never reads as a retryable failure.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE MUST NOT DO
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   - Assert what publishing will do. Every line of the forecast is read off
 *     `identityStatus()` on THIS deployment. The copy it replaced asserted
 *     flatly that publishing "mints an ENS subname, pins the manifest, and mints
 *     an Agentic ID on 0G Chain", on every machine, whatever was configured.
 *   - Round a computed value up to an issued one. A mock ENS backend still
 *     returns a name and the mock 0G backend still returns a token id; both are
 *     derived rather than invented, and neither is registered anywhere. The
 *     forecast says which, and the receipt carries the server's own warning.
 *   - Claim earnings. A price is a term written into the manifest. No x402
 *     facilitator settles it, so it is a configured price and never revenue
 *     (prd.md §12, README "Not in scope").
 */
import { useState } from "react";
import type { ReactNode } from "react";
import type { MiniApp } from "@/lib/seed";
import {
  isMine,
  publishExisting,
  useBoard,
  useIdentityStatus,
  type IdentityStatusView,
  type PublishOutcome,
} from "@/lib/store";
import { Fig, Label, SectionHead } from "@/components/board/chrome";

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

/**
 * A term/definition row, used by every publish surface and by the Studio's
 * capability block.
 *
 * It lives here rather than in `chrome.tsx` only because this pass does not own
 * that file. If a third caller appears, move it there — a layout primitive
 * imported out of a feature module is a smell, and one worth fixing at the point
 * it starts to bite rather than pre-emptively.
 */
export function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="mono min-w-[5.5rem] text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
        {term}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/**
 * The x402 price field. prd.md §4 P1 requires the price to be configurable
 * in-app with no config files, and §12 makes it the creator-earnings primitive —
 * so both publish surfaces offer it, identically, and both label it as a term
 * rather than as income.
 */
export function PriceField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="basis-28">
      <Label>Price per run</Label>
      <div className="mt-1 flex items-baseline rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
        <span className="fig text-sm text-[var(--muted-ink)]">$</span>
        <input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          aria-label="x402 price per run in USD"
          className="fig w-full min-w-0 bg-transparent text-sm outline-none disabled:opacity-60"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * What publishing will do — before the press
 * ------------------------------------------------------------------ */

interface ForecastRow {
  key: string;
  head: string;
  body: string;
  /** `gain` this path is real. `risk` it is computed but not announced. */
  accent?: "gain" | "risk";
}

/**
 * `GET /api/publish` returns `identityStatus()` verbatim: which ENS backend is
 * wired, which content store, which 0G chain and contracts, and the origin the
 * ENSIP-26 records will point at.
 *
 * The copy under the publish button used to assert, flatly, that "publishing
 * mints an ENS subname, pins the manifest, and mints an Agentic ID on 0G Chain" —
 * on every machine, whatever was configured. When the content store is `local`
 * the pin is a real CIDv1 over a process-local store announced to no network,
 * which means `contenthash` will resolve to bytes only this deployment can serve.
 * That is exactly the kind of thing a publish panel exists to say before you
 * press, and it is the difference between the README's claim and the product's
 * behaviour.
 */
function forecast(status: IdentityStatusView, name: string | null): ForecastRow[] {
  const rows: ForecastRow[] = [];
  const label = name ?? "<name>";

  rows.push(
    status.ens.configured && status.ens.mode === "onchain"
      ? {
          key: "ens",
          head: `issues ${label}.${status.ens.parent}`,
          body: "registered on chain under the wrapped parent, with the addr, contenthash and ENSIP-25/26 records written in the same publish.",
          accent: "gain",
        }
      : {
          key: "ens",
          head: `ENS backend is "${status.ens.mode}"${status.ens.configured ? "" : " and not configured"}`,
          body: `${label}.${status.ens.parent} will be computed and shown, but no subname is registered anywhere and nothing can resolve it.`,
          accent: "risk",
        },
  );

  rows.push(
    status.ipfs.mode === "local"
      ? {
          key: "ipfs",
          head: 'pins the manifest to a process-local store ("local")',
          body: "the CIDv1 is real and derived from the bytes, but it is announced to no network — so contenthash will point at bytes only this deployment can serve, and no public gateway will find them.",
          accent: "risk",
        }
      : {
          key: "ipfs",
          head: `pins the manifest via "${status.ipfs.mode}"`,
          body: "the CID on the record is fetchable from a public gateway.",
          accent: "gain",
        },
  );

  rows.push(
    status.zeroG.mode === "live" && status.zeroG.agenticId
      ? {
          key: "zerog",
          head: `mints an Agentic ID on ${status.zeroG.chainName}`,
          body: `ERC-7857 at ${status.zeroG.agenticId} (chain ${status.zeroG.chainId})${status.zeroG.registry ? `, with the name and attestation hash written to MiniAppRegistry at ${status.zeroG.registry}` : ""}.`,
          accent: "gain",
        }
      : {
          key: "zerog",
          head: `Agentic ID is mocked (mode "${status.zeroG.mode}")`,
          body: "a token id is computed so the flow completes, but nothing is minted and the 0G explorer has nothing to show.",
          accent: "risk",
        },
  );

  // The origin is written into the ENSIP-26 records, so a localhost origin
  // produces a name whose endpoints only this machine can reach.
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(status.app.origin)) {
    rows.push({
      key: "origin",
      head: `records will point at ${status.app.origin}`,
      body: "that origin resolves for nobody but this machine, so the name will carry endpoints an external client cannot reach.",
      accent: "risk",
    });
  }

  return rows;
}

export function PublishForecast({
  status,
  name,
}: {
  status: IdentityStatusView | null;
  name: string | null;
}) {
  if (!status) {
    return (
      <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        reading <span className="mono">GET /api/publish</span> for what publishing will actually do —
        until it answers, this panel makes no claim about which identity paths are live.
      </p>
    );
  }

  const rows = forecast(status, name);
  const mocked = rows.filter((r) => r.accent === "risk").length;

  return (
    <div className="mt-3 border-t border-hairline pt-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Label>What Publish will do</Label>
        <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
          read from GET /api/publish on this deployment
        </span>
        {mocked > 0 ? (
          <Fig accent="risk" className="ml-auto text-[0.625rem] uppercase tracking-[0.06em]">
            {mocked} of {rows.length} not fully live
          </Fig>
        ) : (
          <Fig accent="gain" className="ml-auto text-[0.625rem] uppercase tracking-[0.06em]">
            every path live
          </Fig>
        )}
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {rows.map((row) => (
          <li key={row.key} className="text-[0.6875rem] leading-snug">
            <Fig accent={row.accent} className="text-[0.6875rem]">
              {row.head}
            </Fig>
            <span className="text-[var(--muted-ink)]"> — {row.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The receipt — after the press
 * ------------------------------------------------------------------ */

/**
 * `PublishOutcome.warnings` verbatim, plus what was actually obtained.
 *
 * Deliberately NOT a redirect. The Studio used to navigate to `/a/<name>` the
 * instant the promise resolved, which threw away the only report the publish
 * produces: an offline publish — the POST failed, the app stayed local, no ENS
 * name, no CID, no token — navigated exactly like a successful one and looked
 * identical on arrival. `onOpen` is a link the user may press, and it is optional
 * because the app page is already looking at the thing it just published.
 *
 * Three outcomes, three different frames, because they mean three different
 * things: published (possibly with mocked paths), not published because the
 * request failed and may be retried, and refused because sending it would have
 * minted a second token for one app and cannot be retried at all.
 */
export function PublishReceipt({
  outcome,
  typed,
  measured,
  onOpen,
}: {
  outcome: PublishOutcome;
  /** The name the user asked for, so the receipt can say when it was renamed. */
  typed: string;
  /** Whether the manifest carries measured figures. Stated in the last line. */
  measured: boolean;
  onOpen?: (name: string) => void;
}) {
  const published = outcome.app?.manifest ?? null;
  const finalName = published?.name ?? typed;
  const ens = published?.identity.ens ?? outcome.ens;
  const cid = published?.identity.manifestCid ?? outcome.manifestCid;
  const tokenId = published?.identity.agenticId?.tokenId ?? outcome.agenticIdTokenId;
  const refused = outcome.refused;

  const heading = refused ? "Refused" : outcome.offline ? "Not published" : "Published";
  const accent: "gain" | "risk" | "loss" = refused
    ? "risk"
    : outcome.offline
      ? "loss"
      : outcome.warnings.length > 0
        ? "risk"
        : "gain";

  return (
    <div
      className="mt-3 rounded-[calc(var(--radius)*0.6)] border border-hairline p-2.5"
      style={
        accent === "gain"
          ? undefined
          : {
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--${accent}) 55%, transparent)`,
              background: `color-mix(in srgb, var(--${accent}) 7%, transparent)`,
            }
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Label>{heading}</Label>
        <Fig accent={accent} className="text-[0.6875rem] uppercase tracking-[0.06em]">
          {refused
            ? "nothing was sent"
            : outcome.offline
              ? "kept local — the publish request failed"
              : outcome.warnings.length > 0
                ? `${outcome.warnings.length} path${outcome.warnings.length === 1 ? "" : "s"} fell back to a mock`
                : "no path fell back to a mock"}
        </Fig>
        {onOpen && outcome.app ? (
          <button
            type="button"
            className="btn press ml-auto px-2.5 py-1 text-[0.6875rem] uppercase"
            onClick={() => onOpen(finalName)}
          >
            {outcome.offline ? "Open it locally" : "Open it"}
          </button>
        ) : null}
      </div>

      {/* The refusal, in the store's own words. No dl below it: a refused publish
          obtained nothing, and printing empty name/cid/token rows would frame it
          as a partial success. */}
      {refused ? (
        <p className="mt-2 text-[0.6875rem] leading-snug">{refused}</p>
      ) : (
        <dl className="mt-2 space-y-1">
          <Row term="name">
            <span className="mono break-all text-[0.6875rem]">{finalName}</span>
            {finalName !== typed ? (
              <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
                {" "}
                — you typed {typed}, which was taken on this board
              </span>
            ) : null}
          </Row>
          <Row term="ens">
            {ens ? (
              <span className="mono break-all text-[0.6875rem]">{ens}</span>
            ) : (
              <span className="mono text-[0.6875rem] text-[var(--muted-ink)]">
                no ENS name — the name is unresolvable
              </span>
            )}
          </Row>
          <Row term="manifest cid">
            {cid ? (
              <span className="mono break-all text-[0.6875rem]" title={cid}>
                {cid}
              </span>
            ) : (
              <span className="mono text-[0.6875rem] text-[var(--muted-ink)]">
                no CID — nothing was pinned, so the plan behind the name is not fetchable
              </span>
            )}
          </Row>
          <Row term="agentic id">
            {tokenId !== null && tokenId !== undefined ? (
              <span className="mono text-[0.6875rem]">#{tokenId}</span>
            ) : (
              <span className="mono text-[0.6875rem] text-[var(--muted-ink)]">
                no token — nothing was minted
              </span>
            )}
          </Row>
          {/* Read off the manifest that came back, not off the form. The server is
              the authority on what was recorded, and this is where the absolute
              expiry becomes a real value worth printing. */}
          {published && published.agency.tier === "autonomous" ? (
            <Row term="policy">
              <span className="mono text-[0.6875rem]">
                ${published.agency.policy.maxSpendUsd.toLocaleString("en-US")} lifetime · $
                {published.agency.policy.maxPerTxUsd.toLocaleString("en-US")} per tx ·{" "}
                {published.agency.policy.expiresAt
                  ? `expires ${published.agency.policy.expiresAt.slice(0, 10)}`
                  : "no expiry"}{" "}
                · {published.agency.policy.requireConfirm ? "confirm required" : "no confirm"} ·{" "}
                {published.agency.policy.allowlist.length} allowlisted
              </span>
            </Row>
          ) : null}
        </dl>
      )}

      {outcome.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-hairline pt-2">
          {/* Verbatim from `lib/identity/publish.ts`. Not paraphrased, not
              summarised, not counted-and-hidden. */}
          {outcome.warnings.map((w) => (
            <li key={w} className="text-[0.6875rem] leading-snug">
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        {refused
          ? "nothing reached the chain, so there is nothing to undo — and nothing to retry either."
          : measured
            ? "the published manifest is a plan, not a screenshot: pressing Run re-queries the gateway and re-composes the surface."
            : "this manifest was drafted without a measured query, so the figures it carries are fixtures. press Run on the app to replace them with a real one."}{" "}
        every line above is also in the ledger, warnings included.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The app page's publish affordance
 * ------------------------------------------------------------------ */

/**
 * Publishing an app that is already on the board — a fork, usually.
 *
 * WHY THIS EXISTS. prd.md §12 calls fork-and-remix the flywheel and states the
 * loop as "fork → refine → publish under your own name". `forkApp` correctly
 * strips `identity`, `agency.policy.wallet` and `provenance` (§5, non-negotiable)
 * and then had nowhere to go: the only caller of a publish was the Studio's bar,
 * reachable only from a freshly described draft, so a fork could never acquire a
 * subname, a CID or an Agentic ID. §8 makes the ENS name the thing a human
 * verifies BEFORE funding a mini app, which made that gap a safety gap and not a
 * missing convenience: an app that can hold a wallet and can never be named.
 *
 * WHY THE CONFIRM IS TWO STEPS. On a configured deployment this press issues a
 * real ENS subname on Sepolia and mints a real ERC-7857 token on 0G Galileo,
 * spending gas from a key this server holds. None of it can be undone — the
 * name/token binding is immutable by design. So the forecast is on screen before
 * the first press, the second press states the irreversible parts in one
 * sentence, and neither is a button you can hit by reflex.
 *
 * WHY IT DISABLES RATHER THAN HIDES. An app that cannot be published for a
 * reason — already named, or browsed from the registry rather than owned — is a
 * question a reader will have. Hiding the control answers it with silence, and
 * the reason is the interesting part in both cases.
 */
type Stage = "idle" | "armed" | "sending" | "done";

export function AppPublishPanel({ app }: { app: MiniApp }) {
  const m = app.manifest;
  const board = useBoard();
  // Recomputed every render on purpose: signing out has to close this gate, and
  // it did not when ownership was a field on the app.
  const mine = isMine(board, app);
  const status = useIdentityStatus();
  const [price, setPrice] = useState(m.pricing?.x402.priceUsd.toString() ?? "0");
  const [stage, setStage] = useState<Stage>("idle");
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);

  const parent = status?.ens.parent ?? "atlas-apps.eth";
  const priceUsd = Number(price) || 0;
  // The same test `readProvenance` in the Studio uses: a source with no
  // `healthCheckedAt` was never probed, so the figures the body shows are not
  // measurements of anything.
  const measured = m.data.sources.some((s) => s.healthCheckedAt !== null);

  /* The receipt outranks everything below. A successful publish writes
     `identity.ens` back onto this app, which would otherwise flip this panel into
     its "already published" state on the very render that should be showing what
     just happened. */
  if (outcome) {
    return (
      <section className="panel p-3">
        <SectionHead title="Publish" note="the report this publish returned" />
        <PublishReceipt outcome={outcome} typed={m.name} measured={measured} />
      </section>
    );
  }

  if (m.identity.ens) {
    return (
      <section className="panel p-3">
        <SectionHead title="Publish" note="already published — publishing again is refused" />
        <dl className="mt-2 space-y-1">
          <Row term="ens">
            <span className="mono break-all text-[0.6875rem]">{m.identity.ens}</span>
          </Row>
          <Row term="manifest cid">
            <span className="mono break-all text-[0.6875rem]">
              {m.identity.manifestCid ?? "not pinned"}
            </span>
          </Row>
          <Row term="agentic id">
            <span className="mono text-[0.6875rem]">
              {m.identity.agenticId ? `#${m.identity.agenticId.tokenId}` : "not minted"}
            </span>
          </Row>
        </dl>
        <button type="button" disabled className="btn press mt-3 text-sm disabled:opacity-40">
          Publish
        </button>
        <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
          one app, one name, one token. republishing would issue a second subname and mint a second
          Agentic ID against the same app, and the ENS↔registry binding is immutable by design — so
          the stale one would keep asserting the name forever. fork it instead: the copy gets its own
          name, its own token and none of this one&apos;s authority.
        </p>
      </section>
    );
  }

  /*
   * Was `!app.mine` — a seed constant that said "yours" about thirteen bundled
   * apps in a browser with no wallet, so this gate was open on work the reader
   * had no claim to. `isMine` derives it: authored by the connected address, or
   * drafted here and never claimed. Two failures, two sentences, because a
   * reader browsing somebody else's app needs a different instruction from one
   * looking at a bundled app nobody has signed for.
   */
  if (!mine) {
    const byOther = m.author !== null;
    return (
      <section className="panel p-3">
        <SectionHead title="Publish" note="not yours to name" />
        <button type="button" disabled className="btn press mt-2 text-sm disabled:opacity-40">
          Publish
        </button>
        <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
          {byOther ? (
            <>
              this app is authored by <span className="fig normal-case">{m.author}</span>, not by the
              wallet signed in here. publishing it would issue a subname under{" "}
              <span className="fig">{parent}</span> for someone else&apos;s work and record you as
              its author. fork it and publish the copy — that is the loop prd.md §12 specifies, and
              the fork carries <span className="fig">forkedFrom</span> so the attribution survives.
            </>
          ) : (
            <>
              this is a bundled app you are browsing — it was not made here and nobody has signed for
              it. publishing it would issue a subname under <span className="fig">{parent}</span> for
              work that is not yours and record you as its author. fork it and publish the copy — the
              fork carries <span className="fig">forkedFrom</span> so the attribution survives.
            </>
          )}
        </p>
      </section>
    );
  }

  const sending = stage === "sending";

  return (
    <section className="panel p-3">
      <SectionHead
        title="Publish"
        note={`gives ${m.name} a name, a manifest CID and an Agentic ID`}
      />

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <Label>Name</Label>
          {/* Not editable, and that is the point rather than an omission. The
              board already holds this app under this name — its ledger lines, its
              journal, its reviews and the route you are standing on are all keyed
              on it. Renaming at publish would either orphan that history or
              silently collide with another entry, so the name a fork is published
              under is the name the fork dialog set. */}
          <div className="mt-1 flex items-baseline rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
            <span className="fig min-w-0 flex-1 truncate text-sm">{m.name}</span>
            <span className="fig shrink-0 text-sm text-[var(--muted-ink)]">.{parent}</span>
          </div>
        </div>
        <PriceField value={price} onChange={setPrice} disabled={sending} />
      </div>

      <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        {priceUsd > 0 ? (
          <>
            {/* `{" "}` and not a literal leading space: JSX trims each line of a
                multi-line text literal before joining, so `</Fig> per run` on the
                first line rendered as "$0.02per run". */}
            <Fig>${priceUsd}</Fig>
            {" per run is written into the manifest as an x402 term. it is a configured price and"}
            {" not earnings: no facilitator settles it, nothing has ever been collected against"}
            {" one, and the app page reports it as “configured, never charged” (prd.md §12, README"}
            {" “not in scope”)."}
          </>
        ) : (
          "no price — the app runs free. set one to record an x402 term in the manifest; nothing settles it in this build."
        )}
      </p>

      <PublishForecast status={status} name={m.name} />

      {stage === "idle" ? (
        <button
          type="button"
          className="btn btn--primary press mt-3 text-sm"
          onClick={() => setStage("armed")}
        >
          Publish…
        </button>
      ) : null}

      {stage === "armed" || sending ? (
        <div
          className="mt-3 rounded-[calc(var(--radius)*0.6)] border border-hairline p-2.5"
          style={{
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--risk) 55%, transparent)",
            background: "color-mix(in srgb, var(--risk) 7%, transparent)",
          }}
        >
          <Label>Confirm — this writes to two chains and cannot be undone</Label>
          <ul className="mt-1.5 space-y-1 text-[0.6875rem] leading-snug">
            <li>
              <Fig>
                {m.name}.{parent}
              </Fig>{" "}
              is issued as a subname of the wrapped parent
              {status?.ens.mode === "onchain"
                ? " in a Sepolia transaction, paid for with gas from the registrar key this server holds"
                : ` by the "${status?.ens.mode ?? "unknown"}" backend`}
              .
            </li>
            <li>
              an ERC-7857 Agentic ID is minted
              {status?.zeroG.mode === "live"
                ? ` on ${status.zeroG.chainName}, bound to that name at mint time`
                : " by the mocked backend — nothing reaches a chain"}
              . the name↔token binding is immutable: a second publish can never replace it, only add
              a second claim.
            </li>
            <li>
              the manifest is pinned and its CID goes onto the name&apos;s{" "}
              <span className="fig">contenthash</span>, so anyone can fetch the plan this app runs.
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              // Three guards for one press, because a double mint is unrecoverable:
              // disabled while sending, the stage machine cannot re-enter `armed`
              // from `sending`, and `publishExisting` refuses a name it already has
              // a request in flight for.
              disabled={sending}
              className="btn btn--primary press text-sm disabled:opacity-40"
              onClick={() => {
                if (stage === "sending") return;
                setStage("sending");
                void publishExisting(m.name, { priceUsd: priceUsd > 0 ? priceUsd : null })
                  .then((out) => {
                    setOutcome(out);
                    setStage("done");
                  })
                  .catch(() => {
                    // `publishExisting` reports failure in its return value rather
                    // than throwing. If it ever does throw, do not leave the panel
                    // stuck mid-press with no explanation.
                    setStage("idle");
                  });
              }}
            >
              {sending ? "Publishing…" : `Yes — issue ${m.name}.${parent}`}
            </button>
            <button
              type="button"
              disabled={sending}
              className="btn press text-sm disabled:opacity-40"
              onClick={() => setStage("idle")}
            >
              Cancel
            </button>
          </div>
          {sending ? (
            <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
              pinning, minting, issuing, registering — four steps, three of them waiting on a chain.
              leave this open; a second press cannot start a second publish.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
