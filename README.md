# Graph Mini Apps

**Describe an onchain app. Get an agent with a UI, a wallet, and a name.**

A mini app is not a dashboard. It watches live Graph data, renders whatever interface fits the *shape* of that data, and can act on it — inside a policy you set. Every one gets an ENS name, a wallet, and an onchain identity, so you can verify what it is before you fund it.

| | |
|---|---|
| **Live demo** | _TODO — deploy target_ |
| **Video** | _TODO_ |
| **ENS parent** | [`graphminis.eth`](https://sepolia.app.ens.domains/graphminis.eth) (Sepolia) |
| **Example app** | `durable-market-guard.graphminis.eth` |
| **Agentic ID** | [token 8 on 0G Galileo](https://chainscan-galileo.0g.ai/token/0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0?a=8) |
| **MCP endpoint** | `<origin>/api/mcp` |

> **Status.** Everything marked ✅ below was verified by reading it back from the chain or the gateway, not inferred from the code. What isn't built is listed under [Not in scope](#not-in-scope) rather than left ambiguous.

---

## Why

The Graph had everything it needed to be Dune — more chains, more protocols, real time, decentralized — but it only ever built for developers. This is the consumer surface it never shipped. And because the interface is generated per question, apps exist the moment you ask, including for the long tail nobody would ever build by hand.

## What a mini app is

```
analytics  ──────────────  monitoring  ──────────────  autonomous
read-only                  watches + alerts            holds a wallet, acts
1.5px border               2.5px border                5px border
```

The tier is not decoration: border weight encodes agency, and an autonomous app always renders its policy strip, its kill switch, and its trade log. You can see what a thing is allowed to do by looking at it.

**The agent cannot inject code.** It emits [A2UI](https://github.com/google/A2UI) v0.9.1 — declarative data, not executable code. The client holds the approved component catalog and the agent may only reference components by name. For a generated interface that can move money, this is the whole safety argument.

**Form follows data, not keywords.** The composer picks components from the shape of what came back: a bounded ratio becomes a gauge, a ranked categorical becomes a leaderboard. Not from words in the prompt.

---

## How it uses The Graph ✅

**Standardized Subgraphs.** 96 registry entries, **86 verified deployment IDs**, 11 schema families declared and 9 with live deployments, across Arbitrum, Optimism, Base and Mainnet. Resolving a *schema* rather than a subgraph id is the point — it means a question nobody anticipated still resolves.

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

**Two things we do with live data that a demo usually hides:**

- **Dead deployments are named, not silently dropped.** `sourcesFailed` and `failures[]` carry the reason.
- **Impossible values are flagged, not deleted.** Several standardized deployments report USD figures from broken price feeds — SushiSwap on Arbitrum reports a TVL of `7.2e22`. Rows carrying a USD value above $1T get `_suspect` naming the offending field, and rank *last*. Sorting by the broken field once put `$72 sextillion` at the top of the table, which reads as broken software rather than bad upstream data. The data is live and correctly fetched; it is wrong at the source, and we say so.

**x402.** Keyless per-query payment over the gateway (`/api/x402/subgraphs/id/<id>`), EIP-3009 signature, ~$0.01/query. This is what makes forking work: a forked app pays for its own data with its own wallet, with no shared API key.

**Subgraph MCP.** `https://subgraphs.mcp.thegraph.com/sse` for discovery beyond the registry.

---

## MCP server ✅

We serve MCP at `/api/mcp` — the same URL every published mini app writes into its `agent-endpoint[mcp]` ENS record. Stateless Streamable HTTP, one JSON-RPC message per POST.

```jsonc
{ "mcpServers": { "graphminis": { "type": "http", "url": "https://<origin>/api/mcp" } } }
```

| Tool | Does |
|---|---|
| `list_schemas` | What's queryable, with per-network deployment counts |
| `plan_mini_app` | Question → query plan (schemas, networks, GraphQL, tier) |
| `query_graph` | Question → live merged rows across all healthy deployments |
| `build_mini_app` | Question → a renderable A2UI document |
| `resolve_mini_app` | ENS name → manifest, wallet, Agentic ID, mutual verification |

Read-only by design. Nothing here signs or spends — `/api/act` owns the action loop and reads its policy from the server side, because an MCP endpoint is a URL strangers point agents at.

---

## ENS ✅

`graphminis.eth`, registered and **wrapped** on Sepolia, issuing a subname per mini app. Records written per app:

```
addr                              → the mini app's own wallet        ← what you fund
contenthash                       → ipfs://<manifest CID>
agent-context                     → YAML capability description       (ENSIP-26)
agent-endpoint[web]               → <origin>/a/<name>                 (ENSIP-26)
agent-endpoint[mcp]               → <origin>/api/mcp                  (ENSIP-26)
agent-registration[<erc7930>][id] → "1"                               (ENSIP-25)
url · description · avatar        → standard profile records
```

**The name and the token verify each other in both directions.** The ENS record asserts the Agentic ID; `MiniAppRegistry` on 0G Chain asserts the name; the token itself stores the name it was minted against. Resolving returns `mutuallyVerified: true` only when all three agree — checked against the chain, never assumed.

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

Four signer modes behind one interface. In `smart-session` mode (ERC-7579 + Rhinestone Smart Sessions) the allowlist, expiry and lifetime cap are enforced **by the account itself**, so a compromised backend still cannot exceed them. `onchainEnforced` is the return value of a live `isSessionEnabled()` call — a fact read from the chain, never a constant — and the UI reports enforcement *per constraint*, because it is not uniform: USD→token conversion and `requireConfirm` are server-side, and we say so rather than rounding up.

**Forking strips `identity`, `policy.wallet` and `provenance`.** A fork gets a fresh wallet, a fresh name, a fresh Agentic ID, and zero inherited spending authority.

103 tests cover the agency layer, including every policy rejection path.

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
cd web && pnpm dlx tsx src/lib/agency/all.test.ts   # 103 tests
```

Deploying to 0G Galileo needs `--priority-gas-price 2gwei`; the chain enforces a 2 gwei floor and rejects forge's default estimate outright.

---

## Not in scope

Named explicitly, because a vague scope claim is worse than a small one:

- **Substreams.** The manifest carries a `stream` block and the trigger evaluator is built and tested, but there is no Substreams client. Triggers today are driven by polling and manual signals. Event-driven is the correct design for an agent that acts, and it is not done.
- **0G Storage.** Encrypted agent memory goes to the configured content store, not to 0G Storage. The token commits to `keccak256(ciphertext)`, which is identical either way, so this is a transport swap.
- **`@graphminis/kit` on npm.** The kit exists as `web/src/lib/{kit,contracts,agency,identity}` and the Studio imports it rather than reaching around it, but it is not extracted into a published package.
- **Creator earnings.** x402 pays the gateway for data (inbound, working). Paying creators needs our own facilitator and is display-only today.
- **IPFS pinning.** Manifests get a real CIDv1 and are durable on the host machine, but are not announced to a public network unless `PINATA_JWT` / `W3S_TOKEN` is set.
- **Seed content.** The registry ships example apps with fabricated numbers, clearly separate from anything published live.

---

## Attribution

- Built at ETHGlobal Lisbon 2026. Event work begins at [`3871e59`](../../commit/3871e59) (2026-07-24 10:57); the four commits before it (`533b79f`, `e6ce265`, `845a550`, `7056c3b`, 2026-07-22) are a pre-existing landing page and predate the event.
- **AI tools:** built with Claude Code under a spec-driven workflow. ETHGlobal permits this with attribution provided the planning artifacts are committed — [`prd.md`](prd.md) is that artifact, and its revision history (Appendix C) records why each major decision changed.
- **Open source used:** A2UI (Apache-2.0), Messari standardized subgraph schemas, Rhinestone Smart Sessions / module-sdk, viem, Next.js, Foundry, OpenZeppelin.

## Team

_TODO — name · Telegram · X_
