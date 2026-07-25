"use client";

/**
 * FORK.
 *
 * ## What this dialog used to promise, and why that had to go
 *
 * "You get an editable copy pinned to `<name>@<version>`. Refine it in your own
 * words, then publish it under your own name." Neither half was true.
 *
 * `forkApp` in `store.ts` is local-only — it never calls `POST /api/publish`, so
 * a fork has no ENS subname, no manifest CID and no Agentic ID, and the name box
 * on this screen issues nothing. And there is no conversational refine anywhere
 * in the product: the Studio composes from an intent, it does not take a
 * follow-up instruction against an existing manifest. Two sentences, two
 * features that do not exist, on the one screen where a user is deciding whether
 * to trust this thing with a wallet.
 *
 * ## What a fork genuinely does, which is the better story anyway
 *
 * `forkManifest` (src/lib/contracts/manifest.ts) drops `identity`,
 * `agency.policy.wallet` and `provenance`. prd.md §5 calls that non-negotiable;
 * §7's threat model lists "fork inherits the parent's funded wallet" as a named
 * threat with "forking strips wallet, policy, identity, provenance — enforced in
 * the fork path" as the mitigation. So the fork is a copy of the *plan* with all
 * of the authority removed: it can ask the same questions of the same schemas and
 * it cannot spend a cent.
 *
 * `forkApp` returns `stripped: string[]` naming exactly what was removed, and the
 * second panel prints it. That is the honest version of the security claim —
 * shown after the fact, from the return value, rather than asserted before.
 *
 * ## The next step, stated as it actually is
 *
 * Publishing a fork IS wired now, and this file's copy changed with it. It used
 * to say that naming "comes from `POST /api/publish`, which forking does not
 * call" and that this build only reaches that route from a fresh Studio draft.
 * Both were true when written and neither is true any more: `publishExisting()`
 * in `store.ts` publishes an app that is already on the board in place, and the
 * panel on `/a/[name]` is the button that calls it. So this screen points at the
 * real next step — open it, then publish it there — which is prd.md §12's loop
 * ("fork → refine → publish under your own name") ending where §12 says it ends.
 *
 * What has NOT changed, and must not: forking itself still publishes nothing.
 * `forkApp` is local, the name box below registers no subname, and the copy says
 * so. Naming stays a separate, deliberate press on the app's own page because it
 * costs gas and issues an immutable binding — folding it into "Fork" would make a
 * two-chain write the side effect of copying a plan.
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
      {/* Extra bottom padding on the phone layout: the dialog bottoms out at the
          viewport edge there, and the docked ledger pill floats over that corner
          — it was covering half of Cancel. The desktop layout is centred with
          margin all round, so it keeps the plain padding. */}
      <div className="panel raise max-h-[92vh] w-full max-w-lg overflow-y-auto p-4 pb-16 sm:pb-4">
        {result === null ? (
          <>
            <h2 className="display text-base leading-none">Fork {m.name}</h2>
            {/*
              What happens, in the order it happens, with nothing that does not.
              The data plan and the A2UI body come across — that is what makes a
              fork worth having, and §5's "`data` is separate from `ui`" is why it
              re-runs live rather than being a screenshot of the parent. The
              authority does not come across. Nothing is published.
            */}
            <p className="mt-2 text-xs leading-snug text-[var(--muted-ink)]">
              A local copy in this browser, pinned to{" "}
              <span className="fig">
                {m.name}@{m.appVersion}
              </span>{" "}
              as <span className="fig">forkedFrom</span> for attribution. It inherits the query plan
              and the interface, so it re-runs against live sources — and none of the authority: no
              name, no wallet, nothing it is allowed to spend.
            </p>

            <div className="mt-3">
              <Label>Local name</Label>
              {/*
                The `.atlas-apps.eth` suffix used to sit inside this box, which
                made the field read as a registration form. Forking registers
                nothing — `forkApp` never touches `/api/publish` — so the suffix
                is gone and the line below says where a subname would come from
                instead. §8: the name is what a human checks before funding, so a
                box that appears to mint one is the worst place in the product to
                be loose about it.
              */}
              <div className="mt-1 flex items-baseline rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  aria-label="New mini app name"
                  className="fig min-w-0 flex-1 bg-transparent text-sm outline-none"
                  autoFocus
                />
              </div>
              {/* The suffix is still not offered here, and the reason is still
                  the same: forking issues nothing. What changed is the second
                  sentence — the name is now reachable, one deliberate press away
                  on the fork's own page, so this says where instead of saying
                  "not built". It also fixes the name early on purpose: the app
                  page publishes under the name set here, because the board's
                  ledger, journal and route are all keyed on it. */}
              <p className="mono mt-1.5 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
                the manifest name, local to this browser. no subname is issued yet — forking does
                not call <span className="fig">POST /api/publish</span>. the fork&apos;s own page has
                a Publish panel that does, and it issues this label under whichever parent this
                deployment is configured with — that panel names the parent before you press. so
                choose the label as you want the name.
              </p>
            </div>

            <div className="mt-3 rounded-[calc(var(--radius)*0.6)] border border-hairline p-2.5">
              {/*
                The strongest thing on this screen, so it is stated as field paths
                rather than reassurance — a reader can go and check each one in
                `forkManifest`. §5: "forking strips `identity`, `policy.wallet` and
                `provenance` … non-negotiable". §7's threat table names the threat
                this closes: "fork inherits the parent's funded wallet".
              */}
              <Label>Cleared by forkManifest</Label>
              <ul className="mono mt-1.5 space-y-1 text-[0.6875rem] leading-snug">
                <StrikeItem>
                  <span className="fig">identity</span> — ENS name, Agentic ID, manifest CID
                </StrikeItem>
                <StrikeItem>
                  <span className="fig">provenance.attestationRef</span> — the generation attestation
                </StrikeItem>
                {autonomous ? (
                  <>
                    {/*
                      The wallet line reports the parent's actual state. Every seed
                      app carries `wallet: null` — the server signs with one shared
                      session key that is not per-app, and `seed.ts` refuses to
                      print an address nobody holds — so claiming a "funded wallet"
                      was stripped from an app that never had one would invent the
                      thing this panel exists to disown.
                    */}
                    <StrikeItem
                      note={
                        m.agency.policy.wallet
                          ? `${m.agency.policy.wallet.slice(0, 10)}… and anything in it`
                          : "null on the parent too, so there is nothing here to inherit"
                      }
                    >
                      <span className="fig">agency.policy.wallet</span>
                    </StrikeItem>
                    <StrikeItem>
                      standing authority — ${m.agency.policy.maxSpendUsd} lifetime, $
                      {m.agency.policy.maxPerTxUsd} per transaction, {m.agency.policy.allowlist.length}{" "}
                      allowlisted address{m.agency.policy.allowlist.length === 1 ? "" : "es"}
                    </StrikeItem>
                  </>
                ) : null}
              </ul>
              <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
                enforced in <span className="fig">forkManifest</span>, not in this dialog — the copy
                comes back with those fields already empty, and the list on the next screen is the
                function&apos;s own return value.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!valid}
                className="btn btn--primary press text-sm disabled:opacity-40"
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
            <h2 className="display text-base leading-none">Forked, locally</h2>
            <p className="mt-2 text-xs leading-snug">
              <span className="fig">{result.name}</span> exists in this browser, carrying{" "}
              <span className="fig">forkedFrom {m.name}@{m.appVersion}</span> for attribution.
            </p>
            <ul className="mono mt-3 space-y-1 rounded-[calc(var(--radius)*0.6)] border border-hairline p-2.5 text-[0.6875rem]">
              {result.stripped.map((s) => (
                <li key={s} className="flex items-baseline gap-2">
                  <span style={{ color: "var(--loss)" }}>cleared</span>
                  <span>{s}</span>
                </li>
              ))}
              {/*
                Still "unpublished", and still stated as a present fact rather
                than as a promise about what publishing will hand back. The old
                line read "fresh wallet, name and Agentic ID — issued on publish",
                which was wrong twice: publishing does not issue a *wallet* on its
                own — `publishApp` writes back the address `/api/publish` returns
                and nothing synthesises one, so a published app can still carry
                `wallet: null` if `provisionWallet` refused — and at the time
                nothing in the UI could publish an existing app at all. The second
                half is fixed now (the app page has a Publish panel), so this says
                where the name comes from without claiming what it will contain.
                The panel itself forecasts that, per backend, before the press.
              */}
              <li className="flex items-baseline gap-2 border-t border-[var(--hairline)] pt-1">
                <span style={{ color: "var(--risk)" }}>unpublished</span>
                <span>no ENS name, no manifest CID, no Agentic ID, no wallet — until you publish it</span>
              </li>
            </ul>
            {/*
              §5's separation of `data` from `ui` is what makes the one available
              next step worth taking: the fork holds the parent's query plan, so
              running it queries the live sources rather than replaying the
              parent's numbers.
            */}
            {/*
              The last sentence pre-empts a contradiction the very next screen
              would otherwise produce. `app-runtime.tsx` shows an autonomous app
              the address that would actually sign, fetched from
              `/api/agency/register` rather than read out of the manifest — and
              that key is one shared server session key, which it discloses. So a
              fork with `policy.wallet: null` still has an address on its page.
              Both statements are true and they look like they disagree, so this
              says which is which here rather than leaving the reader to reconcile
              them. Per-app wallet isolation is specified in §4/§7 and is not
              built; that gap belongs to the runtime page, which names it.
            */}
            <p className="mt-2.5 text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
              Open it and run it — the inherited plan re-queries the same schemas against live data.
              Then publish it from its own page: the Publish panel there calls{" "}
              <span className="mono">POST /api/publish</span>, which is what issues the subname, pins
              the manifest and mints the Agentic ID. That press is a real write to two chains and it
              cannot be undone, so the panel shows what each path will actually do on this deployment
              first and asks again before it sends. Until then the copy stays local and unable to
              spend. The address the app page shows is the server&apos;s shared session key, not an
              inherited one: this manifest carries no wallet.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn--primary press text-sm"
                onClick={() => {
                  onClose();
                  router.push(`/a/${result.name}`);
                }}
              >
                Open it to publish
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

/**
 * A cleared field. The rule the `note` slot exists to keep: the strike-through
 * covers the *field* and only the field. Running it over an explanatory clause
 * ("null on the parent too …") struck out the sentence that qualified the claim,
 * which read as though the qualification had been removed as well.
 */
function StrikeItem({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="shrink-0" style={{ color: "var(--loss)" }}>
        ✕
      </span>
      {/* One wrapping block, so the mark stays on the first line beside the field
          instead of dropping to a line of its own on a 360px screen. */}
      <span className="min-w-0 flex-1">
        <span className="line-through decoration-[1.5px]">{children}</span>
        {note ? <span className="text-[var(--muted-ink)]"> — {note}</span> : null}
      </span>
    </li>
  );
}
