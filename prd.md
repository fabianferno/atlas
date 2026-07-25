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
6. [The interface](#6-the-interface)
7. [Agency and safety](#7-agency-and-safety)
8. [ENS binding](#8-ens-binding)
9. [0G — compute and Agentic ID](#9-0g--compute-and-agentic-id)
10. [The Graph integration](#10-the-graph-integration)
11. [Architecture](#11-architecture)
12. [The ecosystem layer](#12-the-ecosystem-layer)
13. [Verified technical ground truth](#13-verified-technical-ground-truth)
14. [Track compliance matrix](#14-track-compliance-matrix)
15. [Build plan — parallel execution](#15-build-plan--parallel-execution)
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

Generative UI over live Graph data, with actions. NL → intent → standardized schema resolution → parallel fan-out across **all ten standardized schema families** → Substreams subscription for anything event-driven → A2UI document with interactive components → rendered, live, acting.

Track 3's bar is *"compose two or more Graph products, OR build meaningfully on a standardized schema."* We do both, several times over (§10). Track 3 also scores **Breadth at 20%** — so full schema coverage across ≥3 chains is directly rewarded, not just thoroughness for its own sake.

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

# 6. The interface

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

## The visual system

> **Superseded by what shipped — read this first.** The direction below is neo-brutalism, with border weight encoding agency. What runs is **skeuomorphic** (Dieter Rams / Braun), with **depth** encoding agency: readonly sits flush in an inset groove, monitor lifts on a soft bevel with a live-blue rim, autonomous stands proud on a tall bevel with a deep shadow and a warm orange rim. Everything else below survives intact — semantic colour, monochrome charts, mono as a primary voice, light mode, density discipline, the theme swap. See Appendix C v7, `web/src/app/globals.css`, and `docs/superpowers/specs/2026-07-25-skeuomorphic-theme-design.md`. The argument is kept rather than rewritten because it is the planning artifact the change was made against.

### The design problem, stated honestly

This is not a normal UI brief, because **we do not control the composition.** An agent assembles the screen at runtime from a catalog. So the system has to hold together no matter what gets combined — which rules out any aesthetic that depends on careful, hand-tuned arrangement. Whatever we choose must look deliberate when a machine stacks six components it has never stacked before.

Three more constraints, all in tension:

| Constraint | Pull |
|---|---|
| An LLM is holding a wallet | must read as **trustworthy** |
| The audience is Dune's, not Bloomberg's | must read as **approachable**, not institutional |
| Financial data is tabular and dense | must be **information-dense**, not airy |
| Thirteen parallel agents are building it | must be **hard to get subtly wrong** |

### Direction: neo-brutalism, tuned to this product

Flat fills, hard black rules, offset shadows with no blur, no gradients, no glass.

**Why it fits, structurally:** it's the most *constraint-native* system available. Brutalism is defined by a small set of hard rules, which means an agent composing from the catalog physically cannot produce something incoherent — everything belongs by construction. It's also the easiest system for thirteen parallel builders to hit consistently, because there is almost nothing to drift on. No gradient stops, no shadow blur radii, no elevation scale to disagree about.

**Why it fits the thesis:** brutalism's original claim was *show the structure, don't hide it.* That is this product's argument. Here is the query plan, here are the live sources, here is the policy, here is the journal, here is the attestation. Nothing decorative, nothing concealed.

**The honest risk:** neo-brutalism is close to a default in crypto by 2026. Chunky borders on a yellow field is a look people have seen. So the direction only works if it is *specifically ours* — which is what the next four rules are for. Without them we ship a template.

### Rule 1 — border weight encodes agency (the signature)

**Chrome gets heavier as an app gets more dangerous.**

| Tier | Border | Chrome |
|---|---|---|
| `readonly` — analytics, cannot act | 1.5px | nothing extra |
| `monitor` — watches, alerts, cannot spend | 2.5px | dashed live rule, watch indicator |
| `autonomous` — **holds a wallet, can spend** | 5px | solid policy strip pinned to the top edge |

Scan a grid of fifteen mini apps and you know instantly which ones can move money. Nobody has to read a badge. This is the one structural device that encodes something true, it's unique to this product, and it makes §7's safety story visible at a glance instead of buried in a settings panel.

### Rule 2 — colour is semantic, never decorative

Five accents. Each has exactly one meaning and appears nowhere else.

```
--live    #0047FF   streaming, subscribed, currently running
--gain    #007A3D   value up, position healthy, policy passed
--loss    #D6220F   value down, policy rejected, source dead
--risk    #FFB800   approaching a threshold, degraded, stale
--spend   #7B2FF7   value LEAVING a wallet — this colour and nothing else
```

Violet is the important one. It appears only when money moves, so a single glance across the board tells you whether anything has spent today. A palette where colour is load-bearing is what separates this from decorative brutalism.

```
--paper   #EFEEE9   canvas
--card    #FFFFFF   surfaces
--ink     #0A0A0A   text
--rule    #000000   borders — always pure black, never a tint
--muted   #75736C   secondary text
```

### Rule 3 — charts are monochrome plus one accent

Do not colour-code ten protocols. With ten standardized schemas the categorical palette breaks down immediately, and rainbow charts are the fastest way to look generic.

**Bars and lines are ink at varying weight; exactly one series carries a semantic accent — the one the question was about.** Position and labels do the rest. This is more brutalist, more legible, and it scales to any number of series.

### Rule 4 — mono is a primary voice

Onchain data is tabular: figures, addresses, hashes, timestamps, log lines. Mono is not an accent here, it's half the interface. It also solves the density problem — mono stays legible at small sizes where the heavy borders are eating space.

| Role | Face | Notes |
|---|---|---|
| Display | **Archivo Expanded** (700–800) | Headlines, app names. Real character, not Inter |
| UI | **Archivo** (400–600) | Labels, body, buttons |
| Data | **IBM Plex Mono** (400–500) | Every figure, address, hash, and journal line. Tabular numerals always |

### Rule 5 — light mode, deliberately

Every other project in the room is a dark dashboard with a gradient. Brutalism needs black rules on light ground to read at all, and going light is the risk worth taking. It also photographs better for the ETHGlobal showcase.

### Density discipline

The failure mode of brutalism with financial data is boxes inside boxes. **Borders belong on containers, not on cells.** Inside a data block use hairline rules and spacing. One heavy frame per panel, then get quiet.

Hard offset shadow (`5px 5px 0 var(--rule)`) is reserved for things you can *act on* — cards you can open, buttons you can press. Never on static panels. Restraint is what makes the shadow mean something.

### Motion

The signature moment is **an interface assembling itself.** Components snap in one at a time as the plan resolves, borders drawing before fills. Sharp easing, no bounce, no fade. That is the product's most distinctive second and it's where the entire animation budget goes.

Everything else is instant. Honour `prefers-reduced-motion` by rendering the assembled state directly.

### Information architecture

Without an OS metaphor, three surfaces carry the load:

- **The Board** — the home surface. Studio input at the top, the live activity ledger, then the grid of your mini apps sorted by tier. Answers "what do I have and what is it doing?"
- **The Ledger** — a running feed of every agent action, styled as a receipt. Mono, timestamped, with cost per query and violet on any line that spent. This is how background autonomy stays visible, and it's what makes the product feel alive in a demo.
- **The App** — one running mini app, full width. Generated body, with the policy strip and journal always present for autonomous tier.

Global halt lives in the top bar, always reachable. Per-app kill switch lives in the app.

### Build notes

- Tailwind + shadcn/ui as the base, restyled to the tokens. shadcn is unstyled primitives, so it takes a brutalist skin cleanly — but **override the default radius to 0 and the default shadows to hard offsets globally**, or every component drifts back to generic.
- The catalog (Appendix A) is where the tokens get applied. **The catalog contract does not change with the theme** — components are semantic; the styling is one layer over them. That separation is what makes the theme swap possible.

### The theme swap — a demo beat worth five seconds

The agent has no idea what any of this looks like. It emits semantic A2UI; the client picks the components. Swap the catalog and the *same manifest* renders in a completely different skin, live.

That demonstrates A2UI's entire design property in one gesture — and it proves the aesthetic is a choice sitting on real architecture, not the architecture itself.

**As built.** One attribute — `data-skin` on the root element — and `globals.css` re-expresses the system in a different material. Two skins ship: `tactile` (the v7 skeuomorphic default) and `flat` (the v6 neo-brutalism, kept alive rather than thrown away). The swap touches **tokens and material only**: no component, no catalog entry, no manifest re-read, and nothing round-trips to the agent. Delete the second skin and the app still works with one.

**Rule 1 holds in both, by different means, and that is the non-negotiable part** — a skin that hid which apps can spend would be a bug, not a theme:

| | `tactile` | `flat` |
|---|---|---|
| agency reads as | depth — flush · raised · standing proud | border weight — 1.5px · 2.5px · 5px |
| accent | warm orange `--action` | `--live` blue |
| shadow | soft elevation, catch-lights | hard offset, or nothing |

Verified by reading computed style back off the page in both skins: autonomous is `5px` in `flat` and `1px` with a 225-character box-shadow in `tactile`. The preference is applied by an inline script before first paint, because a flash of the wrong skin on camera reads as a bug in the product rather than a feature of it.

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

| Approach | Notes |
|---|---|
| **Smart account + session keys (ERC-4337 / EIP-7702)** | **Build this.** Policy enforced onchain, not just in our process — allowlist, spend cap, and expiry live in the session key itself |
| Embedded wallet (Privy / Turnkey) | Better consumer onboarding UX; layer it over the smart account for signup |
| Session-key EOA | Fallback only if the account stack fights you |

**Build the smart account version.** The distinction matters more than it looks: with a session-key EOA, "the policy stopped it" means *our server chose not to sign*. With onchain session keys, the policy is enforced by the account itself — a compromised backend still can't exceed the cap or touch a non-allowlisted contract. That's a real security property and a much better answer when a judge pushes on "what if your server is owned?"

### Enforcement status — as built

Four signer modes behind one interface, selected by `AGENCY_WALLET_MODE`:

| Mode | Enforcement |
|---|---|
| `stub` | server-side; no keys needed, demoable cold |
| `session-eoa` | server-side; real testnet txs from a non-root key |
| `smart-account` | server-side; ERC-4337, but the session key is an account *owner* |
| **`smart-session`** | **onchain** — ERC-7579 + Rhinestone Smart Sessions, session key as a *scoped permission* |

**`onchainEnforced` is the return value of an `isSessionEnabled()` call against the live validator — a fact read from the chain, never a constant.** That matters: the UI cannot overstate by accident.

**Enforcement is deliberately not uniform, and the UI reports it per constraint:**

| Constraint | Enforced by |
|---|---|
| allowlist (target + selector) | **chain** |
| expiry | **chain** |
| lifetime cap | **chain**, in token units |
| per-tx cap | **chain** when the action declares `amountParamOffset`, else server |
| USD → token conversion | server — no oracle in the validator, so the chain enforces the *token* amount, not the dollar figure |
| `requireConfirm` / tier | server — no validator models "a human pressed Confirm" |
| kill switch | server — the onchain counterpart is `getRemoveSessionAction` |

**Verified live on Base Sepolia:** all ten Rhinestone contracts deployed, a real `permissionId` computed, `isSessionEnabled()` read from the validator, and the signer refusing to sign with `SessionNotEnabled` rather than falling back to owner signing. **Not verified: the happy path** — a userOp actually landing needs a funded ERC-7579 account, a bundler URL, and the owner's enable transaction. Do not claim a completed onchain-enforced trade until one lands.

**A bug worth knowing about**, because it would have produced a false security claim: Smart Sessions' `getPermissionId()` hashes only `(sessionValidator, initData, salt)` — *not the policies*. Two sessions with the same key and wildly different spending limits share a permission id, so raising a cap locally would leave `isSessionEnabled()` answering `true` for limits the chain never agreed to. Fixed by deriving the salt from a canonical fingerprint of the whole grant: change an allowlist entry, a cap, or the expiry and the permission id changes, the session reads as disabled, and the signer refuses until the owner re-enables. The chain and the server cannot drift apart silently.

---

# 8. ENS binding

## Why ENS is load-bearing here

Under the old framing, ENS was a nice shareable name. Under this one it's a **safety primitive**: a mini app has a wallet and can spend money, so before you fund one you need to verify what it is and who made it. A name that resolves to a UI, an address, an author, and an onchain identity — all from one lookup — is exactly that verification.

`aave-guard.graphminis.eth` is simultaneously: where the app lives, where its wallet is, who wrote it, and what it's allowed to do.

## Namespace

Register a 2LD you control (`graphminis.eth`) and issue subnames beneath it:

Four backends ship behind one interface, selected by `ENS_REGISTRAR_MODE`, degrading to a local mock with a warning rather than throwing.

| Mechanism | Status |
|---|---|
| **Onchain NameWrapper + PublicResolver** | **Primary — this is what runs.** `graphminis.eth` registered and wrapped on Sepolia 2026-07-25; subnames issued and read back off the chain by a client that is not ours. Slower, and worth it: nothing about it depends on a third party staying up |
| Namespace — offchain CCIP-Read, `POST /api/v1/subnames` | Implemented against their live OpenAPI spec. Needs an API key and the parent's resolver pointed at their hybrid resolver — a signup step and a propagation wait we no longer have to take |
| NameStone | Implemented, **but see below — do not demo it** |
| Local mock | Default with no keys |

**Verified end to end**, `aave-health-guard.graphminis.eth` and `wallet-bound-guard.graphminis.eth`: `addr` → the mini app's own wallet, `contenthash` → a CID that decodes to exactly the published manifest, ENSIP-26 `agent-context` / `agent-endpoint[web]` / `agent-endpoint[mcp]`, and an ENSIP-25 `agent-registration` entry the 0G registry confirms in the other direction. Deployment record: `contracts/deployments/ens-sepolia.json`.

**Three findings that changed this plan:**

1. **NameStone shuts down 2026-08-03** (announced 2026-07-14). It works during the hackathon, but demoing infrastructure that dies in ten days is a bad look in a Q&A. **[Durin](https://github.com/resolverworks/durin) inherits the same risk** — it is now a NameStone repo with a NameStone-operated gateway. This is why we stopped depending on a hosted issuer at all.
2. **`ensdomains/hackathon-registrar` is a dead 2019 artifact and its npm package is compromised.** Do not use it. Struck from this document.
3. **On Sepolia, `ETHRegistrarController.register()` reverts** — it is not an authorised controller, and `available()` still returns true, so it fails in a confusing way. Registering the parent requires `TestnetV1PremigrationRegistrar` at `0xdf60C561Ca35AD3C89D24BbA854654b1c3477078`. Documented as `SEPOLIA_PARENT_REGISTRATION` in `ens.ts`.

Also worth knowing: NameStone's Sepolia base URL is a **different path** (`/api/public_v1_sepolia`), not a query parameter. Getting that wrong silently writes testnet names to mainnet.

**Already live**, and the sequence that got there, because trap 2 costs an hour if you meet it cold: register the parent through `TestnetV1PremigrationRegistrar` (single transaction, free, ≥28 days, `data: []`) → it comes back **unwrapped**, so `NameWrapper.setSubnodeRecord` reverts with `Unauthorised` → `BaseRegistrar.setApprovalForAll(NameWrapper, true)` then `wrapETH2LD` → set `ENS_REGISTRAR_MODE=onchain`, `ENS_REGISTRAR_PRIVATE_KEY`, `ENS_RPC_URL`.

**To use Namespace instead:** key from `app.namespace.ninja`, own the parent, point its resolver at Namespace's hybrid resolver, set `NAMESPACE_API_KEY` + `ENS_PARENT_DOMAIN`.

> **Still worth the booth conversation** — but as a "here's what we built, does this land?" rather than "what should we use?". ETHGlobal's own ENS prize pages list ENSIP-25/26 as resources, which is exactly what this implements.

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

Planning and UI composition run on [0G Private Computer](https://0g.ai/blog/0g-private-computer) — OpenAI-compatible at `https://router-api.0g.ai/v1`, so it's a one-line base-URL change. TEE-backed (Intel TDX + H100/H200).

**Models — checked against a live `GET /v1/models` on 2026-07-25.** `deepseek-chat-v3`, named in every earlier revision of this document, **no longer exists on the router**; 23 models do, and that is not one of them. A dead model id is the worst kind of stale, because nothing fails until a real `ZEROG_API_KEY` is set — that is, during the demo and not before it. Current picks: **`0gm-1.0-35b-a3b`** (0G Foundation's own, tool-capable, likeliest to land on a TEE-attested provider), with `deepseek-v4-flash`, `qwen3.7-plus`, `glm-5.1` and `minimax-m3` as alternatives.

**Getting a key:** `pc.0g.ai` → Console → API Keys, then deposit 0G into the compute ledger. Billing is per-token against that ledger; there is no card.

**Trust mode is not optional.** The router's default is *Standard* routing, which explicitly spans community-hosted channels and is **not guaranteed verifiable** — so `verify_tee` in the request body is not sufficient on its own, and a response can come back with no attestation at all. Anything written into `provenance` must come from `verified` (TeeML/TeeTLS providers) or `private` (TEE enclaves only) routing, pinned per request:

```ts
const openai = new OpenAI({
  baseURL: "https://router-api.0g.ai/v1",
  apiKey: process.env.ZEROG_API_KEY,
  defaultHeaders: { "X-0G-Provider-Trust-Mode": "verified" },
});
```

A provenance record that silently degrades to unattested is worse than no provenance, because we would be showing it on stage as proof.

**Thinking must be switched off, and this is not a tuning preference.** 0G's models reason by default and reasoning tokens come out of the *same* budget as the answer — measured live, `{"ok":true}` cost 123 reasoning tokens before 6 of content, and a realistic planner prompt cost 1172. The planner's 700-token ceiling meant the JSON was truncated away, the call returned nothing, and every caller read that as "no model configured" and quietly used the rules engine. **A paid, attested, live inference path looked identical to an unconfigured one.** Pass `chat_template_kwargs: { enable_thinking: false }` — it yields 0 reasoning tokens. `reasoning_effort: "low"` (248) and `chat_template_kwargs: { thinking: false }` (223) both make it *worse* than the default.

**What "proof of inference" actually means here** (§14 #11): the TEE returns a request id, it becomes `provenance.attestationRef`, and its keccak256 is written onchain into `MiniAppRegistry.attestationHash` alongside the token and the name. Verified: `keccak256("0g://f1ade7e8-e9ca-4fb2-b5c9-79cd400e3195")` = `0xa651240d…52f1`, which is what the registry returns for `attested-market-guard.graphminis.eth`. A judge can check that without trusting the UI.

The attestation is stored in the manifest's `provenance`. **This matters more now than it did as a dashboard tool:** if a generated UI can move money, "did this model really produce this plan, from this data" stops being a nicety and becomes an audit trail. Verifiable provenance for an agent that spends.

## Agentic ID (ERC-7857)

Every published mini app is minted as an **Agentic ID** on 0G Chain — 0G's ERC-7857 standard for agents as onchain assets with encrypted metadata, transferable ownership, and cloning. This is a near-perfect fit: our mini apps are agents, they're ownable, and **forking is literally cloning.**

0G Track 1's extra qualification says: *"For Agentic ID projects: link to minted Agentic ID on 0G explorer."* Minting satisfies that **and** the contract-deployment-address requirement in one move.

**Implement the full standard**, not a shaped-alike: deploy the ERC-7857 contract to 0G Chain, wire a TEE-based oracle, store encrypted metadata in 0G Storage with AES-256-GCM, and support the re-encryption handoff on transfer. The reason to do the whole thing is that **transfer and cloning are product features here, not spec trivia** — forking a mini app *is* an ERC-7857 clone, and selling one is a transfer. A partial implementation would leave the ecosystem layer (§12) unable to actually change hands.

## Agent memory on 0G Storage

Every mini app keeps encrypted memory in 0G Storage: past runs, decisions and why it made them, user corrections, and the full action journal that backs the on-screen trade log.

This is not a bolt-on. An autonomous app that rebalances a position needs to know what it already did — otherwise it re-trades on the same signal. Memory is a correctness requirement for anything in the autonomous tier, and it makes the trade log verifiable rather than cosmetic.

It also lands squarely on a 0G Track 1 stated example: *"Agent minted as Agentic ID with encrypted memory."* Memory + Agentic ID together are the exact shape 0G asked for.

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

Track 3 explicitly warns that *"simply querying one Subgraph with no composition does not qualify."* The fan-out is the qualification — build it before anything visual.

Coverage target: **all ten schema families, three chains.** The demo only needs to *show* two or three families composing, but the resolver should handle any of them, because the whole claim is that a question you haven't thought of yet still resolves. A resolver that only knows DEX and Lending is a demo; one that knows all ten is a product.

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
prd.md
docs/superpowers/specs/   # design specs, committed as planning artifacts
docs/superpowers/plans/
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

**Support every family that actually has deployments.** Track 3 scores Breadth at 20%, and each additional family widens the range of questions that resolve without a custom adapter.

`Generic 3.0.0` · `DEX AMM 1.3.2` · `DEX AMM Extended 4.0.1` · `DEX Aggregator 1.0.2` · `Lending/CDP 3.1.0` · `Yield Aggregator 1.3.1` · `NFT Marketplace 2.1.0` · `Network 1.2.0` · `Bridge 1.2.0` · `Perp Futures 1.3.4` · `Options 1.3.2`

**Verified coverage as built — 86 real deployment IDs**, taken from `messari/subgraphs` `deployment/deployment.json` and cross-checked against a crawl of The Graph Network meta-subgraph, each carrying a reliability score and indexer allocation count:

| | Reality |
|---|---|
| Families with live deployments | **9 of 11** |
| Networks | Arbitrum, Optimism, Base, mainnet |
| Arbitrum | 10 lending · 5 dex · 5 perp |
| Optimism | 5 lending · 5 dex · 3 perp |
| Base | 4 lending · 1 dex |

**Two families have zero standardized deployments anywhere** — `dex-aggregator@1.0.2` and `network@1.2.0`. `nft-marketplace` exists on mainnet only. Do not claim eleven in the demo; claim nine, and the number is defensible because every ID was checked.

**One query shape works across families** because the Messari `Protocol` interface is present in lending, dex-amm, dex-amm-extended, dex-agg, yield, bridge, perp and options. Three exceptions found by reading the real schemas, all of which would have failed silently on stage: `nft-marketplace` has no `Protocol` interface (root is `marketplaces`), `network` has none either (root is `networks`), and `DerivPerpProtocol` has no `openInterestUSD` — only `longOpenInterestUSD` / `shortOpenInterestUSD`.

Supports real-time entity queries, time-travel queries, and time-series snapshots. Time-travel is worth using explicitly — historical comparison without maintaining your own snapshots, and a standards feature most submissions won't touch.

**Show the health check working.** Fixture mode deliberately reports ~25 of 35 sources live rather than a perfect board, because a demo where everything is always green never teaches the audience what problem the health check solves. Resist the urge to make it 35/35 for the video — the honest number *is* the Track 3 argument.

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

Status as of 2026-07-25. ☑ means *verified*, not *built* — every one below was read back from the chain or the gateway, not inferred from the code.

| # | Requirement | Track | Owner | Status |
|---|---|---|---|---|
| 1 | Live Graph data, no mocks — **anywhere in the demo** | Graph 1/2/3 | | **☑** data plane live, and **all 16 seed apps now run on it** — `scripts/seed-live.ts` puts every one through resolve → health-check → fan-out → compose, 16/16 live for $0.0084, snapshot in `kit/seed-live.generated.json`. Only `runs`/`forks`/ratings remain seeded, and they are social texture, not data |
| 2 | Reusable tooling published + installable (npm + MCP + SKILL) | Graph 1 | | **◐** MCP server live at `/api/mcp` (5 tools, verified handshake) and `SKILL.md` written. **npm package still not extracted** |
| 3 | Open source, clear README **or** SKILL.md | Graph 1 | | **☑** root `README.md` + `SKILL.md`, both naming deployment IDs, addresses and what is *not* built |
| 4 | AI component that reasons over **or acts on** the data | Graph 2 | | **☑** both — plan and compose run on 0G (`0gm-1.0-35b-a3b`), and the action loop is policy gate → signer → journal |
| 5 | Names which subgraphs/endpoints/tools were used | Graph 2 | | **☑** 12 deployment IDs listed in the README, all 86 in `sources.ts`; every row carries `_source`/`_label`/`_schema`/`_network` |
| 6 | ≥2 Graph products **or** meaningful standardized-schema use (we do 4) | Graph 3 | | **☑** two products verified live: standardized subgraphs (86 deployment ids, health-checked fan-out) **and Substreams** — real subscription on `arb-one.streamingfast.io`, blocks 487508073→75, trigger fired on the breaching block, policy gate decided, plus a no-breach control run that fired nothing. Still coded-but-unexercised: **x402** (`X402_PRIVATE_KEY` unset; the reference run's $0.0014 is 14 × the *gateway's* $0.0001) and **Subgraph MCP** (env var only, nothing calls it). Two verified clears the ≥2 bar without needing the other two |
| 7 | Standards leverage **visible in the demo**, not just the README | Graph 3 | | ☐ |
| 8 | ENS functional, **no hard-coded values** | ENS 1/2 | | **☑** parent registered + wrapped on Sepolia; subnames issued; records read back by an external client |
| 9 | ENS improves identity/discoverability non-cosmetically | ENS 2 | | **☑** `addr` → the app's wallet, `contenthash` → the manifest CID, ENSIP-25/26 records, mutual verification with the 0G token |
| 10 | **Present at ENS booth, Sunday morning, in person** | ENS 1/2 | **assign a name** | ☐ |
| 11 | Proof of 0G Compute / Private Computer inference | 0G 1 | | **☑** live on `verified` routing with `tee_verified: true`. The proof is a chain, not a screenshot: TEE request id → `provenance.attestationRef` → its keccak256 stored onchain in MiniAppRegistry against token 7 |
| 12 | **Contract deployment addresses** | 0G 1 | | **☑** Galileo 16602 — AgenticId `0xeB2872…C3B0`, MiniAppRegistry `0x093319…8dA8`, Verifier `0x708aE7…aaD3` |
| 13 | **Minted Agentic ID linked on 0G explorer** (bonus qualification) | 0G 1 | | **☑** token 6, `chainscan-galileo.0g.ai/token/0xeB2872…C3B0?a=6` |
| 14 | Demo video **under 3:00** (satisfies 0G *and* Graph's 2–4) | all | | ☐ |
| 15 | Live demo link | 0G 1 | | ☐ **and it gates #8/#9 quality** — published records currently carry `localhost:3000` |
| 16 | Team names + Telegram/X | 0G 1 | | ☐ |
| 17 | **Proper git history** — small, frequent, descriptive commits | ETHGlobal | everyone | **◐** on track |
| 18 | AI-tool usage attributed; specs/prompts committed | ETHGlobal | | **☑** this document is the artifact, with Appendix C recording why each major decision changed; plus `docs/superpowers/specs/` and `plans/` for the theme and drawer work. The stale v1 draft was dropped and every reference to it removed — a planning doc that links a missing file argues against itself |
| 19 | Select exactly 3 partner prizes: Graph, ENS, 0G | submission | | ☐ |

**Addressable:** $15,000 (Graph ×3) + $3,000 (ENS 1+2) + $6,000 (0G T1) = **$24,000 across 6 tracks, 3 selections.**

> Rules: up to **3 partner prizes**; a multi-track partner counts as **1 selection**. Graph + ENS + 0G uses all three and covers six tracks in one repo.

**Sponsor-brief alignment worth noting:** Graph Track 2's own example ideas include *"trading/execution agent with live liquidity + x402 pay-per-query"*, *"portfolio/PnL copilot"*, and *"risk-monitoring agent for lending liquidations."* The autonomous framing hits three of six listed examples. You are building what they asked for.

---

# 15. Build plan — parallel execution

Build capacity is not the constraint; **coordination is.** Everything below is organized around that: freeze the seams first, fan out wide, and defend the integration points.

## Phase 0 — freeze the contracts (blocks everything, do it first)

The highest-leverage hour in the whole build. N agents can only produce composable work if the interfaces between them are defined *before* they start. Write these as real, committed artifacts — not prose in this document:

| Artifact | Location | Why it blocks |
|---|---|---|
| Manifest JSON Schema (`graphmini/2`) | `packages/kit/src/contracts/manifest.schema.json` | Every workstream reads or writes it |
| Component + action catalog | `packages/kit/src/contracts/catalog.ts` | Composer emits against it; renderer implements it. Mismatch = nothing renders |
| Kit public API signatures | `packages/kit/src/contracts/api.ts` | `plan · fanOut · compose · publish · policy` — Studio and MCP both bind to it |
| Policy engine interface | `packages/kit/src/contracts/policy.ts` | Signer, triggers, and UI all call through it |
| A2UI document shape emitted | `packages/kit/src/contracts/a2ui.ts` | The composer/renderer seam — the most likely place a parallel build silently diverges |
| Data-source descriptor | `packages/kit/src/contracts/source.ts` | Resolver, fan-out, and streams all traffic in it |

**Rule: no workstream starts before its contracts exist.** Stub implementations that satisfy the types are fine and expected — an agent building the renderer should be able to work against a fixture manifest with no data plane in existence.

## The serial critical path — start these at hour zero

These are **queues, not work.** No amount of parallelism speeds them up, and every one of them blocks a qualification requirement. Kick all of them off before writing a line of code:

- **ENS 2LD registration** — plus propagation. Also the booth conversation (§18 Q1) that decides the issuance mechanism
- **Graph gateway API key** — Studio, wallet connect
- **0G testnet access** — faucet, RPC, Private Computer API key
- **npm org/package name** — claim `@graphminis` before someone else does
- **Domain + deploy target** — the live demo link is a 0G requirement

## Workstreams — fully parallel once Phase 0 lands

Each owns a directory, has a definition of done, and shares no mutable state with its siblings.

| # | Workstream | Owns | Depends on | Done when |
|---|---|---|---|---|
| W1 | **Data plane** | resolver, health checks, fan-out | source, manifest | Any of 10 schemas, 3 chains, dead deployments skipped, parallel merge |
| W2 | **Streams** | Substreams packages, subscription, trigger evaluation | source | ✅ **Done.** Block 487508074 on Arbitrum fired `0:stream:derisk`, the gate passed it, the journal recorded it — plus a control run that consumed three healthy blocks and fired nothing. `scripts/substreams-verify.ts` re-runs both |
| W3 | **Planner** | NL → plan, on 0G Compute, attestation capture | manifest, api | Arbitrary question → valid plan + stored attestation |
| W4 | **Composer** | plan + data → A2UI doc, form-follows-data rules | catalog, a2ui | Every catalog component reachable from some data shape |
| W5 | **Renderer** | A2UI React, full catalog, actions wired, mobile | catalog, a2ui | ✅ **Done.** Fixture and composed manifests render, Button server-events dispatch, and the theme swap works — `[data-skin]` on the root element, tokens and material only, no component or catalog change. Verified round-trip: tier reads as depth in `tactile` and as border weight (1.5/2.5/5px) in `flat`, so agency stays legible in both |
| W5b | **Shell** | ~~desktop, windows, taskbar, tray, Start menu, Task Manager~~ **cut — see §6.** Board, Ledger, App | — | Board lists apps by tier; Ledger streams every action; global halt in the top bar |
| W6 | **Agency** | policy engine, smart account + session keys, signer, kill switch, journal | policy, manifest | Action executes on testnet; every policy rejection path tested |
| W7 | **Identity** | ENS issuance + records, ERC-7857 + oracle + mint, mutual verification | manifest | Name resolves to app; ENSIP-25 binding verifies both directions |
| W8 | **Memory** | encrypted 0G Storage per app, action journal | manifest | App recalls prior runs; journal backs the on-screen log |
| W9 | **Studio** | describe · build · refine · configure · publish | api | Sentence → live app → published, no terminal |
| W10 | **Ecosystem** | registry, fork/remix, ratings, x402 creator payouts | manifest, api | Fork produces fresh wallet/name/ID with zero inherited authority |
| W11 | **Distribution** | npm publish, MCP server, SKILL.md | api | A stranger installs it and gets a rendered app |
| W12 | **Seed content** | 12–15 mini apps spanning the full range | W9 | Registry is populated across analytics → monitor → autonomous |
| W13 | **Submission** | README, architecture diagram, video | — | §14 matrix fully checked |

**W12 deserves more respect than it usually gets.** A registry with three apps in it looks like a prototype; one with fifteen spanning the whole range looks like a platform. It's also the cheapest possible credibility given parallel capacity — and it's what makes the §2 range diagram real rather than aspirational.

## Integration checkpoints — where parallel builds actually fail

Parallel agents rarely fail by writing bad code. They fail by writing code that doesn't compose, and nobody notices until the end. Three hard sync points, each requiring a human to look at the whole thing end-to-end:

**Checkpoint 1 — the vertical slice.** One question → plan → data → A2UI doc → rendered. No actions, no identity. This proves W1/W3/W4/W5 agree on the seams. Until this passes, every other workstream is building on an unverified assumption.

**Checkpoint 2 — the action loop.** A button in a rendered app dispatches a server event, hits the policy engine, gets signed, lands on testnet, and appears in the journal. This is the differentiator and it crosses four workstreams (W5/W6/W8/W9) — the highest-risk seam in the build.

**Checkpoint 3 — the full artifact.** Publish → ENS records written → Agentic ID minted → resolve the name from a *different* client → it runs. Proves W7/W9/W10/W11 compose.

Anything not exercised by a checkpoint is unverified, regardless of how done it looks.

## What parallelism does not buy you

Worth naming so it doesn't surprise anyone at 3am:

- **The serial critical path above.** ENS propagation takes what it takes.
- **Third-party discovery blockers.** When A2UI's action loop or ERC-7857's oracle behaves unexpectedly, ten agents mostly reproduce the same confusion. Assign one owner, let them go deep, don't fan out on an unknown.
- **The integration checkpoints.** Serial by nature, human-judged.
- **The recording.** Budget three hours. It always takes three hours.
- **The Sunday 09:00 deadline**, which is fixed.

## A note on the AI-tool policy

ETHGlobal permits AI tools with attribution, and states plainly that **AI should assist, not wholly create the project** — while explicitly blessing spec-driven workflows *provided all specs, prompts, and planning artifacts are committed to the repo.*

That second clause is your protection, and this document is the artifact it's describing. Keep committing the specs. Keep human decisions visible in the history — the architectural calls, the booth conversations, the scope judgments. A repo where the reasoning is legible reads as spec-driven engineering; one that's only generated output reads as the thing the policy is aimed at. Given how much of this build is agent-executed, this is worth being deliberate about rather than hoping it looks fine.

---

# 16. Demo script — 2:50

Satisfies 0G's <3:00 and Graph's 2–4:00. One cut.

```
0:00–0:18  POSITIONING. Say the thesis out loud.
           "The Graph had everything it needed to be Dune. It indexes more
            chains, more protocols, in real time. But it only ever built for
            developers — so everyone else went to Dune. We built the surface
            The Graph never did."

0:18–0:50  THE OPAL MOMENT. Type into the Studio, verbatim:
           "Watch my lending positions and DEX exposure across Arbitrum,
            Optimism and Base. Rebalance if health factor drops under 1.4."
           The plan streams: classified autonomous, two standardized schema
           families across three chains, and — say this number out loud —
           18 of 22 deployments live, 4 skipped as dead.
                                                    ← Graph T2 + T3

           [Use this question. Measured: autonomous tier, 2 schemas x 3 nets,
            18/22 live, 70 rows. The single-chain variants resolve 9 of 9 and
            the dead-source story never appears on camera, which throws away
            the Track 3 argument.]

0:50–1:12  THE VIBEOS MOMENT. The UI assembles — health gauge, position table,
           trade log, policy badge.
           "Nobody built this screen. It chose a gauge because a health factor
            is a bounded ratio."
           Swap the theme live — same manifest, modern rendering, instantly.
           "The agent has no idea what it looks like. It emits semantic A2UI;
            the client picks the components. It cannot inject code."
                                                    ← technical execution

1:12–1:50  THE LEAP. Drop the health factor on testnet. A line lands in the
           Ledger: "aave-guard.eth executed a swap." The trade log fills.
           "This isn't a dashboard. It has a wallet, a $500 cap, and one
            allowlisted router."
           Open the enforcement panel — it states per constraint who enforces
           what, read live from the validator.
           "The allowlist and the expiry are enforced by the account itself.
            Here's the permission id, and the app checked with the validator
            before it signed. The dollar conversion is still ours — we show you
            which is which."
           [In stub mode the same panel says verifiedOnchain: false, so this
            cannot overstate by accident. Never claim a completed onchain-
            enforced trade until a userOp has actually landed.]
           Then hit the kill switch on the app, and global halt in the top bar.
           The Ledger shows the next trigger arriving and being refused.
           "And that's the kill switch — the app is still running, it just
            can't spend. Dune can't do any of this."
                                                    ← the differentiator

1:50–2:08  IDENTITY. The title bar reads aave-guard.graphminis.eth — resolving
           to the UI, the wallet address, and Agentic ID #142 on 0G Chain. The
           ENS record and the onchain token verify each other.
           Paste the name into a different agent — it resolves, reads
           agent-context, and runs.                 ← ENS T1 + T2, 0G T1

2:08–2:28  THE ECOSYSTEM. The registry. Fork one — it lands on the Board as a
           new card. Fresh wallet, fresh name, no inherited spending authority;
           show the forked app's addr differing from its parent's. The creator
           earns $0.05 per run via x402, on the same rail the agent uses to buy
           its own data.
                                                    ← Graph T1, ecosystem

2:28–2:50  npm i @graphminis/kit — any agent gets this.
           "15,000 subgraphs. Every question is an app now, and every app can
            act. That's The Graph, finally pointed at everyone."
                                                    ← Graph T1
```

**Notes.** The 1:10 leap is the video — rehearse until boring. Pre-record a fallback clip of the live query and the firing trade; venue wifi will fail during recording. Say the spend cap number out loud; it reads as confidence.

---

# 17. Risk register

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| **Parallel work doesn't compose.** Workstreams finish individually, nothing runs end-to-end | **High** | **Fatal** | Phase 0 contracts before any workstream starts. Three integration checkpoints (§15). The composer/renderer catalog seam is the likeliest divergence — pin it hardest |
| **Dead standardized subgraph mid-demo** — ~65 of 90 deployments live at any time | **High** | Fatal | Health-check before every fan-out; skip dead sources; re-verify demo queries 30 min before recording; keep one known-good pinned |
| **Serial critical path started late** — ENS propagation, npm name, 0G access | Med | **Fatal** | These are queues, not work. All kicked off at hour zero (§15), before any code |
| Checkpoint 2 (the action loop) slips | Med | **Fatal** | It's the differentiator and it crosses four workstreams. Highest-risk seam — schedule it early and treat a miss as a stop-the-line event |
| A2UI action loop behaves unexpectedly | Med | High | One owner goes deep; do **not** fan out on an unknown. Fallback: local action handler calling our API directly, identical UX |
| ERC-7857 oracle + encrypted metadata is fiddly | Med | Med | One owner, deep. Transfer/clone is a product feature (§12), so partial implementation has downstream cost — but a documented partial beats a broken full |
| Venue wifi dies during recording | **High** | High | Record core flow early Saturday. Keep fallback clips of the live query and the firing trade |
| **AI-tool policy** — repo reads as wholly generated rather than assisted | Med | **Fatal** | Commit specs and planning artifacts (policy explicitly blesses this). Keep human architectural decisions visible in history. See §15 closing note |
| Git history looks synthetic — bulk commits, no reasoning | Med | **Fatal** | Frequent commits with real messages. Pre-event commits ("test", "Iniit") are a clean pre-existing-work boundary — cite the hash in the README |
| Demo agent does something embarrassing with real money | Low | **Fatal** | Testnet. If mainnet, $20 wallet and say the number out loud |
| Judge: "an LLM with a wallet is reckless" | Med | Med | §7. Policy enforced onchain in the session key, not in the prompt — a compromised backend still can't exceed the cap. Have the table memorized |
| Judge: "isn't this just Dune?" | Med | Low | §1 table. Dune dashboards can't trade, can't be run by an agent, and don't exist until a human writes SQL |
| Breadth without depth — 10 schemas all shallow | Med | Med | Demo shows 2–3 families composing *well*; the other seven prove the resolver generalizes. Don't try to showcase all ten in 2:50 |
| Brutalism reads as unfinished rather than deliberate | Med | Med | §6 — borders on containers not cells, one heavy frame per panel then get quiet, hard shadow reserved for things you can act on. Judge it by screenshotting one panel and asking whether the *content* looks credible |
| Live standardized data contains impossible values | **High** | Med | Real: 13 of 74 rows on a routine fan-out, incl. SushiSwap TVL at 7.2e22 from a broken upstream price feed. Rows are flagged `_suspect` and ranked last, never dropped — sorting by the broken field once put the worst row at the top of the table |
| ~~Seed content is mistaken for live data~~ **Closed** | — | — | All 16 seed apps run through the real pipeline (`scripts/seed-live.ts`, 16/16 live). What remains seeded is `runs`/`forks`/ratings — social texture, not a data claim, and named as such in the README |
| **A broken upstream value reaching an aggregate or a ranking** | **High** | High | Suspect-last was enforced in the fan-out and then silently undone one layer up by the shape detector's re-sort — `$7.2e22` led a leaderboard and summed into a `$131685267736T` headline. Now: ranking is suspect-aware at *every* sort, aggregates exclude suspect rows and state how many, and `kit/shapes.test.ts` pins both. The lesson generalises — an invariant enforced at one layer is not enforced |
| **A field that does not exist on the live schema** | **High** | High | Three exceptions were documented in §13; a fourth (`nft-marketplace` denominates in ETH, so every `*USD` field is a hard query error) only appeared when the family was actually queried, and it zeroed the whole family. Introspect before trusting a schema doc |
| **A returning browser keeps stale seed bodies** | Med | Med | The board persists to localStorage, so a re-measured snapshot did not reach anyone who had already visited — the fix was live and invisible. The persisted blob now carries the snapshot's `generatedAt` and re-seeds when it changes, keeping user-published apps |

---

# 18. Open questions — resolve at booths Friday morning

1. **ENS:** we demo the onchain NameWrapper path — parent registered and wrapped on Sepolia, subnames and records written by transaction — with Namespace's offchain CCIP-Read behind the same interface as the alternative. We went onchain after finding NameStone shuts down 2026-08-03 and Durin runs on their gateway. Does the onchain path read as the stronger choice to you, or do you want to see gasless CCIP-Read subnames instead?
2. **ENS:** does "every mini app is an agent with a wallet, a name, and ENSIP-25/26 records" land better in Track 1 or Track 2? Which do you want us to lead with at the booth?
3. **The Graph:** which standardized-schema deployments are reliably live on Arbitrum *right now*? Directly attacks the top risk.
4. **The Graph:** is there a Substreams package we can subscribe to in an afternoon for price or lending events on Arbitrum, or should we poll and say so?
5. **The Graph:** does building on `subgraph-registry` / `graph-lending-mcp` count as additive? (Track 1 welcomes extension "if clearly additive" — get it confirmed.)
6. **0G:** is a scoped ERC-7857 (real mint, real token, no encrypted-metadata oracle) acceptable for the Agentic ID bonus qualification?
7. **0G:** does an OpenAI-compatible Private Computer call satisfy "proof of 0G Compute," or do they want an attestation artifact onchain?

---

# Appendix A — component and action catalog

A2UI requires the **client** to hold the approved catalog; the agent may only reference it by name. That's the security property and your scope fence — a finite catalog means a finite output space.

Catalog size is a design decision, not a budget one: a wider catalog means richer generated UI, but every component must be reachable from some data shape or the composer will never emit it. **Rule: no component ships without a rule that selects it** (W4's definition of done).

## Display components

| Component | Data shape that triggers it |
|---|---|
| `metric_card` | single scalar, optional delta |
| `bar_chart` | categorical × one metric |
| `grouped_bar` | categorical × multiple metrics |
| `time_series` | timestamped × one-or-more metrics |
| `area_stack` | timestamped × composition-of-a-whole |
| `candlestick` | OHLCV — price series with open/high/low/close |
| `leaderboard` | categorical, ranked — the most common question shape |
| `gauge` | **bounded ratio** — health factors, utilization, LTV |
| `progress_bar` | scalar against a known target |
| `comparison_grid` | ≥2 entities × shared metrics — **the cross-schema shot** |
| `heatmap` | two categoricals × one metric — protocol × chain |
| `distribution` | one metric, many observations — holder concentration |
| `flow_diagram` | source → destination with volume — bridges, routing |
| `position_card` | a held position: size, entry, PnL, risk |
| `data_table` | fallback when nothing else fits |
| `alert_banner` | a triggered condition needing attention |

## Action components

| Component | Emits | Notes |
|---|---|---|
| `action_button` | Server Event → policy engine → signer | The core primitive |
| `confirm_dialog` | Server Event, gated on user confirm | Required when `requireConfirm: true` |
| `amount_input` | data-model binding, feeds action context | Bounded by policy caps at render time, not just at signing |
| `allowlist_picker` | data-model binding | Only ever renders policy-approved targets |
| `kill_switch` | Local Function Call + Server Event | Must render in every autonomous app |
| `trade_log` | display-only, streams from the action journal (W8) | Non-negotiable — an agent that spends must show its work |
| `policy_badge` | display-only | Surfaces caps, expiry, allowlist. The user should never have to ask what it can do |

**Composer rule:** components are chosen from the *shape of the data*, never from keywords in the prompt. A bounded ratio becomes a gauge whether or not the user said "gauge." That's the defensible version of generative UI — and the reason the catalog can grow without the output becoming arbitrary.

`policy_badge` and `trade_log` are the two that make the safety story visible rather than asserted. Neither is optional in an autonomous app.

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
- AI tools: Claude Code for <what>; specs committed as prd.md and
  docs/superpowers/specs/

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

ETHGlobal asks for planning artifacts in the repo, so the revision history below is the artifact: every entry records what changed and why, and each one was a decision made against something that had already been built. The v1 draft it started from was dropped as stale — v2's correction table is what survived of it, and that table is the useful part.

## v7 — skeuomorphism, and depth replaces border weight (current)

Neo-brutalism was the right *structural* argument and the wrong material. What changed and why:

- **The honest risk in v6 came true on contact.** §6 said it out loud — "neo-brutalism is close to a default in crypto by 2026 … the direction only works if it is *specifically ours*." Built out, chunky borders on a light field read as a template, and the four rules meant to make it ours were not enough to carry it
- **Depth encodes agency better than border weight does.** A 1.5 / 2.5 / 5px scale is a quantity you have to measure against its neighbours; flush-versus-proud is a quality you see instantly and in isolation. Same load-bearing idea (Rule 1 survives), better physical metaphor — and a control that visibly *stands proud* reads as pressable, which is exactly the affordance an autonomous app's kill switch wants
- **A product that holds a wallet benefits from looking manufactured rather than sketched.** Rams / Braun is the reference: warm charcoal controls, tactile plastic surfaces, one orange action accent, nothing decorative
- **What did not change:** semantic colour with `--spend` reserved for value leaving a wallet, monochrome charts plus one accent, mono as half the interface, light mode, borders-on-containers density discipline, and the theme swap — which this change is itself evidence for, since the manifests did not move
- Spec and plan: `docs/superpowers/specs/2026-07-25-skeuomorphic-theme-design.md`, `docs/superpowers/plans/2026-07-25-skeuomorphic-theme.md`

Also corrected in this revision: §14 #6 no longer reads "x402 live". x402 is implemented end to end but `X402_PRIVATE_KEY` is unset, and the reference run's $0.0014 is 14 × the *gateway's* $0.0001 — it went over the API-key path. Coded is not verified, and the matrix now says which is which.

## v6 — neo-brutalism, and the shell is cut (superseded by v7)

The OS metaphor is gone. §6 is the built design and this entry is why it changed:

- **We do not control the composition.** An agent assembles the screen at runtime from a catalog, so the aesthetic had to hold together for six components it has never seen stacked together. A window manager makes that *harder*, not easier — it adds a second layout system on top of one we already cannot predict
- **W5b was a whole workstream buying nothing the product needed.** XP.css gives chrome but no window manager, so drag/resize/z-order was real work, and none of it made a generated interface more legible or a policy decision more visible
- **The three surfaces do the job the taskbar was there for.** Board answers "what do I have and what is it doing", the Ledger keeps background autonomy visible as it happens, global halt lives in the top bar. That is the whole "which agents are live" question, without simulating an OS to ask it
- **"Frame is 2001, data is 2026" was a rule protecting against a risk we no longer take.** A product that moves money reads better as severe than as nostalgic
- **What survives from v5:** the theme swap. It was always the load-bearing idea — same manifest, different catalog, rendered live — and it proves A2UI's core property regardless of which skin sits on top

Also corrected here: §9 named `deepseek-chat-v3`, which no longer exists on the 0G router, and did not mention that the router's default routing is not verifiable. Both are fixed in §9 and both were the kind of error that surfaces only once real keys exist.

## v5 — the interface is an operating system (superseded by v6)

Windows XP, committed to fully. Load-bearing rather than decorative:

- **The OS metaphor solves the product's hardest UX problem.** Autonomous agents run in the background; a taskbar, a system tray, and balloon notifications answer "which agents are live and what did they just do?" better than any dashboard idiom
- **Task Manager is the signature.** Ctrl+Alt+Del → your agents are the process list → End Task is the kill switch. Funny, and simultaneously the correct UX plus a visible answer to "what if it goes rogue?"
- **The theme swap proves A2UI.** Same manifest, different catalog, rendered live — the agent never knew what it looked like. Demonstrates the protocol's core property in one gesture and preempts "isn't the retro thing a gimmick?"
- **"Frame is 2001, data is 2026"** is the hard rule that keeps a money-moving product from reading as a joke
- Type stack is Tahoma / Trebuchet MS / Lucida Console — period-correct, distinctive, and zero font loading
- Added W5b (shell) as its own workstream: XP.css gives chrome and controls but no window manager, so drag/resize/z-order is real work

## v4 — built for parallel execution

Build capacity stopped being the constraint (agent-executed build), so the plan is now organized around **coordination** instead of hours:

- §15 rewritten from "what to cut" into **Phase 0 contracts → 13 parallel workstreams → 3 integration checkpoints.** Parallel builds fail at the seams, not in the code, so the seams are frozen before anyone starts
- **Serial critical path** called out separately — ENS propagation, npm name, 0G access. Queues, not work; unaffected by parallelism
- Scope restored where labor was the only reason to trim: **all ten standardized schemas** (Track 3 scores Breadth at 20%), three chains, full Substreams, expanded component catalog
- **Smart accounts + session keys** instead of a session-key EOA — policy enforced onchain, so a compromised backend still can't exceed the cap. A mechanism, not a story
- **Full ERC-7857** rather than a shaped-alike, because transfer and cloning are product features here — forking a mini app *is* a clone
- **Agent memory on 0G Storage** restored — an autonomous app that re-trades on a signal it already acted on is broken, so memory is a correctness requirement. Also hits 0G Track 1's stated example verbatim
- Risk register swapped from labor risks to **integration and attribution risks**, including ETHGlobal's "AI should assist, not wholly create" rule — which spec-driven workflows satisfy *if* the specs are committed

## v3 — the repositioning

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
