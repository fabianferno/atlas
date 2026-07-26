"use client";

import type { Manifest } from "@/lib/contracts/manifest";
import { KV, SectionHead } from "@/components/board/chrome";

export function ProvenancePanel({ m, explorerBase }: { m: Manifest; explorerBase: string | null }) {
  return (
    <section className="panel p-3">
      <SectionHead title="Provenance" />
      <dl className="cells mt-2">
        <KV k="Author" v={m.author ?? "unclaimed"} mono />
        <KV k="Model" v={m.provenance.model} mono />
        {/* `compute` is one of three: `0g-private-computer`, `openai`,
            `local`. Only the first ran on 0G, and only it gets the mark —
            the other two are the honest record that this manifest was
            planned somewhere else. */}
        <KV
          k="Compute"
          v={m.provenance.compute}
          mono
          mark={m.provenance.compute === "0g-private-computer" ? "zerog" : undefined}
        />
        <KV k="Attestation" v={m.provenance.attestationRef ?? "none"} mono />
        {/* `manifestCid` and `agenticId` are null on every bundled app,
            and null is what reaches these strings — "not pinned" and "not
            minted" are the truth for an app that was never published
            through `/api/publish`. Nothing here manufactures a CID or a
            token id to fill the row. */}
        <KV k="Manifest" v={m.identity.manifestCid ?? "not pinned"} mono />
        {/* A minted token gets a link to the 0G explorer, so the claim is
            checkable without trusting this page. The base URL and the
            contract both come from `/api/publish` and the manifest — never
            hardcoded — and no link is rendered without both, because a
            token page for a token that was never minted is a 404 dressed
            up as provenance. */}
        <KV
          k="Agentic ID"
          v={
            m.identity.agenticId
              ? `#${m.identity.agenticId.tokenId} on 0G Chain`
              : "not minted"
          }
          href={
            m.identity.agenticId && explorerBase
              ? `${explorerBase}/token/${m.identity.agenticId.contract}?a=${m.identity.agenticId.tokenId}`
              : null
          }
          mono
          /* Same rule as the link: no token, no mark. "not minted" with a
             0G logo beside it reads as a 0G registration. */
          mark={m.identity.agenticId ? "zerog" : undefined}
        />
        <KV k="Forked from" v={m.forkedFrom ?? "original"} mono />
        <KV k="Version" v={m.appVersion} mono />
      </dl>
    </section>
  );
}
