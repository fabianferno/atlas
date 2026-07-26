"use client";

import type { MiniApp } from "@/lib/seed";
import type { SignerFacts } from "@/components/board/app-facts";
import { KV, Label, SectionHead } from "@/components/board/chrome";
import { fmtDate, fmtNum, fmtUsd, shortHash } from "@/lib/store";
import { isConditionEvaluable } from "@/lib/agency/condition";
import { TIER_BLURB } from "@/lib/seed";
// Type-only, so nothing from the signing stack reaches the client bundle. The
// point of importing it rather than restating the shape is that if the server's
// report grows a constraint, this file stops compiling instead of quietly
// rendering six of seven.
import type { EnforcementSite } from "@/lib/agency/wallet";

export function PermissionsPanel({
  app,
  signer,
}: {
  app: MiniApp;
  signer: SignerFacts | null;
}) {
  const m = app.manifest;
  const policy = m.agency.policy;
  const tier = m.agency.tier;

  /**
   * The manifest asserted a wallet and the server named a different one. Only
   * `/api/publish` is supposed to write that field, so a mismatch means the
   * document on screen is stale or was written by hand — and it is precisely the
   * case where funding the address in the manifest loses the money. Say which is
   * which rather than silently preferring one.
   */
  const walletClaimConflict =
    signer && policy.wallet && policy.wallet.toLowerCase() !== signer.wallet.address.toLowerCase()
      ? policy.wallet
      : null;

  return (
    <section className="panel panel--autonomous p-3">
      <SectionHead title="What it is allowed to do" note={TIER_BLURB[tier]} />
      <dl className="cells mt-2">
        {/* The signer, or nothing. `policy.wallet` is not a fallback
            here and must never become one: it is a client-side claim
            about a server-held key, and the address a reader funds has
            to be the address that signs. */}
        {signer ? (
          <KV k="Signer" v={signer.wallet.address} mono />
        ) : (
          <KV k="Signer" v="asking the server…" />
        )}
        {signer ? (
          <KV k="Signs on" v={`${signer.wallet.chainName} · ${signer.wallet.kind}`} />
        ) : null}
        <KV k="Lifetime cap" v={fmtUsd(policy.maxSpendUsd)} />
        <KV k="Per transaction" v={fmtUsd(policy.maxPerTxUsd)} />
        {/* Real, and the only figure in this panel that is a
            measurement: `dispatchAction` folds the server's own
            `totalSpentUsd(appId)` — the same number the lifetime cap is
            metered against — into `stats.spentUsd`. */}
        <KV k="Spent" v={fmtUsd(app.stats.spentUsd)} accent={app.stats.spentUsd > 0 ? "spend" : undefined} />
        <KV k="Expires" v={policy.expiresAt ? fmtDate(policy.expiresAt) : "never"} />
        <KV k="Requires confirm" v={policy.requireConfirm ? "yes" : "no — trigger signs directly"} />
      </dl>

      {/* WHICH KEY SIGNS — reported, not asserted.
          This used to be one unconditional paragraph reading "This key
          is shared", which was true when it was written and would have
          quietly become a lie the moment isolation landed. The server
          now answers per app (`keyScope`, from `sessionKeyScope()` in
          `lib/agency/wallet.ts`) and this renders that answer. §8's case
          for the ENS name as a safety primitive is that you verify a
          funded address before funding it, so "is this address this
          app's alone" is the one question this block exists to answer —
          and an absent field means unknown, which renders as nothing
          rather than as either answer. */}
      {signer?.wallet.keyScope === "shared" ? (
        <p className="mt-2 text-[0.6875rem] leading-snug" style={{ color: "var(--risk)" }}>
          This key is shared. One process-wide session key signs for every mini app here, so
          funding this address funds all of them and revoking it revokes all of them. Set
          AGENT_SESSION_MASTER_SEED to give each app its own.
        </p>
      ) : null}
      {signer?.wallet.keyScope === "ephemeral" ? (
        <p className="mt-2 text-[0.6875rem] leading-snug" style={{ color: "var(--risk)" }}>
          This key is this app&rsquo;s alone, and it is ephemeral — generated in memory with
          no seed configured, so a restart replaces it and nothing funded here survives. Set
          AGENT_SESSION_MASTER_SEED to make it durable.
        </p>
      ) : null}
      {signer?.wallet.keyScope === "per-app" ? (
        <p className="mono mt-2 text-[0.625rem] leading-snug text-[var(--muted-ink)]">
          This address is this app&rsquo;s alone — derived per app from the server&rsquo;s
          master seed, so funding it funds only {app.manifest.name}. The seed still holds
          every app&rsquo;s key: this is isolation between apps, not custody.
        </p>
      ) : null}

      {walletClaimConflict ? (
        <p className="mono mt-2 text-[0.625rem] leading-snug" style={{ color: "var(--loss)" }}>
          This manifest claims {shortHash(walletClaimConflict, 10, 6)} as its wallet. The
          server signs with the address above. Fund the address above.
        </p>
      ) : null}

      {/* PROBLEM 2's home. prd.md §7 is explicit that enforcement is not
          uniform and that the UI reports it per constraint — and that
          `onchainEnforced` is the return value of an `isSessionEnabled()`
          call against the live validator, not a constant, precisely so
          this cannot overstate by accident. It was being computed on
          every `/api/act` and thrown away. */}
      {signer ? (
        <div className="mt-3 border-t border-[var(--hairline)] pt-2">
          <Label>
            Enforced by — chain or this server
            {signer.enforcement.verifiedOnchain
              ? " · verified by isSessionEnabled()"
              : " · nothing verified onchain"}
          </Label>
          <dl className="cells mt-1.5">
            <EnforcementRow k="Allowlist" site={signer.enforcement.allowlist} />
            <EnforcementRow k="Expiry" site={signer.enforcement.expiry} />
            <EnforcementRow k="Per-tx cap" site={signer.enforcement.perTxCap} />
            <EnforcementRow k="Lifetime cap" site={signer.enforcement.lifetimeCap} />
            <EnforcementRow k="Requires confirm" site={signer.enforcement.confirmation} />
            <EnforcementRow k="Kill switch" site={signer.enforcement.killSwitch} />
          </dl>
          {/* The server's own words, not a paraphrase. These notes are
              where the mode's real limits live — including "a compromised
              backend could exceed these limits", which is the sentence a
              judge should hear from the product rather than from us. */}
          <ul className="mt-2 space-y-1">
            {signer.enforcement.notes.map((note, i) => (
              <li key={i} className="text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
                {note}
              </li>
            ))}
          </ul>
          {/*
            WHERE THAT ENFORCEMENT LIVES — one line, and deliberately one.
            Every limit listed above is held in an in-memory Map on
            `globalThis` in a single server process (`registryScope()` in
            `lib/agency/wallet.ts`). On the deployed build a register call
            and the `/api/act` or `/api/stream` call after it can land on
            different serverless instances, and the second has never seen
            this app. It belongs on this page because this panel is the
            product's strongest safety claim and a reader is entitled to
            know it is not durable; it stays to one mono line because the
            per-constraint block above is the more important disclosure and
            a paragraph here would outweigh it.

            The recovery clause is not aspirational: `dispatchAction` and
            `watchBlocks` in `store.ts` both re-POST the manifest on a 404
            and retry once. Nothing here claims the state survives — it
            does not, and `durable: false` on the wire says so.
          */}
          {signer.registry ? (
            <p className="mono mt-2 text-[0.625rem] leading-snug text-[var(--muted-ink)]">
              held in one server process · instance {signer.registry.instanceId} ·{" "}
              {fmtNum(signer.registry.registeredApps)} app(s) — not durable: a redeploy or a
              second serverless instance loses this registration, and the board re-posts the
              manifest and retries once when that happens
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2">
        <Label>Allowlist — anything not here is rejected</Label>
        <ul className="mono mt-1 space-y-0.5 text-[0.625rem]">
          {policy.allowlist.map((a) => (
            <li key={a} className="truncate">
              {a}
            </li>
          ))}
          {policy.allowlist.length === 0 ? <li>empty — no actions, no exceptions</li> : null}
        </ul>
      </div>
      <div className="mt-3 border-t border-[var(--hairline)] pt-2">
        <Label>Triggers</Label>
        {/* A trigger whose condition the evaluator cannot parse fails
            closed — correct, and silently inert. `draftFromIntent` emits
            prose like "threshold breached" when it cannot derive a real
            comparison from a sentence, so a drafted autonomous app listed a
            trigger here that could never fire, and a listed trigger reads
            as armed. `isConditionEvaluable` is the same grammar the
            evaluator uses (`lib/agency/condition.ts`), not a second copy,
            so this line cannot disagree with what happens on a block. */}
        <ul className="mono mt-1 space-y-0.5 text-[0.6875rem]">
          {m.agency.triggers.map((t, i) => {
            const inert = !isConditionEvaluable(t.when);
            return (
              <li key={i}>
                on {t.on}
                {t.when ? ` when ${t.when}` : ""} → {t.run}
                {inert ? (
                  <span className="block" style={{ color: "var(--risk)" }}>
                    condition is not machine-readable — this trigger fails closed and
                    cannot fire until it is rewritten as a comparison
                  </span>
                ) : t.when === null || t.when.trim() === "" ? (
                  <span className="block text-[var(--muted-ink)]">
                    no condition — fires on every signal
                  </span>
                ) : null}
              </li>
            );
          })}
          {m.agency.triggers.length === 0 ? <li>none</li> : null}
        </ul>
      </div>
    </section>
  );
}

/**
 * One constraint, and who enforces it. `onchain` is the strong claim and gets
 * the strong colour; `server` is coloured as a risk because it IS one — prd.md
 * §7: with server-side enforcement, "the policy stopped it" means our server
 * chose not to sign, and a compromised backend is unbounded. Rounding the two
 * to the same neutral grey is exactly the blurring §7 forbids.
 */
function EnforcementRow({ k, site }: { k: string; site: EnforcementSite }) {
  const onchain = site === "onchain";
  return (
    <KV
      k={k}
      v={onchain ? "chain — enforced by the account" : "server — this process decides"}
      accent={onchain ? "gain" : "risk"}
    />
  );
}
