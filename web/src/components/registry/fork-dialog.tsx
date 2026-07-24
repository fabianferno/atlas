"use client";

/**
 * Fork.
 *
 * `forkManifest` already strips identity, wallet and provenance — this screen
 * says so before you press the button and proves it after. A fork gets a fresh
 * wallet, a fresh name and zero inherited spending authority; that is a
 * security property, and it is worth showing rather than asserting.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MiniApp } from "@/lib/seed";
import { forkApp } from "@/lib/store";
import { Label } from "@/components/board/chrome";

export function ForkDialog({ app, onClose }: { app: MiniApp; onClose: () => void }) {
  const router = useRouter();
  const m = app.manifest;
  const [name, setName] = useState(`${m.name}-fork`);
  const [result, setResult] = useState<{ name: string; stripped: string[] } | null>(null);
  const valid = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(name);

  const autonomous = m.agency.tier === "autonomous";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,10,10,0.55)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Fork ${m.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel raise max-h-[92vh] w-full max-w-lg overflow-y-auto p-4">
        {result === null ? (
          <>
            <h2 className="display text-base leading-none">Fork {m.name}</h2>
            <p className="mt-2 text-xs leading-snug text-[var(--muted-ink)]">
              You get an editable copy pinned to{" "}
              <span className="fig">
                {m.name}@{m.appVersion}
              </span>
              . Refine it in your own words, then publish it under your own name.
            </p>

            <div className="mt-3">
              <Label>New name</Label>
              <div className="mt-1 flex items-baseline border-[2.5px] border-rule bg-[var(--card-b)] px-2 py-1.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  aria-label="New mini app name"
                  className="fig min-w-0 flex-1 bg-transparent text-sm outline-none"
                  autoFocus
                />
                <span className="fig shrink-0 text-sm text-[var(--muted-ink)]">.graphminis.eth</span>
              </div>
            </div>

            <div className="mt-3 border-[2.5px] border-rule p-2.5">
              <Label>What the fork does not inherit</Label>
              <ul className="mono mt-1.5 space-y-1 text-[0.6875rem] leading-snug">
                <StrikeItem>the parent&apos;s ENS name and Agentic ID</StrikeItem>
                <StrikeItem>the generation attestation</StrikeItem>
                {autonomous ? (
                  <>
                    <StrikeItem>
                      the funded wallet {m.agency.policy.wallet ? `${m.agency.policy.wallet.slice(0, 8)}…` : ""}
                    </StrikeItem>
                    <StrikeItem>spending authority — ${m.agency.policy.maxSpendUsd} lifetime cap</StrikeItem>
                  </>
                ) : null}
              </ul>
              <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
                enforced in <span className="fig">forkManifest</span>, not in the UI. the copy starts
                with an empty wallet and no authority to spend anything.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!valid}
                className="btn press text-sm disabled:opacity-40"
                style={{ background: "var(--ink)", color: "var(--card-b)" }}
                onClick={() => {
                  const forked = forkApp(m.name, name);
                  if (forked) setResult({ name: forked.app.manifest.name, stripped: forked.stripped });
                }}
              >
                Fork
              </button>
              <button type="button" className="btn press text-sm" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="display text-base leading-none">Forked</h2>
            <p className="mt-2 text-xs leading-snug">
              <span className="fig">{result.name}</span> is yours. It carries{" "}
              <span className="fig">forkedFrom {m.name}@{m.appVersion}</span> for attribution.
            </p>
            <ul className="mono mt-3 space-y-1 border-[2.5px] border-rule p-2.5 text-[0.6875rem]">
              {result.stripped.map((s) => (
                <li key={s} className="flex items-baseline gap-2">
                  <span style={{ color: "var(--loss)" }}>stripped</span>
                  <span>{s}</span>
                </li>
              ))}
              <li className="flex items-baseline gap-2 border-t border-[var(--hairline)] pt-1">
                <span style={{ color: "var(--gain)" }}>fresh</span>
                <span>wallet, name and Agentic ID — issued on publish</span>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn press text-sm"
                style={{ background: "var(--ink)", color: "var(--card-b)" }}
                onClick={() => {
                  onClose();
                  router.push(`/a/${result.name}`);
                }}
              >
                Open it
              </button>
              <button type="button" className="btn press text-sm" onClick={onClose}>
                Stay here
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StrikeItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="shrink-0" style={{ color: "var(--loss)" }}>
        ✕
      </span>
      <span className="line-through decoration-[1.5px]">{children}</span>
    </li>
  );
}
