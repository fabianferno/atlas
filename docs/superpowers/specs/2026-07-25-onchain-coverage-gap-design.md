# On-the-fly coverage: the agent indexes what The Graph hasn't

**Date:** 2026-07-25
**Status:** approved, not yet implemented

## The problem

graph-minis resolves standardized subgraph schemas rather than individual subgraph IDs, which
is what lets it answer questions nobody anticipated. But that only works for protocols someone
has already indexed. Ask it about a protocol with no subgraph and no Substreams package and it
has nothing to say.

Today it does not even say that honestly. When the composer builds a monitor or autonomous mini
app it writes a stream block into the manifest:

```js
// web/src/lib/seed.ts:1458 — today
stream: { package: "substreams-common@v0.4.0", module: "map_events" }
```

That package does not exist. `resolveStreamTarget` passes the string straight to
`fetchSubstream`, which is a bare `fetch(url)`, so it throws `TypeError: Failed to parse URL`.
Every seed app's stream block is decorative. The same is true of
`aave-v3-arbitrum@v0.4.1`, `uniswap-v3-arbitrum@v0.6.0`, `gmx-v2-arbitrum@v0.3.2`,
`chainlink-optimism@v0.2.4`, `across-v3@v0.5.0`, `erc4626-vaults@v0.2.0` and
`optimism-rewards@v0.1.3`.

Meanwhile the one package that does stream — `streamingfast/ethereum-explorer-v0.1.2`, module
`map_block_meta` — emits only block number, hash, parent hash and timestamp. Substreams is
currently a clock. It says *when* to re-evaluate; every actual value still comes from a subgraph
query.

## What we are building

When a question resolves to a protocol The Graph has no coverage for, the agent builds and
deploys the coverage itself, then consumes it.

```
user: "track Hyperliquid vault flows on Arbitrum"

  list_schemas    → no standardized family covers this
  fan-out health  → 0 healthy deployments
  registry search → 0 packages match

  ⚠ NO COVERAGE ON THE GRAPH
  → "I can index this myself. Build a Substreams package for 0x…?"
  → generate → build → publish → verify → wire → stream
```

"Deployed" means **a consumer is receiving blocks from it** — not that a CLI exited zero.

## Architecture

Three units with separate reasons to change.

### Unit 1 — `skills/substreams-coverage/SKILL.md`

The deploy flow. Runs where there is a shell and a Rust toolchain.

It does **not** reimplement Substreams authoring. StreamingFast's `substreams-dev`,
`substreams-ethereum` and `substreams-solana` skills already do that well — their published
evaluation reports 100% build and run success across 14 tasks. This skill owns orchestration,
the refusal-to-guess protocol, and the handoff to those skills.

Depends on: `substreams` and `graph` CLIs, `wasm32-unknown-unknown`, and graph-minis' MCP server
for gap detection and verification.

### Unit 2 — `web/src/lib/coverage/*`

Pure logic. Knows nothing about MCP.

| Module | Responsibility | Depends on |
|---|---|---|
| `registry.ts` | substreams.dev registry search, defensively parsed | fetch |
| `gap.ts` | standardized coverage + registry hits → `CoverageReport` | `registry.ts`, `fanout.ts` |
| `contract.ts` | manifest conditions → required proto field contract | `manifest.ts` |
| `ledger.ts` | durable record of what was deployed | store interface |
| `wire.ts` | validate a package URL, write it into `data.stream` | `manifest.ts` |

`ledger.ts` mirrors the store-interface-plus-memory-implementation pattern already used by
`agency/journal.ts` and the cursor store in `kit/substreams.ts`, so a durable backend can be
swapped in at boot without touching callers.

### Unit 3 — MCP tools

`check_coverage`, `wire_stream`, `verify_stream`, `list_deployments`, added to the existing
`web/src/app/api/mcp/route.ts`. Thin dispatchers over Unit 2. That file is 364 lines and holds
five tools today; it stays a dispatcher and does not grow logic.

## Packaging

The skill ships as an installable Claude plugin, laid out the same way
`streamingfast/substreams-skills` is:

```
graph-minis/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
└── skills/
    ├── graph-mini-apps/SKILL.md       (moved from the repository root)
    └── substreams-coverage/SKILL.md   (new)
```

```bash
claude plugin marketplace add fabianferno/graph-minis
claude plugin install substreams-coverage@graph-minis
```

Without this the work is a script that lives in one repository. With it, another builder installs
the plugin, points it at their own MCP endpoint, and gets gap detection, deployment and
verification against their own data. The existing root `SKILL.md` moves into `skills/` and keeps
its front-matter unchanged.

## The two deploy paths

### Substreams

`substreams init` → ABI codegen → Rust map module → `cargo build` → `substreams publish`, which
returns a real fetchable URL:

```
https://api.substreams.dev/v1/packages/<package-name>/<version>
```

That URL goes into `manifest.data.stream`, and `/api/stream` streams it through machinery that
already exists — `streamEvents`, the cursor store, the reorg handling, `runTriggers`, the policy
gate. No new consumer code.

### Subgraph

Generated **against the Messari standardized schema** for the protocol's category, not as a
bespoke schema. Two reasons:

- It slots into the existing fan-out with zero new query code. `fanout.ts` fires one query shape
  at every deployment of a standardized family; a newly deployed `lending-cdp@3.1.0` is simply
  another source in the pool.
- Authoring a Standardized Subgraph for a category that lacks one is explicitly in scope for the
  Composability track. A bespoke schema earns nothing there.

When no standardized family fits, it falls back to a bespoke subgraph registered as a custom
source. The fallback is announced before scaffolding, never silent.

Deploys to Subgraph Studio via `graph deploy`. Requires a Studio deploy key.

## The proto contract, derived rather than guessed

StreamingFast's own evaluation names this failure:

> Free-form proto field names. When the prompt does not specify a schema, agents pick reasonable
> but inconsistent field names (`txCount` vs `transactionCount`, etc). For pipelines feeding
> downstream consumers, embed the proto schema in the prompt.

graph-minis *is* a downstream consumer, and its trigger conditions already declare what they
read. So the contract is derived, not embedded by hand:

```
trigger: "reserve.utilization > 0.9"   →   required: reserve.utilization : double
```

`contract.ts` extracts those paths. The generated module must satisfy them, and `verify_stream`
fails the deploy when a streamed payload does not carry them. The consumer defines the contract,
the generator conforms, verification enforces. This inverts their failure mode rather than
documenting it.

## Refusing to silent-ship

The same evaluation's first known rough edge:

> Vague prompts produce confident guesses, not questions. Skill text alone does not override
> model posture. T4.1 and T4.2 (intentionally vague) silent-shipped pipelines with hardcoded
> thresholds and token universes.

This codebase already refuses that posture elsewhere — `_suspect` on impossible USD values,
`sources.skipped` named with reasons, `INJECTED` printed next to every scripted metric in the
verify harness. The skill applies the same rule to infrastructure.

Before any codegen, four things must be known: **chain**, **contract address(es)**, **event
set**, and **field contract**. Anything unstated is asked — one question per turn, with choices
and an explicit "other" — never guessed. Every assumption that does get made is recorded in the
ledger next to the artifact it produced.

## Data flow

```
question → planner → fan-out health check ─┐
                                           ├→ gap.ts → CoverageReport
        registry search (substreams.dev) ──┘
                                           │
              covered ──────────────────────┴──→ normal path, nothing new happens
                                           │
           NOT covered → offer → [user consents]
                                           │
   contract.ts derives required proto fields from the app's conditions
                                           │
   SKILL: init → ABI codegen → Rust map → cargo build → .spkg
                                           │
   substreams publish → https://api.substreams.dev/v1/packages/<n>/<v>
                                           │
   verify_stream: subscribe, demand a tick carrying the contracted fields
                                           │
              ✓ verified ──→ wire.ts writes data.stream → ledger records
              ✗ unverified ─→ ledger records the failure, manifest untouched
```

**The manifest is written only after a real block arrives carrying the contracted fields.** That
ordering is what keeps this from becoming a more elaborate version of the bug it replaces.

## Error handling

| Failure | Response |
|---|---|
| No published ABI for the contract | Fall back to topic0 derived from Solidity source (their T6.1 path). Announced |
| `cargo build` fails | Surface the real error, mark the attempt FAILED, stop. No blind retry |
| `version_exists` on publish | Bump `package.version` patch, rebuild, republish |
| Publish auth missing | Stop with the exact command. Never half-deploy |
| Registry returns `429` | Honor `Retry-After` and back off |
| Published but never ticks | Existing 45s `FIRST_TICK_TIMEOUT_MS` fires. Not wired. Recorded unverified |
| No standardized family fits | Announce bespoke fallback before scaffolding |
| Studio deploy key missing | Substreams path completes; subgraph half reports blocked, not failed |

### The concurrency constraint is load-bearing

The Graph Market FREE tier allows **2 concurrent Substreams sessions** (`SUBSTREAMS_MAX_REQUESTS`
in the JWT). Verification opens a session, so this is not incidental.

A defect found on 2026-07-25 makes it acute: a *successful* verify run never exits. Two orphaned
processes were found holding `ESTABLISHED` connections to `arb-one.streamingfast.io` three and
four hours after producing the block numbers quoted in the README. Both FREE-tier slots were
consumed, and every subsequent run failed with `resource_exhausted`.

In scope for this work:

- `kit/substreams.ts` aborts the deadline controller in its `finally`, closing the HTTP/2 stream
  when the consumer breaks early.
- `scripts/substreams-verify.ts` exits explicitly rather than only setting `process.exitCode`.
- Verification serializes. Two concurrent verifies would exhaust the tier by themselves.

## Targeted fix to existing code

`zDataPlan.stream.package` gains a validator requiring a fetchable URL. This makes
`"aave-v3-arbitrum@v0.4.1"` unrepresentable rather than merely corrected, and the existing seed
manifests must be updated to real published packages or have their stream blocks removed.

## Testing

Uses the repository's dependency-free harness (`src/lib/agency/harness.test.ts`, run with
`pnpm dlx tsx src/lib/agency/all.test.ts`, currently 128/128 passing). No new test runner, no
lockfile change.

- `registry.ts` — the three documented parse traps: zero results is `{}` rather than
  `{"packages": []}`, absent `hasMore` means done, omitted fields are not empty ones
- `wire.ts` — rejects `"aave-v3-arbitrum@v0.4.1"`. A direct regression test for the live bug
- `contract.ts` — field-path extraction from real trigger conditions, including conditions it
  must refuse to interpret
- `gap.ts` — covered, uncovered, and partially-covered verdicts
- `ledger.ts` — ordering and the unverified-attempt record
- `verify_stream` — driven through the existing `options.events` injection in `runStream`, so
  tests need no token and open no socket

One live end-to-end run is recorded in the ledger as the demo artifact.

## Prerequisites

Not present in `web/.env.local` as of 2026-07-25:

| Credential | Needed for |
|---|---|
| substreams.dev publish auth (`substreams auth`) | Publishing packages. Distinct from the Graph Market streaming JWT |
| Subgraph Studio deploy key | `graph deploy` |
| Etherscan/Arbiscan API key | ABI fetching for codegen |

Also required: the `substreams` and `graph` CLIs, and the `wasm32-unknown-unknown` Rust target.
The machine currently has `cargo` 1.91.1 and only `wasm32v1-none`.

## Build order

Both deploy paths are in scope. They are built in sequence because the second reuses the first's
gap detection, ledger and verification, and because a half-built Substreams path plus a half-built
subgraph path demonstrates neither.

1. **Coverage detection** — `registry.ts`, `gap.ts`, `check_coverage`, and the stream-leak fix.
   Ends with: the system can say "nothing on The Graph covers this" and prove it.
2. **Substreams path** — `contract.ts`, the skill's generate/build/publish flow, `verify_stream`,
   `wire.ts`, `ledger.ts`. Ends with: a published package streaming decoded events into a mini app.
3. **Subgraph path** — standardized-schema generation, `graph deploy`, registration as a fan-out
   source. Ends with: a deployed subgraph answering the same question over GraphQL.
4. **Packaging and seed repair** — plugin manifests, the `stream.package` URL validator, and
   replacing or removing the seven fabricated stream references.

Each phase leaves the repository in a working, demonstrable state.

## Out of scope

- Hosted sink deployment via the Portal API. StreamingFast never provisions the database, so it
  requires a user-supplied Postgres or ClickHouse and adds infrastructure that proves nothing the
  stream path does not already prove.
- A server-side build worker. Vercel cannot host a Rust toolchain, and moving publish and deploy
  secrets onto an always-on box is a larger change than this work needs.
- Solana. The skills support it; the mini app consumer does not.
