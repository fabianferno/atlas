# Graph Mini Apps — Product Requirements Document

> A mini app ecosystem powered by The Graph, where agents generate and render data-rich blockchain UIs on the fly.

**Contents**

1. [Product Overview](#1-product-overview)
2. [Feature Breakdown](#2-feature-breakdown)
3. [Technical Architecture](#3-technical-architecture)
4. [MVP Scope & Phases](#4-mvp-scope--phases)
5. [Hackathon Track Mapping](#5-hackathon-track-mapping)
6. [Submission Guide](#6-submission-guide)

---

# 1. Product Overview

## Vision

A **mini app ecosystem powered by The Graph** where anyone can create data-rich, shareable blockchain apps that are rendered on-the-fly by AI agents using A2UI (Agent-to-UI) frameworks. Think of it as the Dune Analytics dashboard-sharing moment — but for a world where agents generate and render UIs dynamically from live blockchain data.

## Problem

The Graph has built an incredible ecosystem of agentic tooling — MCP servers, x402 payments, A2A integrations, standardized subgraphs, Substreams. But this tooling is **siloed**: builders create one-off tools, dashboards, or agents that don't connect to each other. There's no shared surface where the community can create, share, and discover reusable mini apps built on The Graph's data infrastructure.

## Solution

**Graph Mini Apps** — a platform (and set of reusable primitives) that enables:

1. **Agent-driven UI generation**: Agents create mini apps on the fly using A2UI, pulling live data from The Graph.
2. **Shareable mini app templates**: Anyone can publish a mini app (prompt + graph query + UI spec) that others can instantiate.
3. **Cross-protocol composition**: Standardized subgraph schemas + Substreams composable modules enable cross-protocol data dashboards and agent queries.
4. **Agent identity & discovery**: ENS subnames and text records for mini app and agent identity.
5. **Verifiable inference**: 0G's sealed compute layer for AI agents that reason over Graph data.

## How It Works — Example

```
User: "Show me the top 5 DEXs by volume on Arbitrum this week"

Agent flow:
  1. Agent resolves the query intent
  2. Agent queries The Graph (via MCP or direct subgraph) for DEX volume data
  3. Agent renders an A2UI dashboard component with the results
  4. User sees a live, interactive mini app — not a static page

If the user likes it, they can:
  - Fork/share the mini app prompt + query config
  - Give the mini app an ENS subname like "top-dexs.eth"
  - Run the inference layer on 0G for private/verified reasoning
```

## Target Hackathon Tracks

| Track | How This Project Fits |
|-------|----------------------|
| **The Graph — Track 1** (Best AI Tooling) | Reusable infrastructure: A2UI mini app framework, Subgraph MCP integration, SKILL-based deployment |
| **The Graph — Track 2** (Best AI Use Case) | AI agent that reasons over live Graph data, renders dynamic mini app UIs |
| **The Graph — Track 3** (Composable Products) | Cross-protocol dashboards using standardized subgraph schemas + Substreams composition |
| **ENS — Track 1** (Creative Use) | ENS subnames for mini app identity, text records for app metadata/versioning |
| **ENS — Track 2** (AI Agents) | Agent name resolution, subname registries for agent fleets, onchain discoverability |
| **0G — Track 1** (Best AI Product) | Verifiable AI inference over Graph data, agent memory via 0G Storage |
| **0G — Track 2** (Infrastructure) | Agent framework layer combining Graph MCP + 0G Compute + A2UI rendering |

## Key Differentiators

- **Not another dashboard builder** — this is agent-generated, prompt-driven UI. No drag-and-drop.
- **Not another MCP server** — this is a composition layer that connects existing MCPs, SKILLs, and A2UI into a mini app ecosystem.
- **Standards-first** — built on Messari Standardized Subgraphs and composable Substreams, not single-subgraph queries.
- **Shareable by design** — every mini app is a shareable artifact (prompt + query config + UI spec), like a "dashboard as code."

---

# 2. Feature Breakdown

## 2.1 Mini App Runtime (A2UI Engine)

The core rendering layer. Agents generate mini app UIs dynamically using A2UI frameworks.

### Features

- **A2UI Component Generation**: Agents describe UI in natural language or structured prompts → A2UI framework renders it.
- **Live Data Bindings**: Mini app components bind to The Graph subgraph queries, so UI updates as onchain data changes.
- **Component Library**: Pre-built A2UI components for common blockchain data patterns:
  - Token price charts (OHLCV)
  - TVL / volume bars
  - Transaction tables
  - Wallet balance cards
  - Protocol revenue breakdowns
  - Leaderboards / rankings
  - Alert/notification banners
- **Snapshot Mode**: Agents can save a point-in-time render (shareable link) of a mini app state.
- **Fork & Remix**: Any mini app can be forked with modified queries, prompts, or UI specs.

### Example

```
Agent receives: "Show me Uniswap V3 revenue on Arbitrum for the last 7 days"
Agent generates: An A2UI component with a bar chart + data table
Data binds to: Subgraph query against the Standardized Lending/DEX schema
Result: Live chart showing daily revenue, with clickable bars for details
```

## 2.2 Mini App Registry (Create, Share, Discover)

A catalog where mini apps are published and discovered.

### Features

- **Publish Mini App**: Authors submit a mini app defined by:
  - **Prompt / System instruction**: The agent prompt that generates the UI
  - **Query config**: Subgraph endpoint, query variables, schema binding
  - **UI spec**: A2UI component definition or template reference
  - **Metadata**: Title, description, tags, category, author ENS
- **Discover / Browse**: Filter by category (DeFi, NFTs, DAOs, Cross-protocol), chain, protocol, or tag.
- **Instantiate Mini App**: Clicking a mini app runs its prompt + queries against The Graph and renders the A2UI.
- **Rate & Review**: Community ratings for usefulness, accuracy, design.
- **Versioning**: Mini apps can be versioned when prompts or queries change.

### Example

```
Published Mini App: "Arbitrum DEX Revenue Comparator"
Prompt: "Compare daily trading volume across the top 5 DEXs on Arbitrum"
Query config: Subgraph — Standardized DEX schema, Arbitrum network
Tags: #defi #arbitrum #dex #revenue
Institutions that use it: 142
Average rating: 4.7/5
```

## 2.3 The Graph Integration Layer

Deep integration with The Graph's data and AI tooling.

### Features

- **Subgraph Studio Integration**: Auto-configuration of subgraph API keys and endpoints.
- **MCP Server Aggregation**: Query multiple MCP servers (lending, DEX, CDP, derivatives) through a unified interface.
- **x402 Pay-per-Query Support**: Mini apps can be gated behind x402 payments — authors earn per query.
- **Standardized Subgraph Auto-Binding**: When a mini app references a protocol, auto-resolve to the correct standardized subgraph schema.
- **Substreams Data Streaming**: For real-time dashboards, pull data from Substreams (not just polled subgraphs).
- **Cross-Protocol Query Router**: One prompt → fan out to multiple protocol subgraphs → aggregate results.

### Example

```
User prompt: "How much total value is locked across all lending protocols on Optimism?"
The Graph layer:
  1. Resolves "lending protocols" → Standardized Lending Subgraph schema
  2. Queries Subgraph Studio for Optimism lending data
  3. Aggregates TVL across Aave, Morpho, etc.
  4. Returns data → A2UI renders a TVL card
```

## 2.4 Agent Intelligence Layer

The reasoning layer — agents that understand queries, compose data, and decide what UI to render.

### Features

- **Query Intent Parser**: Parses natural language queries → maps to The Graph subgraphs and standardized schemas.
- **Multi-Source Compositor**: Combines data from multiple subgraphs/MCPs into a unified view.
- **Agent Memory**: Agents remember user preferences, past queries, and mini app interactions.
- **Auto-Recommendation**: Based on query patterns, agents suggest relevant mini apps or data sources.
- **SKILL-Based Deployment**: One-prompt deployment using Substreams SKILLs or custom agent SKILLs.

### Example

```
User: "I've been looking at GMX on Arbitrum. What's the top perp DEX by open interest?"
Agent:
  1. Remembers user queried GMX 3 hours ago (from memory)
  2. Resolves "perp DEX" → Standardized Perpetuals schema
  3. Queries Subgraph for open interest data
  4. Renders a comparison mini app: GMX vs Hyperliquid vs Jupiter
  5. Suggests: "Want me to track open interest changes over time?"
```

## 2.5 ENS Integration

ENS-powered identity and discovery for mini apps and agents.

### Features

- **Mini App ENS Names**: Each published mini app can claim an ENS subname (e.g., `top-dexs.graph.eth`).
- **ENS Text Records for App Metadata**: Store mini app metadata in ENS text records:
  - `app/prompt` — the agent prompt
  - `app/query` — subgraph query config hash
  - `app/version` — version number
  - `app/author` — author ENS name
  - `app/instructions` — usage instructions
- **Agent Name Resolution**: AI agents resolve ENS names → get protocol identity, capabilities, and metadata.
- **Subname Registry for Agent Fleets**: Agent teams register subname trees (e.g., `agent-a.graph.eth`, `agent-b.graph.eth`).
- **ENSIP-25 Agent Verification**: Verify agent identity via onchain ENSIP-25 name ownership.
- **ENSIP-26 Agent Text Records**: Standardized agent metadata in ENS text records.

### Example

```
Mini App: "Arbitrum DEX Revenue Comparator"
ENS: `dex-comparator.graph.eth`
Text records:
  app/prompt → "hash:0xabc..."
  app/version → "2.1.0"
  app/author → "0xauthor.eth"
  app/instructions → "Click bars for protocol-level breakdown. Data updates every 5 minutes."

Agent resolving `dex-comparator.graph.eth`:
  1. Looks up text records via ENS resolver
  2. Fetches prompt and query config from hash
  3. Instantiates the mini app with live Graph data
```

## 2.6 0G Integration

0G-powered inference, storage, and verifiable compute.

### Features

- **Sealed Inference for Private Queries**: Agents can run sensitive queries (e.g., private portfolio analysis) through 0G Private Computer (TEE-sealed).
- **0G Storage for Agent Memory**: Persistent, encrypted agent memory stored on 0G Storage.
- **Agentic ID for Mini App Authors**: Authors can mint an Agentic ID on 0G, linking their identity across Graph + 0G.
- **Onchain Micropayments via 0G Chain**: Mini app creators earn via micropayments settled on 0G Chain (x402 + 0G).
- **Verifiable Model Provenance**: When agents use AI models for analysis, 0G provides cryptographic proof of inference provenance.

### Example

```
User wants: Private portfolio risk analysis across 5 chains
Flow:
  1. Agent receives wallet address (kept private via TEE)
  2. Agent queries Graph subgraphs for portfolio holdings
  3. Inference runs on 0G Private Computer (wallet never leaves TEE)
  4. Memory of past analyses stored in encrypted 0G Storage
  5. Results rendered as a risk dashboard mini app
```

## 2.7 Cross-Track Composition Features

Features that explicitly target multiple hackathon tracks simultaneously.

- **One-Prompt Deployment (Graph Track 1 + 0G Track 2)**: Deploy a full mini app stack (Graph MCP + 0G Compute + A2UI) via a single agent prompt / SKILL.
- **Cross-Protocol Dashboard (Graph Track 3 + ENS Track 1)**: Dashboard aggregating standardized subgraphs, with each protocol section name-spaced to an ENS subname.
- **AI Agent Fleet Manager (Graph Track 2 + ENS Track 2 + 0G Track 1)**: Agent fleet with ENS-registered subnames, running verified inference on 0G, querying Graph data.
- **x402 Monetized Mini Apps (Graph Track 1 + 0G Track 1)**: Mini apps with pay-per-query via x402, with revenue routed to the creator's 0G wallet.

---

# 3. Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User / Agent Layer                        │
│  Natural language → Agent intent → A2UI component generation     │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │   Mini App Runtime (A2UI)    │
              │  - Component library         │
              │  - Live data bindings        │
              │  - Snapshot / fork / remix   │
              └──────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │   Query Intent & Routing     │
              │  - Intent parser             │
              │  - Cross-protocol router     │
              │  - MCP aggregation           │
              └──────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │    The Graph Integration     │
              │  - Subgraph Studio API       │
              │  - Subgraph MCP server(s)    │
              │  - Substreams streaming      │
              │  - x402 payment layer        │
              └──────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │   Data Sources               │
              │  - Standardized Subgraphs    │
              │  - Protocol-specific subgraphs│
              │  - Substreams packages       │
              └─────────────────────────────┘
```

## Layer 1: A2UI Rendering Engine

**Purpose**: Transform agent-generated UI specifications into rendered mini app components.

**Components**:
- **A2UI Renderer**: Interprets A2UI component definitions and renders them in the browser / agent environment.
- **Data Binding Engine**: Connects A2UI components to live subgraph query results. Supports polling intervals and WebSocket/substream updates.
- **Component Store**: Local registry of pre-built blockchain-specific A2UI components (charts, tables, cards).

**A2UI spec example** (conceptual — actual format depends on framework):
```
component: "bar_chart"
data_source: "subgraph_query"
query: "DEXVolume"
dimensions: ["protocol_name"]
metrics: ["volume_usd", "fee_usd"]
time_range: "7d"
chart_style: "grouped_bar"
```

## Layer 2: Query Intent & Routing

**Purpose**: Translate natural language into structured subgraph queries and route to the right data sources.

**Components**:
- **Intent Parser**: Maps user/agent queries to standardized schema types.
  - Input: "Show me top DEXs by volume"
  - Output: `{ schema: "DEX", metric: "volume", order: "desc", limit: 10 }`
- **Schema Resolver**: Maps protocol/category names to standardized subgraph schemas (Messari).
- **MCP Fan-Out Router**: Distributes queries to multiple MCP servers in parallel, aggregates results.
- **Query Optimizer**: Chooses between Subgraph Studio (polling) vs Substreams (streaming) based on data freshness needs.

**Query routing logic**:
```
User query → Intent parser → Schema type
  ├─ DEX → Standardized DEX Subgraph → Subgraph Studio (polling) or Substreams (streaming)
  ├─ Lending → Standardized Lending Subgraph → Subgraph Studio
  ├─ Derivatives → Standardized Perpetuals Subgraph → Subgraph Studio
  └─ Cross-protocol → Fan out to all 3 → Aggregate → Render
```

## Layer 3: The Graph Integration

**Purpose**: Direct interface with The Graph's infrastructure — subgraphs, MCP, x402, Substreams.

**Subgraph Query Interface**:
- Abstracted client that works with Subgraph Studio, The Graph Market, and local subgraphs.
- Auto-configures API keys, endpoints, and network selection from The Graph Studio.
- Handles query batching and caching.

**MCP Integration**:
- Discovers available MCP servers via MCP registry / glama.ai.
- Maintains a local MCP proxy that fans out queries.
- Supports standardized query format across different MCP implementations.

**x402 Layer**:
- Integrates x402 payment flows for paid subgraph queries.
- Mini app creators can opt-in to x402 gating: each instantiation of their mini app triggers a payment.
- Payment routing to creator wallets.

**Substreams Integration**:
- For real-time data needs, subscribes to relevant Substreams packages.
- Streams data to ClickHouse, Postgres, or in-memory store for live dashboards.

## Layer 4: Mini App Registry

**Purpose**: Store, version, and serve mini app definitions.

**Data Model**:
```
MiniApp {
  id: string (unique identifier)
  title: string
  description: string
  prompt: string (system instruction for agent)
  query_config: {
    endpoint: string (subgraph URL)
    query: string (GraphQL query template)
    variables: object (variable definitions with defaults)
    schema_type: string (DEX, Lending, NFT, etc.)
  }
  ui_spec: object (A2UI component definition)
  author_ens: string (optional ENS name)
  tags: string[]
  category: string (DeFi, NFT, DAO, Cross-protocol, etc.)
  version: string
  x402_enabled: boolean
  x402_price: number (optional, in ETH)
  stats: {
    instances: number (times instantiated)
    rating: number (0-5)
    reviews: number
  }
  created_at: timestamp
  updated_at: timestamp
}
```

**Storage Options**:
- GitHub repo as registry (lightweight, hackathon-friendly)
- Onchain registry (ENS IPFS hash + onchain metadata)
- Simple hosted API (for demo purposes)

## Layer 5: ENS Integration

**Purpose**: Use ENS for mini app identity, agent identity, and metadata storage.

**ENS Usage Patterns**:

1. **Mini App Names**: Each mini app claims a subname under `*.graph.eth` (or a custom namespace).
   - `dex-comparator.graph.eth` → resolves to mini app metadata
   - `portfolio-tracker.graph.eth` → resolves to another mini app

2. **Text Record Metadata**: Mini app and agent metadata stored in ENS text records.
   - `app/prompt` → hash of agent prompt (fetch from IPFS or registry)
   - `app/version` → semantic version
   - `app/schema` → standardized schema type
   - `app/author` → author ENS name
   - `app/rating` → community rating

3. **Agent Registry**: AI agents register their identity via ENS.
   - `agent-a.graph.eth` → agent capabilities and metadata
   - Resolves via ENSIP-25 for name ownership verification
   - Uses ENSIP-26 for agent-specific text records

4. **Subname Trees for Agent Fleets**:
   ```
   fleet.graph.eth
   ├── agent-alpha.graph.eth
   ├── agent-beta.graph.eth
   └── agent-gamma.graph.eth
   ```

## Layer 6: 0G Integration

**Purpose**: Leverage 0G for verifiable compute, storage, and agent identity.

1. **Private Computer (TEE-Sealed Inference)**:
   - Sensitive queries (portfolio analysis, private agent reasoning) run inside a TEE.
   - The wallet address / query context never leaves the TEE.
   - Inference output is cryptographically verified.

2. **0G Storage**:
   - Encrypted agent memory (past queries, preferences, mini app history).
   - Mini app definitions can be stored here as an alternative to on-chain/GitHub.

3. **Agentic ID**:
   - Authors mint an Agentic ID on 0G Chain.
   - Links their Graph activity, mini app creations, and 0G inference into one identity.

4. **0G Chain Micropayments**:
   - Settlement layer for x402 payments.
   - Mini app creators receive micropayments for each query.

## Tech Stack Recommendations

### Frontend (A2UI Renderer)
- Framework: Next.js or similar (for demo site + registry)
- A2UI library: The A2UI framework (as specified by sponsor)
- Charting: Recharts / Lightweight-charts (for financial data visualization)

### Backend (Query & Routing)
- Runtime: Node.js / TypeScript
- Query client: GraphClient (The Graph's official SDK)
- MCP client: MCP SDK (for server communication)
- Caching: Redis or in-memory TTL cache

### Registry (Mini App Storage)
- Primary: GitHub repo (README + JSON/YAML mini app definitions)
- Secondary: IPFS via ENS text records (for onchain discoverability)

### ENS
- ethers.js / viem for ENS resolution
- ENSIP-25 + ENSIP-26 client libraries

### 0G
- 0G SDK for Private Computer access
- 0G Storage SDK for encrypted persistence
- 0G Chain SDK for Agentic ID and payments

## Data Flow — Complete Example

```
1. User visits mini app site → clicks "Arbitrum DEX Revenue" mini app
2. Registry returns mini app definition:
   - Prompt: "Compare daily DEX revenue on Arbitrum"
   - Query config: DEX schema, Arbitrum endpoint
   - UI spec: bar_chart component
3. A2UI Renderer initializes with the component spec
4. Query Intent layer parses and sends GraphQL query to The Graph
5. Subgraph Studio returns volume data
6. Data Binding Engine maps query results to bar_chart dimensions/metrics
7. A2UI component renders → user sees live bar chart
8. (Optional) Agent memory logs this interaction
9. (Optional) User's ENS name is resolved for personalization
10. (Optional) If query is sensitive, reroute through 0G Private Computer
```

---

# 4. MVP Scope & Phases

## MVP Definition

The minimum viable product that qualifies for **The Graph Track 2** (Best AI Use Case) and provides a foundation for other tracks.

## MVP Must-Haves

### 1. Mini App Renderer (A2UI)
- [ ] Basic A2UI component rendering (bar chart, data table, card)
- [ ] Live data binding to a single subgraph query
- [ ] One example mini app: "Top DEXs by Volume" (renders live data from standardized DEX subgraph)

**Example**: User visits the site → sees a bar chart showing DEX volumes → data updates every 5 minutes from The Graph.

### 2. Query Intent Layer (Basic)
- [ ] Hardcoded intent → query mapping for 3-5 query patterns
  - "top X by metric" → leaderboard query
  - "X over time" → time-series query
  - "compare X" → multi-protocol comparison
- [ ] Subgraph query builder from intent output

**Example**: User types "top 5 DEXs by volume" → system generates GraphQL query → sends to subgraph → returns data → chart renders.

### 3. Mini App Registry (Simple)
- [ ] GitHub-based registry (mini app definitions as JSON files)
- [ ] Browse/list published mini apps
- [ ] One-click instantiation of a mini app

**Example**: Site shows a list of mini apps → user clicks one → it loads and renders.

### 4. The Graph Integration
- [ ] Subgraph Studio API key configuration
- [ ] Query execution against 1-2 standardized subgraphs
- [ ] Error handling + loading states

### 5. Demo Video Material
- [ ] End-to-end demo: user types query → sees mini app render
- [ ] Shows at least 2 different mini apps
- [ ] Under 4 minutes

## Phase 2: Multi-Track Qualification

After MVP, add features to qualify for additional tracks:

### For Graph Track 1 (AI Tooling)
- [ ] MCP server aggregation layer
- [ ] x402 payment integration (basic)
- [ ] SKILL.md with deployment instructions
- [ ] Open-source framework documentation

### For Graph Track 3 (Composable Products)
- [ ] Standardized subgraph auto-binding
- [ ] Cross-protocol query router (3+ protocols)
- [ ] Substreams data streaming for at least one data source

### For ENS Track 1 & 2
- [ ] ENS subname registration for mini apps
- [ ] ENS text records for app metadata
- [ ] Agent ENS registry (2-3 test agents with subnames)

### For 0G Track 1 or 2
- [ ] 0G Private Computer integration for one sensitive query type
- [ ] 0G Storage for agent memory
- [ ] Agentic ID minting flow

## Phase 3: Polish & Production

- [ ] Full A2UI component library (10+ components)
- [ ] Agent memory system (persistent preferences)
- [ ] Mini app forking and remixing
- [ ] Community ratings and reviews
- [ ] Versioned mini apps
- [ ] Dashboard snapshot sharing (shareable links)
- [ ] Multi-chain support (3+ chains)
- [ ] Real-time Substreams streaming
- [ ] Full ENS integration (fleet registry, ENSIP-25/26)
- [ ] 0G micropayment settlement

## Scope Decisions

### In Scope for MVP
- Single chain (Arbitrum or Ethereum)
- 3-5 pre-built mini app templates
- GitHub-based registry (no custom backend needed)
- Hardcoded intent mappings (not full LLM-based parsing)
- Basic chart + table components

### Out of Scope for MVP
- Full natural language query parsing (use templates first)
- Multi-agent coordination
- Full 0G infrastructure (Phase 2)
- Production-grade registry (Phase 3)
- NFT/gaming/DAO subgraphs (focus on DeFi first)
- Mobile-responsive A2UI rendering

---

# 5. Hackathon Track Mapping

## How One Project Maps to Multiple Tracks

This project is designed so that a single submission can qualify for **multiple tracks**. Below is the mapping of features → tracks → qualification compliance.

## The Graph — Track 1: Best AI Tooling

**Qualification checklist**:
- [x] Reusable infrastructure (not a single end-user app) → **Mini App framework + SKILL + MCP aggregation layer**
- [x] Consumes live Graph data → All mini apps query live subgraph data
- [x] Open-source with clear README / SKILL.md → GitHub repo with framework docs
- [x] Public repo + 2–4 min demo video

**Which features demonstrate Track 1**:

| Feature | How It Demonstrates |
|---------|-------------------|
| Mini App Runtime (A2UI Engine) | Reusable rendering infrastructure — any agent can use it |
| Query Intent & Routing Layer | Framework for parsing queries → standard schema → MCP fan-out |
| x402 Payment Integration | Reusable payment primitive for data monetization |
| SKILL-Based Deployment | One-prompt deployment via Substreams SKILLs |

**Judging alignment**:

| Criteria | Evidence |
|----------|----------|
| Usefulness to other builders (30%) | Any builder can publish a mini app; framework is reusable across protocols |
| Reusability & completeness (25%) | Full stack: rendering, query routing, registry, payment layer |
| Effective use of The Graph (20%) | Queries live subgraphs, uses MCP, Substreams, x402 |
| Technical execution (15%) | Multi-layer architecture with A2UI + Graph + ENS + 0G |
| Innovation (10%) | A2UI + mini app ecosystem is a new paradigm for Graph data access |

## The Graph — Track 2: Best AI Use Case

**Qualification checklist**:
- [x] The Graph as load-bearing data source → Mini apps cannot exist without live subgraph data
- [x] Live data from Graph provider → Subgraph Studio / The Graph Market
- [x] AI/agent component that reasons over data → Agent intent parser + compositor + A2UI renderer
- [x] Public repo + 2–4 min demo video
- [x] Describes which subgraphs/endpoints/tools were used

**Which features demonstrate Track 2**:

| Feature | How It Demonstrates |
|---------|-------------------|
| Agent Intelligence Layer | Agent reasons over user queries, composes multi-source data, recommends actions |
| Mini App Registry | AI-generated, AI-rendered mini apps as the primary UX |
| Cross-Protocol Query Router | Agent composes data across protocols into unified views |
| Agent Memory | Agent remembers context and personalizes future interactions |

**Judging alignment**:

| Criteria | Evidence |
|----------|----------|
| Effective use of The Graph (35%) | Graph data is the core — no Graph = no mini app |
| Usefulness & impact (25%) | Natural language → live dashboard; democratizes blockchain data access |
| Technical execution (20%) | Agent reasoning + A2UI rendering + live data binding |
| Innovation (10%) | Agent-generated UI is novel for blockchain data |
| Demo & clarity (10%) | Live demo: type a query, see a mini app render in real-time |

## The Graph — Track 3: Composable / Standardized Products

**Qualification checklist**:
- [x] Compose 2+ Graph products OR build on standardized schema → Cross-protocol dashboard using 3+ standardized subgraphs
- [x] Live data from Graph provider
- [x] Standards leverage clear in demo
- [x] Public repo + 2–4 min demo video

**Which features demonstrate Track 3**:

| Feature | How It Demonstrates |
|---------|-------------------|
| Standardized Subgraph Auto-Binding | Mini apps reference schemas (DEX, Lending, Perpetuals), not specific subgraphs |
| Cross-Protocol Query Router | Composes DEX + Lending + Derivatives data in one view |
| Substreams Composition | Reusable Substreams packages (e.g., ERC-4626 module) as data sources |
| Multi-MCP Aggregation | Aggregates lending MCP + DEX MCP + CDP MCP |

**Demo example for Track 3**:
```
Dashboard: "Cross-Protocol DeFi Overview"
Data sources:
  - Standardized DEX Subgraph → Arbitrum DEX volume
  - Standardized Lending Subgraph → Optimism lending TVL
  - Standardized Perpetuals Subgraph → Arbitrum perp open interest
  - Substreams module (ERC-4626) → Tokenized vault yields
All rendered in one A2UI dashboard component with live data.
```

**Judging alignment**:

| Criteria | Evidence |
|----------|----------|
| Leverage of composability/standards (35%) | Built entirely on Messari standardized schemas, composable Substreams |
| Breadth (20%) | 3+ protocols, 2+ chains, 2+ Graph products (subgraphs + Substreams + MCP) |
| Technical execution (20%) | Multi-source aggregation with unified schema layer |
| Usefulness (15%) | One dashboard showing cross-protocol DeFi health |
| Demo & clarity (10%) | Clear visual comparison across protocols |

## ENS — Track 1: Most Creative Use

**Qualification checklist**:
- [x] ENS clearly improves the product → Mini apps have ENS names + metadata in text records
- [x] Functional demo → Mini apps resolved via ENS subname
- [x] Video/live link + Sunday morning booth presentation

**How ENS is used creatively**:
- Mini apps get ENS subnames (`dex-comparator.graph.eth`) — a human-readable, shareable identity for a machine-generated artifact
- Mini app metadata stored in ENS text records (`app/prompt`, `app/version`, `app/schema`)
- Text records enable onchain discovery: any agent can resolve an ENS name → fetch mini app definition → instantiate it

## ENS — Track 2: Best ENS Integration for AI Agents

**Qualification checklist**:
- [x] ENS improves agent identity/discoverability (not cosmetic) → Agent fleet registry via ENS subnames
- [x] Functional demo
- [x] Video/live link + Sunday morning booth presentation

**How ENS is used for agents**:
- AI agents register ENS subnames (`agent-a.graph.eth`, `agent-b.graph.eth`)
- Agent capabilities and metadata stored in ENSIP-26 text records
- Agents resolve each other via ENS for multi-agent coordination
- ENSIP-25 used to verify agent name ownership onchain

## 0G — Track 1: Best AI Product

**Qualification checklist**:
- [x] Working, demoable product
- [x] Proof of 0G Compute / Private Computer for inference
- [x] Public repo + demo video under 3 mins

**How 0G is used**:
- Sensitive portfolio analysis runs through 0G Private Computer (TEE-sealed)
- Agent memory stored on 0G Storage (encrypted)
- Mini app authors mint Agentic IDs on 0G
- Micropayments settled on 0G Chain

## 0G — Track 2: Best Infrastructure & Tooling

**Qualification checklist**:
- [x] Frameworks, SDKs, primitives, developer tooling
- [x] At least one working example agent/app built with tooling
- [x] Architecture diagram

**How 0G is used as infrastructure**:
- Agent framework combining Graph MCP + 0G Compute + A2UI rendering
- Memory-layer abstraction over 0G Storage
- Verification layer for model provenance via 0G TEE

## Recommended Submission Strategy

### Option A: Single Comprehensive Submission (Recommended)

Submit **one project** that demonstrates:
- **Graph Track 2** (primary): AI agent + mini app renderer + live Graph data
- **ENS Track 2** (secondary): Agent ENS identity + subname registry
- **0G Track 1** (secondary): Private Computer inference demo

**Why**: The project naturally spans all three. One demo video showing the full flow covers all tracks.

### Option B: Dual Submissions

**Submission 1 — Graph Tracks** (primary focus):
- Graph Track 2 (primary): Full mini app ecosystem
- Graph Track 3 (bonus): Cross-protocol dashboard component
- ENS Track 1 (bonus): Mini app ENS naming

**Submission 2 — 0G Track**:
- 0G Track 2: Agent infrastructure layer (framework, not end-product)

### Option C: Focus on Graph + ENS

**Submission**:
- Graph Track 1: Framework as tooling (MCP aggregation + A2UI engine + SKILL)
- Graph Track 2: AI agent use case (mini app rendering)
- ENS Track 1: Creative mini app naming
- ENS Track 2: Agent fleet registry

**0G**: Shipped as a bonus feature (optional Private Computer toggle)

---

# 6. Submission Guide

## Recommended Track: The Graph Track 2 (Best AI Use Case) — $5,000

**Primary submission** focuses on the AI agent + mini app renderer + live Graph data. This is the strongest fit and has the clearest demo path.

### Submission Checklist
- [x] The Graph as load-bearing data source ✓ (mini apps query live subgraphs)
- [x] Live data from Graph provider ✓ (Subgraph Studio API)
- [x] AI/agent component that reasons over data ✓ (intent parser + compositor + renderer)
- [ ] Public GitHub repo with README + setup instructions
- [ ] 2–4 minute demo video
- [ ] Briefly describe which subgraphs/endpoints/tools were used

### Demo Video Flow (3 minutes)
```
0:00-0:15  — Intro: "Graph Mini Apps — agent-generated blockchain dashboards"
0:15-0:45  — Demo 1: User types "top 5 DEXs by volume on Arbitrum" → mini app renders live chart
0:45-1:30  — Demo 2: Cross-protocol view — agent queries DEX + Lending schemas → unified dashboard
1:30-2:00  — Demo 3: Show another pre-built mini app from the registry (e.g., "TVL over time")
2:00-2:30  — Explain the architecture: A2UI + Graph MCP + standardized schemas
2:30-3:00  — Show registry, how anyone can create/share mini apps, and future vision
```

### Required Subgraph/Tool Documentation
Include in README:
```
Data Sources Used:
- Standardized DEX Subgraph (Arbitrum) — via Subgraph Studio
- Standardized Lending Subgraph (Arbitrum) — via Subgraph Studio
- Subgraph MCP Server (PaulieB14/graph-lending-mcp)
Tools Used:
- The Graph Subgraph Studio (data queries)
- A2UI framework (UI rendering)
- [Any other tools]
```

## Secondary Track: ENS Track 1 (Creative Use) — $1,500

**Bonus submission** — add ENS subnames to mini apps and text records for metadata.

### Submission Checklist
- [x] ENS clearly improves the product ✓ (human-readable mini app identity + onchain metadata)
- [x] Functional demo ✓ (resolve ENS → fetch mini app → render)
- [ ] Video/live demo link
- [ ] Sunday morning booth presentation

### Demo Addition (add 30 seconds to main video)
```
2:30-3:00  — Show a mini app's ENS name (`dex-comparator.graph.eth`)
             Resolve it → see text records (prompt, version, author)
             Show another agent resolving the same ENS and instantiating the mini app
```

## Tertiary Track: 0G Track 1 (Best AI Product) — $6,000

**Optional extension** — add 0G Private Computer for one "sensitive query" demo.

### Submission Checklist
- [x] Working, demoable product ✓
- [x] Proof of 0G Compute / Private Computer ✓ (one demo flow)
- [ ] Contract deployment addresses
- [ ] Public GitHub with README + setup
- [ ] Demo video under 3 mins
- [ ] Explain which 0G features/SDKs used
- [ ] Team member names + contact

### Demo Addition
```
3:00-3:30  — Show "Private Portfolio Analysis" mini app
             Wallet address is encrypted, inference runs on 0G Private Computer
             Results rendered as a risk dashboard
```

## File Structure for Submission

```
graph-minis/
├── README.md                  # Project description + setup instructions
├── SKILL.md                   # One-prompt deployment instructions (for Track 1)
├── demo/
│   └── video.mp4             # 2-4 minute demo
├── mini-apps/
│   ├── dex-comparator/
│   │   ├── manifest.json     # Mini app definition
│   │   └── prompt.md         # Agent prompt
│   ├── tvl-tracker/
│   │   ├── manifest.json
│   │   └── prompt.md
│   └── ...
├── src/
│   ├── renderer/             # A2UI rendering engine
│   ├── query-layer/          # Intent parser + routing
│   └── registry/             # Mini app registry
├── architecture-diagram.png  # For 0G Track 2
└── docs/
    ├── setup.md              # Local dev setup
    └── api.md                # Registry API (if applicable)
```

## Submission Templates

### README.md Structure
```markdown
# Graph Mini Apps

Agent-generated blockchain dashboards powered by The Graph.

## What It Does
Type a query → Agent parses intent → Queries The Graph → Renders live A2UI dashboard

## Features
- [List features — see section 2 of prd.md]

## How It Uses The Graph
- Live subgraph queries via Subgraph Studio
- Standardized subgraph schemas (Messari)
- Subgraph MCP aggregation
- [Add more]

## Setup
1. [Steps]

## Demo
[Link to video]

## Architecture
[Link to diagram]
```

### SKILL.md Structure (for Track 1)
```markdown
# Graph Mini Apps SKILL

One-prompt deployment of a Graph-powered mini app.

## Prerequisites
- The Graph API key
- A2UI framework installed

## Deploy
Run: `[command]`

## What Gets Created
- Mini app renderer
- Query routing layer
- Example mini app (DEX comparator)

## Customization
[How to modify prompt, queries, UI spec]
```
