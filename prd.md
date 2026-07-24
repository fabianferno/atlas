# Graph Mini Apps — Product Requirements Document

> *Describe an onchain app. Get an agent with a UI, a wallet, and a name.*

**Event:** ETHGlobal Lisbon 2026 · Fri Jul 24 – Sun Jul 26 · **submissions close Sun 09:00 WEST**
**Targets:** The Graph (3 tracks) · ENS (2 tracks) · 0G (1 track) — 3 partner selections, 6 tracks, **$24,000 addressable**

**Contents**

1. [Positioning](#1-positioning)
2. [What a mini app is](#2-what-a-mini-app-is)
3. [Users](#3-users)
4. [The product — four primitives](#4-the-product--four-primitives)
5. [The Mini App Manifest](#5-the-mini-app-manifest)
6. [Generative UI and actions](#6-generative-ui-and-actions)
7. [Agency and safety](#7-agency-and-safety)
8. [ENS binding](#8-ens-binding)
9. [0G — compute and Agentic ID](#9-0g--compute-and-agentic-id)
10. [The Graph integration](#10-the-graph-integration)
11. [Architecture](#11-architecture)
12. [The ecosystem layer](#12-the-ecosystem-layer)
13. [Verified technical ground truth](#13-verified-technical-ground-truth)
14. [Track compliance matrix](#14-track-compliance-matrix)
15. [The 36-hour cut](#15-the-36-hour-cut--what-actually-ships)
16. [Demo script](#16-demo-script--250)
17. [Risk register](#17-risk-register)
18. [Open questions](#18-open-questions--resolve-at-booths-friday-morning)
- [Appendix A — component and action catalog](#appendix-a--component-and-action-catalog)
- [Appendix B — submission templates](#appendix-b--submission-templates)
- [Appendix C — revision notes](#appendix-c--revision-notes)
- [Appendix D — sources](#appendix-d--sources)

---

# 1. Positioning

## The observation

**The Graph had everything it needed to be Dune, and it stayed a developer tool.**

Both indexed the same chains. Both solved the same problem. But Dune shipped a surface a non-engineer could stand on — write a query, get a dashboard, share a link — and became the default way *everyone* looks at onchain data: traders, journalists, DAO voters, founders, people arguing on Twitter. The Graph shipped subgraphs, schemas, and a GraphQL gateway, and became the default way *developers* get onchain data.

That's not a technology gap. It's a surface gap. The Graph's data is richer, more real-time, more composable, and more decentralized than Dune's — and almost nobody outside of web3 engineering has ever touched it directly.

**Graph Mini Apps is the consumer surface The Graph never built.**

## Why now

Two things changed in the last year that make this buildable, and neither existed when Dune won.

**Generative UI became real.** At Microsoft Build 2026, Steve Sanderson demoed [VibeOS](https://www.youtube.com/watch?v=7NfyZhV1dKM) — an operating system with no application code. Launch the calculator and there's nothing underneath it: a Claude agent generates the interface in real time and interprets what you do with it. It's a provocation aimed at the oldest assumption in computing, that an app is a durable piece of code. The interfaces are *hallucinated*, and they work.

Apply that to onchain data and the Dune bottleneck disappears. Today, if the dashboard for your question doesn't exist, you wait for someone to build it — and for the long tail, nobody ever will. If the interface is generated per-question, the wait is zero and the long tail is free.

**Agent-native UI got a standard.** [A2UI](https://a2ui.org) (Google, Apache-2.0, v0.9.1 stable) makes generated interfaces *safe*: the agent emits declarative JSON, never code, and can only reference components the client already approved. Critically, it's **bidirectional** — components carry actions that dispatch back to the agent. Which means a generated UI isn't a picture. It's a control surface.

## The product

**Google Opal for onchain.** Describe what you want in natural language; get a working mini app you can use, share, fork, and remix — with The Graph as the entire data backend.

But with one difference that matters more than the rest:

> **Opal's mini apps produce text. Ours hold wallets.**

A Graph mini app isn't a dashboard that answers. It's an agent that acts. It watches live onchain data, renders whatever interface fits the moment, and can execute — trade, rebalance, claim, mirror another wallet, alert you. Each one has its own wallet, its own ENS name, and its own onchain identity.

**The one-liner:** *Describe an onchain app. Get an agent with a UI, a wallet, and a name.*

## Why this beats "isn't it just Dune?"

Dune dashboards can't trade. They can't watch for a liquidation and act on it at 4am. They can't be handed to another agent. They can't exist for a question nobody has asked yet.

| | Dune | Graph Mini Apps |
|---|---|---|
| Who builds it | A human, in SQL | An agent, from a sentence |
| When it exists | After someone builds it | The moment you ask |
| What it does | Displays | Displays **and acts** |
| Identity | A URL on dune.com | An ENS name + onchain Agentic ID |
| Who can run it | People, on Dune | People, **and any agent, anywhere** |
| Data | Dune's warehouse | The Graph — 15,000+ subgraphs, live, decentralized |

---

# 2. What a mini app is

One object, one spec, a very wide range. This is the range slide — it's what makes the platform argument instead of the demo argument.

```
  ANALYTICS ─────────────────── MONITORING ─────────────────── AUTONOMOUS
  read-only                     read + alert                   read + act

  "Top DEXs by volume           "Tell me when any of my        "Mirror this wallet's
   on Arbitrum this week"        lending positions drops        Arbitrum swaps, max
                                 below 1.4 health factor"       $50 per trade"

  Renders: leaderboard          Renders: gauges + alert        Renders: live position,
                                 banner, watch toggle           kill switch, trade log
  Wallet: none                  Wallet: none                   Wallet: yes, funded,
                                                                capped
  Trigger: on open              Trigger: Substreams event      Trigger: Substreams event
```

Every one of these is the same artifact: **a manifest** (§5). Same creation flow, same renderer, same ENS name, same fork button. The difference is which capabilities the creator turned on.

**Worked example — the autonomous end:**

```
User types in the Studio:
  "Watch my Aave position on Arbitrum. If health factor goes under 1.4,
   sell enough ETH to bring it back to 1.8. Show me what you're doing."

The generated mini app:
  DATA     Lending/CDP 3.1.0 standardized schema → live position
  STREAM   Substreams price feed → re-evaluates on every block, not every 5 min
  UI       health-factor gauge · position table · trade log · KILL SWITCH
           (agent chose a gauge because the value is a bounded ratio —
            nobody specified "gauge")
  WALLET   session key, $500 cap, allowlisted to one DEX router
  ACTION   swap(), gated by policy + the kill switch
  IDENTITY aave-guard.graphminis.eth · Agentic ID #142 on 0G Chain
```

Nobody wrote that app. Nobody will ever write that app — it's one person's specific position, on one chain, with one risk tolerance. That's the long tail, and it's most of the demand.

---

# 3. Users

## Primary — the consumer The Graph never reached

Traders, DAO contributors, DeFi power users, crypto-curious people who read charts but have never written GraphQL. **They are Dune's audience, and The Graph has never had them.**

**Job:** *"I want an onchain thing that watches something for me and does something about it, without hiring an engineer or waiting for someone to build it."*

| What they do today | Cost |
|---|---|
| Hunt for a Dune dashboard | Only exists for popular questions; stale; read-only |
| Set a price alert on an exchange | Fires at 4am and does nothing |
| Ask an engineer friend | Days of latency, doesn't scale, awkward |
| Manually watch a position | Doesn't sleep well, misses the move |
| Buy an off-the-shelf trading bot | Rigid, opaque, not their strategy |

## Secondary — creators

People who build a good mini app and share it. They earn from it via x402 (§12). This is the Dune power-user persona — the reason Dune had content on day one — and it's what turns a tool into an ecosystem.

## Tertiary — agent builders

They install the MCP server or `@graphminis/kit` and get Graph-grounded generative UI inside their own agent. **This is the Graph Track 1 constituency**, and it's why the kit stays a real, published artifact even though the Studio is now the primary surface.

## Anti-user

Anyone who wants a drag-and-drop dashboard builder, or a no-code workflow canvas with boxes and arrows. Not us. You describe intent; the agent decides the interface.

---

# 4. The product — four primitives

## P1 — The Studio → Graph Track 1 + 2

**Everything happens in our web app.** This is the Opal lesson: the moment you tell a consumer to `npm install`, you've lost them and you're back to being a developer tool — which is the exact failure mode this product exists to fix.

The Studio is one page:

- **Describe** — natural language, one box
- **Watch it build** — the plan streams: schemas resolved, sources health-checked, components chosen, actions wired. Legible, not a spinner
- **Use it immediately** — renders live, in place
- **Refine conversationally** — "add a 7-day chart", "only alert me above $10k", "use Optimism too"
- **Configure capabilities** — wallet, spend cap, triggers, x402 price — all in-app, no config files
- **Publish** — name it, mint it, list it

MCP server config, SKILL library, and the generator all live inside this app. A user should never see a terminal.

**`@graphminis/kit` still ships as a published npm package + MCP server + SKILL.md** — it's the engine, and Graph Track 1 requires *"reusable tooling/infrastructure, not a single end-user app."* The Studio is a client of the kit, not a wrapper around a private codebase. Publish it for real; an unpublished package reads as an assertion.

## P2 — The Runtime → Graph Track 2 + 3

Generative UI over live Graph data, with actions. NL → intent → standardized schema resolution → parallel fan-out across ≥2 schema families → Substreams subscription where freshness matters → A2UI document with interactive components → rendered, live, acting.

Track 3's bar is *"compose two or more Graph products, OR build meaningfully on a standardized schema."* We do both, several times over (§10).

## P3 — Identity → ENS Track 1 + 2, 0G Track 1

Every mini app gets an **ENS subname** and an **Agentic ID (ERC-7857) on 0G Chain**. The name is how humans and agents find and run it. The Agentic ID is its onchain identity and the thing its wallet is bound to.

Naming is not decoration here — **a mini app has a wallet, so it needs a name a human can verify before funding it.** `aave-guard.graphminis.eth` resolving to both a UI and an address is the entire safety UX.

## P4 — The Ecosystem → Graph Track 1, ENS Track 1

Registry, fork/remix, ratings, creator earnings via x402. This is what makes it a platform rather than a toy (§12). Dune's fork button was the whole flywheel; we ship it on day one.

---

# 5. The Mini App Manifest

The single most important object in the system. Registry, ENS, forking, provenance, and agency are all functions of it.

```jsonc
{
  "spec": "graphmini/2",
  "name": "aave-guard",
  "title": "Aave Position Guard — Arbitrum",
  "intent": "Watch my Aave position. If health factor < 1.4, sell ETH to reach 1.8.",

  // ── WHERE THE DATA COMES FROM ─────────────────────────────────
  "data": {
    "schemas": ["lending-cdp@3.1.0", "dex-amm@1.3.2"],
    "network": "arbitrum-one",
    "sources": [
      { "subgraphId": "<id>", "schema": "lending-cdp@3.1.0",
        "healthCheckedAt": "2026-07-25T14:02:00Z" }
    ],
    "queries": { "position": "query($user:ID!){ ... }" },
    "stream": {                          // Substreams — event-driven, not polled
      "package": "erc4626-vaults@v0.2.0",
      "module": "map_vault_events",
      "filter": { "user": "$owner" }
    },
    "transport": "x402"                  // "gateway" | "x402" | "mcp"
  },

  // ── WHAT IT LOOKS LIKE ────────────────────────────────────────
  "ui": { /* A2UI v0.9.1 document — flat component list + data model */ },

  // ── WHAT IT CAN DO ────────────────────────────────────────────
  "agency": {
    "mode": "autonomous",                // "readonly" | "alert" | "autonomous"
    "triggers": [
      { "on": "stream", "when": "healthFactor < 1.4", "run": "rebalance" }
    ],
    "actions": {
      "rebalance": {
        "kind": "swap",
        "router": "0x<allowlisted router>",
        "params": { "targetHealthFactor": 1.8 }
      }
    },
    "policy": {                          // see §7 — enforced, not advisory
      "wallet": "0x<session key address>",
      "maxSpendUsd": 500,
      "maxPerTxUsd": 50,
      "allowlist": ["0x<router>", "0x<aave pool>"],
      "expiresAt": "2026-08-25T00:00:00Z",
      "requireConfirm": false,
      "killSwitch": true
    }
  },

  // ── WHO IT IS ─────────────────────────────────────────────────
  "identity": {
    "ens": "aave-guard.graphminis.eth",
    "agenticId": { "chain": "0g", "contract": "0x<ERC7857>", "tokenId": 142 }
  },

  // ── WHERE IT CAME FROM ────────────────────────────────────────
  "provenance": {
    "model": "deepseek-chat-v3",
    "compute": "0g-private-computer",
    "attestationRef": "0g://<ref>",
    "generatedAt": "2026-07-25T14:02:11Z"
  },

  // ── ECOSYSTEM ─────────────────────────────────────────────────
  "author": "fabianferno.eth",
  "appVersion": "1.0.0",
  "forkedFrom": "lending-watch.graphminis.eth@0.9.2",
  "pricing": { "x402": { "enabled": true, "priceUsd": 0.05 } }
}
```

**Design notes**

- **`data` is separate from `ui`.** Re-running the data plan gives fresh results, so a resolved ENS name is *live*, not a screenshot. This is what makes it a mini app rather than a permalink.
- **`sources` is health-checked at generation time.** ~28% of standardized deployments are dead at any moment (§17) — freezing a verified-live source is a correctness requirement.
- **`agency.policy` is the security boundary.** It is enforced at the signer, not suggested to the model. See §7.
- **`forkedFrom` pins a version.** Forking a moving target is how you get a fork that silently breaks.
- **Forking strips `identity`, `policy.wallet`, and `provenance`.** A fork must never inherit the parent's wallet or its attestation. Non-negotiable.

---

# 6. Generative UI and actions

## The A2UI loop

A2UI is bidirectional, and that's the whole reason a mini app can be an agent:

```
   AGENT                                          CLIENT
     │  A2UI document (components + data model)      │
     │ ────────────────────────────────────────────► │  renders from
     │                                               │  approved catalog
     │                                               │
     │  streamed component/data updates              │  live data binding
     │ ────────────────────────────────────────────► │
     │                                               │
     │        action payload (client_to_server.json) │  user clicks
     │ ◄──────────────────────────────────────────── │  a Button
     │                                               │
   agent converts the event into a query,            │
   runs policy checks, may sign a transaction        │
```

A `Button` carries an `action` that is either a **Server Event** (dispatched to the agent) or a **Local Function Call** (handled client-side). Server events resolve path references against the local data model and post a payload conforming to `client_to_server.json`.

```jsonc
{
  "id": "rebalance-btn",
  "component": "Button",
  "child": "btn-label",
  "action": {
    "event": {
      "name": "rebalance_position",
      "context": {
        "target": { "path": "/targetHealthFactor" },
        "amount": { "path": "/computedSellAmount" }
      }
    }
  }
}
```

## Two properties worth saying out loud in the demo

**The agent cannot inject code.** A2UI is declarative data, not executable code. The client holds the approved component catalog; the agent may only reference it by name. A generated interface that can move money *must* have this property, and it's ~15 seconds of demo that separates you from every "LLM writes React" project in the room.

**Form follows data, not keywords.** The composer picks components from the *shape* of the returned data — a bounded ratio becomes a gauge, a ranked categorical becomes a leaderboard, two entities over shared metrics become a comparison grid. Not from words in the prompt. That's the defensible version of "generative UI," and it's the answer when a judge says "couldn't you just draw a chart?"

---

# 7. Agency and safety

**Read this section before writing any signing code.** A generated interface that holds a wallet is the most interesting thing in this project and the easiest way to embarrass yourself on stage.

## Threat model

| Threat | Mitigation |
|---|---|
| Model hallucinates a bad trade | Policy enforced at the **signer**, not in the prompt. The model proposes; the policy engine disposes |
| Prompt injection via onchain data (token names, ENS text, memos) | Treat all indexed data as untrusted. Never let query results reach the planner as instructions. Sanitize + delimit |
| Mini app drains its wallet | Hard caps: `maxSpendUsd`, `maxPerTxUsd`, `expiresAt`. Session key, never a root key |
| Mini app interacts with a malicious contract | `allowlist` of router/pool addresses. Empty allowlist = no actions, no exceptions |
| Fork inherits the parent's funded wallet | Forking strips wallet, policy, identity, provenance. Enforced in the fork path |
| Runaway loop | `killSwitch: true` renders a kill switch in every autonomous app. Also a global pause |
| Judge asks "what stops it going rogue?" | You have this table. Have it memorized |

## Policy engine

Every action passes through the same gate, regardless of whether a human clicked or a trigger fired:

```
proposed action
  → is the mode "autonomous"?           else require explicit confirm
  → is target in allowlist?             else reject
  → is amount ≤ maxPerTxUsd?            else reject
  → is cumulative ≤ maxSpendUsd?        else reject
  → is now < expiresAt?                 else reject
  → is killSwitch untripped?            else reject
  → sign with session key
  → append to the on-app trade log (visible in the UI, always)
```

**Demo posture:** testnet by default. If you demo on mainnet, use a wallet with $20 in it and say the number out loud — it reads as confidence, not recklessness.

## Wallets

Each mini app gets its own wallet. Options, in order of speed-to-demo:

| Approach | Speed | Notes |
|---|---|---|
| **Session-key EOA derived per mini app** | Fastest | Simple, fully in your control, easy to explain. Recommended for the weekend |
| **Embedded wallet (Privy / Turnkey)** | Medium | Better UX for real users, adds a dependency and a signup flow |
| **Smart account + session keys (ERC-4337 / 7702)** | Slowest | The correct long-term answer. Real policy enforcement onchain. Too much for 36h |

Recommendation: **session-key EOA now, smart accounts in "what's next."** Say the upgrade path out loud in the demo — judges reward knowing where you cut.

---

# 8. ENS binding

## Why ENS is load-bearing here

Under the old framing, ENS was a nice shareable name. Under this one it's a **safety primitive**: a mini app has a wallet and can spend money, so before you fund one you need to verify what it is and who made it. A name that resolves to a UI, an address, an author, and an onchain identity — all from one lookup — is exactly that verification.

`aave-guard.graphminis.eth` is simultaneously: where the app lives, where its wallet is, who wrote it, and what it's allowed to do.

## Namespace

Register a 2LD you control (`graphminis.eth`) and issue subnames beneath it:

| Mechanism | Speed | Tradeoff |
|---|---|---|
| **Offchain via CCIP-Read** ([NameStone](https://namestone.com/), Namespace, JustaName, [gskril/ens-offchain-registrar](https://github.com/gskril/ens-offchain-registrar)) | Fastest — REST, gasless | Records in a DB behind CCIP-Read. Legitimate, but have the "how onchain is this?" answer ready |
| **[Durin](https://github.com/resolverworks/durin)** — L2 subname registry | Medium | Subnames as ERC-721s on L2, records onchain. Bonus: another deployed contract address |
| **[ensdomains/hackathon-registrar](https://github.com/ensdomains/hackathon-registrar)** | Fast | Purpose-built for this situation |

> **Friday, first thing:** ask the ENS booth which they want to see. Five minutes, de-risks $3,000.

## Records per mini app

```
addr                             → 0x<the mini app's wallet>        ← now meaningful
contenthash                      → ipfs://<manifest CID>
agent-context                    → YAML: what it does, which schemas, what it can
                                   spend, how to run it                    (ENSIP-26)
agent-endpoint[web]              → https://graphminis.xyz/a/aave-guard     (ENSIP-26)
agent-endpoint[mcp]              → https://mcp.graphminis.xyz/sse          (ENSIP-26)
agent-registration[<erc7930>][142] → "1"                                   (ENSIP-25)
url · description · avatar       → standard profile records
```

The `agent-registration` key binds the ENS name to the **Agentic ID token on 0G Chain** — registry entry and name verify each other in both directions. That mutual verification is the strongest single technical idea in this build, and it's the thing that makes ENS and 0G one story instead of two slides.

## Track fit

- **ENS Track 1 (Most Creative):** the name isn't identity, it's an *executable, funded artifact*. `contenthash` + `agent-context` + `addr` means one ENS name is a runnable, spending program over live blockchain data. "Go beyond name → address" is the literal ask.
- **ENS Track 2 (AI Agents):** every mini app *is* an agent, with `agent-endpoint[mcp]` for machine discovery, `agent-context` for capability description, and ENSIP-25 registry binding for verification. Discovery in both directions, using the real standards.

**Hard requirements:** functional, **no hard-coded values**, and **someone presents at the ENS booth Sunday morning in person.** Assign that name today.

---

# 9. 0G — compute and Agentic ID

Two uses, both in 0G Track 1's stated wheelhouse. No privacy framing — that was a dead end, since privacy is unverifiable on a demo stage.

## Inference on 0G Compute

Planning and UI composition run on [0G Private Computer](https://0g.ai/blog/0g-private-computer) — OpenAI-compatible at `https://router-api.0g.ai/v1`, so it's a one-line base-URL change. TEE-backed (Intel TDX + H100/H200). Models: DeepSeek Chat V3, Qwen3.6 Plus, GLM-5-FP8.

```ts
const openai = new OpenAI({
  baseURL: "https://router-api.0g.ai/v1",
  apiKey: process.env.ZEROG_API_KEY,
});
```

The attestation is stored in the manifest's `provenance`. **This matters more now than it did as a dashboard tool:** if a generated UI can move money, "did this model really produce this plan, from this data" stops being a nicety and becomes an audit trail. Verifiable provenance for an agent that spends.

## Agentic ID (ERC-7857)

Every published mini app is minted as an **Agentic ID** on 0G Chain — 0G's ERC-7857 standard for agents as onchain assets with encrypted metadata, transferable ownership, and cloning. This is a near-perfect fit: our mini apps are agents, they're ownable, and **forking is literally cloning.**

0G Track 1's extra qualification says: *"For Agentic ID projects: link to minted Agentic ID on 0G explorer."* Minting satisfies that **and** the contract-deployment-address requirement in one move.

> **Scope warning.** Full ERC-7857 wants a TEE/ZKP oracle, 0G Storage for encrypted metadata, and AES-256-GCM. That is a 6–10 hour rabbit hole. **Timebox to 3 hours.** Fallback: deploy a minimal ERC-7857-shaped registry that mints a real token with a manifest CID and skips encrypted-metadata transfer. You still get a minted token, a real contract address, and an explorer link — say plainly in the README which parts of the standard you implemented. Judges respect a scoped implementation far more than a broken full one.

---

# 10. The Graph integration

The Graph is the entire backend. Not a data source among several — the backend.

## Four Graph products, four distinct reasons

| Product | Used for | Why not something else |
|---|---|---|
| **Standardized Subgraphs** | Cross-protocol queries — one query shape across 90 lending deployments on 15 chains | Protocol-specific subgraphs would need an adapter per protocol. This is the whole composability thesis |
| **Subgraph MCP** | Discovery — finding the right subgraph among 15,000 when a user asks about something unusual | Hardcoding subgraph IDs caps you at whatever you thought of on Friday |
| **Substreams** | Event-driven triggers — autonomous apps must react to a block, not a 5-minute poll | Polling a subgraph means your liquidation guard is up to 5 minutes late. That's the difference between working and not |
| **x402** | Keyless per-query payment — the mini app's own wallet pays for its own data | An API key can't be given to an agent that a stranger forked. x402 makes forking work without credential sharing |

**That Substreams justification is the real one.** Under the old dashboard framing, Substreams was a nice-to-have I'd cut. Under "mini apps that act," polling is a correctness bug. Say this in the demo — Track 3 judges will hear a team that understands *why* the product exists, not one checking a box.

## x402, both directions

```
  INBOUND   mini app wallet ──$0.01 USDC (Base)──► The Graph gateway
            keyless per-query data. No API key to share when forked.

  OUTBOUND  user of a mini app ──$0.05──► creator's wallet
            creator earnings. Our facilitator, same protocol.
```

The Graph's x402 pays the gateway; it does not route to third parties. Creator earnings need our own facilitator wrapping the same protocol — that's the honest framing, and it's a genuinely nice extension to demo: *the same payment rail an agent uses to buy data, creators use to get paid.*

## Fan-out

```
intent → schema resolution → live-deployment lookup (health-checked)
       → parallel query across N deployments and ≥2 schema families
       → merge → normalize → compose
```

Minimum for Track 3 qualification: **DEX AMM 1.3.2 + Lending/CDP 3.1.0.** Track 3 explicitly warns that *"simply querying one Subgraph with no composition does not qualify."* Build the fan-out first, before anything visual.

---

# 11. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  THE STUDIO  (Next.js — the only surface a user sees)                │
│  describe · watch it build · use · refine · configure · publish      │
│  registry · fork/remix · ratings · earnings                          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  imports, never reaches around
┌───────────────────────────────▼──────────────────────────────────────┐
│  @graphminis/kit   (npm · MCP server · SKILL.md)                     │
│                                                                      │
│   PLANNER ──────────► RESOLVER ──────────► FAN-OUT ──────► COMPOSER  │
│   intent → plan       schema → live         parallel        → A2UI   │
│   [0G Compute]        deployments,          across ≥2       doc w/   │
│                       health-checked        schemas         actions  │
│                            │                    │                    │
│                       subgraph-registry    gateway│x402│mcp          │
│                                                                      │
│   POLICY ENGINE ◄─── actions from the rendered UI or a trigger       │
│   allowlist · caps · expiry · kill switch → session-key signer       │
└──────┬────────────────────┬──────────────────┬──────────────────┬────┘
       │                    │                  │                  │
       ▼                    ▼                  ▼                  ▼
  THE GRAPH            A2UI RENDER        IDENTITY           STREAMS
  standardized         React, mobile-     ENS subname        Substreams
  subgraphs ·          responsive,        (addr, contenthash, → triggers
  Subgraph MCP ·       interactive        agent-context,      (event-driven,
  x402 gateway         components         agent-endpoint[…])  not polled)
                                          ⟷ mutual verify
                                          Agentic ID ERC-7857
                                          on 0G Chain
```

**The Studio imports the kit and never reaches around it.** That constraint is what lets one repo credibly claim both "reusable infrastructure" (Graph T1) and "end-user app" (Graph T2). Enforce it in review.

## Repo layout

```
packages/kit/          # @graphminis/kit — planner, resolver, fan-out, composer, policy
packages/mcp/          # MCP server wrapping the kit
apps/studio/           # Next.js — Studio, registry, /a/[name] runtime
contracts/
  ├─ AgenticId.sol     # ERC-7857 (scoped) — 0G Chain
  └─ MiniAppRegistry.sol
SKILL.md · README.md · architecture.png
prd.md · prd-v1-original.md
```

---

# 12. The ecosystem layer

Dune's flywheel was never the dashboards — it was fork, attribution, and a leaderboard of people whose work got reused. Ship that on day one; it's what makes the platform claim credible in a 3-minute video.

## Registry

Browse and search published mini apps. Filter by category (analytics / monitor / autonomous), chain, protocol, schema, tag. Show what matters: **times forked, times run, total value transacted, creator.** Vanity metrics are worse than none.

## Fork and remix

The reason the manifest exists. Fork any mini app → get an editable copy → refine it in natural language → publish under your own name, with `forkedFrom` preserved for attribution.

**Forking strips `identity`, `agency.policy.wallet`, and `provenance`.** A fork gets a fresh wallet, a fresh ENS name, a fresh Agentic ID, and zero inherited spending authority. This is a security requirement, not a design preference — enforce it in code, and mention it in the demo.

## Ratings and reviews

Thumbs plus a short review, weighted by whether the rater actually ran the app. Keep the schema trivial (`appId, rater, score, text, ranIt`) — this is ecosystem texture, not a product in itself. The point is that a registry with visible community signal *reads* like a platform, and an empty grid doesn't.

## Creator earnings

Creators set an x402 price per run. Users' agents pay it; funds settle to the creator's wallet. Show lifetime earnings on the creator's profile.

**This is the loop that makes it an ecosystem:** creator publishes → users fork and run → creator earns → creator publishes more. Dune never paid its dashboard authors, and it's the most common complaint about it. Being the version that does is a real differentiator, and it's worth thirty seconds of the video.

---

# 13. Verified technical ground truth

Checked against live docs 2026-07-24. This also answers Graph Track 2's *"describe which subgraphs/endpoints/tools were used."*

## The Graph

```
Subgraph MCP    https://subgraphs.mcp.thegraph.com/sse
                Authorization: Bearer <GATEWAY_API_KEY>   (via npx mcp-remote)
                15,000+ subgraphs; schema inspection, keyword/contract search

Gateway         https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>

x402 (keyless)  POST https://gateway.thegraph.com/api/x402/subgraphs/id/<SUBGRAPH_ID>
                Base mainnet USDC  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
                Base Sepolia USDC  0x036CbD53842c5426634e7929541eC2318f3dCF7e
                npm @graphprotocol/client-x402 · npx graphclient-x402
                ~$0.01/query, no signup

Substreams      https://substreams.dev  — package registry (.spkg)
                SKILLs: claude plugin marketplace add streamingfast/substreams-skills
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

## Standardized schemas (Messari, via The Graph)

**Pick two. Don't survey all ten.**

`Generic 3.0.0` · **`DEX AMM 1.3.2`** · `DEX AMM Extended 4.0.1` · `DEX Aggregator 1.0.2` · **`Lending/CDP 3.1.0`** · `Yield Aggregator 1.3.1` · `NFT Marketplace 2.1.0` · `Network 1.2.0` · `Bridge 1.2.0` · `Perp Futures 1.3.4` · `Options 1.3.2`

Supports real-time entity queries, time-travel queries, and time-series snapshots.

## A2UI

Apache-2.0, **v0.9.1 stable** (v1.0 RC). Docs at [a2ui.org](https://a2ui.org), repo [a2ui-project/a2ui](https://github.com/a2ui-project/a2ui). **React renderer stable.** Flat component list + data model, designed for incremental LLM updates. Declarative JSON, never executable code; client holds the approved catalog.

**Actions:** `Button.action` → Server Event (to agent) or Local Function Call (client-side). Payload conforms to `client_to_server.json`; path references resolve against the local data model. Transport is pluggable — A2A, WebSockets. See [client-to-server actions](https://a2ui.org/concepts/client_to_server_actions/).

## 0G

```
Private Computer   https://router-api.0g.ai/v1     (OpenAI-compatible)
                   TEE: Intel TDX + NVIDIA H100/H200
                   Models: DeepSeek Chat V3, Qwen3.6 Plus, GLM-5-FP8 · pc.0g.ai
0G Chain           EVM-compatible — deploy AgenticId + MiniAppRegistry
Agentic ID         ERC-7857. Deploy your own contract; oracle (TEE/ZKP) +
                   0G Storage + AES-256-GCM for full spec. Scope this (§9).
```

## Prior art worth building on

- [`PaulieB14/subgraph-registry`](https://github.com/PaulieB14/subgraph-registry) — semantic classification of all 15K subgraphs **with reliability scoring**. Your schema resolver *and* dead-endpoint defense, pre-built.
- [`PaulieB14/graph-lending-mcp`](https://glama.ai/mcp/servers/PaulieB14/graph-lending-mcp) — one query across 90 lending deployments, 19 tools. Reference for the fan-out.
- [`graphops/subgraph-mcp`](https://github.com/graphops/subgraph-mcp) · [`ensdomains/ens-cli`](https://github.com/ensdomains/ens-cli)

> ETHGlobal permits open-source starter kits and additive extension — but **document exactly what was pre-existing versus built this weekend**, in the README and in git history.

---

# 14. Track compliance matrix

Hard qualification requirements. **Anything unchecked at Sunday 07:00 is a disqualification, not a missing feature.**

| # | Requirement | Track | Owner | Status |
|---|---|---|---|---|
| 1 | Live Graph data, no mocks — **anywhere in the demo** | Graph 1/2/3 | | ☐ |
| 2 | Reusable tooling published + installable (npm + MCP + SKILL) | Graph 1 | | ☐ |
| 3 | Open source, clear README **or** SKILL.md | Graph 1 | | ☐ |
| 4 | AI component that reasons over **or acts on** the data | Graph 2 | | ☐ |
| 5 | Names which subgraphs/endpoints/tools were used | Graph 2 | | ☐ |
| 6 | ≥2 Graph products **or** meaningful standardized-schema use (we do 4) | Graph 3 | | ☐ |
| 7 | Standards leverage **visible in the demo**, not just the README | Graph 3 | | ☐ |
| 8 | ENS functional, **no hard-coded values** | ENS 1/2 | | ☐ |
| 9 | ENS improves identity/discoverability non-cosmetically | ENS 2 | | ☐ |
| 10 | **Present at ENS booth, Sunday morning, in person** | ENS 1/2 | **assign a name** | ☐ |
| 11 | Proof of 0G Compute / Private Computer inference | 0G 1 | | ☐ |
| 12 | **Contract deployment addresses** | 0G 1 | | ☐ |
| 13 | **Minted Agentic ID linked on 0G explorer** (bonus qualification) | 0G 1 | | ☐ |
| 14 | Demo video **under 3:00** (satisfies 0G *and* Graph's 2–4) | all | | ☐ |
| 15 | Live demo link | 0G 1 | | ☐ |
| 16 | Team names + Telegram/X | 0G 1 | | ☐ |
| 17 | **Proper git history** — small, frequent, descriptive commits | ETHGlobal | everyone | ☐ |
| 18 | AI-tool usage attributed; specs/prompts committed | ETHGlobal | | ☐ |
| 19 | Select exactly 3 partner prizes: Graph, ENS, 0G | submission | | ☐ |

**Addressable:** $15,000 (Graph ×3) + $3,000 (ENS 1+2) + $6,000 (0G T1) = **$24,000 across 6 tracks, 3 selections.**

> Rules: up to **3 partner prizes**; a multi-track partner counts as **1 selection**. Graph + ENS + 0G uses all three and covers six tracks in one repo.

**Sponsor-brief alignment worth noting:** Graph Track 2's own example ideas include *"trading/execution agent with live liquidity + x402 pay-per-query"*, *"portfolio/PnL copilot"*, and *"risk-monitoring agent for lending liquidations."* The autonomous framing hits three of six listed examples. You are building what they asked for.

---

# 15. The 36-hour cut — what actually ships

**The vision above is the product. This section is the weekend.** They are different documents and conflating them is how teams submit nothing.

The scope in §1–§12 is roughly three times what fits in the ~30 working hours left. That's fine — a PRD should describe the product — but the build has to be sequenced so that **every hour produces something demoable**, and so that the things which are *qualification requirements* land before the things which are *impressive*.

## The spine — nothing ships without this

1. **Cross-schema fan-out**, health-checked (Graph T3 qualification)
2. **NL → plan → A2UI render**, live data (Graph T2 qualification)
3. **One action that executes** with policy enforcement (the entire differentiator)
4. **ENS name written and resolvable** (ENS T1+T2 qualification)
5. **A contract deployed on 0G Chain** with an address (0G qualification)

If only these five exist Sunday morning, you have a complete, qualifying submission for six tracks.

## Degrade in this order if you're behind

| Cut | When | Cost |
|---|---|---|
| Full ERC-7857 → minimal minting contract | If §9 exceeds 3h | Low — still get a token + explorer link |
| Substreams stream → 15s polling, same interface | If streaming exceeds 3h | **Medium** — weakens the T3 story. Keep the manifest field so it reads as designed-for |
| Ratings + reviews | Saturday evening | Low — registry survives without it |
| Creator x402 payouts → show inbound x402 only | Saturday evening | Low — inbound x402 still demos the rail |
| Conversational refinement → regenerate from scratch | Anytime | Low — user barely notices in a demo |
| Autonomous trigger → button-triggered action | **Last resort** | **High** — this is the differentiator. Protect it |

Never cut: the fan-out, one working action, the ENS write, the 0G contract.

## Hour by hour

**Fri 10:00–13:00 · de-risk before building**
ENS booth — pick the subname mechanism, register the 2LD now (propagation isn't instant). Graph API key; verify a standardized-schema query returns real data on Arbitrum. 0G: one successful `/v1/chat/completions` call. Spike the A2UI React renderer **including a Button with a server event** — actions are the whole product; find out today if they fight you. Commit after each.

**Fri 13:00–20:00 · the qualifying spine**
Resolver + health check + parallel fan-out across DEX AMM and Lending/CDP. Planner: NL → plan, on 0G. Ten hardcoded intent patterns beat a general parser — ship those, generalize only if time allows. Target: type a question, see real numbers in a terminal. Ugly is fine.

**Fri 20:00 – Sat 02:00 · it becomes a product**
Composer → A2UI doc with interactive components. Manifest v2 serialization. Studio page: describe → watch it build → render. **Checkpoint 02:00 — does a sentence produce a live rendered app?** If no, cut everything in §12 and protect the spine.

**Sat 09:00–14:00 · the differentiator**
Policy engine + session-key signer. One action end-to-end on testnet. Kill switch. Trade log in the UI. **This is the demo. Do not let it slip past 14:00.**

**Sat 14:00–18:00 · identity**
Pin manifest → IPFS. Write ENS records (`addr`, `contenthash`, `agent-context`, `agent-endpoint[web|mcp]`). Deploy contracts to 0G Chain, **record addresses**. Mint one Agentic ID; grab the explorer link. Write `agent-registration[…]` back to ENS to close the ENSIP-25 loop.

**Sat 18:00–21:00 · platform + tooling**
Publish `@graphminis/kit` to npm for real. MCP server + SKILL.md. Registry grid, fork button, ratings. Mobile pass (Tailwind — should be cheap). Seed 6–8 good mini apps spanning analytics → monitor → autonomous, so the range slide is real.

**Sat 21:00 – Sun 02:00 · ship the story**
Record the video — **budget three hours, it always takes three.** README with data sources, AI attribution, pre-existing-work disclosure. Architecture diagram.

**Sun 02:00–08:00 · freeze and submit**
**Feature freeze 02:00.** Demo-path bugs only. Submit by **08:00**, not 08:55. The ENS booth presenter sleeps — and is not the person fixing bugs at 02:00.

---

# 16. Demo script — 2:50

Satisfies 0G's <3:00 and Graph's 2–4:00. One cut.

```
0:00–0:18  POSITIONING. Say the thesis out loud.
           "The Graph had everything it needed to be Dune. It indexes more
            chains, more protocols, in real time. But it only ever built for
            developers — so everyone else went to Dune. We built the surface
            The Graph never did."

0:18–0:50  THE OPAL MOMENT. Type into the Studio:
           "Watch my Aave position on Arbitrum. If health factor drops under
            1.4, sell ETH to bring it back to 1.8."
           Watch the plan stream: two standardized schemas resolved, dead
           deployments skipped, Substreams subscribed, components chosen.
                                                    ← Graph T2 + T3

0:50–1:10  THE VIBEOS MOMENT. The UI appears — health gauge, position table,
           trade log, kill switch.
           "Nobody built this screen. It chose a gauge because a health factor
            is a bounded ratio. And it can't inject code — A2UI is declarative,
            it can only use components we approved."
                                                    ← technical execution

1:10–1:45  THE LEAP. Drop the health factor on testnet. The app fires:
           policy check, session key signs, trade lands, log updates live.
           "This isn't a dashboard. It has a wallet, a $500 cap, one allowlisted
            router, and a kill switch. Dune can't do this."
                                                    ← the differentiator

1:45–2:05  IDENTITY. It's aave-guard.graphminis.eth — resolving to the UI, the
           wallet address, and Agentic ID #142 on 0G Chain. The ENS record and
           the onchain token verify each other.
           Paste the name into a different agent — it resolves, reads
           agent-context, and runs.                 ← ENS T1 + T2, 0G T1

2:05–2:25  THE ECOSYSTEM. Registry. Fork it — new wallet, new name, no inherited
           spending authority. Refine in one sentence. Publish. The creator
           earns $0.05 per run via x402, on the same rail the agent uses to buy
           its own data.                            ← Graph T1, ecosystem

2:25–2:50  npm i @graphminis/kit — any agent gets this.
           "15,000 subgraphs. Every question is an app now, and every app can
            act. That's The Graph, finally pointed at everyone."
                                                    ← Graph T1
```

**Notes.** The 1:10 leap is the video — rehearse until boring. Pre-record a fallback clip of the live query and the firing trade; venue wifi will fail during recording. Say the spend cap number out loud; it reads as confidence.

---

# 17. Risk register

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| **Scope.** Vision is ~3× the remaining hours | **High** | **Fatal** | §15 spine + degrade order. Re-read the degrade table at every checkpoint, not at 04:00 Sunday |
| **Dead standardized subgraph mid-demo** — ~65 of 90 deployments live at any time | **High** | Fatal | Health-check before every fan-out; skip dead sources; re-verify demo queries 30 min before recording; keep one known-good pinned |
| Action/policy path not done by Sat 14:00 | Med | **Fatal** | It's the differentiator. Protect the slot. Fall back to button-triggered, never cut entirely |
| A2UI action loop harder than the render loop | Med | High | Spike the Button server-event Friday morning, not Saturday. Fallback: local action handler that calls our API directly, same UX |
| ERC-7857 full spec rabbit hole (oracle + encryption + Storage) | **High** | Med | Hard 3h timebox → minimal minting contract. Document what you scoped |
| Substreams streaming eats a day | Med | Med | 3h timebox → 15s polling behind the same interface. Keep the manifest field |
| ENS subname issuance eats a day | Med | High | Booth Friday morning; offchain CCIP-Read as fast path |
| 0G key/quota delay | Low | Med | OpenAI-compatible — swap via env var. Build on OpenAI, flip to 0G, show the flip |
| Venue wifi dies during recording | **High** | High | Record core flow early Saturday. Keep fallback clips |
| Git history looks AI-generated | Med | **Fatal** | Commit every 20–30 min with real messages. Pre-event commits ("test", "Iniit") are a clean pre-existing-work boundary — cite the hash in the README |
| Demo agent does something embarrassing with real money | Low | **Fatal** | Testnet. If mainnet, $20 wallet and say the number |
| Judge: "an LLM with a wallet is reckless" | Med | Med | §7 is the answer. Policy at the signer, not the prompt; allowlist; caps; expiry; kill switch. Have the table memorized |
| Judge: "isn't this just Dune?" | Med | Low | §1 table. Dune dashboards can't trade, can't be run by an agent, and don't exist until a human writes SQL |

---

# 18. Open questions — resolve at booths Friday morning

1. **ENS:** which subname mechanism do you want to see — offchain CCIP-Read, Durin on L2, or hackathon-registrar? *(5 min, de-risks $3,000)*
2. **ENS:** does "every mini app is an agent with a wallet, a name, and ENSIP-25/26 records" land better in Track 1 or Track 2? Which do you want us to lead with at the booth?
3. **The Graph:** which standardized-schema deployments are reliably live on Arbitrum *right now*? Directly attacks the top risk.
4. **The Graph:** is there a Substreams package we can subscribe to in an afternoon for price or lending events on Arbitrum, or should we poll and say so?
5. **The Graph:** does building on `subgraph-registry` / `graph-lending-mcp` count as additive? (Track 1 welcomes extension "if clearly additive" — get it confirmed.)
6. **0G:** is a scoped ERC-7857 (real mint, real token, no encrypted-metadata oracle) acceptable for the Agentic ID bonus qualification?
7. **0G:** does an OpenAI-compatible Private Computer call satisfy "proof of 0G Compute," or do they want an attestation artifact onchain?

---

# Appendix A — component and action catalog

A2UI requires the **client** to hold the approved catalog; the agent may only reference it by name. That's the security property and your scope fence — a finite catalog means a finite output space.

## Display components — ship six

| Component | Data shape that triggers it |
|---|---|
| `metric_card` | single scalar, optional delta |
| `bar_chart` | categorical × one metric |
| `time_series` | timestamped × one-or-more metrics |
| `leaderboard` | categorical, ranked — the most common question shape |
| `gauge` | **bounded ratio** — health factors, utilization, LTV |
| `comparison_grid` | ≥2 entities × shared metrics — **the cross-schema shot** |
| `data_table` | fallback when nothing else fits |

## Action components — ship four

| Component | Emits | Notes |
|---|---|---|
| `action_button` | Server Event → policy engine → signer | The core primitive |
| `confirm_dialog` | Server Event, gated on user confirm | Required when `requireConfirm: true` |
| `kill_switch` | Local Function Call + Server Event | Must render in every autonomous app |
| `trade_log` | display-only, streams from the action journal | Non-negotiable — an agent that spends must show its work |

**Composer rule:** components are chosen from the *shape of the data*, never from keywords in the prompt. A bounded ratio becomes a gauge whether or not the user said "gauge." That's the defensible version of generative UI.

Deferred (say so in the README): OHLCV candles, Sankey/flow diagrams, portfolio treemaps, multi-step approval flows.

---

# Appendix B — submission templates

## README.md skeleton

```markdown
# Graph Mini Apps

Describe an onchain app. Get an agent with a UI, a wallet, and a name.

**Live:** <url>  ·  **Video:** <url>  ·  **npm:** @graphminis/kit
**Agentic ID:** <0G explorer link>  ·  **Contracts:** 0x… (0G Chain)

## Why
The Graph had everything it needed to be Dune — more chains, more protocols,
real time, decentralized — but it only ever built for developers. This is the
consumer surface it never shipped. And because the interface is generated per
question, apps exist the moment you ask, including for the long tail nobody
would ever build by hand.

## What a mini app is
Not a dashboard. An agent with a wallet: it watches live Graph data, renders
whatever UI fits, and can act — within a policy you set.
[range: analytics → monitoring → autonomous]

## How it uses The Graph
- Standardized Subgraphs — DEX AMM 1.3.2, Lending/CDP 3.1.0 (Arbitrum)
  Exact deployment IDs queried: <list — Track 2 requires this>
- Subgraph MCP  — https://subgraphs.mcp.thegraph.com/sse (discovery)
- Substreams    — <package> (event-driven triggers; polling is a correctness
                  bug for an agent that acts)
- x402 gateway  — POST /api/x402/subgraphs/id/<id> (keyless; a forked app pays
                  with its own wallet, no shared API key)

## ENS
graphminis.eth + per-app subnames. Records: addr · contenthash ·
agent-context · agent-endpoint[web|mcp] (ENSIP-26) ·
agent-registration[registry][tokenId] (ENSIP-25), which mutually verifies
against the Agentic ID on 0G Chain.

## 0G
- Private Computer (router-api.0g.ai/v1) plans and composes inside a TEE;
  attestation stored in each manifest
- Every published mini app minted as an Agentic ID (ERC-7857)
- Implemented: <exactly which parts of ERC-7857 — be precise>

## Safety
Policy enforced at the signer, not in the prompt: allowlist, per-tx and
lifetime caps, expiry, kill switch. Forks inherit no spending authority.

## Not in scope
[be explicit — it reads as judgment]

## Attribution
- Built at ETHGlobal Lisbon 2026 starting <commit hash>; prior commits predate
  the event and contain <what>
- OSS used: A2UI (Apache-2.0), subgraph-registry, …
- AI tools: Claude Code for <what>; specs committed as prd.md,
  prd-v1-original.md

## Team
Name · Telegram · X
```

## SKILL.md skeleton

```markdown
# Graph Mini Apps

Give any agent the ability to build onchain mini apps — generated UI over live
Graph data, with actions.

## Install
npm i @graphminis/kit
# or add the MCP server:
{ "mcpServers": { "graphminis": { "command": "npx",
  "args": ["mcp-remote", "https://mcp.graphminis.xyz/sse"] } } }

## Use
import { plan, fanOut, compose, publish } from '@graphminis/kit'

const p  = await plan("watch my Aave position, rebalance under 1.4 HF")
const d  = await fanOut(p)            // parallel, health-checked, ≥2 schemas
const ui = await compose(d)           // A2UI v0.9.1 doc, interactive

await publish(ui, {
  name: 'aave-guard',
  policy: { maxSpendUsd: 500, allowlist: ['0x…'], killSwitch: true }
})
// → aave-guard.graphminis.eth + Agentic ID on 0G Chain

## Customization
- Component + action catalog: packages/kit/src/catalog.ts
- Schema resolution:          packages/kit/src/resolver.ts
- Policy engine:              packages/kit/src/policy.ts
```

---

# Appendix C — revision notes

[`prd-v1-original.md`](./prd-v1-original.md) is the archived first draft. ETHGlobal asks for planning artifacts in the repo, so the evolution is an asset.

## v3 — the repositioning (current)

**Mini apps are agents, not dashboards.** They hold wallets and act. This is the change that makes everything else cohere:

- Kills the Dune comparison outright — Dune dashboards can't trade
- Makes ENS load-bearing as a *safety* primitive: you verify a name before funding it
- Makes Agentic ID (ERC-7857) an obvious fit — mini apps are ownable agents, and forking is cloning
- Makes Substreams a correctness requirement rather than a nice-to-have: polling means a liquidation guard is up to 5 minutes late
- Makes x402 native in both directions: an agent pays for its own data; a fork needs no shared API key
- Hits three of Graph Track 2's six stated example ideas

**Positioning added:** The Graph had everything to beat Dune and only ever served developers. This is the consumer surface. Inspirations named: [Opal](https://blog.google/technology/google-labs/opal-expansion/) (the creation surface) and [VibeOS](https://www.youtube.com/watch?v=7NfyZhV1dKM) (interfaces generated at runtime, not coded).

**Restored from v1, now justified:** ratings/reviews, fork/remix, Substreams streaming, x402 creator earnings, mobile responsive. Under "dashboards" these were unscored surface; under "ecosystem of agents" they're the flywheel.

**Creation moved in-app.** The Studio is the primary surface; `@graphminis/kit` is the engine beneath it and still ships to npm for Graph Track 1. Telling a consumer to `npm install` reproduces the exact failure this product exists to fix.

**Added:** §7 agency and safety (mandatory once an LLM holds a wallet), action components in the catalog, §15 split between the product and the weekend.

**0G:** privacy framing dropped per direction. Now compute + Agentic ID. Provenance survives — and matters more, since an agent that spends needs an audit trail.

## v2 — factual corrections

| v1 claim | Reality |
|---|---|
| ENS records `app/prompt`, `app/version` | Invented. ENSIP-26 defines `agent-context`, `agent-endpoint[<protocol>]`; ENSIP-25 defines `agent-registration[<registry>][<agentId>]` |
| `*.graph.eth` subnames | You don't own `graph.eth`. Needs your own 2LD + issuance mechanism |
| "A2UI framework (as specified by sponsor)" | Not a sponsor. Google Apache-2.0 OSS — an implementation choice, no track credit |
| x402 lets authors earn per query | The Graph's x402 pays its gateway. Creator earnings need our own facilitator (§12) |
| Standardized subgraphs are a stable base | ~28% of deployments dead at any moment. Now the #2 risk |

Also corrected: 0G needs contract addresses and a video under 3:00 (v1's script was 3:30 and failed 0G); ENS requires in-person Sunday booth presentation; ETHGlobal requires clean git history.

---

# Appendix D — sources

Verified 2026-07-24.

**Positioning**
[VibeOS at Microsoft Build 2026](https://www.youtube.com/watch?v=7NfyZhV1dKM) · [VibeOS writeup](https://www.hackster.io/news/this-ai-operating-system-hallucinates-pseudo-software-even-notepad-on-demand-f83e24b42ef9) · [Google Opal](https://blog.google/technology/google-labs/opal-expansion/)

**A2UI**
[a2ui.org](https://a2ui.org) · [protocol v0.9](https://a2ui.org/specification/v0.9-a2ui/) · [client-to-server actions](https://a2ui.org/concepts/client_to_server_actions/) · [handling user actions](https://a2ui.org/concepts/actions/) · [repo](https://github.com/a2ui-project/a2ui) · [v0.9 announcement](https://developers.googleblog.com/a2ui-v0-9-generative-ui/)

**The Graph**
[AI overview](https://thegraph.com/docs/en/ai-overview/) · [Standardized Subgraphs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/) · [x402 payments](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/) · [90-protocol lending query](https://thegraph.com/blog/community-builder-queried-defi-lending-protocols-subgraphs-mcp/) · [substreams.dev](https://substreams.dev) · [substreams-skills](https://github.com/streamingfast/substreams-skills) · [subgraph-registry](https://github.com/PaulieB14/subgraph-registry) · [graphops/subgraph-mcp](https://github.com/graphops/subgraph-mcp)

**ENS**
[ENSIP-25](https://docs.ens.domains/ensip/25/) · [ENSIP-26](https://docs.ens.domains/ensip/26/) · [subname docs](https://docs.ens.domains/web/subdomains/) · [ens-cli](https://github.com/ensdomains/ens-cli) · [hackathon-registrar](https://github.com/ensdomains/hackathon-registrar) · [Durin](https://github.com/resolverworks/durin) · [NameStone](https://namestone.com/)

**0G**
[Private Computer](https://0g.ai/blog/0g-private-computer) · [docs](https://docs.0g.ai/) · [Agentic ID](https://docs.0g.ai/concepts/agentic-id) · [ERC-7857](https://docs.0g.ai/developer-hub/building-on-0g/inft/erc7857) · [sealed inference](https://www.globenewswire.com/news-release/2026/03/06/3250768/0/en/0G-Introduces-Sealed-Inference-Cryptographically-Private-AI-Where-Every-Response-Is-Verified-Inside-a-Hardware-Enclave.html)
