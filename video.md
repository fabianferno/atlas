# video.md — the 4-minute demo

One take, screen recording with voiceover. Target **3:50–4:00**. 0G asks for under 3 minutes, so the
**0:00–2:55 block is the 0G cut** — it ends on a complete beat (the signed transaction) and can be
exported on its own.

The spine: **describe → an app exists → it watches → it acts under a gate → you can verify it before
you fund it.** Every number spoken below is on screen at the moment it is spoken. Nothing is
narrated that the screen does not show.

---

## Before you hit record

- [ ] `.env.local` has `GRAPH_API_KEY` and `ZEROG_API_KEY` set — otherwise Run says
      `FIXTURES — the gateway is not keyed`, on camera.
- [ ] Load `https://atlas-mini-apps.vercel.app` once and let the seed snapshot settle. The board
      should read **16 of 16**.
- [ ] Open five tabs, in this order, so no tab is ever loaded on camera:
      1. `/registry` (Studio + Published strip)
      2. `/` (the board)
      3. `/a/atlas-market-guard`
      4. `https://sepolia.basescan.org/tx/0x5a44e9d5d79446afd042928a76d405459242688f479d7257e23143d6190c9d78`
      5. `https://chainscan-galileo.0g.ai/token/0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0?a=10`
- [ ] Dry-run **Watch 3 blocks** once. The free Substreams tier allows 2 concurrent streams and the
      account may answer `resource_exhausted`. If it does, do not re-roll it live — use the
      scripted-verification beat in §5b instead. Decide which one you are shooting *before* you record.
- [ ] 1440×900, browser zoom 110%, cursor highlighting on, notifications off.
- [ ] Skin set to `tactile` (the default) at the start.

---

## 0:00 — 0:22 · The claim

**Screen:** `/registry`, Studio input empty, cursor already in it.

> Every onchain analytics tool ships a dashboard someone built in advance. The Graph had everything
> it needed to be the consumer layer of crypto — more chains, more protocols, real time,
> decentralized — and it only ever shipped for developers.
>
> Atlas is the surface it never built. You describe an onchain app, and you get one: a live
> interface, a name, and — if you allow it — a wallet.

Do not over-explain here. The next 40 seconds are the argument.

---

## 0:22 — 1:05 · Describe it, and it exists

**Screen:** type into the Studio, slowly enough to read:

```
watch lending TVL across Arbitrum and Optimism and warn me when outflows spike
```

Hit generate. Let the pipeline log run visibly. Do not cut the wait — the wait is the proof.

> This is not a template. The resolver picks a *schema family* — `lending-cdp`, `dex-amm-extended` —
> never a single subgraph id. One question then fires the same query shape at every healthy
> deployment of that family, on every network we have one on, and merges the answers.

**Point at the run line as it lands** (yours will differ; read the real one):

```
18 sources queried → 13 healthy, 5 dead skipped by health check → 74 rows in 2.8s → $0.0014
```

> Five of eighteen were dead. About a quarter of standardized deployments are, at any moment — so
> sources are health-checked at generation time and frozen into the app's manifest. A demo that
> hides that is lying about the data layer it's built on.

> Eighty-six verified deployment IDs, eleven schema families, four networks. And because the
> resolution is by schema, a question nobody anticipated still resolves.

---

## 1:05 — 1:35 · Form follows data — and the agent can't inject code

**Screen:** the generated app. Scroll it once, slowly.

> Nothing here was chosen from keywords in the prompt. A bounded ratio became a gauge; a ranked
> categorical became a leaderboard. The composer reads the *shape* of what came back.

**Now press the skin toggle in the top bar.** `tactile` → `flat`. Let it land. Press it back.

> That's the safety argument in one gesture. The model never emits code — it emits A2UI, a
> declarative document that may only *reference* components the client already holds by name. So
> the entire system can be re-expressed in a different material with no component changes, no
> catalog changes, and nothing round-tripping to the agent.
>
> And watch what didn't change: you can still tell which apps can spend. Depth encodes agency in
> one skin, border weight in the other. A theme that hid that would be a bug, not a theme.

---

## 1:35 — 2:10 · Three tiers, and the third one holds a wallet

**Screen:** the board (`/`), then open `atlas-market-guard`.

> Three tiers. Analytics sits flush and only reads. Monitoring lifts and watches. Autonomous stands
> proud, and holds a wallet.
>
> An autonomous app always renders its policy strip, its kill switch, and its trade log. You can see
> what a thing is allowed to do by looking at it.

**Point at the enforcement block, row by row.**

> And this is the part most demos round up. Every row here says *where* it's enforced. Right now
> we're in `session-eoa` mode, so every constraint reads `server`, `verifiedOnchain: false` — the
> panel says a compromised backend could exceed these limits, because it could. In smart-session
> mode the account enforces the allowlist and the cap itself, and `onchainEnforced` is the return
> value of a live `isSessionEnabled()` call, never a constant.

---

## 2:10 — 2:30 · Run re-queries The Graph, live

**Screen:** press **Run**.

> Run used to increment a counter. Now it re-reads the manifest's pinned plan, re-fires the fan-out,
> re-composes the body, and tells you what came back — rows, how many deployments answered of how
> many were queried, cost, elapsed.

**Read the returned line off the screen.**

> That's a resolved name being live rather than a screenshot.

---

## 2:30 — 2:55 · It acts, under a gate it cannot talk its way past

**Screen:** press **Watch 3 blocks** on the autonomous app.

> Polling a subgraph means an autonomous guard is up to five minutes late. For something that
> displays, that's a preference. For something that spends, it's a correctness bug — so triggers run
> off a real Substreams subscription, one tick per block, each carrying the cursor the stream
> resumes from.

**Then cut to the Basescan tab, already open on the transaction.**

> Here is the whole chain, end to end, on Arbitrum block 487540654:

**Read down the screen:**

```
Substreams tick → trigger "healthFactor < 1.15" fired
  → POLICY OK  approve $25 → 0x036CbD53…  (allowlisted, under the $50/tx cap)
  → session key signed → tx 0x5a44e9d5…9d78
  → success, block 44604106, 1 Approval event, allowance read back off chain
```

> That is an `approve`, and we call it an `approve`. Granting the router an allowance is genuinely
> the first step of a swap — but it isn't a swap, so it's its own action kind rather than a manifest
> that lies about what the signer did.

> Three properties this turns on: a reorg is never an event — `blockUndoSignal` rewinds, it never
> becomes a trigger. A replayed block doesn't trade twice — ticks are keyed block-and-hash and the
> ledger dedupes. And the metric is re-read server-side per block, because a client that could post
> a health factor could make an autonomous app trade on demand.

**← The 0G cut ends here. Fade out at 2:55.**

### 5b · Fallback if `Watch 3 blocks` returns `resource_exhausted`

Do not hide it — show it and say what it is. It costs eight seconds and buys the credibility of
everything after it:

> The free tier allows two concurrent streams and the account is at quota, so the endpoint refuses
> us — and that refusal is rendered as a refusal, not as "no data". Three outcomes get three
> different sentences, because "no token", "the endpoint said no", and "blocks were consumed" mean
> three different things, and collapsing them is where a demo starts lying. The subscription is
> verified both directions by `scripts/substreams-verify.ts` — a breach run that fires, and a
> control run over healthy blocks that fires nothing.

---

## 2:55 — 3:35 · A name you can verify before you fund it

**Screen:** back to `/registry`, scroll to the **Published strip**. It resolves live on mount — let
the rows populate on camera.

> Every published app gets an ENS subname under `atlas-apps.eth` on Sepolia. And these rows aren't
> stored — they're resolved live, right now, through `/api/resolve`.

**Point at `atlas-market-guard`:**

> `addr` is the address it signs from — that's what you'd fund. `contenthash` is the manifest, and
> this resolves *without us*: read the contenthash off Sepolia, fetch the CID from ipfs.io, parse
> what comes back. Five of the eight issued names do that today.

**Cut to the 0G explorer tab (token 10).**

> And the name and the token verify each other in both directions. The ENS record asserts the
> Agentic ID. The registry on 0G Chain asserts the name. The ERC-7857 token stores the name it was
> minted against. `mutuallyVerified` is true only when all three agree — checked against the chain
> on every resolve, never assumed.
>
> Planning and composition run on 0G with TEE attestation, and the attestation isn't a screenshot:
> its hash is written onchain, bound to the token and the name. Anyone can check that without
> trusting our UI.

---

## 3:35 — 3:50 · It's reachable by other agents

**Screen:** the footer line on the board, `/api/mcp` visible.

> The same URL every published app writes into its ENS `agent-endpoint` record is a live MCP server.
> Five read-only tools — list the schemas, plan an app, query The Graph, build the interface, resolve
> a name. Read-only on purpose: nothing there signs or spends, because an MCP endpoint is a URL
> strangers point agents at.

---

## 3:50 — 4:00 · Close

**Screen:** the board, full grid, one slow scroll.

> Sixteen mini apps, every one built by that pipeline and re-measured against live data — the whole
> registry re-runs for eight-tenths of a cent.
>
> Describe an onchain app. Get an agent with a UI, a wallet, and a name you can verify.
> That's Atlas.

---

## Say these exactly — they are what make it read as a product, not a hack

Each one is a place where the honest version is *stronger* than the rounded-up version. Judges have
seen a hundred demos that rounded up.

1. **"Five of eighteen were dead."** Nobody shows their failure rate. Showing it says the pipeline is
   real and you've run it enough to know its shape.
2. **"That is an `approve`, and we call it an `approve`."** Naming the limit of your own transaction
   is the single most credible sentence in the video.
3. **"Every row says where it's enforced."** Server vs. chain, per constraint. This is the difference
   between a policy and a promise.
4. **"Resolved live, right now."** The Published strip re-resolving on camera is worth more than any
   number of etherscan links.
5. **"Checked against the chain, never assumed."** Say it once, about mutual verification.

## Never say these

- ❌ "each app gets its own wallet" — one session key signs for every app. Say **"an address it signs
  from, that you can verify before funding"**.
- ❌ "it executes a swap" — it executes an `approve`.
- ❌ "we use The Graph's Subgraph MCP" — the env var exists and nothing calls it. *Our* MCP server is
  a different thing and is real.
- ❌ "x402 pays per query" — it is implemented and has never paid for a query. Leave it out of a
  4-minute cut entirely.
- ❌ "a shared registry of published apps" — the board is per-browser `localStorage` plus the seed
  snapshot.
- ❌ any spoken number that isn't on screen at that moment.

## If you run long

Cut in this order, and only in this order:

1. §7 MCP (15s) — it's in the README and the submission.
2. The second half of §4's enforcement narration (10s) — keep the pointing, drop the smart-session
   sentence.
3. §5b fallback narration — but only if `Watch 3 blocks` actually succeeded.

Never cut: the dead-deployment count, the skin toggle, the policy gate line, or `mutuallyVerified`.
Those four are the whole submission.

## Deliverable

- **Full cut:** 4:00, YouTube unlisted → README `**Video**` row + `submission.md` `**Video:**` field.
- **0G cut:** 0:00–2:55, exported separately, under three minutes as 0G requires.
