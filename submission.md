# Atlas — ETHGlobal Lisbon 2026 submission

Copy each block below into the matching field on the ETHGlobal submission form.

- **Repo:** https://github.com/fabianferno/atlas
- **Live demo:** https://atlas-mini-apps.vercel.app
- **MCP endpoint:** `https://atlas-mini-apps.vercel.app/api/mcp`
- **Permalink base (pinned commit):** https://github.com/fabianferno/atlas/tree/003cb559cdd9de3edef598b27c65fdaeda2031f3
- **Video:** _TODO — 2–4 min, required by The Graph and 0G (0G wants under 3 min)._

---

## Short description (max 100 characters)

```
Describe an onchain app. Get an agent with a UI, a wallet, and an ENS name.
```

_75 characters._

---

## Description

Atlas turns a question about onchain activity into a **mini app**: a live interface generated from real Graph data, that can also hold a wallet and act inside a policy you set.

A mini app is not a dashboard. It watches live data, renders whatever interface fits the *shape* of that data, and — if you let it — takes an action when a condition breaks. Every published one gets an ENS name, an address, and an onchain identity, so a stranger can verify what it is before funding it.

The Graph had everything it needed to be the consumer analytics layer of crypto — more chains, more protocols, real time, decentralized — but it only ever shipped for developers. Atlas is the consumer surface it never built. Because the interface is generated per question, an app exists the moment you ask for it, including for the long tail nobody would ever hand-build.

### The pipeline: a question becomes an app

![Atlas pipeline: question to mini app](https://raw.githubusercontent.com/fabianferno/atlas/main/docs/diagrams/atlas-pipeline.png)

The important move is at the **Resolver**: it picks a *schema family* (`lending-cdp`, `dex-amm-extended`, `bridge`, `perp-futures`, …), never a single subgraph id. One question then fires the same query shape at every healthy deployment of that family across every network we have one on, and merges the results. A question nobody anticipated still resolves, because the schema is shared even when the protocol is new to us.

A representative run:

```
18 sources queried → 13 healthy, 5 dead skipped by health check → 74 rows in 2.8s → $0.0014
```

That ~28% dead rate is real, which is why sources are health-checked at generation time and frozen into the app's manifest. All **16 of 16** seed mini apps in the registry are built by this exact pipeline — resolve, health-check, fan out, compose — not written by hand. Re-measuring every one of them costs **$0.0084** total.

### Three tiers, and depth encodes agency

```
analytics  ──────────────  monitoring  ──────────────  autonomous
read-only                  watches + alerts            holds a wallet, acts
sits flush                 lifts, live-blue rim        stands proud, orange rim
```

The tier is not decoration. An autonomous app always renders its policy strip, its kill switch and its trade log — you can see what a thing is allowed to do by looking at it. The shipped theme is skeuomorphic (Dieter Rams / Braun), and a single `data-skin` attribute re-expresses the whole system in a different material with **no component changes, no catalog changes, no round trip to the agent**. That theme swap is the proof that the generated UI is data, not code.

### The agent cannot inject code

The model emits [A2UI](https://github.com/google/A2UI) v0.9.1 — a declarative document plus a data model. The client holds the approved component catalog and the document may only *reference* components by name. For a generated interface that can move money, that containment is the entire safety argument.

Form follows data, not keywords: a bounded ratio becomes a gauge, a ranked categorical becomes a leaderboard. The composer reads the shape of what came back, not words in the prompt.

### When it acts, it acts under a gate it cannot talk its way past

![Atlas autonomous loop: Substreams tick to policy gate to signed transaction](https://raw.githubusercontent.com/fabianferno/atlas/main/docs/diagrams/atlas-agency-loop.png)

Polling a subgraph means an autonomous guard is up to five minutes late. For an app that displays, that's a preference. For one that spends, it's a correctness bug — so triggers run off a real Substreams gRPC subscription, one tick per block, each carrying the cursor the stream resumes from.

Four properties the design turns on:

- **A reorg is not an event.** `blockUndoSignal` is journalled and rewinds; it never becomes a trigger signal. The right answer to "that block didn't happen" is to stop, not to act.
- **A replayed block does not trade twice.** Substreams replays from a cursor by design after a disconnect, so ticks are keyed `<block>:<hash>` and the ledger dedupes.
- **The cursor is committed after the action, not before.** At-least-once with an idempotent key beats at-most-once when the effect is a trade.
- **The metric is re-read server-side, per block**, from the app's own health-checked sources. A client that could post `healthFactor` could make an autonomous app trade on demand.

The whole chain runs to a real transaction:

```
Arbitrum block 487540654 (real, off arb-one.streamingfast.io)
  → Substreams tick → trigger "healthFactor < 1.15" fired
  → POLICY OK  approve $25 → 0x036CbD53…  (allowlisted, under the $50/tx cap)
  → session key signed → tx 0x5a44e9d5…9d78
  → status success, block 44604106, 1 Approval event
  → allowance 25 USDC, read back off chain
```

[View it on Basescan.](https://sepolia.basescan.org/tx/0x5a44e9d5d79446afd042928a76d405459242688f479d7257e23143d6190c9d78) It is an `approve`, and it is described as one — granting the router an allowance is genuinely the first step of a swap, but it is not a swap, so `approve` is its own action kind rather than a swap the manifest lies about.

### A name you can verify before you fund it

![Atlas identity: ENS subname, Agentic ID and registry verifying each other](https://raw.githubusercontent.com/fabianferno/atlas/main/docs/diagrams/atlas-identity.png)

`atlas-apps.eth` is registered and wrapped on Sepolia and issues a subname per mini app. The ENS record asserts the Agentic ID; the registry on 0G Chain asserts the name; the ERC-7857 token stores the name it was minted against. `mutuallyVerified` is true only when all three agree, and it is **read off the chain on every resolve, never assumed**.

Eight subnames are issued; three mutually verify today, and the table in the README says exactly why each of the other five does not — four were published under a previous parent name and their tokens still assert it, and the name↔token binding is deliberately immutable, so renaming a parent cannot drag old tokens along. One (`aave-guard-fork`) is left broken on purpose as the artifact that exposed a swallowed revert in the fork-registration path.

The contenthash resolves without us: read `contenthash` off Sepolia, fetch the CID from ipfs.io, parse the manifest. Five of the eight issued names do that today. Three point at bytes that no longer exist anywhere, because they were published while the content store was a gitignored local directory — a CID is the hash of its bytes, so that is unrecoverable rather than pending, and it's stated as such rather than quietly dropped.

### Also shipped

- **An MCP server** at `/api/mcp` — the same URL every published app writes into its ENS `agent-endpoint[mcp]` record. Five read-only tools: `list_schemas`, `plan_mini_app`, `query_graph`, `build_mini_app`, `resolve_mini_app`. Nothing there signs or spends, because an MCP endpoint is a URL strangers point agents at.
- **A `SKILL.md`** at the repo root so an agent can decide *whether The Graph covers this at all* before trying.
- **Policy enforced at the signer, not in the prompt.** Four signer modes behind one interface; in `smart-session` mode (ERC-7579 + Rhinestone Smart Sessions) the allowlist, expiry and lifetime cap are enforced by the account itself. `onchainEnforced` is the return value of a live `isSessionEnabled()` call, never a constant, and the running `session-eoa` mode says plainly that every row is server-enforced.
- **159 tests**, 123 of them on the agency layer, including every policy rejection path.

### What is deliberately not built

Named explicitly, because a vague scope claim is worse than a small one: a real *swap* from a stream trigger (the transaction is real, the swap is not built); per-account positions (the standardized fan-out reads protocol-level scalars, so `healthFactor` conditions evaluate false and are marked **inert** rather than shown as armed); per-app wallets (one session key currently signs for every app, and the autonomous panel says so); a shared browsable registry (the board is per-browser `localStorage` plus the measured seed snapshot); x402 receipts (implemented, never exercised — no key set); and Subgraph MCP consumption (the env var exists, nothing calls it, so it is a gap, not an integration).

The README marks every claim that was verified by reading it back from a chain or a gateway, and strikes through two claims that an audit found overstated rather than deleting them.

---

## How it's made

**Stack.** Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4 with shadcn/ui and Base UI, deployed on Vercel. Contracts are Solidity + Foundry on 0G Galileo (chain 16602). Chain access is viem end to end; Privy handles the human wallet; `permissionless` + `@rhinestone/module-sdk` handle the smart-account signer modes. Zod validates every boundary. No database — state is `localStorage`, IPFS via Pinata, a generated JSON snapshot, and the chains themselves.

**The Graph is the load-bearing data source, three products deep.**

*Standardized Subgraphs.* [`web/src/lib/kit/sources.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/sources.ts) is a 96-entry registry — 86 verified deployment IDs across 11 schema families and 4 networks (Arbitrum One, Optimism, Base, Mainnet). [`resolver.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/resolver.ts) resolves a question to *families*, not ids; [`fanout.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/fanout.ts) fires one query shape at every healthy deployment and merges. Health checks live in [`sources.ts#L316`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/sources.ts#L316) with a 90s TTL and a 2s timeout, because a quarter of standardized deployments are dead at any moment and a demo that hides that is lying.

*Substreams.* [`web/src/lib/kit/substreams.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/substreams.ts) is a real gRPC subscription (`@substreams/core` over Connect/HTTP-2) against `arb-one.streamingfast.io`, with a cursor store, `<block>:<hash>` dedupe keys, and `blockUndoSignal` handling. [`scripts/substreams-verify.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/scripts/substreams-verify.ts) verifies it **both directions** — a breach run that fires and a control run over healthy blocks that fires nothing, because a harness that can only print ✅ proves nothing:

```
breach:  blocks 487508073 → 487508075 in 1.5s → TRIGGER fired → POLICY OK → journaled
control: blocks 487509578 → 487509580, healthy throughout → 0 firings
```

*x402.* [`gateway.ts#L233`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/gateway.ts#L233) implements keyless per-query payment by hand rather than via the client package: POST unpaid, parse the real 402 challenge, answer it with an EIP-3009 signature at the published ~$0.01/query. This is the mechanism that makes forking coherent — a forked app pays with its own wallet instead of inheriting a shared API key. `X402_PRIVATE_KEY` is unset, so no query has actually been paid this way, and the submission says so rather than implying a receipt exists.

**0G does the inference and the identity.** Planning and UI composition run on 0G Private Computer (`router-api.0g.ai/v1`, model `0gm-1.0-35b-a3b`) pinned to `verified` routing in [`inference.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/inference.ts) — the router's default `Standard` mode spans unverified community channels, where `verify_tee` can return no attestation at all. Proof of inference is a chain, not a screenshot:

```
TEE run (tee_verified: true) → request id
  → manifest.provenance.attestationRef   0g://f1ade7e8-e9ca-4fb2-b5c9-79cd400e3195
  → keccak256                            0xa651240d…52f1
  → MiniAppRegistry.attestationHash      ← same value, onchain, bound to token and name
```

[`contracts/src/AgenticId.sol`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/contracts/src/AgenticId.sol) implements the ERC-7857 V2 `eip-7857-draft` interface properly rather than shaped-alike: AES-256-GCM metadata encryption with `dataHash = keccak256(ciphertext)`, ECDSA proofs the onchain verifier actually accepts, receiver binding, stale-metadata rejection, single-use 48-byte nonces. The reference verifier ships two stubs (`verifyPreimage` returns true for any blob; the TEE check is a `// TODO`) and neither was copied.

**ENS is the identity layer, not a label.** [`web/src/lib/identity/ens.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/ens.ts) writes `addr`, `contenthash`, ENSIP-26 `agent-context` and `agent-endpoint[web|mcp]`, and the ENSIP-25 `agent-registration[<erc7930>][<agentId>]` binding, with the ERC-7930 chain-address encoding verified against ENSIP-25's own worked example. [`agentic-id.ts#L1014`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/agentic-id.ts#L1014) reads the 0G side of the binding back and `mutuallyVerified` is the conjunction of all three assertions.

### The hacky parts worth naming

- **ENS on Sepolia does not work the documented way.** `ETHRegistrarController` is not an authorised controller there, so `register()` reverts while `available()` still returns `true` — a silent dead end. The path that works is `TestnetV1PremigrationRegistrar` (`0xdf60C561Ca35AD3C89D24BbA854654b1c3477078`), free, one transaction, `data: []`. Then the name comes back **unwrapped**, so `NameWrapper.setSubnodeRecord` reverts `Unauthorised` until you `setApprovalForAll` + `wrapETH2LD`. That sequence is the single largest time sink of the build and it is written down in [`contracts/deployments/ens-sepolia.json`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/contracts/deployments/ens-sepolia.json) so the next team doesn't lose the same day.
- **viem's `getEnsResolver` returns a non-resolver on Sepolia.** For one of our names it answers `0x422484c2…`, where every `addr`/`text`/`contenthash` call reverts; the registry's own `resolver(node)` answers `0xE99638b4…`, which holds the records. We ask the registry first and keep the UniversalResolver path second for wildcard/CCIP names.
- **Reading ENS was gated on a write credential.** `resolveRegistrarMode()` degrades to `mock` without a registrar private key, and `readRecords` skipped the resolver entirely in mock mode — so the public deployment resolved *nothing* while working perfectly on the machine holding the key. Reading needs an RPC and nothing else. Same shape as the IPFS bug below: "it resolves on my machine" is not a property of a decentralized record.
- **Pinata returns a different CID for the same bytes.** `pinJSONToIPFS` wraps a document as UnixFS and returns a **dag-pb** CID (`bafybei…`) while local mode addresses the raw block (`bafkrei…`). Enabling Pinata naively would have minted new addresses and orphaned every `contenthash` already written to Sepolia. `pinFileToIPFS` with `cidVersion: 1` reproduces the local CID exactly, and [`ipfs.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/ipfs.ts) now **asserts** it per pin: if Pinata ever returns a CID we did not derive, the publish fails rather than writing an unverifiable address onchain.
- **A swallowed revert made every published fork unverifiable.** `MiniAppRegistry.registerFork` reverts `ParentUnknown` when the parent was never published — correct, so lineage can't be faked. But the publish path passed a parent key whenever a manifest carried `forkedFrom`, and every bundled app is unpublished. So: ENS written, token minted, `registerFork` reverts, caught as a generic "registry write failed" — and the 0G half of the mutual proof silently missing. Fixed by asking the contract's own `get(parentKey)` first and registering **without** the lineage link when the parent is genuinely absent, surfacing `lineageSkipped` in the publish warnings. Losing attribution is recoverable from the manifest; losing the registration costs the safety primitive a stranger uses before funding a name.
- **Live data broke four things fixtures had hidden.** Placeholder GraphQL in seed manifests was being treated as planner intent and degraded every single-schema app (3 rows where the real query returns 36). `nft-marketplace@2.1.0` denominates in ETH — `cumulativeTradeVolumeUSD` does not exist on `Marketplace`, so asking for it is a hard error that zeroed the whole family. A broken SushiSwap price feed put `$72384163253T` at the top of a leaderboard because the shape detector re-sorted and undid the suspect ranking. And `isActive: true` — the normal state of every healthy market — rendered "Is Active has fired" in an alert banner on a wallet-holding app. [`shapes.test.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/shapes.test.ts) pins all four.
- **A fabricated ticker used to invent money, and it is gone.** A client-side interval made up a block number, a tx hash and a dollar amount every 4.2 seconds and wrote them into stats the board presented as value moved. Deleted. `spentUsd` now comes from the same server-side number the lifetime cap is metered against, so `$0.00` is a measurement. `valueTransactedUsd` had no writer once the ticker went, so it renders nowhere — a figure with no writer is worse than a missing one, because it looks like a measurement.
- **Seed triggers that could never fire were being drawn as armed.** The condition grammar was extracted into [`condition.ts`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/agency/condition.ts) (it imports nothing) and gained `isConditionEvaluable` — the same grammar the evaluator uses, asked a different question. Applying it to the seed apps found **zero of ten evaluable**: four grammatically valid on impossible paths, five unparseable prose, one `null`. All ten were rewritten to protocol-level premises the fan-out genuinely answers, and one that would have alerted on the first block it saw was re-armed with measured headroom.
- **Deploying to 0G Galileo needs `--priority-gas-price 2gwei`.** The chain enforces a 2 gwei floor and rejects forge's default estimate outright.
- **`pnpm test` runs the typecheck first, on purpose.** `tsx` strips types and runs; it never type-checks, so the suite alone goes green on code that does not compile.

---

## Tech Stack

### Ethereum developer tools

- viem
- Foundry
- OpenZeppelin
- The Graph (Subgraphs, Substreams, hosted gateway)
- IPFS / Pinata
- ENS (NameWrapper, PublicResolver, ENSIP-25 / ENSIP-26)
- Privy
- Rhinestone (Smart Sessions, module-sdk)
- permissionless.js (ERC-4337 / ERC-7579)
- x402
- Vercel

_(wagmi is present as a transitive peer of Privy but nothing in `src/` calls it — not claiming it.)_

### Blockchain networks

**Written to:**
- Ethereum Sepolia — ENS parent + subname records
- 0G Galileo testnet (chain 16602) — `AgenticId`, `MiniAppRegistry`, `AgenticIdVerifier`
- Base Sepolia — the autonomous app's signed transactions

**Read from (live Graph data):**
- Arbitrum One
- Optimism
- Base
- Ethereum Mainnet

Base mainnet USDC is the settlement asset the x402 path is coded against (implemented, not exercised).

### Programming languages

- TypeScript
- Solidity
- GraphQL
- JavaScript
- CSS

### Web frameworks

- Next.js 16 (App Router)
- React 19
- Tailwind CSS v4
- shadcn/ui
- Base UI (`@base-ui/react`)

### Databases

**None.** There is no database and it is a deliberate answer, not an omission. State lives in four places: per-browser `localStorage` (`atlas.board`), IPFS via Pinata (manifests, content-addressed), a generated JSON snapshot committed to the repo (`web/src/lib/kit/seed-live.generated.json`, re-measured by a script), and the chains themselves (ENS records, Agentic ID tokens, the 0G registry, the trade log).

### Design tools

- Excalidraw — the three architecture diagrams in this submission ([`docs/diagrams/`](https://github.com/fabianferno/atlas/tree/main/docs/diagrams), rendered from mermaid sources, editable `.excalidraw` scenes committed alongside)
- Google Fonts

The visual system itself was specced in markdown and written by hand in CSS — see [`docs/superpowers/specs/2026-07-25-skeuomorphic-theme-design.md`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/docs/superpowers/specs/2026-07-25-skeuomorphic-theme-design.md) — with no Figma stage.

### Other technologies / libraries / frameworks

- **A2UI v0.9.1** (Google, Apache-2.0) — the declarative UI protocol the agent emits
- **Model Context Protocol (MCP)** — stateless Streamable HTTP server at `/api/mcp`
- **Agent SKILL** (`SKILL.md`) — the agent-facing entry point
- **Substreams** (`@substreams/core`, Connect / HTTP-2 gRPC)
- **Messari Standardized Subgraph schemas**
- **ERC-7857** (Agentic ID / iNFT, V2 draft interface)
- **ERC-7579 + ERC-4337** (smart accounts, session keys)
- **EIP-3009** (transfer-with-authorization, the x402 signature)
- **ERC-7930** (chain-scoped addresses, for the ENSIP-25 record key)
- **ENSIP-25 / ENSIP-26** (agent registration + agent text records)
- **0G Compute / Private Computer** (TEE-attested inference)
- **OpenAI SDK** (as the transport to the 0G router, and as the non-attested fallback)
- **Zod v4**, **graphql-request**, **cobe** (the globe), **lucide-react**, **openai** (SDK, pointed at the 0G router)
- **pnpm**, **tsx**

---

## Describe how AI tools were used in your project

ChatGPT was used to generate the initial boilerplate code with the client and server. Claude Code was used to implement the smart contract logic.

Beyond that, the whole build ran under a spec-driven workflow with Claude Code: the plan is committed as [`prd.md`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/prd.md) and its Appendix C records why each major decision changed, including the ones that reversed an earlier call. Design work is specced the same way under [`docs/superpowers/specs/`](https://github.com/fabianferno/atlas/tree/003cb559cdd9de3edef598b27c65fdaeda2031f3/docs/superpowers/specs) and [`docs/superpowers/plans/`](https://github.com/fabianferno/atlas/tree/003cb559cdd9de3edef598b27c65fdaeda2031f3/docs/superpowers/plans). ETHGlobal permits AI-assisted work with attribution provided the planning artifacts are committed; those are the artifacts.

Claude Code also ran the audit that produced the corrections visible in the README — several of the "not in scope" entries exist because a claim was checked against a chain or a public gateway and did not hold. The three architecture diagrams in this submission were generated from mermaid sources and rendered to Excalidraw scenes by a local tooling skill.

Separately, and this is a *product* use of AI rather than a build-time one: the planner and the UI composer are model calls at runtime, executed on 0G Private Computer inside a TEE, with the attestation reference hashed and written onchain.

---

## Sponsor prizes

Three partner prizes selected: **The Graph, 0G, ENS.** Each has one set of four fields below — paste the fenced block into the matching field.

Event-track note (separate from partner prizes): this is a **Classic ("From Scratch")** submission. Event work begins at commit [`3871e59`](https://github.com/fabianferno/atlas/commit/3871e59) (2026-07-24 10:57); four commits dated 2026-07-22 are a pre-existing landing page, disclosed rather than buried, and nothing in the submitted product path descends from them. Nothing Continuity-only is claimed anywhere.

---

### The Graph — $15,000

**How are you using this Protocol / API?**

```
Atlas turns a plain-English question into a live mini app, and The Graph is the
only data source underneath it. Three Graph products are composed: Standardized
Subgraphs (a 96-entry registry, 86 verified deployment IDs across 11 schema
families and 4 networks), Substreams (a real gRPC subscription on
arb-one.streamingfast.io driving per-block trigger evaluation), and x402
(keyless per-query payment implemented against the live 402 challenge). The key
move is that we resolve a *schema family* rather than a subgraph id, so one
question fans out at every healthy deployment across two or more families and
two or more networks and merges the results — a question nobody anticipated
still resolves. A representative run: 18 sources queried, 13 healthy, 5 dead
skipped by health check, 74 rows in 2.8s for $0.0014. All 16 mini apps in the
registry are built by that pipeline on live data, not by hand, and we also ship
the reusable pieces: an MCP server with 5 tools at /api/mcp and an agent
SKILL.md, both open source.

Endpoints and tools used: gateway.thegraph.com (API key) and the x402 route
/api/x402/subgraphs/id/<id>; arb-one.streamingfast.io (map_block_meta, one tick
per block, cursor-resumed). Representative deployment IDs:
4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf  lending-cdp@3.1.0       arbitrum-one  aave-v3
5MjRndNWGhqvNX7chUYLQDnvEgc8DaH8eisEkcJt71SR  lending-cdp@3.1.0       arbitrum-one  compound-v3
3RWFxWNstn4nP3dXiDfKi9GgBoHx7xzc7APkXs1MLEgi  lending-cdp@3.1.0       optimism      aave-v3
Dpk4Gen22wxQ3Laojf7DR2me8wGzjaHwjsKAsLf2rCFV  lending-cdp@3.1.0       arbitrum-one  dforce
3m97d2dJ2pXwPFuiHrm8T37V9TCoAHBpMqRwdguyUZXF  lending-cdp@3.1.0       arbitrum-one  abracadabra
HnV3fhwsWfmQGdD2AeGzqvRVTDBqnMH74jCsDVq1DXYP  lending-cdp@3.1.0       arbitrum-one  rari-fuse
DQqb7FiQ1joLhESkAwvAYiuXhwfz4zf6qHmbt7stnec8  lending-cdp@3.1.0       optimism      sonne-finance
FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX  dex-amm-extended@4.0.1  arbitrum-one  uniswap-v3
EgnS9YE1avupkvCNj9fHnJxppfEmNNywYJtghqiu2pd9  dex-amm-extended@4.0.1  optimism      uniswap-v3
3oHCddbQGTi42kPZBwyGzD2JzZR33zK2MwXtxAerNJy2  dex-amm-extended@4.0.1  arbitrum-one  sushiswap-v3
The full 86 are in web/src/lib/kit/sources.ts.
```

**Link to the line of code where the tech is used**

```
https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/fanout.ts#L348
```

That is the fan-out itself — what makes this composition rather than a single query. If a second link is wanted, use the literal gateway call: [`gateway.ts#L156-L166`](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/gateway.ts#L156-L166).

Other load-bearing files, in case a judge wants them: [x402 challenge + EIP-3009 signature](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/gateway.ts#L233) · [Substreams subscription, cursor and undo handling](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/substreams.ts) · [the 86-deployment registry](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/sources.ts#L90) · [health check before spend](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/sources.ts#L316) · [MCP server](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/app/api/mcp/route.ts) · [SKILL.md](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/SKILL.md)

**How easy is it to use the API / Protocol? (1–10)**

```
7
```

Querying the gateway is as easy as it gets — an API key and a GraphQL POST — and x402 was a genuinely small protocol to implement by hand. The three points come off for things that are missing rather than broken: no machine-readable index of standardized deployments, no health signal on them, and no per-family record of which fields actually exist.

**Additional feedback for the Sponsor**

```
Standardized Subgraphs need a machine-readable index, and it needs a health
signal. Assembling 96 entries by hand (family, version, network, protocol,
deployment id) was the most fragile artifact in our repo, and ~28% of those
deployments are dead at any given moment with nothing in Explorer telling you
which. We had to build health-checking with a 2s timeout and a 90s TTL before
the product could be honest about what answered. This is the single highest-
leverage thing you could ship for AI tooling: every agent that wants cross-
protocol reach is currently rebuilding this same file.

The schema is standardized; the field set is not. nft-marketplace@2.1.0
denominates in ETH — cumulativeTradeVolumeUSD does not exist on Marketplace, and
asking for it is a hard error that returns zero rows for the entire family. We
found four such deviations the hard way, each costing a debugging cycle where
the symptom (empty result) pointed nowhere near the cause. Publishing "fields
actually present, per family, per version" would remove that whole class of bug.

Standardization guarantees shape, not sanity. SushiSwap on Arbitrum reports a
TVL of 7.2e22; Camelot V2 reports 4.1e17. 14 of 74 rows tripped our plausibility
check on a routine two-family fan-out, and the default sort put the worst one at
the top of the leaderboard. We now flag anything over $1T as _suspect, rank it
last and never drop it — but every consumer is independently inventing this
heuristic. A convention, or a quality flag in the index, would be worth a lot.

The Substreams free tier's 2 concurrent streams is below the demo threshold. A
second subscribing app hits resource_exhausted immediately, which means an app
that subscribes cannot be demonstrated alongside a verification script during a
hackathon. We render the refusal honestly instead of faking success, but 3-4
concurrent streams would have let us demo the thing we built.

x402 is well documented and pleasant to implement — the 402 challenge plus one
EIP-3009 signature is a small, clean protocol. What's missing is a testnet
facilitator. We implemented the entire path and could not exercise it, because
exercising it means spending real USDC on Base mainnet. A testnet mode would
convert a lot of "implemented" into "verified" across a hackathon.

Subgraph MCP is the gap we couldn't close, and it's a shape mismatch rather than
a quality problem. We point GRAPH_MCP_URL at subgraphs.mcp.thegraph.com/sse and
never call it, because resolving a *schema* and resolving a *subgraph* are
different questions and the MCP answers the second. A schema-level tool
(list_standard_schemas -> deployments per network, with health) would have made
our entire sources.ts unnecessary, which is the best possible outcome for us.
```

---

### 0G — $15,000

**How are you using this Protocol / API?**

```
0G does the inference and the identity. Every query plan and every generated UI
is produced by a model call on 0G Private Computer (router-api.0g.ai/v1, model
0gm-1.0-35b-a3b), pinned to `verified` routing so an attestation actually
exists. Each published mini app is minted as an Agentic ID — a real ERC-7857 V2
implementation, not a shaped-alike one — and registered in our MiniAppRegistry
on 0G Galileo, both deployed by us. Proof of inference is a chain rather than a
screenshot: the TEE run returns a request id, that becomes
manifest.provenance.attestationRef (0g://f1ade7e8-e9ca-4fb2-b5c9-79cd400e3195),
its keccak256 (0xa651240d…52f1) is written onchain as
MiniAppRegistry.attestationHash and bound to both the token and the ENS name, so
anyone can verify the app was planned by attested compute without trusting our
UI.

Contracts deployed on 0G Galileo (chain 16602):
  AgenticId (ERC-7857)  0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0
  MiniAppRegistry       0x093319DbD3c21b037Cb21199e468D3E15A748dA8
  AgenticIdVerifier     0x708aE7041986B6AdB399f395d8f1b9f41034aaD3
Minted Agentic ID, viewable on the explorer: token 10 on AgenticId, which backs
atlas-market-guard.atlas-apps.eth. Token 13 is a published fork that also
mutually verifies.

0G features used: 0G Private Computer (TEE-sealed inference, verified routing),
0G Chain (Galileo), Agentic ID (ERC-7857 V2 draft interface). 0G Storage is not
used — encrypted agent memory goes to the configured content store, and the
token commits to keccak256(ciphertext) either way, so that is a transport swap
rather than a missing property.
```

Explorer links, for pasting where the form wants a URL: [AgenticId](https://chainscan-galileo.0g.ai/address/0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0) · [MiniAppRegistry](https://chainscan-galileo.0g.ai/address/0x093319DbD3c21b037Cb21199e468D3E15A748dA8) · [AgenticIdVerifier](https://chainscan-galileo.0g.ai/address/0x708aE7041986B6AdB399f395d8f1b9f41034aaD3) · [minted token 10](https://chainscan-galileo.0g.ai/token/0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0?a=10) · [fork registration tx](https://chainscan-galileo.0g.ai/tx/0x02f178c0717ac8898691630175ff0f78a42d2e598eb4ed2f06dd282e3c2885b1)

**Link to the line of code where the tech is used**

```
https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/inference.ts#L235-L245
```

That is where the 0G Private Computer client is built and `verified` trust mode is pinned. Others: [why `verified` is the default](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/inference.ts#L54) · [attestation lifted into provenance](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/kit/inference.ts#L343) · [the ERC-7857 contract](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/contracts/src/AgenticId.sol) · [mint + register](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/agentic-id.ts#L884) · [mutual verification read back off chain](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/agentic-id.ts#L1014)

**How easy is it to use the API / Protocol? (1–10)**

```
5
```

The OpenAI-compatible router makes inference nearly free to adopt — that part alone is a 10. The rating comes down because the defaults are wrong for the thing the prize asks you to prove: `Standard` trust mode can return no attestation at all, the Galileo gas floor rejects Foundry's default estimate with an unhelpful error, and the ERC-7857 reference verifier ships stubs that look like an implementation.

**Additional feedback for the Sponsor**

```
Make `verified` routing the loud default in the docs. The router's Standard trust
mode spans unverified community channels, which means verify_tee can come back
with no attestation at all — and a team would happily ship believing they had TEE
inference. We pin `verified` explicitly. For a prize whose qualification is
literally "proof of 0G Compute", this is the single most important sentence in
your documentation, and right now it is easy to miss entirely.

Put --priority-gas-price 2gwei in the Galileo quickstart. The chain enforces a
2 gwei floor and rejects forge's default estimate outright, with an error that
does not point at the fix. Every Foundry team hits this in their first ten
minutes, and it reads like a broken RPC rather than a policy.

The ERC-7857 reference verifier ships stubs, and that is a hazard rather than a
gap. verifyPreimage returns true for any blob and the TEE check is a // TODO.
Someone will deploy that, demo it, and believe the proof means something — the
current shape reads as a reference implementation. Either make the stubs revert
by default with a clear message, or ship them under a Mock… name.

Pin a canonical ERC-7857 interface and publish test vectors. We implemented the
V2 eip-7857-draft interface your docs link to, including AES-256-GCM with
dataHash = keccak256(ciphertext), receiver binding, stale-metadata rejection and
single-use 48-byte nonces — but we had to decide several of those semantics
ourselves. A conformance suite would let teams *prove* they implement 7857
instead of asserting it, and would separate real implementations from
shaped-alike ones at judging time, which is presumably what you want.

The Private Computer / Compute naming split costs time under pressure.
pc.0g.ai, router-api.0g.ai, "0G Compute" and "Private Computer" took longer to
disambiguate than they should have. One page mapping product name -> endpoint ->
what attestation you get would fix it.
```

---

### ENS — $5,000

**How are you using this Protocol / API?**

```
An ENS subname is the thing you verify before you fund an autonomous agent, and
that is the whole integration rather than a label on it. atlas-apps.eth is
registered and wrapped on Sepolia and issues a subname per mini app, carrying
addr (the address a stranger would fund), contenthash (the manifest saying what
the agent is allowed to do), and both draft agent ENSIPs implemented properly:
ENSIP-26 agent-context and agent-endpoint[web|mcp], and the ENSIP-25
agent-registration[<erc7930>][<agentId>] binding, with the ERC-7930 encoding
verified against ENSIP-25's own worked example. The name and the onchain
identity verify each other in both directions — the ENS record asserts the
Agentic ID, the registry on 0G asserts the name, and the token stores the name
it was minted against — so resolving returns mutuallyVerified: true only when
all three agree, read off chain on every call and never assumed. Resolving a
name also hands you the MCP endpoint to talk to, so an agent that knows the name
knows how to call the app, not just where to send money. Nothing is hard-coded:
GET /api/resolve/<label> hits Sepolia on every call, and the registry page
renders a *missing* record as absent rather than inventing one.

Eight subnames issued under atlas-apps.eth. Demo name:
atlas-market-guard.atlas-apps.eth. The contenthash path is verifiable with our
server not in it at all: read contenthash off Sepolia, fetch the CID from
ipfs.io, parse the bytes.
```

**Link to the line of code where the tech is used**

```
https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/ens.ts#L1214
```

That is the subname issuance plus the resolver multicall that writes every record, in the order that actually works on Sepolia. Others: [ENSIP-25 record key builder, ERC-7930 encoded](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/ens.ts#L145) · [ENSIP-26 `agent-endpoint[<protocol>]` key](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/ens.ts#L164) · [where agent records are assembled per app](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/lib/identity/ens.ts#L465) · [live resolve endpoint](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/web/src/app/api/resolve/%5Bname%5D/route.ts) · [the Sepolia registration path that actually works](https://github.com/fabianferno/atlas/blob/003cb559cdd9de3edef598b27c65fdaeda2031f3/contracts/deployments/ens-sepolia.json)

**How easy is it to use the API / Protocol? (1–10)**

```
4
```

Mainnet-shaped ENS is clean and the record model is exactly right for agent identity. The rating is low because the *testnet* path is broken relative to the docs: `register()` reverts on Sepolia while `available()` returns true, the name comes back unwrapped so subname issuance reverts `Unauthorised`, and viem's `getEnsResolver` returns a resolver whose every call reverts. Each presents as "your integration is wrong" rather than "the testnet differs", and together they were the single largest time sink of the build.

**Additional feedback for the Sponsor**

```
Sepolia registration does not work the documented way, and it fails silently.
ETHRegistrarController is not an authorised controller on Sepolia, so register()
reverts while available() still returns true — the two most obvious calls
disagree and nothing tells you why. The path that works is
TestnetV1PremigrationRegistrar (0xdf60C561Ca35AD3C89D24BbA854654b1c3477078),
free, one transaction, data: []. This cost us more time than anything else in
the build. One paragraph in the testnet docs would fix it permanently for
everyone.

The name then comes back unwrapped, so NameWrapper.setSubnodeRecord reverts
Unauthorised until you setApprovalForAll + wrapETH2LD. Anyone following the
subname-issuance guide on Sepolia hits this immediately after the previous
problem, so the two compound into a day.

viem's getEnsResolver returns a non-resolver on Sepolia. For one of our names it
answers 0x422484c2…, where every addr / text / contenthash call reverts, while
the registry's own resolver(node) answers 0xE99638b4…, which holds the records.
We ask the registry first and keep UniversalResolver second for wildcard/CCIP
names. This deserves either a viem fix or a documented caveat, because the
failure mode looks exactly like "your records were never written" — we nearly
re-published a name over it.

ENSIP-25 should fix the agentId encoding. The spec says registry-defined
*string* and does not settle decimal vs hex; every published example (the
ENSIP's own 167, the ENS blog's 42) is decimal, so decimal is the de-facto
convention. Say so normatively — otherwise two implementations write different
record keys for the same token and neither of them is wrong, which defeats the
point of a standard key.

ENSIP-26's agent-context has no recommended body format. That is defensible for
a draft, but it means every agent consuming the record writes a bespoke parser.
We used YAML. Even a non-normative "here is a shape that works" example would
make these records machine-readable across projects, which is the entire reason
to put agent capability in a text record rather than in a README.

Document reading and writing as separately gated. Our own bug — read paths
degraded to mock without a *write* key, so the public deployment resolved
nothing while every dev machine worked perfectly — was our fault, but it is a
shape that will repeat. One line in the integration guide ("you need only an RPC
to read; you need a signer only to write") would prevent a whole class of
works-on-my-machine ENS integrations from shipping broken.
```

---

## Pending before submission closes

- Record the demo video (2–4 min for The Graph, under 3 min for 0G).
