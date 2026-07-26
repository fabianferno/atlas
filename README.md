# Atlas

**Describe an onchain app. Get an agent with a UI, a wallet, and a name.**

A mini app is not a dashboard. It watches live Graph data, renders whatever interface fits the *shape* of that data, and can act on it — inside a policy you set. Every one gets an ENS name, a wallet, and an onchain identity, so you can verify what it is before you fund it.

| | |
|---|---|
| **Live demo** | **https://atlas-mini-apps.vercel.app** |
| **Video** | _TODO_ |
| **ENS parent** | [`atlas-apps.eth`](https://sepolia.app.ens.domains/atlas-apps.eth) (Sepolia) |
| **Example app** | `atlas-market-guard.atlas-apps.eth` |
| **Agentic ID** | [token 10 on 0G Galileo](https://chainscan-galileo.0g.ai/token/0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0?a=10) |
| **MCP endpoint** | `https://atlas-mini-apps.vercel.app/api/mcp` |

> **Status.** Everything marked ✅ below was verified by reading it back from the chain or the gateway, not inferred from the code. What isn't built is listed under [Not in scope](#not-in-scope) rather than left ambiguous — including two things that ✅ used to cover and no longer does: **three of the eight issued subnames point at manifest bytes that no longer exist anywhere**, and **one process-wide session key signs for every mini app**, so "a wallet" above is per-app in the manifest and not per-app in custody. Both are struck-and-replaced rather than deleted, in this file and in `prd.md` §14.

---

## Why

The Graph had everything it needed to be Dune — more chains, more protocols, real time, decentralized — but it only ever built for developers. This is the consumer surface it never shipped. And because the interface is generated per question, apps exist the moment you ask, including for the long tail nobody would ever build by hand.

## What a mini app is

```
analytics  ──────────────  monitoring  ──────────────  autonomous
read-only                  watches + alerts            holds a wallet, acts
sits flush                 lifts, live-blue rim        stands proud, orange rim
(inset groove)             (soft bevel)                (tall bevel, deep shadow)
```

The tier is not decoration: **depth encodes agency**, and an autonomous app always renders its policy strip, its kill switch, and its trade log. You can see what a thing is allowed to do by looking at it. (The shipped theme is skeuomorphic — Dieter Rams / Braun. `prd.md` §6 argues for neo-brutalism with border weight doing this job; that was the earlier direction, and `web/src/app/globals.css` plus `docs/superpowers/specs/2026-07-25-skeuomorphic-theme-design.md` are what actually runs.)

**The agent cannot inject code.** It emits [A2UI](https://github.com/google/A2UI) v0.9.1 — declarative data, not executable code. The client holds the approved component catalog and the agent may only reference components by name. For a generated interface that can move money, this is the whole safety argument.

**The theme swap proves it.** One attribute (`data-skin`) re-expresses the entire system in a different material — `tactile`, the skeuomorphic default, and `flat`, the neo-brutalism this shipped before. Tokens and material only: no component changes, no catalog entry changes, no manifest re-read, nothing round-trips to the agent. Press the button in the top bar while a live autonomous app is on screen and the same manifest renders in a different skin. That is A2UI's core property in one gesture, and it is why the aesthetic is a choice sitting on the architecture rather than being the architecture.

Agency stays legible in both, which is the part that isn't negotiable — depth encodes it in `tactile`, border weight (1.5/2.5/5px) in `flat`. A skin that hid which apps can spend would be a bug, not a theme.

**Form follows data, not keywords.** The composer picks components from the shape of what came back: a bounded ratio becomes a gauge, a ranked categorical becomes a leaderboard. Not from words in the prompt.

---

## How it uses The Graph ✅

**Standardized Subgraphs.** 96 registry entries — **86 verified deployment IDs**, 9 placeholders and 1 unverified, counted off `GET /api/graph` rather than asserted — 11 schema families declared and 9 with live deployments, across Arbitrum, Optimism, Base and Mainnet. Resolving a *schema* rather than a subgraph id is the point — it means a question nobody anticipated still resolves.

| Family | arbitrum-one | optimism | base | mainnet |
|---|---|---|---|---|
| `lending-cdp@3.1.0` | 10 | 5 | 4 | 5 |
| `dex-amm@1.3.2` | 3 | 4 | — | 3 |
| `dex-amm-extended@4.0.1` | 2 | 1 | 1 | 2 |
| `perp-futures@1.3.4` | 5 | 3 | — | — |
| `bridge@1.2.0` | 6 | 6 | 1 | 2 |
| `yield-aggregator@1.3.1` | 1 | 1 | — | 3 |
| `options@1.3.2` | 2 | — | — | 1 |
| `nft-marketplace@2.1.0` | — | — | — | 4 |
| `generic@3.0.0` | 5 | 2 | 5 | — |

**Deployment IDs queried in the reference run** (Graph Track 2 asks for these explicitly; the full 86 are in [`web/src/lib/kit/sources.ts`](web/src/lib/kit/sources.ts)):

```
4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf  lending-cdp@3.1.0       arbitrum-one  aave-v3
5MjRndNWGhqvNX7chUYLQDnvEgc8DaH8eisEkcJt71SR  lending-cdp@3.1.0       arbitrum-one  compound-v3
3RWFxWNstn4nP3dXiDfKi9GgBoHx7xzc7APkXs1MLEgi  lending-cdp@3.1.0       optimism      aave-v3
Dpk4Gen22wxQ3Laojf7DR2me8wGzjaHwjsKAsLf2rCFV  lending-cdp@3.1.0       arbitrum-one  dforce
3m97d2dJ2pXwPFuiHrm8T37V9TCoAHBpMqRwdguyUZXF  lending-cdp@3.1.0       arbitrum-one  abracadabra
HnV3fhwsWfmQGdD2AeGzqvRVTDBqnMH74jCsDVq1DXYP  lending-cdp@3.1.0       arbitrum-one  rari-fuse
zGuPrsVqtY5ehJDCmweb9ZnBrae3tSQWRux8Mz1M4Gn   lending-cdp@3.1.0       arbitrum-one  vesta-finance
DQqb7FiQ1joLhESkAwvAYiuXhwfz4zf6qHmbt7stnec8  lending-cdp@3.1.0       optimism      sonne-finance
6AmkakXwadWiZ2jN7oJcFreWmKG1nZrT5P8om52upYPd  lending-cdp@3.1.0       optimism      dforce
FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX  dex-amm-extended@4.0.1  arbitrum-one  uniswap-v3
EgnS9YE1avupkvCNj9fHnJxppfEmNNywYJtghqiu2pd9  dex-amm-extended@4.0.1  optimism      uniswap-v3
3oHCddbQGTi42kPZBwyGzD2JzZR33zK2MwXtxAerNJy2  dex-amm-extended@4.0.1  arbitrum-one  sushiswap-v3
```

**The fan-out is the composition.** One question fires the same query shape at every healthy deployment across ≥2 schema families and ≥2 networks, then merges. A representative run:

```
18 sources queried → 13 healthy, 5 dead skipped by health check → 74 rows in 2.8s → $0.0014
```

That 28% dead rate is real and is why sources are health-checked at generation time and frozen into the manifest. Querying one subgraph with no composition explicitly does not qualify for Track 3; this is why.

**The whole registry runs on this.** All **16 of 16** seed mini apps are built by the real pipeline — resolve → health-check → fan-out → compose — not by hand. `pnpm dlx tsx --env-file=.env.local scripts/seed-live.ts` re-measures every one and writes `web/src/lib/kit/seed-live.generated.json`; the board reads that snapshot, so the registry renders with no key and no network while every number in it was measured. Total cost of a full re-run: **$0.0084**. The snapshot's `generatedAt` invalidates any browser's cached copy, so a re-measure reaches a returning visitor instead of silently not applying.

**16 of 16 is a measurement, and the board can now report fewer.** A seed app the snapshot could not measure is **dropped from `SEED_APPS` entirely** rather than falling back to a fixture body — an app with no live data has nothing to show, so it shows nothing, and the drop is not silent: `SEED_DECLARED_COUNT` and `SEED_DROPPED` are exported so the surface can say "13 of 16, three had no live data in this snapshot" instead of implying full coverage. `SEED_APPS_ALL` keeps every declared app so the generator still re-measures a dropped one next run; filtering the generator's input instead would drop an app once and therefore forever. In the current snapshot `SEED_DROPPED` is empty, which is why the number reads 16 of 16 — that is the honest reason, not a floor.

**"Run" re-queries The Graph for real.** It used to increment a counter and write a ledger line saying a query had happened. It now re-reads the manifest's pinned plan, fires the fan-out at `/api/graph` and re-composes the body through `/api/compose`, and reports what came back — rows, deployments that answered of deployments queried, cost, elapsed — or says `FIXTURES — the gateway is not keyed, so no deployment was queried` when there is no key. That is `prd.md` §5's "a resolved name is live, not a screenshot" delivered in the product rather than argued for in a document.

Four bugs that only surfaced once real data ran through it, all of which had been invisible behind fixtures:

- **Placeholder GraphQL was degrading every single-schema app.** Seed manifests carried a generated stub query; `planQueryFor` treats a lone unkeyed query as the planner's intent and fired it instead of falling through to the family default. The gateway rejected it, the core-fallback retry rescued a narrower version, and the app came back with 3 rows where the real query returns 36. Manifests now carry the family's real query.
- **`nft-marketplace@2.1.0` denominates in ETH, not USD.** `cumulativeTradeVolumeUSD` does not exist on `Marketplace`; asking for it is a hard error, so the whole family returned zero rows. Verified by introspecting OpenSea Seaport mainnet. This is a fourth schema exception on top of the three in `prd.md` §13.
- **Impossible values led the board.** The fan-out ranks `_suspect` rows last, but the shape detector re-sorted on the metric and undid it — putting `$72384163253T` from a broken SushiSwap feed at the top of a leaderboard, and summing it into a `$131685267736T` headline. Ranking is now suspect-aware at every sort, and aggregates exclude suspect rows while *saying how many* they excluded.
- **`isActive` read as a fired alert.** `NAME_HINTS` classifies any `is…` boolean as a flag, so `isActive: true` — the normal state of every healthy market — rendered "Is Active has fired" in an alert banner on a wallet-holding app. A fired condition now has to be breach-shaped.

`web/src/lib/kit/shapes.test.ts` pins all four.

**Two things we do with live data that a demo usually hides:**

- **Dead deployments are named, not silently dropped.** `sourcesFailed` and `failures[]` carry the reason.
- **Impossible values are flagged, not deleted.** Several standardized deployments report USD figures from broken price feeds — SushiSwap on Arbitrum reports a TVL of `7.2e22`. Rows carrying a USD value above $1T get `_suspect` naming the offending field, and rank *last*. Sorting by the broken field once put `$72 sextillion` at the top of the table, which reads as broken software rather than bad upstream data. The data is live and correctly fetched; it is wrong at the source, and we say so.

**x402 — implemented, not yet exercised.** Keyless per-query payment over the gateway (`/api/x402/subgraphs/id/<id>`): the 402 challenge is parsed for real and answered with an EIP-3009 signature at the published ~$0.01/query. But `X402_PRIVATE_KEY` is unset, so no query has actually been paid for this way — the reference run above cost $0.0014, which is 14 × the API-key gateway's $0.0001, not 14 × $0.01. The design is what makes forking work (a forked app pays with its own wallet, no shared API key); the receipt does not exist yet.

**Substreams ✅ — event-driven triggers, verified on Arbitrum.** Polling a subgraph means an autonomous guard is up to five minutes late. For an app that displays, that is a latency preference; for one that spends, it is a correctness bug — which is why this is here and not on the cut list.

A real gRPC subscription (`@substreams/core` over Connect/HTTP-2) against `arb-one.streamingfast.io`, one tick per block, each carrying the cursor the stream resumes from. Verified both directions with `web/scripts/substreams-verify.ts`:

```
breach:  blocks 487508073 → 487508075 in 1.5s
         487508074 → healthFactor 1.035 breaches "healthFactor < 1.15"
         → TRIGGER fired → POLICY OK swap $25 → 0x94cc0aac… → journaled
control: blocks 487509578 → 487509580, healthy throughout → 0 firings
```

The control run matters: a harness that can only print ✅ proves nothing.

**The chain runs all the way to a real transaction.** `--real` sends from the app's own session key on Base Sepolia:

```
Arbitrum block 487540654  (real, off arb-one.streamingfast.io)
  → Substreams tick → trigger "healthFactor < 1.15" fired
  → POLICY OK  approve $25 → 0x036CbD53…  (allowlisted, under the $50/tx cap)
  → session key signed → tx 0x5a44e9d5…9d78
  → status success, block 44604106, 1 Approval event
  → allowance 25 USDC, read back off chain
```

[View on Basescan](https://sepolia.basescan.org/tx/0x5a44e9d5d79446afd042928a76d405459242688f479d7257e23143d6190c9d78)

**It is an `approve`, and it is described as one.** Granting the router an allowance is genuinely the first step of a swap, and it is a real onchain action taken autonomously under a policy — but it is not a swap, and calling it one would make the manifest lie about what the signer did. `approve` is its own `Action.kind` for exactly that reason. `scripts/substreams-verify.ts --real` reproduces it.

Four properties the design turns on:

- **A reorg is not an event.** `blockUndoSignal` is journalled and rewinds; it never becomes a trigger signal. The correct response to "that block did not happen" is to stop, not to act.
- **A replayed block does not trade twice.** Substreams replays from a cursor by design after a disconnect, so ticks are keyed `<block>:<hash>` and the signal ledger dedupes.
- **The cursor is committed after the action, not before.** At-least-once with an idempotent key beats at-most-once when the effect is a trade.
- **The metric is re-read server-side, per block.** From the app's own health-checked sources (`web/src/lib/agency/enrich.ts`) — a client that could post `healthFactor` could make an autonomous app trade on demand. Untrusted module output is namespaced under `block` and loses every key collision to our own read.

`GET /api/stream` reports `substreams` or `interval`, and the app's Data plan panel says *"on an interval — no Substreams token, so polling"* when there is no token, rather than implying latency it does not have. Token: a JWT from [thegraph.market](https://thegraph.market) → Dashboard → Create New Key → API TOKEN, as `SUBSTREAMS_API_TOKEN`. The FREE tier allows **2 concurrent streams**, which a second subscribing app will hit — `resource_exhausted` is classified retryable for exactly that reason.

**Until now, nothing in the app subscribed.** `POST /api/stream` had no caller anywhere in the product — the only thing that ever opened a subscription was `scripts/substreams-verify.ts`, which is a script, not the product. An autonomous app's panel said "event-driven" while its process was subscribed to nothing. There is now a bounded **Watch 3 blocks** control on monitor and autonomous apps: it opens a real subscription, consumes N blocks, re-evaluates the triggers per block, and returns. Bounded on purpose — an unbounded subscription from a serverless request handler would be a claim the runtime cannot keep.

**And the success path is currently unexercised in the app, because the account is at its quota.** The request reaches `arb-one.streamingfast.io` and the endpoint answers:

```
POST /api/stream  → [resource_exhausted] Concurrent stream limit exceeded (active sessions: 2/2)
                    retryable: true · endpoint arb-one.streamingfast.io
                    journal: STREAM subscribed map_block_meta @ arbitrum-one (from head)
```

That is a real failure of a real call against the real endpoint, not a mock, and it is rendered as one — three outcomes get three different sentences, because "no token configured", "the endpoint refused us", and "blocks were consumed" mean three different things and collapsing them is where a demo starts lying. The two blocking sessions are account-wide on the free tier and outside this process. So: the subscription is verified end to end **by the script** (below), and verified as far as the endpoint's answer **in the app**.

**Subgraph MCP — not wired.** `GRAPH_MCP_URL` points at `https://subgraphs.mcp.thegraph.com/sse`, but nothing in `src/` calls it: schema resolution runs off the 86-entry registry in `sources.ts` plus a live health check. Discovery beyond that registry is a real gap, and the env var on its own is not an integration. (Distinct from *our* MCP server below, which we do serve.)

---

## MCP server ✅

We serve MCP at `/api/mcp` — the same URL every published mini app writes into its `agent-endpoint[mcp]` ENS record. Stateless Streamable HTTP, one JSON-RPC message per POST.

```jsonc
{ "mcpServers": { "atlas": { "type": "http", "url": "https://<origin>/api/mcp" } } }
```

| Tool | Does |
|---|---|
| `list_schemas` | What's queryable, with per-network deployment counts |
| `check_coverage` | Whether The Graph can answer a question at all — deployment candidates, whether a Substreams package exists, and a verdict of covered / subgraph-only / substreams-only / uncovered / unknown |
| `plan_mini_app` | Question → query plan (schemas, networks, GraphQL, tier) |
| `query_graph` | Question → live merged rows across all healthy deployments |
| `build_mini_app` | Question → a renderable A2UI document |
| `resolve_mini_app` | ENS name → manifest, wallet, Agentic ID, mutual verification |

Read-only by design. Nothing here signs or spends — `/api/act` owns the action loop and reads its policy from the server side, because an MCP endpoint is a URL strangers point agents at.

---

## ENS ✅

`atlas-apps.eth`, registered and **wrapped** on Sepolia, issuing a subname per mini app. Records written per app:

```
addr                              → the address the app signs from   ← what you fund
contenthash                       → ipfs://<manifest CID>
agent-context                     → YAML capability description       (ENSIP-26)
agent-endpoint[web]               → <origin>/a/<name>                 (ENSIP-26)
agent-endpoint[mcp]               → <origin>/api/mcp                  (ENSIP-26)
agent-registration[<erc7930>][id] → "1"                               (ENSIP-25)
url · description · avatar        → standard profile records
```

**Verified live from the deployed origin, with no write key present** — which is how a public instance should be configured:

```
GET https://atlas-mini-apps.vercel.app/api/resolve/atlas-market-guard
  source        contenthash          ← ENSIP-7, not a registry fallback
  address       0xedE65679…3fE12     ← the address the record points at
  endpoints     web + mcp → https://atlas-mini-apps.vercel.app/…
  agenticId     token 10 on 0G Galileo (16602)
  verification  mutuallyVerified: true
```

**That `addr` is the shared session key, and calling it "the app's own wallet" was the overstatement.** `AGENT_SESSION_PRIVATE_KEY` is process-wide: register two different mini apps and both come back `0xedE65679…3fE12`, which is exactly what this record holds. The earlier names carry distinct addresses (`0xf747bB26…`, `0x80FeF491…`, `0x35Cf1fd0…`) from an earlier derivation, so the set genuinely spans more than one signer regime — which is the honest reason a resolver cannot tell you whose key an address is. A record says where a name points; custody is not a property of a record. Per-app keys are in [Not in scope](#not-in-scope).

Published by the product's own path — `scripts/publish-under-parent.ts` runs plan → resolve → fan-out → compose and then pins, issues, mints and registers. That run: 9 live deployments of 9 probed, 42 rows, planned on 0G Compute (`0gm-1.0-35b-a3b`) with attestation `0g://6f3651f2…`, ENS tx `0x40daed7e…`, mint tx `0x06867715…`, registry tx `0x857ffd66…`.

Two things that only surfaced once this ran somewhere other than a dev machine, both now fixed:

- **Reading was gated on write credentials.** `resolveRegistrarMode()` degrades to `mock` without a registrar private key, and `readRecords` skipped the resolver entirely in mock mode. A read-only deployment therefore resolved *nothing* and silently fell back — working perfectly on the machine that held the key. Reading ENS needs an RPC and nothing else, so the gate is now "mock was explicitly asked for".
- **viem's `getEnsResolver` returns a non-resolver on Sepolia.** For `aave-health-guard.atlas-apps.eth` it answers `0x422484c2…`, where every `addr`/`text`/`contenthash` call reverts. The registry's own `resolver(node)` answers `0xE99638b4…`, which holds the records. We now ask the registry first and keep the UniversalResolver path second for wildcard/CCIP names.

**Four earlier names read `mutuallyVerified: false`, and that is the binding working** — a different failure from `aave-guard-fork`'s below, which was a bug. `aave-health-guard`, `wallet-bound-guard`, `attested-market-guard` and `durable-market-guard` were published under a previous parent, so their tokens still assert `…graphminis.eth` — read straight off 0G Galileo:

```
token 6  ensNameOf="wallet-bound-guard.graphminis.eth"
token 8  ensNameOf="durable-market-guard.graphminis.eth"
```

The name↔token binding is **immutable by design**: `AgenticId._bindEnsName` reverts `EnsNameAlreadyBound` and `MiniAppRegistry.register` reverts `TokenAlreadyBound`. A binding you can silently re-point is not a binding, so renaming the ENS parent cannot drag the old tokens along — the honest repair is a fresh publish, which is what `atlas-market-guard` is. The old names still resolve their records, wallet and manifest; only the mutual assertion is historical. Demo `atlas-market-guard`.

Also: `aave-health-guard` has **no `addr` record** — it predates wallet binding, and `setRecords` skips a null address rather than writing zero.

**Eight names are issued, and three mutually verify.** Re-read off Sepolia and 0G Galileo:

| name | token | manifest | `mutuallyVerified` |
|---|---|---|---|
| `atlas-market-guard` | 10 | fetches | **true** — the one to demo |
| `lineage-fallback-probe` | 13 | fetches | **true** — a published *fork* |
| `rebalance-arbitrum-dex` | 11 | fetches | **true** — no `addr` record |
| `aave-guard-fork` | 12 | fetches | false — kept broken as evidence, below |
| `durable-market-guard` | 8 | fetches | false — pre-rename token |
| `attested-market-guard` | 7 | 504 | false — pre-rename token |
| `wallet-bound-guard` | 6 | 504 | false — pre-rename token |
| `aave-health-guard` | 5 | 504 | false — pre-rename token, no `addr` |

`rebalance-arbitrum-dex`, `aave-guard-fork` and `lineage-fallback-probe` came out of end-to-end tests of the publish path during this audit rather than from a curated demo flow. They are in the record because they are real onchain state and because they are the repeats that show the path is reproducible after the parent rename — not because they were chosen.

**A swallowed revert made every published fork unverifiable.** `MiniAppRegistry.registerFork` opens `if (_records[parentKey].author == address(0)) revert ParentUnknown(parentKey)` — correct, so lineage cannot be faked against a name nobody published. But the publish path passed `parentKey` whenever a manifest carried `forkedFrom`, and every *bundled* app is unpublished. So publishing a fork went: ENS records written → Agentic ID minted → `registerFork` reverts → caught as a generic "registry write failed". The name resolved, the token existed, and **the 0G half of the mutual proof was silently missing** — `mutuallyVerified: false`, which is precisely the property this whole section rests on.

Fixed in `registerMiniApp` (`web/src/lib/identity/agentic-id.ts`) by asking the contract's own question first — `get(parentKey)` — and, when the parent is genuinely absent, registering **without** the lineage link rather than not registering at all, with `lineageSkipped` carried up into the publish report's `warnings[]`. The trade is deliberate: losing `forkedFrom` costs onchain attribution, which is recoverable because the manifest still carries it; losing the registration costs mutual verification, which is the safety primitive a stranger uses before funding a name. Keep the one that decides that, and say the other was skipped rather than letting a manifest-only `forkedFrom` imply it was recorded.

`aave-guard-fork` (token 12) is the artifact that exposed it and is left broken on purpose — `registryAssertsName: false`. `lineage-fallback-probe` (token 13) is the identical situation published *after* the fix: all three assertions true, `mutuallyVerified: true`, registry tx [`0x02f178c0…`](https://chainscan-galileo.0g.ai/tx/0x02f178c0717ac8898691630175ff0f78a42d2e598eb4ed2f06dd282e3c2885b1). So "a published fork can be mutually verified" is demonstrable, and was not before.

**One record-keeping gap left, named rather than papered over.** [`contracts/deployments/ens-sepolia.json`](contracts/deployments/ens-sepolia.json) now lists all eight subnames and carries `manifestAvailability` and `registryGap` sections matching the table above — but its `verifiedSubname` still nominates `aave-health-guard`, whose manifest no longer fetches. The chain is the authority; that file is a record of it. And the on-screen Published strip lists five labels, so it is not exhaustive either.

**The contenthash resolves without us.** The strongest form of this claim is the one that does not involve our server at all, so that is the one that gets checked — read `contenthash` off Sepolia, fetch the CID from ipfs.io, parse what comes back:

```
1. ENS contenthash   ipfs://bafkreiagp25njrnk42kixxjo4tctw6v2go23dmo6lzwihg7sfcsiv4opxu
2. ipfs.io fetch     200 OK
3. manifest          spec=atlas/2 name=atlas-market-guard tier=monitor
                     schemas lending-cdp@3.1.0, dex-amm-extended@4.0.1 · 9 sources
```

**Backfilling needed no republishing and no transactions** — a CID is the hash of the bytes, so re-uploading the same bytes produces the same CID, and a `contenthash` already written was a correct address that simply had no provider. `scripts/pin-backfill.ts --verify` pinned **8 documents and read all 8 back from ipfs.io**.

**But it could only backfill bytes that still existed, and for three names they did not.** Of the **eight subnames issued under `atlas-apps.eth`, five resolve their manifest and three never will** — measured against ipfs.io, a gateway that is not ours:

```
atlas-market-guard       bafkreiagp25njr…   200
durable-market-guard     bafkreih7fstkxx…   200
rebalance-arbitrum-dex   bafkreidplmme6w…   200
aave-guard-fork          bafkreigphjjdkc…   200
lineage-fallback-probe   bafkreihjc5hp7t…   200
attested-market-guard    bafkreihychyb2e…   504
wallet-bound-guard       bafkreia74xt27s…   504
aave-health-guard        bafkreib7rymi3y…   504
```

The three were published while `IPFS_MODE=local`, whose content store — `web/.atlas/`, **gitignored**, which is the whole root cause — was the only provider their bytes ever had. This is unrecoverable rather than pending, and the reason is the same property that made backfilling free: a CID *is* the hash of the bytes, so regenerating a manifest yields a different CID that no longer matches the `contenthash` on Sepolia. Re-pointing a record would be a new transaction and a different claim. `IPFS_MODE` is now `pinata`, so a publish cannot land in a store of one anymore — but the three records already written resolve to an address with no provider, and the earlier version of this section, which said all six read back from a public gateway, was wrong.

**Writing a content address onchain commits you to hosting the bytes.** That is the transferable lesson, and it is the same shape as the read-gated-on-a-write-credential bug above: "it resolves on my machine" is not a property of a decentralized record.

One trap that would have silently broken that: Pinata's `pinJSONToIPFS` wraps a document as UnixFS and returns a **dag-pb** CID (`bafybei…`), while local mode addresses the raw block (`bafkrei…`). Same content, different CID — so enabling Pinata would have minted new addresses and orphaned every record already written. `pinFileToIPFS` with `cidVersion: 1` uses raw leaves and reproduces the local CID exactly, and `PinataBackend` now asserts that per pin rather than trusting it: if Pinata ever returns a CID we did not derive, the publish fails instead of writing an unverifiable address into ENS.

**The name and the token verify each other in both directions.** The ENS record asserts the Agentic ID; `MiniAppRegistry` on 0G Chain asserts the name; the token itself stores the name it was minted against. Resolving returns `mutuallyVerified: true` only when all three agree — checked against the chain, never assumed.

**And this is now on screen, not just in this file.** `/registry` opens with a Published strip that resolves five of the eight issued labels live through `GET /api/resolve/<label>` on every mount — the only hardcoded thing in it is the list of labels, because which subnames exist is a fact about the parent name rather than data. It predates the three names published later in this audit, so it is a sample, not the register; the table above is the full set. Each row renders `addr`, `contenthash` → whether the manifest bytes actually arrived, the ENSIP-25 `agent-registration` binding with its Agentic ID token linked to the 0G explorer, and the two-directional verification result. It colours a *missing* record as absent rather than as a failure, says "no addr record" instead of an address for `aave-health-guard`, and does not claim a public gateway holds bytes it fetched server-side. Until it existed, nothing in the product exercised `/api/resolve` at all, and the standards claim lived only in a README.

**Registering the parent on Sepolia does not work the documented way.** `ETHRegistrarController` is not an authorised controller there, so `register()` reverts while `available()` still returns true. Use `TestnetV1PremigrationRegistrar` (`0xdf60C561Ca35AD3C89D24BbA854654b1c3477078`) — free, one transaction, `data: []` — then note the name comes back **unwrapped**, so `NameWrapper.setSubnodeRecord` reverts with `Unauthorised` until you `setApprovalForAll` + `wrapETH2LD`. Transactions in [`contracts/deployments/ens-sepolia.json`](contracts/deployments/ens-sepolia.json).

---

## 0G ✅

**Contracts, 0G Galileo testnet (chain 16602):**

| Contract | Address |
|---|---|
| `AgenticId` (ERC-7857) | [`0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0`](https://chainscan-galileo.0g.ai/address/0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0) |
| `MiniAppRegistry` | [`0x093319DbD3c21b037Cb21199e468D3E15A748dA8`](https://chainscan-galileo.0g.ai/address/0x093319DbD3c21b037Cb21199e468D3E15A748dA8) |
| `AgenticIdVerifier` | [`0x708aE7041986B6AdB399f395d8f1b9f41034aaD3`](https://chainscan-galileo.0g.ai/address/0x708aE7041986B6AdB399f395d8f1b9f41034aaD3) |

**Inference.** Planning and UI composition run on 0G Private Computer (`router-api.0g.ai/v1`), model `0gm-1.0-35b-a3b`, pinned to **`verified` routing** — the router's default `Standard` mode explicitly spans unverified community channels, so `verify_tee` alone can return no attestation at all.

**Proof of inference is a chain, not a screenshot:**

```
TEE run (tee_verified: true) → request id
  → manifest.provenance.attestationRef   0g://f1ade7e8-e9ca-4fb2-b5c9-79cd400e3195
  → keccak256                            0xa651240d…52f1
  → MiniAppRegistry.attestationHash      ← same value, onchain, bound to the token and the name
```

Anyone can check that without trusting our UI.

**ERC-7857 — implemented, not shaped-alike.** We implement the V2 `eip-7857-draft` interface that 0G's own docs link to: `mint`/`transfer`/`clone`/`authorizeUsage`/`update`, AES-256-GCM metadata encryption with `dataHash = keccak256(ciphertext)`, ECDSA proofs the onchain verifier actually accepts, receiver binding, stale-metadata rejection, and single-use 48-byte nonces. The reference verifier ships two stubs (`verifyPreimage` returns true for any blob; the TEE check is a `// TODO`) and neither was copied. Full "real vs scoped" table: [`contracts/README.md`](contracts/README.md).

---

## Safety

Policy is enforced **at the signer, not in the prompt**. Every action passes the same gate whether a human clicked or a trigger fired:

```
mode autonomous? → target allowlisted? → ≤ maxPerTxUsd? → ≤ maxSpendUsd?
  → before expiresAt? → kill switch untripped? → sign → append to the trade log
```

Four signer modes behind one interface. In `smart-session` mode (ERC-7579 + Rhinestone Smart Sessions) the allowlist, expiry and lifetime cap are enforced **by the account itself**, so a compromised backend still cannot exceed them. `onchainEnforced` is the return value of a live `isSessionEnabled()` call — a fact read from the chain, never a constant.

**The per-constraint split is now rendered, not just specified.** `enforcementReport()` has always been the single author of "chain or server, per constraint" and for a while nothing displayed it, which left a panel printing caps with no enforcement site next to them — an invitation to assume the limits beside an address are enforced somewhere they are not. The autonomous app's enforcement block now renders it row by row straight from that function, verbatim, and the same block is returned by `POST /api/agency/register` and `GET /api/act`. In the running `session-eoa` mode every row reads `server`, `verifiedOnchain: false`, with the report's own note explaining that a compromised backend could exceed the limits. USD→token conversion and `requireConfirm` are server-side in *every* mode, and are said so rather than rounded up.

**Forking strips `identity`, `policy.wallet` and `provenance`.** A fork gets a fresh name, a fresh Agentic ID, and zero inherited spending authority. (With one process-wide session key, "a fresh wallet" means an address the fork does not inherit *from the manifest*; the signer is the same one — see [Not in scope](#not-in-scope). `aave-guard-fork` and `lineage-fallback-probe` both resolve `addr` to `0xedE65679…3fE12`, which is the honest reason the demo script no longer instructs anyone to show a fork's address differing from its parent's.)

**And a fork can now be published under its own name — that leg was missing.** `publishApp`'s only caller was the Studio's publish bar, so an app that arrived by forking had no route to a name: fork → refine → *publish under your own name* stopped one step short of the part that makes attribution mean anything. `publishExisting` in `web/src/lib/store.ts`, behind a confirm-gated panel on `/a/[name]`, closes it. Forking itself still publishes nothing, deliberately — a fork is an editable copy until you decide to name it.

**A trigger the runtime cannot evaluate now says so instead of reading as armed — and all ten seed triggers are now evaluable, where none were.** The condition grammar moved to `web/src/lib/agency/condition.ts`, which imports nothing, and gained `isConditionEvaluable` — the same grammar the evaluator uses, asked a different question. A condition naming a metric no standardized family exposes (`healthFactor`, per [Not in scope](#not-in-scope)) evaluates to `false`, which is the safe direction but reads identically to a trigger that is watching and simply has not fired. Applying that test to the seed apps found **zero of ten evaluable**: four were grammatically valid on impossible paths, five were unparseable prose, one was `null`. The six per-account intents ("watch **my** Aave position") were re-phrased to protocol-level premises the fan-out genuinely answers, and all ten now pass — verified by running `isConditionEvaluable` over `SEED_APPS`. One of the rewrites was also *pre-fired* (`bridge-outflow-watch` would have alerted on the first block it saw) and was re-armed with measured headroom; an alert that is true before anything happens is the same class of lie as a counter that increments itself.

**A fabricated ticker used to invent money, and it is gone.** A client-side interval made up a block number, a tx hash and a dollar amount every 4.2 seconds and wrote them into `stats.valueTransactedUsd` and `stats.spentUsd`, which the board and the registry presented as value moved. Deleted. `spentUsd` now comes from the server's `totalSpentUsd(appId)` — the same number the lifetime cap is metered against, so $0.00 is a measurement. `valueTransactedUsd` had no writer at all once the ticker went, so it is rendered nowhere and sorts nothing; a figure with no writer is worse than a missing one, because it looks like a measurement.

**159 tests** in the suite, **123 of them on the agency layer**, including every policy rejection path.

---

## Run it

```bash
cd web && pnpm install
cp .env.example .env.local     # every key is optional; each one upgrades one path
pnpm dev
```

With no keys at all it runs end to end on fixtures and a local mock. Each variable independently makes one path real — `GRAPH_API_KEY` for live data, `ZEROG_API_KEY` for attested inference, `ENS_REGISTRAR_PRIVATE_KEY` for resolvable names. Nothing silently pretends: the publish report returns a `warnings[]` naming every path still mocked.

```bash
cd contracts && forge test        # 13 tests
cd web && pnpm exec tsc --noEmit && pnpm dlx tsx src/lib/agency/all.test.ts   # 159 tests
```

Deploying to 0G Galileo needs `--priority-gas-price 2gwei`; the chain enforces a 2 gwei floor and rejects forge's default estimate outright.

---

## Not in scope

Named explicitly, because a vague scope claim is worse than a small one:

- **A real *swap* from a stream trigger.** A real transaction now lands (see below), but it is an `approve`, not a swap. A swap needs testnet WETH, an approval, and correct `exactInputSingle` params; `calldataFrom` also returns `0x` unless an action declares explicit `data`, so the seed apps' `derisk` action would send empty calldata to the router and revert. The signer, the gate and the transaction are real; the *swap* is not built.
- **Per-account positions.** The standardized fan-out reads protocol-level scalars, so a condition on `lending.totalValueLockedUSD` works and one on `healthFactor` does not — no standardized family exposes a single user's position in that query shape. Conditions naming `healthFactor` evaluate to `false`, which is the safe direction, but it is a real gap: see `web/src/lib/agency/enrich.ts`. **And "evaluates to false" looked identical to "watching, hasn't fired"** — the trigger list showed both the same way. `isConditionEvaluable` in `web/src/lib/agency/condition.ts` asks the same grammar the evaluator uses whether it *can* answer at all, so a trigger that fails closed is now marked inert rather than listed as armed.
- **0G Storage.** Encrypted agent memory goes to the configured content store, not to 0G Storage. The token commits to `keccak256(ciphertext)`, which is identical either way, so this is a transport swap.
- **`@atlas/kit` on npm.** The kit exists as `web/src/lib/{kit,contracts,agency,identity}` and the Studio imports it rather than reaching around it, but it is not extracted into a published package.
- **Creator earnings.** x402 pays the gateway for data (inbound, working). Paying creators needs our own facilitator and is display-only today.
- **IPFS pinning — for new publishes only.** ~~Done — pinned for real.~~ That claim was wrong and is corrected above. `IPFS_MODE=pinata` and `scripts/pin-backfill.ts --verify` pins 8 documents and reads all 8 back from ipfs.io, so anything published from here forward is retrievable by someone who is not us — **5 of the 8 issued subnames resolve their manifest off ipfs.io**. But **three point at bytes that no longer exist anywhere**: published under `IPFS_MODE=local` whose store was `web/.atlas/`, gitignored, and a CID is the hash of its bytes, so there is no regenerating them. Fixed going forward, not fixed retroactively.
- **Per-app wallets.** `AGENT_SESSION_PRIVATE_KEY` is process-wide, so **one session key signs for every mini app** — verified by registering two different apps and comparing: both answer `0xedE65679…3fE12`. Funding that address funds all of them; revoking it revokes all of them. Per-app isolation is the design in `prd.md` §4/§7 and it is not what runs, which matters because §8's argument that an ENS name is a safety primitive rests on the address being the app's *own*. The autonomous panel says this in the app rather than leaving a per-app page to imply otherwise.
- **A shared, browsable registry.** The board and the registry are **per-browser `localStorage`** (`atlas.board`) plus the seed snapshot. Publishing writes real ENS records and a real Agentic ID, but the grid a visitor browses is their own, not a directory of every published mini app. Fork counts and ratings are local for the same reason.
- **Seed social metrics — and the reviews.** All 16 seed apps run on live data (see above), but `runs`, `forks`, thumbs and **the review text** are seeded texture. The reviews are the part worth naming: they used to narrate specific transactions, amounts and timestamps that never happened, attributed to named `.eth` handles — a fabricated *event log*, not a fabricated score. They now read as opinions about features that genuinely exist ("the kill switch sitting one press away", "policy strip is always on screen"), and the handles are still invented. Inventing a fan-out would be a data claim; inventing a fork count is set dressing; inventing a transaction was neither, which is why it went.

---

## Attribution

- Built at ETHGlobal Lisbon 2026. Event work begins at [`3871e59`](../../commit/3871e59) (2026-07-24 10:57); the four commits before it (`533b79f`, `e6ce265`, `845a550`, `7056c3b`, 2026-07-22) are a pre-existing landing page and predate the event.
- **AI tools:** built with Claude Code under a spec-driven workflow. ETHGlobal permits this with attribution provided the planning artifacts are committed — [`prd.md`](prd.md) is that artifact, and its revision history (Appendix C) records why each major decision changed, including the ones that reversed an earlier call. Design work is specced the same way in [`docs/superpowers/specs/`](docs/superpowers/specs/) and [`plans/`](docs/superpowers/plans/).
- **Open source used:** A2UI (Apache-2.0), Messari standardized subgraph schemas, Rhinestone Smart Sessions / module-sdk, viem, Next.js, Foundry, OpenZeppelin.

## Team

**Fabian Ferno** — solo · [github.com/fabianferno](https://github.com/fabianferno) · [fabianferno.com](https://fabianferno.com) · hello@fabianferno.com · Telegram [@fabianferno](https://t.me/fabianferno) · X [@fabianferno](https://x.com/fabianferno)
