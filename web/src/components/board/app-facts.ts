"use client";

import { useEffect, useRef, useState } from "react";
import type { Manifest } from "@/lib/contracts/manifest";
import type {
  EnforcementReport,
  PlanDivergence,
  RegistryScope,
  WalletKind,
} from "@/lib/agency/wallet";

/**
 * Whether trigger evaluation is event-driven right now, asked of the server
 * rather than assumed. Polling and per-block subscription look identical from
 * the outside, and the difference is the whole Substreams argument — so the UI
 * states which one it is and never rounds up. Null while unknown.
 */
export function useStreamMode(): { mode: "substreams" | "interval"; reason: string } | null {
  const [state, setState] = useState<{ mode: "substreams" | "interval"; reason: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/stream")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { mode?: "substreams" | "interval"; reason?: string } | null) => {
        if (!alive || !body?.mode) return;
        setState({ mode: body.mode, reason: body.reason ?? "" });
      })
      .catch(() => {
        // A failed probe is not a claim of either mode. Stay silent.
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/**
 * What the server will sign with, and what enforces each limit.
 *
 * WHY THIS IS A FETCH AND NOT `manifest.agency.policy.wallet`. This page used to
 * print the manifest's claimed wallet as the address to fund. For the seed apps
 * that claim was a hand-written 40-hex string — nobody holds the key, so anyone
 * who funded it destroyed the money. The manifest is a client-side document and
 * cannot be an authority on a server-held key; only the server can be. So the
 * address on screen is the one that comes back from `/api/agency/register`,
 * which provisions if needed and reports either way, and `policy.wallet` is
 * treated as a claim to be checked rather than a value to be rendered.
 *
 * Same discipline as `useStreamMode` above: null while unknown, null on failure,
 * and the caller renders nothing rather than a guess. An unreachable server is
 * not evidence about an address.
 *
 * IT CARRIES TWO MORE BLOCKS NOW, AND BOTH WERE ARRIVING AND BEING DISCARDED.
 * The response has always been read as `Partial<SignerFacts>`, so a field this
 * type did not name was parsed and dropped on the floor:
 *
 *   `divergence` — the exact list of fields where the manifest this page is
 *   rendering and the manifest the server is RUNNING disagree. The registry is
 *   first-write-wins, so a re-register keeps the policy and the metric half of
 *   the data plan it was first given. That is the correct security rule and it
 *   has a cost: this server once held `aave-v3-arbitrum@v0.4.1` — a Substreams
 *   package that had not existed in the repo for several commits — while this
 *   page rendered the current one out of local state, and `Watch 3 blocks`
 *   failed with `Failed to parse URL from aave-v3-arbitrum@v0.4.1` with nothing
 *   anywhere saying the two sides disagreed. The server now answers with the
 *   disagreement. A non-empty `ignored` means *your copy is not what runs*, and
 *   this file's own header forbids letting a failure look like a quiet success.
 *
 *   `registry` — where the registration lives. It is an in-memory Map on one
 *   server process, so it does not survive a redeploy or a second serverless
 *   instance. See the disclosure line under the enforcement block for why that
 *   is on this page at all.
 *
 * Both are typed from `lib/agency/wallet.ts` rather than restated here, for the
 * same reason `EnforcementReport` is: if the server's answer grows a field, this
 * file should stop compiling rather than quietly render an older shape.
 */
export interface SignerFacts {
  wallet: {
    address: string;
    kind: WalletKind;
    chainId: number;
    chainName: string;
    sessionKeyAddress: string;
    onchainEnforced: boolean;
    permissionId?: string;
    /** Optional: an older server does not send it, and unknown must not render
     *  as either answer. See the banner below. */
    keyScope?: "per-app" | "shared" | "ephemeral";
  };
  enforcement: EnforcementReport;
  /*
   * Optional, and not because the route is unreliable — it returns both on every
   * branch, including the 422. Optional because the alternative is to synthesise
   * `{ diverged: false, ignored: [] }` when a response arrives without them, and
   * that is a *reading* — it says the server agrees with this page, which is the
   * one thing an absent field cannot tell you. Missing means unknown, and unknown
   * renders as nothing.
   */
  divergence?: PlanDivergence;
  registry?: RegistryScope;
}

export function useSigner(manifest: Manifest | null): SignerFacts | null {
  const [state, setState] = useState<SignerFacts | null>(null);
  // The app currently on screen, and the app we have already asked about. The
  // manifest OBJECT changes identity every time `runApp` re-composes the body,
  // and re-registering on each recompose would be pointless work against a
  // first-write-wins route — so the request is keyed on the app's name, and the
  // response is dropped if a different app arrived while it was in flight.
  const wanted = useRef<string | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    const appId = manifest?.name ?? null;
    wanted.current = appId;
    if (!manifest || !appId || asked.current === appId) return;
    asked.current = appId;

    void fetch("/api/agency/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: (Partial<SignerFacts> & { ok?: boolean }) | null) => {
        if (wanted.current !== appId) return;
        // A 422 (provisionWallet refusing mainnet, or an incompletely scoped
        // session) arrives as ok:false with no wallet. That is a correct
        // failure and it is NOT an address — stay silent.
        if (!body?.ok || !body.wallet || !body.enforcement) return;
        // `divergence` and `registry` ride along verbatim. They used to be
        // dropped here — this callback only ever lifted `wallet` and
        // `enforcement` out of the body — which is how a server running a
        // different manifest than the one on screen stayed invisible while the
        // sentence naming the difference sat unread in the response.
        setState({
          wallet: body.wallet,
          enforcement: body.enforcement,
          divergence: body.divergence,
          registry: body.registry,
        });
      })
      .catch(() => {
        // Let the next mount try again. A dropped request is not a fact.
        if (asked.current === appId) asked.current = null;
      });
  }, [manifest]);

  return state;
}

/**
 * The 0G explorer base URL and the deployed contract addresses, asked of
 * `/api/publish`. Used only to turn a real Agentic ID into a link — an app with
 * no minted token gets no link and no href, because a token page for a token
 * that was never minted is a 404 dressed as provenance.
 */
export function useZeroGExplorer(): string | null {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/publish")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { zeroG?: { explorer?: string | null } } | null) => {
        if (!alive || !body?.zeroG?.explorer) return;
        setBase(body.zeroG.explorer.replace(/\/+$/, ""));
      })
      .catch(() => {
        // No explorer base means the token id renders as plain text. Correct.
      });
    return () => {
      alive = false;
    };
  }, []);
  return base;
}
