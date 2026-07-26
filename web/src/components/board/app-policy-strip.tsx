"use client";

import type { MiniApp } from "@/lib/seed";
import type { SignerFacts } from "@/components/board/app-facts";
import { fmtDate, fmtUsd, haltRemote, isArmed, shortHash } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AppPolicyStrip({
  app,
  signer,
}: {
  app: MiniApp;
  signer: SignerFacts | null;
}) {
  const m = app.manifest;
  const policy = m.agency.policy;
  return (
    <div className="policy-strip">
      <span title="Enforced at the signer, not suggested to the model.">policy</span>
      {/* The signer, from the server. Nothing here falls back to
          `policy.wallet` — a manifest cannot know a server-held key, and
          an address that is only a claim is worse than no address at all.
          Silent until the round trip answers. */}
      {signer ? (
        <>
          <span className="fig normal-case" title={`${signer.wallet.address} — signs on ${signer.wallet.chainName}`}>
            {shortHash(signer.wallet.address, 8, 6)}
          </span>
          <span className="opacity-50">·</span>
          <span
            style={{ color: signer.enforcement.verifiedOnchain ? "var(--gain)" : "var(--risk)" }}
            title={
              signer.enforcement.verifiedOnchain
                ? "isSessionEnabled() returned true — the account itself rejects an out-of-scope call"
                : "Every limit below is enforced by this server. A rejection means our server chose not to sign."
            }
          >
            {signer.enforcement.verifiedOnchain ? "onchain-enforced" : "server-enforced"}
          </span>
          <span className="opacity-50">·</span>
        </>
      ) : null}
      <span>cap {fmtUsd(policy.maxSpendUsd)}</span>
      <span className="opacity-50">·</span>
      <span>per tx {fmtUsd(policy.maxPerTxUsd)}</span>
      <span className="opacity-50">·</span>
      <span>{policy.allowlist.length} allowlisted</span>
      <span className="opacity-50">·</span>
      <span>expires {policy.expiresAt ? fmtDate(policy.expiresAt) : "never"}</span>
      <span className="ml-auto flex items-center gap-2">
        {/* Through `isArmed`, not `!policy.halted`. Those diverge: a fork
            arrives with `running: false`, so the strip read "armed" on an app
            that was not, while the header lamp a few lines down correctly
            showed nothing. One file cannot answer the same question two ways. */}
        {policy.halted ? (
          <span style={{ color: "var(--loss)" }}>halted</span>
        ) : isArmed(app) ? (
          <span style={{ color: "var(--gain)" }}>armed</span>
        ) : (
          <span style={{ color: "var(--muted-ink)" }}>not armed</span>
        )}
        <button
          type="button"
          onClick={() => void haltRemote(m, !policy.halted)}
          className={cn(
            "btn press px-2.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em]",
            !policy.halted && "btn--danger",
          )}
        >
          {policy.halted ? "Release" : "Kill switch"}
        </button>
      </span>
    </div>
  );
}
