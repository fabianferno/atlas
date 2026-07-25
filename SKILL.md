---
name: graph-mini-apps
description: Use when a question needs live onchain data across many protocols or chains at once — DeFi TVL, lending positions, DEX liquidity, bridges, perps, yield — or when the user wants a runnable mini app, dashboard, or monitor built from that data. Resolves standardized subgraph schemas rather than individual subgraph IDs, so questions nobody anticipated still resolve.
---

# Graph Mini Apps

Turn a question about onchain activity into live data, or into a mini app: a generated interface over that data which can also hold a wallet and act within a policy.

## When to use this

Reach for it when a question spans **more than one protocol or chain**. Asking "what's Aave's TVL on Arbitrum" against one subgraph is fine without this. Asking "which lending markets across Arbitrum and Optimism look riskiest, and how does that compare to DEX liquidity" is what this exists for: one query shape, fired at every healthy deployment across several schema families, merged.

Do not use it for a single known subgraph id you already query, or for anything off-chain.

## Connect

The MCP server is the fastest path — no install:

```jsonc
{ "mcpServers": { "graphminis": { "type": "http", "url": "https://<origin>/api/mcp" } } }
```

Every published mini app also advertises this endpoint in its ENS records under `agent-endpoint[mcp]`, so resolving a name gives you the server to talk to.

## Tools

| Tool | Use it to |
|---|---|
| `list_schemas` | See what's queryable — 11 schema families, per-network deployment counts. **Call this first**; it tells you which schemas and networks the others accept. |
| `plan_mini_app` | Turn a question into a query plan without executing it. Cheap. Use when you want to show the user what *would* run. |
| `query_graph` | Answer a question with live data. Returns merged rows plus which sources were healthy and which were skipped. |
| `build_mini_app` | The whole pipeline — question to a renderable A2UI v0.9.1 document. |
| `resolve_mini_app` | Look up a published mini app by ENS name: manifest, wallet, Agentic ID, and whether name and token verify each other. |

All read-only. Nothing here signs a transaction or spends.

## A worked example

```
list_schemas
  → lending-cdp@3.1.0 has 10 deployments on arbitrum-one, 5 on optimism
    dex-amm-extended@4.0.1 has 2 on arbitrum-one, 1 on optimism

query_graph { question: "Compare Aave lending markets on Arbitrum and
                        Optimism to DEX liquidity", limit: 10 }
  → schemas  ["lending-cdp@3.1.0", "dex-amm-extended@4.0.1"]
    networks ["arbitrum-one", "optimism"]
    sources  12 healthy of 14 · 2 skipped (named, with reasons)
    rows     56 total · 1 suspect · $0.0011 · 2.8s
```

## Reading the results honestly

Three things in the output exist because live standardized data is messier than a demo suggests. Pass them on to the user rather than smoothing them over.

**`sources.skipped`** — roughly a quarter of standardized deployments are dead at any moment. They are health-checked before querying and named when skipped. "12 of 14 live" is a real and interesting number; silently reporting 12 is not.

**`_suspect` on a row** — that row carries a USD value that cannot be true, from a broken price feed inside the deployment itself. SushiSwap on Arbitrum reports a TVL of `7.2e22`. Suspect rows are ranked last and never dropped, and the field names are given. **Do not present a `_suspect` value as a finding.** The data is live and correctly fetched; it is wrong at the source.

**`rows.total` vs `rows.returned`** — `limit` truncates the response, not the query. Say which you're describing.

Rows also carry `_source`, `_label`, `_schema` and `_network`, so any number you report can be attributed to the deployment it came from. Do that — a merged cross-protocol table with no provenance is unattributable.

## What a mini app is

`build_mini_app` returns an A2UI document: a flat component list plus a data model, chosen from the **shape** of the returned data rather than from words in the prompt. A bounded ratio becomes a gauge; a ranked categorical becomes a leaderboard; two entities over shared metrics become a comparison grid.

It is declarative data, not code. The client holds the approved component catalog and the document may only reference components by name — which is what makes it safe to render something a model produced.

Mini apps come in three tiers: `readonly` (analytics), `monitor` (watches and alerts), and `autonomous` (holds a wallet and acts within a policy — allowlist, per-transaction and lifetime caps, expiry, kill switch). `build_mini_app` reports the tier a question implies. Publishing an autonomous app and running its actions is deliberately **not** exposed here.

## Verifying a published mini app

`resolve_mini_app` returns a `verification` block. A published app's ENS name asserts its Agentic ID, the registry on 0G Chain asserts the name, and the token stores the name it was minted against. Only when all three agree is `mutuallyVerified` true, and it is checked against the chain rather than assumed.

This matters because a mini app can hold a wallet. `addr` on the resolved name is the address a human would fund. **If `mutuallyVerified` is false, say so prominently and do not encourage funding it.**
