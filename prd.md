# Graph Mini Apps — Product Requirements Document

> *Ask a question about onchain data. Get back a live app with a name you can hand to anyone.*

**Event:** ETHGlobal Lisbon 2026 · Fri Jul 24 – Sun Jul 26 · **submissions close Sun 09:00 WEST**
**Targets:** The Graph (3 tracks) · ENS (2 tracks) · 0G (1 track) — 3 partner selections, 6 tracks, **$24,000 addressable**

**Contents**

1. [Thesis](#1-thesis)
2. [User & job-to-be-done](#2-user--job-to-be-done)
3. [The product — three primitives](#3-the-product--three-primitives)
4. [Non-goals](#4-non-goals--killed-with-reasons)
5. [The Mini App Manifest](#5-the-mini-app-manifest)
6. [ENS binding](#6-ens-binding--the-real-spec)
7. [0G — provenance, not privacy](#7-0g--provenance-not-privacy)
8. [Verified technical ground truth](#8-verified-technical-ground-truth)
9. [Architecture](#9-architecture)
10. [Track compliance matrix](#10-track-compliance-matrix)
11. [The 36-hour plan](#11-the-36-hour-plan)
12. [Demo video script](#12-demo-video--250)
13. [Risk register](#13-risk-register)
14. [Open questions for Friday](#14-open-questions--resolve-at-booths-friday-morning)
- [Appendix A — A2UI component catalog](#appendix-a--a2ui-component-catalog)
- [Appendix B — submission templates](#appendix-b--submission-templates)
- [Appendix C — revision notes](#appendix-c--revision-notes-what-changed-from-v1)
- [Appendix D — sources](#appendix-d--sources)

---

# 1. Thesis

**The mini app is an ENS name.**

Everything else in this product is downstream of that sentence. Read it as a product decision, not a feature.

**One-liner:** *Ask a question about onchain data. Get back a live app with a name you can hand to anyone — `top-dexs.graphminis.eth`.*

**Why generated UI, specifically.** The Graph indexes 15,000+ subgraphs across 10 standardized schema families. The space of *questions* is unbounded; the space of pre-built dashboards is not. Every fixed dashboard is a developer's guess about what you'd want to ask, frozen at build time. Below some threshold of demand, no one will ever build the dashboard for your question — so today your options are "write GraphQL yourself" or "read a wall of JSON in a chat window." Generated UI collapses the cost of the long tail to zero: the agent picks the visual form that fits *this* answer, because it just saw the data's shape.

**Why it has to be an artifact, not a chat message.** A chat answer dies in the scrollback. Dune's real insight was never "dashboards" — it was the **fork button**: the query became a durable, addressable, remixable object with attribution. That's what turns a tool into an ecosystem. Here, the addressable object is an ENS name, which means the artifact is portable across every wallet, app, and *agent* on Ethereum without us running a registry.

**The three-sentence pitch:**
> Blockchain data is indexed and queryable, but the UI for any given question doesn't exist until someone builds it. Graph Mini Apps generates the interface on the fly from live Graph data, then freezes it into an ENS name anyone — human or agent — can resolve and re-run. Ask once, and the answer becomes infrastructure.

---

# 2. User & job-to-be-done

**Primary user:** the DeFi analyst / researcher / protocol contributor who can read a chart but doesn't want to write GraphQL — and who needs to *share* what they found.

**Job:** *"When I have a question about how protocols are performing, I want an answer I can look at and pass to my team, without asking an engineer or writing a query."*

**What they do today:**

| Today | Cost |
|---|---|
| Search Dune for an existing dashboard | Only exists for popular questions; usually stale or subtly wrong |
| Write GraphQL against a subgraph | Needs to know which of 15,000 subgraphs, and its schema |
| Ask ChatGPT | Gets a plausible number with no provenance, no live data, no artifact |
| Ask an engineer on the team | Hours-to-days latency, doesn't scale |

**Secondary user (this is what unlocks Graph Track 1):** the *agent builder* who wants their agent to return a UI instead of a paragraph. They install our npm package / MCP server and get Graph-grounded generative UI for free.

**Anti-user:** anyone who wants a drag-and-drop dashboard builder. Not us. Say so in the README.

---

# 3. The product — three primitives

Scope discipline: three things, each of which independently satisfies a track's hard requirement. **If a feature doesn't ladder to one of these three, it doesn't get built this weekend.**

## P1 — `@graphminis/kit` (the reusable tooling) → Graph Track 1

A published, installable package that turns "a question" into "a rendered UI over live Graph data." Ships as:

- **npm library** — `resolveSchema()`, `planQuery()`, `fanOut()`, `toA2UI()`
- **MCP server** — exposes those as tools so *any* agent (Claude, Cursor, ChatGPT) gets Graph-grounded generative UI
- **`SKILL.md`** — one-prompt install for Claude Code

Track 1 explicitly demands *"reusable tooling/infrastructure, not a single end-user app."* This is that. It must be genuinely separable — a stranger must be able to `npm i` it and use it without our website. **Publish it to npm for real.** An unpublished package reads as an assertion; a published one is evidence.

## P2 — The generator (the end-user app) → Graph Track 2 + Track 3

Natural language → intent → **standardized schema** resolution → **parallel fan-out across ≥2 schema families** → A2UI JSON → live rendered app.

Track 3's bar is *"compose two or more Graph products, OR build meaningfully on a standardized schema."* We do both: standardized schemas (Lending/CDP v3.1.0 + DEX AMM v1.3.2, minimum) **and** two Graph products (Gateway subgraph queries + the x402 gateway, with Subgraph MCP as a third). Track 3 also warns: *"simply querying one Subgraph with no composition does not qualify"* — so the cross-schema fan-out is not a nice-to-have, it's the qualification. **Build it first.**

## P3 — Manifest ⟷ ENS resolution (the artifact) → ENS Track 1 + Track 2

A generated app serializes to a **Mini App Manifest** (§5), which is pinned and bound to an ENS subname via **real ENSIP-25/26 records**. Resolving the name rehydrates the app against *live* data — not a cached screenshot.

The ENS demo money shot: **paste the ENS name into a completely different agent and watch it reconstruct the same app.** That is discoverability that isn't cosmetic, and it's the exact thing ENS Track 2 asks for.

---

# 4. Non-goals — killed, with reasons

Say these out loud in the README. Explicit non-goals read as judgment; silent omissions read as incompleteness.

| Killed | Why |
|---|---|
| Ratings, reviews, star scores | Zero judging points, real build cost |
| Fork/remix UI | The manifest already makes forking possible; a UI for it is polish. Mention in "what's next" |
| Versioning system | `appVersion` field in the manifest. Done. No machinery |
| Substreams streaming / ClickHouse sink | Not achievable in 36h. Substreams MCP *discovery* is a cheap stretch if time allows |
| Agent memory / personalization | Nice, unscored, cut |
| Multi-agent fleets, subname trees | Cool slide, no demo. Cut |
| "Private portfolio analysis" on 0G | Unverifiable on stage, wrong use of TEE. Replaced — see §7 |
| Creator micropayments / x402 revenue routing | x402 pays the gateway, not creators. Would need our own facilitator |
| Mobile responsive | Demo is on a laptop |
| Multi-chain (>2) | One chain done right beats five done shakily |
| Dual/split submissions | Rules make it pointless; splitting effort makes both weak |

---

# 5. The Mini App Manifest

The single most important artifact in the system. Everything — registry, ENS, forking, provenance — is a function of this object. Keep it small enough to fit in an ENS text record's worth of pointer plus one IPFS fetch.

```jsonc
{
  "spec": "graphmini/1",
  "name": "top-dexs",
  "title": "Top DEXs by Volume — Arbitrum, 7d",
  "question": "Show me the top 5 DEXs by volume on Arbitrum this week",

  "plan": {
    "schemas": ["dex-amm@1.3.2", "lending-cdp@3.1.0"],
    "network": "arbitrum-one",
    "sources": [
      { "subgraphId": "<id>", "schema": "dex-amm@1.3.2", "healthCheckedAt": "2026-07-25T14:02:00Z" }
    ],
    "query": "query($since:Int!){ ... }",
    "variables": { "since": 1753372800 },
    "transport": "gateway"          // "gateway" | "x402" | "mcp"
  },

  "ui": { /* A2UI v0.9.1 document — flat component list + data model */ },

  "provenance": {
    "model": "deepseek-chat-v3",
    "compute": "0g-private-computer",
    "attestationRef": "0g://<tx-or-storage-ref>",
    "generatedAt": "2026-07-25T14:02:11Z"
  },

  "author": "fabianferno.eth",
  "appVersion": "1.0.0",
  "forkedFrom": null
}
```

**Design notes**

- `plan` is separated from `ui` on purpose: re-running the plan gives fresh data, so a resolved name is *live*, not a screenshot. **This is what makes it a mini app rather than a permalink.**
- `sources` is resolved at generation time and **health-checked**. Given ~28% of standardized deployments are dead at any moment (§13), freezing a verified-live source into the manifest is a correctness requirement, not an optimization.
- `transport` lets the same manifest run keyed (gateway) or keyless (x402). The x402 path is what makes the "any agent, no signup" claim true.

---

# 6. ENS binding — the real spec

Use the standards. This is the difference between winning ENS and getting a polite nod.

## Namespace

Register a 2LD you control (`graphminis.eth`, or whatever's free) and issue subnames beneath it. Three viable mechanisms, in order of speed:

| Mechanism | Speed | Tradeoff |
|---|---|---|
| **Offchain via CCIP-Read** ([NameStone](https://namestone.com/), Namespace, JustaName, or [gskril/ens-offchain-registrar](https://github.com/gskril/ens-offchain-registrar)) | Fastest — REST API, gasless | Records live in a DB behind CCIP-Read. Legitimate and widely used, but a judge may probe "how onchain is this?" — have the answer ready |
| **[Durin](https://github.com/resolverworks/durin)** — L2 subname registry | Medium | Subnames are ERC-721s on an L2, records onchain. **Bonus: gives you a deployed contract address** |
| **[ensdomains/hackathon-registrar](https://github.com/ensdomains/hackathon-registrar)** | Fast | Purpose-built for exactly this situation |

> **Do this Friday, first thing:** walk to the ENS booth and ask which mechanism they want to see. It's a 5-minute conversation that de-risks a $3,000 track, and they'll tell you what impresses them. Do not guess.

## Records written per mini app

For `top-dexs.graphminis.eth`:

```
contenthash                      → ipfs://<manifest CID>
agent-context                    → YAML: what this app answers, which schemas,
                                   which network, how to re-run it
agent-endpoint[web]              → https://graphminis.xyz/a/top-dexs
agent-endpoint[mcp]              → https://mcp.graphminis.xyz/sse
agent-registration[<erc7930-registry>][<agentId>]  → "1"     # ENSIP-25
url, description, avatar         → standard records, for wallet/profile display
```

## Why this earns each ENS track

- **Track 1 (Most Creative):** the record set isn't identity — it's an *executable artifact*. `contenthash` + `agent-context` together mean an ENS name is a runnable program over live blockchain data. "Go beyond name → address" is the literal ask; a name that resolves to a self-describing, re-runnable data app is a genuinely new use of the record layer.
- **Track 2 (AI Agents):** `agent-endpoint[mcp]` means any MCP-speaking agent discovers how to *talk to* the app, and `agent-context` tells it what the app is for — no docs, no integration. ENSIP-25 `agent-registration` proves the generator agent's registry entry is really bound to this name. Both directions of discovery, both using the actual standards.

**Demo requirement:** must be functional with **no hard-coded values**, and **someone must physically present at the ENS booth Sunday morning.** Put a name on that job now.

---

# 7. 0G — provenance, not privacy

**The reframe.** The obvious move is "private portfolio analysis." Wrong instrument. On a demo stage, privacy is an unverifiable claim — you cannot *show* an audience that something stayed secret.

**Better:** *agent-generated UI over financial data has a trust problem.* If an agent invents the chart, how do you know the chart isn't lying? Run **the generation step itself** inside 0G's sealed inference, and attach the attestation to the manifest. Now every mini app carries a cryptographic receipt: *this UI was produced by this model, from this query plan, at this time.* Verifiable provenance for generated interfaces. That's a real, novel, defensible claim — and unlike privacy, you can point at it on screen.

**Integration cost: about ten minutes.** [0G Private Computer](https://0g.ai/blog/0g-private-computer) exposes an **OpenAI-compatible API** at `https://router-api.0g.ai/v1` — existing OpenAI SDK code works after a one-line base-URL change. TEE-backed (Intel TDX + H100/H200). Models include DeepSeek Chat V3, Qwen3.6 Plus, GLM-5-FP8.

```ts
const openai = new OpenAI({
  baseURL: "https://router-api.0g.ai/v1",
  apiKey: process.env.ZEROG_API_KEY,
});
// same call shape you already have
```

**Contract requirement.** 0G demands **contract deployment addresses**. Ship the smallest honest contract on 0G Chain: a `MiniAppRegistry` mapping `keccak(ensName) → (manifestCID, attestationHash, author)`. ~40 lines. This simultaneously:

- satisfies 0G's deployment-address requirement,
- gives you a real registry address for the ENSIP-25 `agent-registration[<registry>][<agentId>]` key,
- and closes the loop: **onchain registry entry ⟷ ENS name, mutually verifying.**

That last point is the strongest technical idea available to you this weekend. It makes ENS and 0G reinforce each other instead of sitting in separate slides — which is exactly what a judge means by "coherent" versus "prize-chasing."

**Track choice:** submit to **0G Track 1 (Best AI Product, $6,000)**. Track 2 wants frameworks — but `@graphminis/kit` is already committed to Graph Track 1, and 0G explicitly routes end-user products to Track 1. Don't fight it.

---

# 8. Verified technical ground truth

Checked against live docs on 2026-07-24. Put this in the README — it's also the "which subgraphs/endpoints/tools did you use" answer that Graph Track 2 requires.

## The Graph

```
Subgraph MCP    https://subgraphs.mcp.thegraph.com/sse
                Authorization: Bearer <GATEWAY_API_KEY>   (via npx mcp-remote)
                15,000+ subgraphs; schema inspection, keyword/contract search, 30d volume

Gateway         https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>

x402 (keyless)  POST https://gateway.thegraph.com/api/x402/subgraphs/id/<SUBGRAPH_ID>
                Base mainnet USDC  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
                Base Sepolia USDC  0x036CbD53842c5426634e7929541eC2318f3dCF7e
                npm @graphprotocol/client-x402 · npx graphclient-x402
                ~$0.01/query, no signup
```

MCP client config:

```json
{
  "mcpServers": {
    "subgraph-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "--header", "Authorization:${AUTH_HEADER}",
               "https://subgraphs.mcp.thegraph.com/sse"],
      "env": { "AUTH_HEADER": "Bearer YOUR_GATEWAY_API_KEY" }
    }
  }
}
```

## Standardized schemas

Messari, via The Graph. **Pick two — don't survey all ten.**

`Generic 3.0.0` · **`DEX AMM 1.3.2`** · `DEX AMM Extended 4.0.1` · `DEX Aggregator 1.0.2` · **`Lending/CDP 3.1.0`** · `Yield Aggregator 1.3.1` · `NFT Marketplace 2.1.0` · `Network 1.2.0` · `Bridge 1.2.0` · `Perp Futures 1.3.4` · `Options 1.3.2`

Query methods supported: real-time entity queries, time-travel queries for historical snapshots, and time-series snapshot entities.

## A2UI

Apache-2.0, **v0.9.1 stable** (v1.0 RC). **React renderer is stable**, at `/renderers/react` in [google/A2UI](https://github.com/google/A2UI). Format is a flat component list with ID references plus a data model — designed for incremental LLM updates.

Declarative JSON, never executable code; the client holds the approved component catalog (Appendix A). **That security property is a good 15 seconds of your demo** — the agent cannot inject code into your app, only select from components you approved.

## 0G

```
Private Computer   https://router-api.0g.ai/v1     (OpenAI-compatible)
                   TEE: Intel TDX + NVIDIA H100/H200
                   Models: DeepSeek Chat V3, Qwen3.6 Plus, GLM-5-FP8
                   Web UI / CLI / TypeScript SDK · pc.0g.ai
0G Chain           EVM-compatible — deploy MiniAppRegistry here
```

## Prior art worth building on

All open source, all legitimate to extend:

- [`PaulieB14/graph-lending-mcp`](https://glama.ai/mcp/servers/PaulieB14/graph-lending-mcp) — fans one query across 90 lending deployments, 19 tools. Reference implementation for your fan-out.
- [`PaulieB14/subgraph-registry`](https://github.com/PaulieB14/subgraph-registry) — semantic classification of all 15K subgraphs with **reliability scoring**. This is your schema resolver *and* your dead-endpoint defense, pre-built.
- [`graphops/subgraph-mcp`](https://github.com/graphops/subgraph-mcp) — the MCP server implementation.
- [`ensdomains/ens-cli`](https://github.com/ensdomains/ens-cli) — agent-native ENS CLI.

> ETHGlobal permits open-source starter kits and building additively on existing tools — but **document precisely what was pre-existing and what you built**, in the README and in git history. This is where sloppy teams get disqualified.

---

# 9. Architecture

```
                    "top 5 DEXs by volume on Arbitrum this week"
                                     │
                    ┌────────────────▼────────────────┐
                    │  PLANNER                        │   0G Private Computer
                    │  intent → schema family + net   │   (TEE, attested)
                    │  → query plan                   │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │  RESOLVER                       │   subgraph-registry
                    │  schema → live deployments      │   + health check
                    │  DROP DEAD ENDPOINTS  ← critical│   (~28% are dead)
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │  FAN-OUT (parallel)             │
                    │  DEX AMM 1.3.2 ─┐               │   gateway | x402 | mcp
                    │  Lending 3.1.0 ─┴→ merge        │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │  COMPOSER → A2UI JSON           │   0G (attested)
                    │  picks component form from      │
                    │  the shape of the data          │
                    └────────────────┬────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
       A2UI React render      Manifest → IPFS        MiniAppRegistry
       (live app)             ↓                      (0G Chain)
                              ENS subname                  │
                              contenthash                  │
                              agent-context         ◄──────┘
                              agent-endpoint[mcp]    ENSIP-25 mutual
                              agent-registration[…]  verification
```

**The whole system is `@graphminis/kit`.** The website is a thin client over it. That separation is what lets one repo credibly claim both "reusable tooling" (T1) and "end-user app" (T2) — but only if it's *actually* separable. Enforce it: **the web app imports the package, never reaches around it.**

## Repo layout

```
packages/kit/          # npm: @graphminis/kit — planner, resolver, fan-out, composer
packages/mcp/          # MCP server wrapping kit
apps/web/              # Next.js — generator UI + /a/[name] resolver
contracts/             # MiniAppRegistry.sol (0G Chain)
SKILL.md               # one-prompt install
README.md              # data sources, what's pre-existing, AI-tool attribution
architecture.png       # required-ish for 0G, cheap to produce
prd.md                 # this file — ETHGlobal wants spec artifacts committed
prd-v1-original.md     # archived first draft (shows planning evolution)
```

---

# 10. Track compliance matrix

Every row is a hard qualification requirement, not a nice-to-have. **Anything unchecked at Sunday 07:00 is a disqualification, not a missing feature.**

| # | Requirement | Track | Owner | Status |
|---|---|---|---|---|
| 1 | Live Graph data, no mocks — **anywhere in the demo** | Graph 1/2/3 | | ☐ |
| 2 | Reusable tooling published + installable (npm/MCP/SKILL) | Graph 1 | | ☐ |
| 3 | Open source, clear README **or** SKILL.md | Graph 1 | | ☐ |
| 4 | AI component that reasons over the data | Graph 2 | | ☐ |
| 5 | Names which subgraphs/endpoints/tools were used | Graph 2 | | ☐ |
| 6 | ≥2 Graph products **or** meaningful standardized-schema use (we do both) | Graph 3 | | ☐ |
| 7 | Standards leverage **visible in the demo**, not just the README | Graph 3 | | ☐ |
| 8 | ENS functional, **no hard-coded values** | ENS 1/2 | | ☐ |
| 9 | ENS improves identity/discoverability non-cosmetically | ENS 2 | | ☐ |
| 10 | **Present at ENS booth, Sunday morning, in person** | ENS 1/2 | **assign a name** | ☐ |
| 11 | Proof of 0G Compute / Private Computer inference | 0G 1 | | ☐ |
| 12 | **Contract deployment addresses** | 0G 1 | | ☐ |
| 13 | Demo video **under 3:00** (satisfies 0G *and* Graph's 2–4) | all | | ☐ |
| 14 | Live demo link | 0G 1 | | ☐ |
| 15 | Team names + Telegram/X | 0G 1 | | ☐ |
| 16 | **Proper git history** — small, frequent, descriptive commits | ETHGlobal | everyone | ☐ |
| 17 | AI-tool usage attributed; specs/prompts committed | ETHGlobal | | ☐ |
| 18 | Select exactly 3 partner prizes: Graph, ENS, 0G | submission | | ☐ |

**Addressable:** $15,000 (Graph, 3 tracks) + $3,000 (ENS 1+2) + $6,000 (0G T1) = **$24,000 across 6 tracks, 3 selections.**

> Submission rules: up to **3 partner prizes**; a partner with multiple tracks counts as **1 selection**. Graph + ENS + 0G uses all three and covers six tracks. There is no reason to split the repo — and splitting effort in 36h makes both halves weak.

---

# 11. The 36-hour plan

Ordered by *risk*, not by architecture. Everything that can kill you is front-loaded; everything cosmetic is last and cuttable.

## Friday 10:00–13:00 — de-risk before building

- ENS booth: confirm the subname mechanism they want to see. Register the 2LD **now** — propagation is not instant.
- Graph API key from Studio; verify a real standardized-schema query returns data on Arbitrum.
- 0G: get a Private Computer key, make one `/v1/chat/completions` call succeed.
- Spike the A2UI React renderer with a hand-written JSON doc. **If A2UI's renderer fights you for more than 2 hours, fall back to a fixed component catalog driven by the same JSON schema** — the product thesis survives; only the library changes.
- `git commit` after each of these. **Start the history habit immediately.**

## Friday 13:00–20:00 — the qualifying spine

- Resolver + health check + parallel fan-out across DEX AMM and Lending/CDP. *This is Track 3's qualification — build it before anything pretty.*
- Planner: NL → query plan, via 0G. Ten hardcoded intent patterns beat a general parser; ship those first and only generalize if time allows.
- End-to-end: type a question → see real numbers in a terminal. Ugly is fine.

## Friday 20:00 – Saturday 02:00 — it becomes a product

- Composer: query result → A2UI JSON → rendered app.
- Manifest serialization.
- Next.js generator page.
- **Checkpoint 02:00: does a question produce a rendered live app?** If not, cut the ENS *write* path to read-only and protect the core.

## Saturday 09:00–15:00 — the artifact layer

- Pin manifest → IPFS; write ENS records (`contenthash`, `agent-context`, `agent-endpoint[web|mcp]`).
- `/a/[name]` route: resolve ENS → fetch manifest → **re-run the plan live** → render.
- Deploy `MiniAppRegistry` to 0G Chain; **record the address** (requirement #12).
- Write `agent-registration[…]` back to ENS, closing the ENSIP-25 loop.

## Saturday 15:00–20:00 — the tooling claim

- Extract `@graphminis/kit`, **publish to npm for real.**
- MCP server + `SKILL.md`.
- Prove the money shot: a *different* agent resolves the ENS name and reconstructs the app.

## Saturday 20:00 – Sunday 02:00 — ship the story

- Record the video. **Budget three hours; it always takes three hours.**
- README with data sources, AI attribution, pre-existing-work disclosure.
- Architecture diagram.
- Generate 5–6 good mini apps so the site isn't empty on stage.

## Sunday 02:00–08:00 — freeze, buffer, submit

- **Feature freeze at 02:00.** After that: only demo-path bugs.
- Submit by **08:00**, one hour early. Not 08:55.
- Someone sleeps enough to present at the ENS booth. That person is **not** the same person doing the 02:00 bug fixes.

---

# 12. Demo video — 2:50

Satisfies 0G's <3:00 **and** Graph's 2–4:00. One cut for everything — don't make three videos.

```
0:00–0:20  Problem, concretely.
           "There are 15,000 subgraphs. There is no dashboard for your question,
            and there never will be — nobody builds UI for the long tail."

0:20–1:00  THE CORE. Type: "compare lending TVL and DEX volume on Arbitrum this week."
           Show the fan-out live: two standardized schemas, parallel, dead
           endpoints skipped. A UI assembles itself — chart form chosen from the
           data's shape.                                    ← Graph T2 + T3

1:00–1:20  "The agent didn't write code. A2UI is declarative — it can only pick
            from components we approved. It cannot inject anything."
                                                            ← technical execution

1:20–1:45  Click 'Name this app'. It becomes lending-vs-dex.graphminis.eth.
           Show the real records: contenthash, agent-context, agent-endpoint[mcp].
                                                            ← ENS T1

1:45–2:15  MONEY SHOT. Switch to a different agent — plain Claude, our MCP server,
           nothing else. Paste the ENS name. It resolves, reads agent-context,
           re-runs the plan, and renders the same app with fresh data.
           "The name is the app. Any agent can run it."     ← ENS T2

2:15–2:35  Open the provenance panel: the UI was generated inside 0G's sealed
           inference, attested, and the registry entry lives at <0G address>,
           which is what the ENS name verifies against.     ← 0G T1

2:35–2:50  npm i @graphminis/kit — one install, any agent gets this.
           "Ask once. The answer becomes infrastructure."    ← Graph T1
```

**Notes:** the money shot at 1:45 is the whole video — rehearse it until it's boring. Have a **pre-recorded fallback clip** of the live query in case the venue wifi dies during recording; it will.

---

# 13. Risk register

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| **Dead standardized subgraph mid-demo** — 90 deployments, ~65 live at any moment (~28% down) | **High** | Fatal | Health-check before every fan-out; skip dead sources; pre-verify demo queries 30 min before recording; keep one known-good subgraph pinned |
| A2UI React renderer immature / undocumented | Med | High | 2-hour timebox, then fall back to a fixed component catalog over the same JSON. Thesis survives |
| ENS subname issuance eats a day | Med | High | Booth conversation Friday morning; offchain CCIP-Read as the fast path |
| 0G Private Computer key/quota delay | Low | Med | OpenAI-compatible — a base-URL env var swaps it out. Build against OpenAI, flip to 0G, prove the flip on camera |
| Venue wifi dies during recording | **High** | High | Record the core flow early Saturday, not Sunday. Keep a fallback clip |
| Git history looks AI-generated / one big commit | Med | **Fatal** | Commit every 20–30 min with real messages, starting now. Existing history ("test", "Iniit", "commmit current") is already a liability |
| Team burns Saturday on a registry/browse UI | Med | High | It's in §4 non-goals. Point at it when someone starts building it |
| Nobody makes the ENS booth Sunday | Low | High | Assign a name **today**, protect their sleep Saturday night |
| "Isn't this just Dune?" from a judge | Med | Med | Rehearsed answer: Dune requires you to write SQL and a human to build the dashboard. Here the question is the interface, the artifact is portable via ENS, and any agent can re-run it. Dune's queries can't be resolved by an agent that's never seen Dune |

---

# 14. Open questions — resolve at booths Friday morning

1. **ENS:** which subname mechanism do you want to see — offchain CCIP-Read, Durin on L2, or hackathon-registrar? *(5 min, de-risks $3,000)*
2. **ENS:** does an ENS name resolving to a re-runnable data app read as "creative use," or do you want something else in Track 1?
3. **The Graph:** which standardized-schema deployments are reliably live on Arbitrum *right now*? They know. This directly attacks the top risk.
4. **The Graph:** does building on `graph-lending-mcp` / `subgraph-registry` count as additive, or do you want it from scratch? (Track 1 says extending existing tools is welcome if clearly additive — get it confirmed.)
5. **0G:** does an OpenAI-compatible Private Computer call satisfy "proof of 0G Compute," or do they want an on-chain attestation artifact?
6. **0G:** is a minimal registry contract sufficient for the deployment-address requirement?

---

# Appendix A — A2UI component catalog

A2UI requires the **client** to hold a catalog of approved components; the agent may only reference them by name. That's the security property, and it's also your scope fence — the catalog is finite, so the composer's output space is finite.

**Ship six.** Not more. Each maps to a data shape the planner can detect.

| Component | Data shape that triggers it | Notes |
|---|---|---|
| `metric_card` | single scalar (+ optional delta) | "Total TVL on Arbitrum" |
| `bar_chart` | categorical × one metric | Ranking/comparison — the workhorse |
| `time_series` | timestamped × one-or-more metrics | "over time" questions |
| `leaderboard` | categorical, ranked, with a metric | Top-N — the single most common question shape |
| `data_table` | rows × arbitrary columns | The fallback when nothing else fits |
| `comparison_grid` | ≥2 entities × shared metrics | **The cross-schema shot** — this is what renders the Track 3 demo |

Deliberately deferred (say so in the README): OHLCV candles, wallet balance cards, protocol revenue breakdowns, alert banners, Sankey/flow diagrams.

**Composer rule:** the component is chosen from the *shape of the returned data*, not from keywords in the question. That is the defensible version of "generative UI" — and it's the answer to "couldn't you just have a chart?"

---

# Appendix B — submission templates

## README.md skeleton

```markdown
# Graph Mini Apps

Ask a question about onchain data. Get back a live app with an ENS name
anyone — human or agent — can resolve and re-run.

**Live demo:** <url>   **Video:** <url>   **npm:** @graphminis/kit

## What it does
[3 sentences from §1]

## How it uses The Graph
- Standardized Subgraphs — DEX AMM 1.3.2, Lending/CDP 3.1.0 (Arbitrum)
- Gateway:      https://gateway.thegraph.com/api/<key>/subgraphs/id/<id>
- x402 gateway: POST /api/x402/subgraphs/id/<id>  (keyless, USDC on Base)
- Subgraph MCP: https://subgraphs.mcp.thegraph.com/sse
- Exact subgraph IDs queried: <list them — Track 2 requires this>

## ENS
- Namespace: graphminis.eth, subnames per mini app
- Records: contenthash · agent-context · agent-endpoint[web|mcp] (ENSIP-26)
           agent-registration[registry][agentId] (ENSIP-25)
- Mechanism: <offchain CCIP-Read | Durin L2 | hackathon-registrar>

## 0G
- Private Computer (router-api.0g.ai/v1) generates the UI inside a TEE
- MiniAppRegistry deployed on 0G Chain: 0x<ADDRESS>
- Attestation reference stored in each manifest

## Setup
1. …

## What is NOT in scope
[§4 — state this explicitly; it reads as judgment]

## Pre-existing work / attribution
- Built during ETHGlobal Lisbon 2026, from scratch, starting <commit>
- Open-source components used: A2UI (Apache-2.0), subgraph-registry, …
- AI tools: Claude Code used for <what>; specs in prd.md, prd-v1-original.md

## Team
Name · Telegram · X
```

## SKILL.md skeleton

```markdown
# Graph Mini Apps

Give any agent the ability to answer onchain-data questions with a
rendered UI instead of a paragraph.

## Prerequisites
- The Graph gateway API key (thegraph.com/studio) — or none, via x402
- Node 18+

## Install
npm i @graphminis/kit
# or add the MCP server:
{ "mcpServers": { "graphminis": { ... } } }

## Use
import { plan, fanOut, toA2UI } from '@graphminis/kit'
const p  = await plan("compare lending TVL and DEX volume on Arbitrum, 7d")
const d  = await fanOut(p)          // parallel, health-checked
const ui = await toA2UI(d)          // A2UI v0.9.1 document

## Publish as an ENS-addressable mini app
await publish(ui, { name: 'lending-vs-dex' })
// → lending-vs-dex.graphminis.eth

## Customization
- Component catalog: packages/kit/src/catalog.ts
- Schema resolution: packages/kit/src/resolver.ts
```

---

# Appendix C — revision notes (what changed from v1)

Kept for the record; [`prd-v1-original.md`](./prd-v1-original.md) is the archived first draft. ETHGlobal asks for planning artifacts in the repo, so the evolution is an asset, not clutter.

**Factual corrections:**

| v1 claim | Reality |
|---|---|
| ENS text records `app/prompt`, `app/version`, `app/schema` | Invented. ENSIP-26 defines `agent-context` and `agent-endpoint[<protocol>]`; ENSIP-25 defines `agent-registration[<registry>][<agentId>]` |
| Mini apps get `*.graph.eth` subnames | You don't own `graph.eth`. Needs your own 2LD + issuance mechanism |
| "A2UI framework (as specified by sponsor)" | **A2UI is not a sponsor at this event.** Google Apache-2.0 OSS. Zero sponsor points — budget it as cost, not credit |
| x402 lets mini app authors "earn per query" | x402 pays The Graph's gateway. It does not route revenue to third parties |
| Substreams → ClickHouse for live dashboards | Not in 36h. Substreams SKILLs are Claude Code *plugins*, not a deployable runtime |
| Standardized subgraphs are a stable base | ~28% of deployments are dead at any moment. Now the #1 risk |

**Structural changes:**

- **ENS promoted from bonus to thesis.** It's what makes this an artifact rather than a chat reply — and what makes ENS non-cosmetic.
- **0G repointed from privacy to provenance.** Privacy is unverifiable on stage; provenance is visible.
- **Registry killed.** Browse/rate/review/version was real cost for zero judging points.
- **Scope cut from 7 layers to 3 primitives**, each mapping to a track's hard requirement.
- **Submission options B and C deleted.** Rules give 3 partner selections; Graph + ENS + 0G covers 6 tracks with one repo. Splitting is strictly worse.
- **Added:** compliance matrix, risk register, hour-by-hour plan, 2:50 video script that satisfies both Graph and 0G (v1's 3:30 script failed 0G's <3:00 rule).

---

# Appendix D — sources

Verified 2026-07-24.

- [ENSIP-25 — AI Agent Registry ENS Name Verification](https://docs.ens.domains/ensip/25/)
- [ENSIP-26 — Agent Text Records](https://docs.ens.domains/ensip/26/)
- [ENS subname docs](https://docs.ens.domains/web/subdomains/) · [ens-cli](https://github.com/ensdomains/ens-cli) · [hackathon-registrar](https://github.com/ensdomains/hackathon-registrar) · [Durin](https://github.com/resolverworks/durin) · [NameStone](https://namestone.com/)
- [The Graph — AI overview](https://thegraph.com/docs/en/ai-overview/) · [Standardized Subgraphs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/) · [x402 payments](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/) · [90-protocol lending query](https://thegraph.com/blog/community-builder-queried-defi-lending-protocols-subgraphs-mcp/)
- [graphops/subgraph-mcp](https://github.com/graphops/subgraph-mcp) · [PaulieB14/subgraph-registry](https://github.com/PaulieB14/subgraph-registry) · [PaulieB14/subgraph-mcp-skills](https://github.com/PaulieB14/subgraph-mcp-skills) · [substreams-skills](https://github.com/streamingfast/substreams-skills)
- [google/A2UI](https://github.com/google/A2UI) · [A2UI v0.9 announcement](https://developers.googleblog.com/a2ui-v0-9-generative-ui/)
- [0G Private Computer](https://0g.ai/blog/0g-private-computer) · [0G docs](https://docs.0g.ai/) · [Sealed Inference announcement](https://www.globenewswire.com/news-release/2026/03/06/3250768/0/en/0G-Introduces-Sealed-Inference-Cryptographically-Private-AI-Where-Every-Response-Is-Verified-Inside-a-Hardware-Enclave.html)
