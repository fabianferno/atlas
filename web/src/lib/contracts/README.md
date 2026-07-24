# Phase 0 contracts

**Do not change these without a coordinated update across workstreams.**

Thirteen agents build in parallel against these seams. Parallel builds rarely
fail by writing bad code — they fail by writing code that doesn't compose, and
nobody notices until integration. These files are the interfaces that prevent
that.

| File | Owns | Consumed by |
|---|---|---|
| `manifest.ts` | The Mini App Manifest, fork semantics | everyone |
| `catalog.ts` | Component names + shape→component selection | W4 composer, W5 renderer |
| `api.ts` | Kit public API signatures | W9 studio, W11 MCP, all of W1–W4 |
| `policy.ts` | Policy engine, journal, signer | W6 agency, W5 renderer, W8 memory |

## Rules

1. **Stub freely.** An implementation that satisfies the types is a valid
   starting point. The renderer should work against fixture manifests before
   the data plane exists.
2. **The catalog seam is the most fragile.** The composer emits component
   names; the renderer implements them. Add to `catalog.ts` first, then both
   sides.
3. **No component without a selection rule.** If nothing in
   `SHAPE_TO_COMPONENT` reaches it, the composer will never emit it and it is
   dead code.
4. **Policy is pure and synchronous.** It must be trivially testable and
   impossible to make network-dependent.
5. **Forking strips wallet, identity, and provenance.** Security requirement,
   already implemented in `forkManifest`. Do not work around it.

## Integration checkpoints

Anything not exercised by one of these is unverified, however done it looks.

1. **Vertical slice** — question → plan → data → A2UI doc → rendered.
2. **Action loop** — button → server event → policy → signer → testnet → journal.
3. **Full artifact** — publish → ENS records → Agentic ID → resolve from a
   different client → it runs.
