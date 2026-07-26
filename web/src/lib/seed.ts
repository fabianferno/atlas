/**
 * W12 — seed content. Sixteen mini apps spanning the full range:
 * analytics (readonly) → monitoring (monitor) → autonomous.
 *
 * A registry with three apps looks like a prototype. Sixteen spanning the
 * range looks like a platform.
 *
 * WHAT IS REAL AND WHAT IS NOT, because this file is the one most likely to be
 * mistaken for measurement.
 *
 *   MEASURED    The data plan, the sources, the A2UI body, the per-run cost and
 *               the provenance. All of it comes from the LIVE OVERLAY at the
 *               bottom, which folds in what `scripts/seed-live.ts` really
 *               resolved, health-checked, queried and composed. An app the
 *               overlay could not measure is DROPPED, not backfilled.
 *   TEXTURE     `runs`, `forks`, the thumbs, and the reviewers and their scores.
 *               There is no community yet; the README says so. This is the only
 *               invented category left, it is set dressing rather than a data
 *               claim, and §12's argument for having any of it is sound.
 *   ABSENT      Everything that would be a *claim*: an ENS name, a minted token,
 *               a manifest CID, a wallet address, a dollar figure, a transaction
 *               hash, a journal line, a position. Null, zero or empty — because
 *               none of it happened, and a plausible value is worse than none.
 *
 * The reviews sit on the seam and get their own rule — see `Review` below:
 * opinions about features that exist, never testimony about events that did not.
 *
 * Nothing in this file touches the network.
 */
import type {
  AgencyTier,
  Manifest,
  Network,
  SchemaFamily,
  Source,
} from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";
import { DEFAULT_QUERIES } from "@/lib/kit/fanout";
// The real registry. `fanout.ts` above already pulls `sources.ts` into this
// module graph (it needs `lookupEntry`), so this import adds no weight and
// closes no cycle — `sources.ts` does not reach back here.
import { candidateSources, entryToSource } from "@/lib/kit/sources";

/**
 * Mirrors `STUB_MODEL` in `@/lib/kit/inference`, which is the source of truth
 * and the value the offline planner really reports. Copied rather than imported
 * on purpose: `inference.ts` imports the `openai` package, the package declares
 * no `sideEffects`, and `store.ts` is `"use client"` and imports this file — so
 * importing the constant would ship the whole OpenAI SDK to the browser to read
 * one string. If the constant there changes, change it here.
 */
const OFFLINE_MODEL = "atlas-deterministic-stub";

/* ------------------------------------------------------------------ *
 * The local body shape — `UiDoc`, a flat list of display blocks.
 *
 * NO SEED APP USES THIS ANY MORE. Every one carries a real A2UI document from
 * the overlay and renders through `@/components/renderer`. What still emits a
 * `UiDoc` is `draftFromIntent` at the bottom of this file — the offline fallback
 * draft the Studio shows when the live plan/compose path is unavailable — which
 * `AppBody` renders down its fixture branch. `resetOwnedValues` therefore still
 * needs to handle this shape as well as the A2UI one.
 *
 * It names the same catalog components (contracts/catalog.ts), which is what let
 * `kit/seed-to-a2ui.ts` translate one into the other.
 * ------------------------------------------------------------------ */

/*
 * `Accent`, `UiBlock` and `UiDoc` used to be declared here and are now defined
 * by the kit (`@/lib/kit/ui-doc`), which is where the code that consumes them
 * lives. Re-exported rather than merely imported: every existing importer of
 * these types points at this file, and moving a type should not be an API break
 * for thirty call sites.
 */
import type { Accent, UiBlock, UiDoc } from "@/lib/kit/ui-doc";
export type { Accent, UiBlock, UiDoc };

/* ------------------------------------------------------------------ */

export interface MiniAppStats {
  runs: number;
  forks: number;
  /** Total value this app has moved through its own wallet, lifetime. */
  valueTransactedUsd: number;
  /** Lifetime spend against the policy cap. */
  spentUsd: number;
  thumbsUp: number;
  thumbsDown: number;
  earnedUsd: number;
  sourcesQueried: number;
  sourcesHealthy: number;
  costPerRunUsd: number;
}

/**
 * A rating plus a short review. §12 argues an empty registry reads as a
 * prototype rather than a platform, so the seed set carries reviews and the
 * README discloses them as texture — there is no community yet.
 *
 * THE LINE THE SEED REVIEW TEXT HOLDS, because it is easy to cross by accident:
 * a review may state an opinion about a feature that genuinely exists; it may
 * not give testimony about an event that did not happen. "The kill switch being
 * one press away is why I would fund it" is the first kind — `killSwitch` is
 * real, enforced in the composer and re-enforced in the renderer. "Caught a 1.38
 * at 04:12 and unwound $48 of it" was the second kind, and it is what these used
 * to say: a trigger firing, a dollar amount moving, a timestamp, attributed to a
 * named .eth handle. A judge reading that was being told a transaction occurred.
 * A score is set dressing; a receipt in prose is a claim. Opinions stay,
 * testimony goes.
 *
 * So: no review here names a tx, a block, a latency, a dollar figure, or an
 * action it watched the app take. They still read as different people with
 * different objections, because that was never the dishonest part.
 */
export interface Review {
  id: string;
  rater: string;
  score: "up" | "down";
  text: string;
  /**
   * Weighted 3× — a rater who actually ran the app. Real feature:
   * `RAN_IT_WEIGHT` in `components/registry/ratings.tsx`.
   *
   * ON THE SEEDED REVIEWS BELOW, eleven of which set this true. That is part of
   * the same invention as the handle above it and the sentence beside it, and it
   * is allowed on §12's own terms — an invented rater holding an invented opinion
   * may be described as having run the thing they are opining about. What is NOT
   * allowed is a reader mistaking one of these for a person, so every one of them
   * is labelled `seeded` at the point of display (`SEEDED_REVIEW_IDS` at the foot
   * of this file, rendered as a tag on each row). Note that three of them are
   * signed `anon` rather than `.eth`, so "the .eth ones are the fake ones" was
   * never a rule a reader could apply on their own.
   *
   * ON A REVIEW THE VISITOR POSTS, this field is derived by `rateApp` in
   * `store.ts` from `localRuns` — this browser's own completed fan-outs — and by
   * nothing else. It used to be computed at the call site as `stats.runs > 0`,
   * i.e. from the seeded counter three lines up in this very file, so a first
   * visitor's genuine review was stored asserting a run they never made and
   * weighted 3× for it. Never reintroduce a path where a display total can
   * answer this question.
   */
  ranIt: boolean;
  at: string;
}

export interface MiniApp {
  manifest: Manifest;
  stats: MiniAppStats;
  reviews: Review[];
  /*
   * There is no `mine` field, and its removal is the same correction the rest of
   * this file records, applied to ownership.
   *
   * It was a boolean literal: thirteen of the sixteen apps below carried
   * `mine: true`, the Board filtered on it, and the home screen therefore led
   * with "Your mini apps" over thirteen cards — signed in, signed out, or in a
   * browser that had never seen a wallet. Privy does a real login and writes the
   * address to `state.wallet`, and nothing anywhere compared the two. A claim
   * about who holds something, asserted by a constant, surviving a logout: that
   * is the class §14 #1 cleared out, in the one key that had escaped it.
   *
   * Ownership is now DERIVED — `isMine()` in `store.ts` — from `manifest.author`
   * against the connected wallet, with local provenance as the second case. Both
   * inputs have real writers (`publishApp`, `forkApp`, `PrivyWalletBridge`), so
   * a seed app is nobody's until someone forks it, which is the truth.
   */
  /**
   * SWITCHED ON — the owner has this configuration enabled. It is ONE of the four
   * conditions `isArmed()` in `store.ts` requires, and on its own it means
   * nothing. Never read it directly to decide what to render.
   *
   * TWO corrections live in this field, and the second is the interesting one.
   *
   * It first read "subscribed to a stream right now", which nothing backed:
   * `POST /api/stream` is the only call that opens a Substreams subscription and
   * it had no caller anywhere in the product, so ten seed apps asserted ten open
   * subscriptions on the strength of a boolean literal in this file. That was
   * fixed by re-documenting the field as "ARMED — published, not halted, and it
   * would act if a trigger fired".
   *
   * THE REWRITE KEPT THE OLD DATA. `isArmed()` never actually checked published,
   * eight seed apps below still carried a hand-written `running: true`, and
   * `identity.ens` is null on all sixteen — so the top bar read "8 ARMED" behind
   * a lamp on a board where nothing was published, nothing was registered
   * server-side, and nothing could act. A boolean literal asserting standing
   * spending authority is the same class of fabrication as the deleted ledger
   * ticker; it just wore a flag's clothes instead of a figure's, which is why it
   * survived a pass that deleted the ticker.
   *
   * So no seed app sets this any more — `build()` writes `false` and `SeedInput`
   * has no field for it — and `isArmed()` asks the manifest whether a name was
   * really issued rather than trusting this flag to have meant it. The only
   * writers left are `publishApp`, `setHalted` and `setAppHalted` in `store.ts`,
   * each of which runs off something that actually happened in this browser.
   *
   * A subscription is bounded and lives for the seconds `watchBlocks()` runs, so
   * nothing on the client can hold "live" as state — which is why there is no
   * live count and why `--live` is reserved for a run that is genuinely open.
   */
  running: boolean;
  lastRunAt: string;
  /** Per-app action journal. Backs the trade log (W8 owns the real one). */
  journal: JournalEntry[];
}

export interface LedgerLine extends JournalEntry {
  id: string;
  /** Mini app name this line belongs to. */
  app: string;
}

/* ------------------------------------------------------------------ *
 * Fixed clock. Deterministic across server and client render — no
 * hydration mismatch, and the receipt reads the same in every timezone.
 * ------------------------------------------------------------------ */
export const SEED_EPOCH = Date.parse("2026-07-26T09:41:00.000Z");
export const SEED_NOW = new Date(SEED_EPOCH).toISOString();

// `ago(minutes)` used to live here. Its only two callers were `updatedAt` and
// `lastRunAt` in `build()`, both keyed off the seed `running` flag — "edited two
// minutes ago, probed one minute ago" for an app that was switched on, "ninety"
// and "three hundred and forty" for one that was not. Both were invented recency
// dressed as freshness, and `lastRunAt` in particular renders as "probed <date>"
// under a panel of measured deployment counts. Deleted along with the flag; the
// two fields now carry values that are either true or measured. See `build()`.
function daysAgo(days: number): string {
  return new Date(SEED_EPOCH - days * 86_400_000).toISOString();
}

/**
 * The Substreams package every seed app subscribes through.
 *
 * These used to be per-protocol names — `aave-v3-arbitrum@v0.4.1` with
 * `map_reserve_updates`, `uniswap-v3-arbitrum@v0.6.0` with `map_swaps`, and eight
 * more. All ten were invented, and none was even the right *kind* of string: the
 * runner needs an `.spkg` URL, so a real watch on any seed app died with
 * `Failed to parse URL from aave-v3-arbitrum@v0.4.1`. They read as a curated set
 * of protocol-specific streams and were a wish list.
 *
 * What runs is one verified package and one module — `map_block_meta`, which needs
 * no custom protobuf codegen. That is not a downgrade, it is the actual design:
 * the stream is a CLOCK, and the numbers a trigger compares are re-read
 * server-side from the app's own health-checked sources on each block
 * (`agency/enrich.ts`). §10's argument is about *when* a trigger re-evaluates —
 * once per block instead of once per five-minute poll — not about which protobuf
 * carried the tick.
 *
 * Literals rather than imports of `DEFAULT_SPKG`/`DEFAULT_MODULE` from
 * `lib/kit/substreams.ts`: that module pulls `@substreams/core` and
 * `@connectrpc/connect-node`, and `seed.ts` is reachable from a `"use client"`
 * store — importing it would ship a gRPC stack to the browser to read two
 * strings. `substreams.ts` is the source of truth; keep these in sync with it.
 */
const SEED_SPKG = "https://spkg.io/streamingfast/ethereum-explorer-v0.1.2.spkg";
const SEED_STREAM_MODULE = "map_block_meta";

const ROUTER_ARB = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";
const AAVE_POOL_ARB = "0x794a61358d6845594f94dc1db02a252b5b4814ad";
const ROUTER_OP = "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45";
const VAULT_ROUTER = "0x2e234dae75c793f67a35089c9d99245e1c58470b";

/**
 * The body a seed app carries before the live overlay replaces it — nothing.
 *
 * Each app used to declare a hand-written `blocks` fixture: `$84,200` of
 * collateral, a health factor of `1.52`, a `$412,800 WETH → USDC` row, a whale
 * table of truncated addresses. Those were the most convincing fabrications in
 * the file, because a `position_card` reading "Collateral 13.84 WETH · $84,200"
 * is not a rounded illustration, it is a specific claim about a specific
 * account. They are deleted rather than kept behind a comment: an app that the
 * overlay could not measure is now dropped from `SEED_APPS` entirely (see
 * below), so no reachable path could render them — and an unreachable fixture
 * full of plausible numbers is precisely the trap that let `resetOwnedValues`
 * silently die.
 *
 * `data.sources` is empty for the same reason. The seed apps declared invented
 * deployment IDs (`Jd8k2Lp`, `5zvR82Q`, …) with `healthy: true` and a
 * health-check timestamp three minutes old — a health check that never ran,
 * against IDs that do not exist. `scripts/seed-live.ts` resolves from
 * `data.schemas` × `data.networks`, never from `data.sources`, so nothing needed
 * them; the overlay writes the real, probed list.
 *
 * The `UiDoc` shape itself stays — `draftFromIntent` still emits it and
 * `AppBody` still renders it for a Studio draft. It just has no seed content.
 */
const EMPTY_SEED_BODY: UiDoc = { spec: "a2ui/0.9.1", blocks: [] };

interface SeedInput {
  name: string;
  title: string;
  intent: string;
  category: string;
  tags: string[];
  tier: AgencyTier;
  /** What the overlay resolves against. The only source-of-data input there is. */
  schemas: SchemaFamily[];
  networks: Network[];
  stream?: { package: string; module: string } | null;
  /*
   * There is no `author` field, and its absence is enforced rather than
   * conventional — the seed → manifest mapping writes `null` unconditionally, so
   * a handle cannot be reintroduced here by adding a line.
   *
   * There were sixteen of them: `0xdegen.eth`, `vega.eth`, `kaia.eth`,
   * `mara.eth`, `fabianferno.eth`. They rendered as `by 0xdegen.eth` on the
   * registry card and `Author  vega.eth` in the app panel, and they were the
   * last survivors of the class §14 #1 cleared out — an ENS name nobody holds,
   * asserting who made something. The file header's own ABSENT rule names "an
   * ENS name" first; `identity.ens` was nulled on all sixteen apps and this
   * field, which is the same claim in a different key, was missed.
   *
   * It sat outside the disclosure too. `runs`, `forks` and the thumbs live under
   * a "Community · seeded" heading and the reviews carry a per-row `seeded` tag;
   * the byline is in the card's footer, under neither, with nothing beside it.
   *
   * The reviewers keep their handles. An invented rater holding an invented
   * opinion is texture §12 argues for and the UI labels it as such. Authorship
   * is not an opinion — it says a person made this thing — so it gets the
   * treatment every other identity claim in this file got: null, and "unclaimed"
   * on screen, which is exactly what these apps are.
   */
  /*
   * There is no `mine` field either, and it is the same claim one level up: not
   * "who wrote this" but "whose is this". See the note on `MiniApp.mine` above
   * for what it used to assert. Like `author`, its absence is enforced rather
   * than conventional — the seed → `MiniApp` mapping writes no ownership at all,
   * so a seed app cannot be made to belong to the reader by adding a line here.
   */
  /*
   * There is no `running` field, on purpose, and it is the newest of the
   * deliberate omissions here.
   *
   * Eight of the sixteen apps below used to set `running: true`. `isArmed()` in
   * `store.ts` read that flag, the top bar counted it, and the home screen's
   * headline number was therefore "8 armed" — a count of standing spending
   * authority, on a board where every app renders "unpublished — no ENS subname
   * issued" and `identity.ens` is null on all sixteen. Nothing was published,
   * nothing was registered with the server, and so nothing held authority to act;
   * the 8 came from this file and from nowhere else.
   *
   * It is the same defect as the fabricated ledger ticker and the derived ENS
   * names, and it outlived both because a boolean does not look like a claim the
   * way a dollar figure does. It is one: on screen it is a lamp and a count.
   *
   * `build()` writes `false`, `publishApp` sets it when a publish really returns,
   * and `isArmed()` no longer trusts it alone — see `MiniApp.running`. Do not
   * re-add this field to seed an app "on"; publishing is what arms an app.
   */
  /**
   * `valueTransactedUsd`, `spentUsd` and `earnedUsd` are deliberately not
   * accepted. A seed app has moved no money, so there is no figure to seed and
   * no call site that should be able to supply one. `build()` writes 0.
   */
  stats: Partial<Omit<MiniAppStats, "valueTransactedUsd" | "spentUsd" | "earnedUsd">> & {
    runs: number;
    forks: number;
  };
  reviews?: Review[];
  /*
   * There is no `journal` field, on purpose. A journal line is a receipt — a
   * block observed, a policy decision taken, a transaction signed — and a
   * hand-written one, tx hash included, is indistinguishable on screen from one
   * the signer produced. The seed apps' lines named blocks nobody watched and
   * hashes nobody broadcast. The log fills from real runs (`appendLedger` in
   * store.ts) or it stays empty.
   */
  /**
   * No `wallet` here either. §8: a mini app holds a wallet, so the address on screen is what
   * a human verifies *before funding it* — that is the safety primitive ENS is
   * load-bearing for, not a decoration on the policy strip. A plausible address
   * nobody holds the key to is the single worst thing this UI could print: it
   * invites a transfer into a black hole and it makes the policy strip a prop.
   * The server signs with one shared session key, which is not per-app, so there
   * is no honest per-app value to put here. Leave it null until a real key is
   * provisioned for a real app. Do not "fill this in".
   */
  policy?: {
    maxSpendUsd: number;
    maxPerTxUsd: number;
    allowlist: string[];
    expiresAt: string;
  };
  actions?: Manifest["agency"]["actions"];
  triggers?: Manifest["agency"]["triggers"];
  createdDaysAgo: number;
  priceUsd?: number;
  /*
   * No `forkedFrom` either, and this one was a live fabrication until this pass.
   *
   * `perpDeleverage` carried `forkedFrom: "aave-guard@1.0.0"`, which rendered on
   * its registry card as "by vega.eth · fork of aave-guard@1.0.0". That fork
   * never happened — and it does not even survive being read: a perp-futures
   * deleverage guard is not a fork of a lending guard, so the lineage was not
   * merely unrecorded, it was implausible on its face.
   *
   * §12's line is what decides it. A made-up opinion about a real feature is set
   * dressing; a made-up EVENT is a data claim. A fork is an event — §12 makes
   * fork-and-remix the flywheel and the credit story, §14 #13a spent a whole row
   * on making onchain lineage verifiable through `registerFork`, and
   * `identity/publish.ts` reads `manifest.forkedFrom` to decide what parent key
   * to assert to the 0G registry. So a hand-written lineage here is a claim about
   * the chain, in the same family as the ENS names and the Agentic IDs that were
   * nulled in the same `build()` below.
   *
   * Nulled rather than kept behind a nicer string: `forkApp` in `store.ts` writes
   * a real `forkedFrom` when someone really forks, and that is the only way one
   * should ever appear.
   */
}

function build(s: SeedInput): MiniApp {
  const manifest: Manifest = {
    spec: "atlas/2",
    name: s.name,
    title: s.title,
    intent: s.intent,
    category: s.category,
    tags: s.tags,
    data: {
      schemas: s.schemas,
      networks: s.networks,
      // Empty until the overlay writes the probed list. See EMPTY_SEED_BODY.
      sources: [],
      // The family's REAL query, keyed by family so `planQueryFor` matches it
      // exactly. This used to be a generated placeholder
      // (`nft_marketplace(first:$first){ id totalValueLockedUSD }`), which was
      // worse than useless: for a single-schema app it is the only key, so
      // `planQueryFor`'s "one unkeyed query" rule handed it to the fan-out
      // instead of falling through to the family default. The gateway rejected
      // it, the core-fallback retry rescued a narrower version, and the app came
      // back with 3 rows where the real query returns 36 — a silent quality loss
      // that looked like thin upstream data.
      queries: Object.fromEntries(s.schemas.map((schema) => [schema, DEFAULT_QUERIES[schema]])),
      variables: { first: 25 },
      stream: s.stream ? { ...s.stream, filter: {} } : null,
      transport: s.tier === "readonly" ? "gateway" : "x402",
    },
    ui: EMPTY_SEED_BODY,
    agency: {
      tier: s.tier,
      triggers: s.triggers ?? [],
      actions: s.actions ?? {},
      policy: {
        // Always null — see the note on `SeedInput.policy`. The caps, the
        // allowlist and the expiry are real policy *shape* and cost nothing to
        // show; the address is a funding target and must not be invented.
        wallet: null,
        maxSpendUsd: s.policy?.maxSpendUsd ?? 0,
        maxPerTxUsd: s.policy?.maxPerTxUsd ?? 0,
        allowlist: s.policy?.allowlist ?? [],
        expiresAt: s.policy?.expiresAt ?? null,
        requireConfirm: s.tier !== "autonomous",
        killSwitch: true,
        halted: false,
      },
    },
    /**
     * Empty for every seed app, and this is the point of the whole file.
     *
     * Each of these three fields used to be derived from the app's own name,
     * which made them look issued when nothing was. Concretely:
     *
     *   ens          `<name>.atlas-apps.eth` — the parent is real and wrapped on
     *                Sepolia, but only four subnames were ever issued
     *                (contracts/deployments/ens-sepolia.json), and none of them
     *                is a seed app. A name that does not resolve is worse than no
     *                name: §8 makes the name the thing you verify before funding,
     *                so a fake one defeats the primitive it is advertising.
     *   agenticId    a contract address that is not the deployed AgenticId
     *                (that is 0xeB2872c5472185c901b7C20C4619e0Fd8Ac2C3B0 on 0G
     *                Galileo, chainId 16602), plus a tokenId from a modulus of
     *                the app's name length — which collided across apps and was
     *                never minted. §9 asks for a link to a minted Agentic ID; a
     *                number that resolves to nothing on the explorer is the
     *                opposite of that.
     *   manifestCid  24 characters of `bafybeig` + padding. A real CIDv1 is 59.
     *                It was not a CID; it was the shape of one.
     *
     * `identity` is populated by the publish path when a name is actually issued
     * and a token is actually minted. Until then the UI must render "not
     * published" rather than a plausible string, and §5's note that forking
     * strips identity means an unpublished app and a fresh fork read the same —
     * which is correct.
     */
    identity: { ens: null, agenticId: null, manifestCid: null },
    provenance: {
      // The seed bodies below were assembled by hand, not by a model. The live
      // overlay replaces this wholesale for every app it measured; this is the
      // value that survives if it ever cannot. `deepseek-chat-v3` used to sit
      // here — §9 records that model as no longer existing on the 0G router,
      // checked against a live GET /v1/models — alongside an `0g://att/…` ref
      // for an attestation no TEE ever returned. Both were claims about compute
      // that never ran.
      model: OFFLINE_MODEL,
      compute: "local",
      attestationRef: null,
      generatedAt: daysAgo(s.createdDaysAgo),
    },
    // Always null, and not read from `s` — see the note on `SeedInput`. Nobody
    // holds these apps, so nobody is named as having written them.
    author: null,
    appVersion: "1.0.0",
    // Always null — see the note on `SeedInput`. A fork is an event, and no seed
    // app is the result of one.
    forkedFrom: null,
    pricing: s.priceUsd ? { x402: { enabled: true, priceUsd: s.priceUsd } } : null,
    createdAt: daysAgo(s.createdDaysAgo),
    // Same instant as `createdAt`, which is the true statement about a seed app:
    // it was written once and nobody has edited it since. This used to be
    // `ago(running ? 2 : 90)` — "edited two minutes ago" for the eight apps that
    // asserted `running`, which was recency invented out of a flag that was
    // itself invented.
    updatedAt: daysAgo(s.createdDaysAgo),
  };

  return {
    manifest,
    // Always false. `SeedInput` has no field for it and the long note there says
    // why: a seed app has no issued name and no server-side registration, so it
    // holds no standing authority to act and must not be counted as armed.
    running: false,
    // Placeholder only in the sense that it is always replaced: `withLiveData`
    // overwrites it with the snapshot's own `generatedAt`, which is when the
    // deployments behind this app were really probed. It matters because
    // `app-runtime.tsx` renders this as "probed <date>" directly beneath the
    // measured `N of M deployments live`. The old value was `ago(running ? 1 :
    // 340)` — a probe time derived from a boolean, sitting under real counts.
    lastRunAt: daysAgo(s.createdDaysAgo),
    // Always empty — see the note on `SeedInput`. The trade log is a receipt
    // surface; it fills when the app really runs, really receives a block, or
    // really dispatches an action.
    journal: [],
    reviews: s.reviews ?? [],
    stats: {
      // Kept: seeded social texture, disclosed as such in the README. There is no
      // community yet, and inventing a fork count is set dressing rather than a
      // data claim. The line between the two is the whole argument, so:
      runs: s.stats.runs,
      forks: s.stats.forks,
      thumbsUp: s.stats.thumbsUp ?? 0,
      thumbsDown: s.stats.thumbsDown ?? 0,
      // Zeroed: money. These three are rendered as dollars moved, dollars spent
      // against a policy cap, and dollars a creator received.
      //
      // `earnedUsd` is the sharpest of the three. §12 specifies creator earnings
      // settling to the creator's wallet through an x402 facilitator, and the
      // README's "Not in scope" admits that facilitator does not exist and the
      // number is display-only. So any figure here asserts that money reached a
      // person. It did not.
      valueTransactedUsd: 0,
      spentUsd: 0,
      earnedUsd: 0,
      // Measured, and overwritten by the live overlay with what the fan-out
      // actually cost and how many deployments actually answered.
      sourcesQueried: s.stats.sourcesQueried ?? 0,
      sourcesHealthy: s.stats.sourcesHealthy ?? 0,
      costPerRunUsd: s.stats.costPerRunUsd ?? 0.01,
    },
  };
}

/* ================================================================== *
 * ANALYTICS — readonly. Cannot act. 1.5px chrome.
 * ================================================================== */

const dexVolumeArb = build({
  name: "dex-volume-arb",
  title: "Top DEXs by volume — Arbitrum, 7d",
  intent: "Show me the top DEXs by volume on Arbitrum this week.",
  category: "analytics",
  tags: ["dex", "volume", "arbitrum"],
  tier: "readonly",
  schemas: ["dex-amm@1.3.2"],
  networks: ["arbitrum-one"],
  createdDaysAgo: 12,
  priceUsd: 0.02,
  stats: { runs: 1842, forks: 37, thumbsUp: 96, thumbsDown: 4, sourcesQueried: 31, sourcesHealthy: 27, costPerRunUsd: 0.012 },
  reviews: [
    { id: "r1", rater: "0xdegen.eth", score: "up", text: "This is the three Dune tabs I keep open, without the SQL in between.", ranIt: true, at: daysAgo(3) },
    { id: "r2", rater: "mara.eth", score: "up", text: "Wish it covered Base. Refining in a sentence beats waiting for someone else to add it.", ranIt: true, at: daysAgo(6) },
  ],
});

const tvlCrosschain = build({
  name: "tvl-crosschain",
  title: "Cross-protocol TVL — Arbitrum vs Optimism vs Base",
  intent: "Compare lending and DEX TVL across Arbitrum, Optimism and Base.",
  category: "analytics",
  tags: ["tvl", "multichain", "composition"],
  tier: "readonly",
  schemas: ["lending-cdp@3.1.0", "dex-amm@1.3.2", "yield-aggregator@1.3.1"],
  networks: ["arbitrum-one", "optimism", "base"],
  createdDaysAgo: 9,
  priceUsd: 0.05,
  stats: { runs: 934, forks: 21, thumbsUp: 58, thumbsDown: 2, sourcesQueried: 44, sourcesHealthy: 38, costPerRunUsd: 0.031 },
  reviews: [
    { id: "r3", rater: "pgov.eth", score: "up", text: "Three schema families in one query shape. This is the composability argument.", ranIt: true, at: daysAgo(2) },
  ],
});

const bridgeFlows = build({
  name: "bridge-flows",
  title: "Bridge flows into Arbitrum, 24h",
  intent: "Where is bridged value coming from into Arbitrum in the last day?",
  category: "analytics",
  tags: ["bridge", "flows", "arbitrum"],
  tier: "readonly",
  schemas: ["bridge@1.2.0"],
  networks: ["arbitrum-one", "mainnet"],
  createdDaysAgo: 20,
  priceUsd: 0.02,
  stats: { runs: 611, forks: 14, thumbsUp: 41, thumbsDown: 3, sourcesQueried: 18, sourcesHealthy: 16 },
});

const perpOiBoard = build({
  name: "perp-oi-board",
  title: "Perp open interest by market — Arbitrum",
  intent: "Show open interest and funding by perp market on Arbitrum.",
  category: "analytics",
  tags: ["perps", "open-interest", "arbitrum"],
  tier: "readonly",
  schemas: ["perp-futures@1.3.4"],
  networks: ["arbitrum-one"],
  createdDaysAgo: 16,
  stats: { runs: 388, forks: 9, thumbsUp: 27, thumbsDown: 1 },
});

// Mainnet, not Optimism: `nft-marketplace@2.1.0` has standardized deployments on
// mainnet only (prd.md §13). Pointed at Optimism this app resolved zero live
// sources, which made it the one seed app `scripts/seed-live.ts` could not put on
// real data — so the app moved to where the schema actually exists. Worth keeping
// in mind now that an unmeasured app is dropped rather than backfilled: a
// schema/network pair with no registry coverage costs you the card.
const nftVolumeEth = build({
  name: "nft-volume-eth",
  title: "NFT marketplace volume — Ethereum, 30d",
  intent: "How much NFT volume is actually happening across marketplaces?",
  category: "analytics",
  tags: ["nft", "mainnet", "marketplace"],
  tier: "readonly",
  schemas: ["nft-marketplace@2.1.0"],
  networks: ["mainnet"],
  createdDaysAgo: 26,
  stats: { runs: 176, forks: 3, thumbsUp: 11, thumbsDown: 4 },
});

const yieldLeaderboard = build({
  name: "yield-leaderboard",
  title: "Best stablecoin vaults by net APY",
  intent: "Rank stablecoin vaults by net APY across Arbitrum and Optimism.",
  category: "analytics",
  tags: ["yield", "stablecoins", "apy"],
  tier: "readonly",
  schemas: ["yield-aggregator@1.3.1", "lending-cdp@3.1.0"],
  networks: ["arbitrum-one", "optimism"],
  createdDaysAgo: 7,
  priceUsd: 0.03,
  stats: { runs: 722, forks: 44, thumbsUp: 63, thumbsDown: 2, sourcesQueried: 22, sourcesHealthy: 19 },
  reviews: [
    { id: "r4", rater: "kaia.eth", score: "up", text: "Net of fees, which nothing else bothers to do.", ranIt: true, at: daysAgo(1) },
    { id: "r5", rater: "anon", score: "down", text: "Ranks by 7d APY, would prefer 30d.", ranIt: false, at: daysAgo(4) },
  ],
});

/* ================================================================== *
 * TRIGGER CONDITIONS — what a `when` may name, and why these changed.
 *
 * Every seed condition used to be either prose (`"hourlyOutflow > 3 * median"`,
 * `"abs(fundingA - fundingB) > 0.15"`) or a path the data plane cannot produce
 * (`healthFactor`, `leverage`, `claimableUsd`, `amountUsd`). Both fail closed, so
 * nothing was unsafe — and nothing could ever fire. A trigger listed on a card
 * with no comment reads as armed, so an app that could never act looked exactly
 * like one that could. `isConditionEvaluable` (kit-side, `agency/condition.ts`)
 * now separates "cannot be parsed" from "not satisfied", and `app-runtime` labels
 * the first case; these conditions are written so neither label is needed.
 *
 * WHAT IS IN SCOPE, verified by running each app's own fan-out through
 * `/api/graph` and reading `metricsFromFanOut`'s output rather than guessing:
 *
 *   snapshot-level   `sourcesQueried` `sourcesHealthy` `rows` `rowsSuspect`
 *                    `costUsd` `live` `stale` `ageMs`
 *   per family       `<prefix>.<scalar>`, where the prefix comes from
 *                    `familyPrefix()`: lending-cdp → `lending`, dex-amm →
 *                    `dex_amm` (NOT `dex`), dex-aggregator → `dex`,
 *                    yield-aggregator → `yield`, perp-futures → `perp`,
 *                    nft-marketplace → `nft`, bridge/network/generic unchanged.
 *   stream payload   `block.*`, and it is used by nothing here. It is untrusted
 *                    module output (§7); the fan-out scalars are ours, read from
 *                    a source we health-checked, which is what earns them the
 *                    right to gate an action.
 *
 * THREE THINGS THAT DECIDED THE THRESHOLDS, all found by measuring:
 *
 *  1. `<family>.<scalar>` binds ONE ROW — `metricsFromFanOut` takes the first
 *     non-suspect row of that family, not an aggregate. So `lending.
 *     totalBorrowBalanceUSD` is one market's borrow balance (Aave Arbitrum WETH,
 *     ~$106M today), not the family's total. Every threshold below was chosen
 *     against the value that app's own fan-out actually returned.
 *  2. WHICH row binds can change between snapshots, because it is whichever
 *     health-checked deployment answered first. Where that instability would
 *     make a magic number meaningless, the condition compares two paths from the
 *     same row instead (`perp.longOpenInterestUSD > perp.shortOpenInterestUSD`)
 *     — that relationship holds whichever venue binds.
 *  3. `cumulative*` scalars only ever increase. A `>` threshold on one is a
 *     one-shot latch: it fires once and then stays true forever. That is fine
 *     for a MONITOR (a milestone alert should fire once, and the signal ledger
 *     suppresses re-fires) and wrong for an AUTONOMOUS app, which needs to arm
 *     and re-arm. So money-movers below gate on non-monotonic gauges only.
 *
 * Autonomous conditions additionally carry `stale == false`. `enrich.ts`
 * suggests exactly this: a stale snapshot is the last good read served again
 * after a throttle or a failure, and it must not be a reason to sign.
 * ================================================================== */

/* ================================================================== *
 * MONITORING — watches and alerts, cannot spend. 2.5px chrome.
 * ================================================================== */

// Premise re-phrased from a per-account one. `healthFactor` is a property of one
// user's position and no standardized family exposes it (README "Not in scope";
// `enrich.ts` header), so the old intent promised a number the data plane cannot
// produce and the old condition was false on every block forever. Borrow load on
// the market is the protocol-level fact that stands behind the same worry, and it
// is really answerable. The `name` is deliberately unchanged — it keys
// `seed-live.generated.json`, so renaming would drop the app until regeneration.
const healthFactorWatch = build({
  name: "health-factor-watch",
  title: "Lending leverage watch — Arbitrum and Optimism",
  intent:
    "Tell me when the lending markets I follow on Arbitrum and Optimism are being borrowed against harder than I am comfortable with.",
  category: "risk",
  tags: ["lending", "liquidation", "alerts"],
  tier: "monitor",
  schemas: ["lending-cdp@3.1.0"],
  networks: ["arbitrum-one", "optimism"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured $106.0M on the bound row (Aave Arbitrum WETH). $120M is ~13% above
  // it: reachable on a real move, not crossed on a quiet day.
  triggers: [{ on: "stream", when: "lending.totalBorrowBalanceUSD > 120000000", run: "notify" }],
  actions: { notify: { kind: "notify", params: { channel: "board" }, label: "Alert me" } },
  createdDaysAgo: 11,
  priceUsd: 0.05,
  stats: { runs: 5120, forks: 62, thumbsUp: 128, thumbsDown: 5, sourcesQueried: 12, sourcesHealthy: 11, costPerRunUsd: 0.008 },
  reviews: [
    { id: "r6", rater: "0xdegen.eth", score: "up", text: "A block-level trigger instead of a five-minute poll. For liquidation risk that gap is the whole product.", ranIt: true, at: daysAgo(5) },
    { id: "r7", rater: "vega.eth", score: "up", text: "A fork starts with no wallet and no inherited authority. I wanted that enforced in code, not promised.", ranIt: true, at: daysAgo(8) },
  ],
});

// A single swap's size is not something the standardized fan-out returns — it
// reads protocol aggregates, and `amountUsd` only ever existed on the untrusted
// stream payload as `block.amountUsd`, which nothing verifies. Cumulative venue
// volume IS returned, and "flow is picking up on the venues I watch" is the same
// instinct expressed as a fact this app can actually read.
//
/* ------------------------------------------------------------------ *
 * THE DEAD FAMILIES — `dex-aggregator@1.0.2` and `network@1.2.0`. Read this
 * before "cleaning up" the `schemas` line below, or the one on `copy-trader-arb`
 * or `gas-rebate-claimer`. Those three declarations are the ONLY reason two
 * disclosures elsewhere in the product render at all, and deleting them is a
 * silent regression that looks like tidying.
 *
 * THE FACT: prd.md §13 audited every declared family and found these two have
 * ZERO standardized deployments on any network. So `resolveSources` answers a
 * declaration of either with a single explicit `PLACEHOLDER-<family>-<network>`
 * source marked `healthy: false` — verified in `kit/seed-live.generated.json`:
 * `PLACEHOLDER-dex-aggregator-arbitrum-one` here and on `copy-trader-arb`,
 * `PLACEHOLDER-network-optimism` on `gas-rebate-claimer`. Nothing is queried
 * against them, no row comes back from them, and no trigger names their prefix.
 *
 * SO WHY KEEP THEM. The obvious fix is to drop the family and shrink the
 * manifest to what really answers. It was considered and rejected, because a
 * declaration is not a measurement: `data.schemas` is what the app ASKS for, and
 * `data.sources` is what the health check ANSWERED. The answer is already on
 * screen and already negative — the app page's Sources list renders that
 * placeholder row in `--loss` with the literal words "dead, skipped", and
 * `/registry`'s schema select labels the family "— no live deployment" off
 * `familiesWithNoLiveSource`, which it derives from exactly these declarations
 * (`registry-grid.tsx` says so at length). Drop the declarations and that set
 * goes empty, the label never renders, and prd.md §14 #7 — a checked hard
 * requirement that cites the label as its evidence — loses part of what earned
 * its tick. That is deleting a disclosure to tidy a manifest, and §13's own
 * argument is that a demo where everything is green never shows what the health
 * check is for.
 *
 * WHAT IS STILL WRONG, AND IS NOT FIXABLE FROM THIS FILE: `app-runtime.tsx`'s
 * data plan renders `<KV k="Schemas" v={m.data.schemas.join(" · ")} />` — a bare
 * join, so "generic@3.0.0 · network@1.2.0" reads as two families this app is
 * getting data from, with the contradiction three rows below it in the Sources
 * list rather than at the point of display. Same for the family chips on the
 * registry card. Both files are owned elsewhere; handed off in the report rather
 * than edited here. The rule they need is the one `/registry`'s select already
 * follows: mark a declared family with no healthy source, do not silently list
 * it beside the ones that answered.
 * ------------------------------------------------------------------ */
const whaleAlertArb = build({
  name: "whale-alert-arb",
  title: "Volume milestones — Arbitrum DEXs",
  intent:
    "Tell me when cumulative swap volume on the Arbitrum venues I watch crosses the next big round number. I want to hear that flow is picking up, not go looking for it.",
  category: "flow",
  tags: ["whales", "dex", "alerts"],
  tier: "monitor",
  schemas: ["dex-amm@1.3.2", "dex-aggregator@1.0.2"],
  networks: ["arbitrum-one"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured $257.7M on the bound row. $300M is ~16% out and will be crossed.
  // A cumulative counter latches once true — correct for a milestone alert, and
  // the reason no autonomous app below gates on a `cumulative*` scalar.
  triggers: [{ on: "stream", when: "dex_amm.cumulativeVolumeUSD > 300000000", run: "notify" }],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  createdDaysAgo: 5,
  priceUsd: 0.02,
  stats: { runs: 3011, forks: 28, thumbsUp: 74, thumbsDown: 6, sourcesQueried: 14, sourcesHealthy: 13, costPerRunUsd: 0.009 },
});

// Funding rate is not in the standardized perp schema, and `abs(a - b)` is not
// in the condition grammar either — the old `when` was doubly unparseable. Long
// and short open interest ARE both returned, and a lopsided book is the condition
// that makes funding blow out in the first place, so this watches the cause.
const fundingDivergence = build({
  name: "funding-divergence",
  title: "Perp book skew — Arbitrum and Optimism",
  intent:
    "Tell me when the perp venues I watch get lopsided — long open interest running ahead of short is what drags funding around.",
  category: "risk",
  tags: ["perps", "funding", "arbitrage"],
  tier: "monitor",
  schemas: ["perp-futures@1.3.4"],
  networks: ["arbitrum-one", "optimism"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Two paths from the same row rather than a magic number, on purpose: which
  // venue binds depends on which deployment answered first (measured Kwenta at
  // $5.33M long / $5.27M short, but Mux binds at $108M / $99.6M on an
  // Arbitrum-only read). A threshold calibrated to one of those is meaningless
  // for the other; "long exceeds short" is true or false for either.
  triggers: [
    { on: "stream", when: "perp.longOpenInterestUSD > perp.shortOpenInterestUSD", run: "notify" },
  ],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  createdDaysAgo: 14,
  priceUsd: 0.08,
  stats: { runs: 1420, forks: 19, thumbsUp: 52, thumbsDown: 3, sourcesQueried: 9, sourcesHealthy: 8 },
});

// Feed age is not in any standardized schema, so "older than 20 minutes" was
// unanswerable — and `now - updatedAt` is arithmetic the grammar does not parse.
// But the snapshot's own health fields say something adjacent and true: how many
// deployments answered, and how many rows came back implausible. This app keeps
// its character (do not trust a stale answer) by watching the thing that is
// actually measured — the health of its own reads.
const staleOracleWatch = build({
  name: "stale-oracle-watch",
  title: "Read health watch — Optimism lending",
  intent:
    "Warn me when the Optimism deployments this reads from start dropping out or returning nonsense. I would rather know the answer is thin than act on it.",
  category: "risk",
  tags: ["oracles", "lending", "optimism"],
  tier: "monitor",
  schemas: ["lending-cdp@3.1.0", "generic@3.0.0"],
  networks: ["optimism"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured 3 of 7 healthy and 0 suspect rows, so both clauses read false today
  // and one more deployment going dark crosses the first. Deliberately NOT
  // `stale == true`: the enricher marks a read stale whenever it is inside its
  // 10s throttle, which on a 250ms block time is nearly every tick, so that
  // condition would fire constantly and mean nothing.
  triggers: [{ on: "stream", when: "sourcesHealthy < 3 or rowsSuspect > 0", run: "notify" }],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  createdDaysAgo: 18,
  stats: { runs: 806, forks: 7, thumbsUp: 24, thumbsDown: 1 },
});

// An hourly rate and a rolling median are both derived series the fan-out does
// not return, and `3 * median` is arithmetic the grammar does not parse. Bridge
// TVL is returned, and a bridge draining is the same alarm read from the level
// instead of the flow.
const bridgeOutflowWatch = build({
  name: "bridge-outflow-watch",
  title: "Bridge liquidity drain watch",
  intent:
    "Alert me when liquidity drains out of the bridges I use across Arbitrum, Optimism and Base. A bridge emptying is the signal I actually care about.",
  category: "risk",
  tags: ["bridge", "anomaly", "alerts"],
  tier: "monitor",
  schemas: ["bridge@1.2.0"],
  networks: ["arbitrum-one", "optimism", "base"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured $39.6M locked on the bound row. $30M is a ~24% drawdown — a real
  // drain rather than noise, and below rather than above because the worry is
  // liquidity leaving.
  // Threshold re-measured 2026-07-26: the bound row read $2,335,017, so the
  // previous `< 30000000` was already TRUE and this monitor would have alerted on
  // the first block of any watch — inert in the other direction, and a false alert
  // is worse than a missed one for something whose whole job is to be believed.
  //
  // WHY IT DRIFTED, because it will drift again: `bridge.totalValueLockedUSD` is
  // ONE ROW, not a family total — `metricsFromFanOut` binds the first non-suspect
  // row, and which deployment that is changes as sources come and go. The same
  // path read $39.6M earlier in the day and $2.3M now. An absolute threshold over
  // a varying row is a heuristic, not a measurement, and this family offers no
  // second scalar to make it row-independent the way `funding-divergence` compares
  // long against short open interest.
  //
  // So: below the currently bound value with real headroom (−36%), which is armed
  // rather than pre-fired today. If the larger deployment binds again this goes
  // quiet, and that is the honest limit of protocol-level fan-out for drain
  // semantics — not something a cleverer constant fixes.
  triggers: [{ on: "stream", when: "bridge.totalValueLockedUSD < 1500000", run: "notify" }],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  createdDaysAgo: 22,
  stats: { runs: 402, forks: 11, thumbsUp: 18, thumbsDown: 2 },
});

/* ================================================================== *
 * AUTONOMOUS — holds a wallet, can spend. 5px chrome + policy strip.
 * ================================================================== */

// prd.md §2's worked example, re-premised. The original — "if health factor goes
// under 1.4, sell enough ETH to bring it back to 1.8" — is the sentence the whole
// product was designed around, and it is the one thing the data plane cannot
// answer: health factor is per-account. Borrow load on the market this position
// sits in is protocol-level, really returned, and stands behind the same worry:
// when a market is being borrowed against hard, that is when a wick liquidates
// people. Still an autonomous agent that watches a real number and swaps on it.
const aaveGuard = build({
  name: "aave-guard",
  title: "Aave borrow-load guard — Arbitrum",
  intent:
    "Watch how hard the Aave market I am exposed to on Arbitrum is being borrowed against. When it runs hot, swap out of ETH to de-risk. Show me what you're doing.",
  category: "risk",
  tags: ["aave", "liquidation", "autonomous", "arbitrum"],
  tier: "autonomous",
  schemas: ["lending-cdp@3.1.0", "dex-amm@1.3.2"],
  networks: ["arbitrum-one"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured $106.0M borrowed on the bound row (Aave Arbitrum WETH, $201.8M
  // deposited). $115M is ~8% out: close enough to be a live trigger, far enough
  // that it is not already true. `stale == false` because this one signs.
  triggers: [
    {
      on: "stream",
      when: "stale == false and lending.totalBorrowBalanceUSD > 115000000",
      run: "rebalance",
    },
  ],
  actions: {
    rebalance: {
      kind: "swap",
      target: ROUTER_ARB,
      params: { tokenIn: "WETH", tokenOut: "USDC" },
      label: "De-risk into USDC",
    },
  },
  policy: {
    maxSpendUsd: 500,
    maxPerTxUsd: 50,
    allowlist: [ROUTER_ARB, AAVE_POOL_ARB],
    expiresAt: "2026-08-25T00:00:00.000Z",
  },
  createdDaysAgo: 3,
  priceUsd: 0.05,
  stats: {
    runs: 1204,
    forks: 88,
    thumbsUp: 141,
    thumbsDown: 3,
    sourcesQueried: 12,
    sourcesHealthy: 11,
    costPerRunUsd: 0.014,
  },
  reviews: [
    { id: "r8", rater: "vega.eth", score: "up", text: "The kill switch sitting one press away is the reason I would fund something like this at all.", ranIt: true, at: daysAgo(1) },
    { id: "r9", rater: "kaia.eth", score: "up", text: "Policy strip is always on screen. I can see the cap without digging.", ranIt: true, at: daysAgo(2) },
    { id: "r10", rater: "anon", score: "down", text: "Would like a confirm step even in autonomous mode.", ranIt: false, at: daysAgo(3) },
  ],
});

// The one app whose original premise cannot be re-phrased into itself. Mirroring
// a named wallet is per-account by definition — there is no protocol-level version
// of "what did 0x7f3a do", and the old title named an address lifted from this
// file's own invented whale table while the condition compared `sender` to the
// literal string "0x7f3a…9c41", ellipsis included. So the premise moves to the
// nearest thing that is real and keeps the character: follow the flow, size it
// small, let the per-trade cap be the safety. Not deleted, because an autonomous
// app that trades on live venue data is exactly the tier the registry exists to
// show; renamed in title only, since `name` keys the live snapshot.
const copyTraderArb = build({
  name: "copy-trader-arb",
  title: "Liquidity follower — Arbitrum DEX pools",
  intent:
    "Follow the Arbitrum pools I care about and take a small position when liquidity is building, at most $50 a trade.",
  category: "trading",
  tags: ["copy-trading", "dex", "autonomous"],
  tier: "autonomous",
  // `dex-aggregator@1.0.2` has no deployment anywhere and resolves to one
  // `healthy: false` placeholder — kept deliberately, not overlooked. The full
  // argument is the block above `whale-alert-arb`; the trigger below reads
  // `dex_amm.*`, never `dex.*`, so nothing here depends on it answering.
  schemas: ["dex-amm@1.3.2", "dex-aggregator@1.0.2"],
  networks: ["arbitrum-one"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured $17,535 locked on the bound row. $25k is ~43% out, which is a real
  // move for a pool this size and not a rounding error. TVL rather than
  // `cumulativeVolumeUSD` because this one spends: a cumulative counter latches
  // true forever once crossed, and an autonomous app has to be able to re-arm.
  triggers: [
    {
      on: "stream",
      when: "stale == false and dex_amm.totalValueLockedUSD > 25000",
      run: "mirror",
    },
  ],
  actions: { mirror: { kind: "swap", target: ROUTER_ARB, params: { maxUsd: 50, slippageBps: 50 }, label: "Take position" } },
  policy: {
    maxSpendUsd: 750,
    maxPerTxUsd: 50,
    allowlist: [ROUTER_ARB],
    expiresAt: "2026-08-10T00:00:00.000Z",
  },
  createdDaysAgo: 6,
  priceUsd: 0.1,
  stats: { runs: 942, forks: 51, thumbsUp: 87, thumbsDown: 11, sourcesQueried: 8, sourcesHealthy: 8, costPerRunUsd: 0.011 },
  reviews: [
    { id: "r11", rater: "fabianferno.eth", score: "up", text: "A block-level trigger is the only version of copy trading that makes sense. The per-trade cap is what would let me leave it on.", ranIt: true, at: daysAgo(2) },
    { id: "r12", rater: "anon", score: "down", text: "Mirroring entries and exits off one rule is too blunt — I want a separate threshold for each.", ranIt: true, at: daysAgo(5) },
  ],
});

// "Best net APY" is not in the yield schema — the family returns size, revenue
// and user counts, not a rate. Size and fee revenue are what it does return, and
// ranking vaults on those is a real strategy rather than a proxy for one.
const yieldRotator = build({
  name: "yield-rotator",
  title: "Yield rotator — stables, weekly",
  intent:
    "Once a week, compare the stablecoin vaults on Arbitrum and Optimism by size and fee revenue, and move into the strongest one.",
  category: "yield",
  tags: ["yield", "rotation", "autonomous"],
  tier: "autonomous",
  schemas: ["yield-aggregator@1.3.1", "lending-cdp@3.1.0", "dex-amm@1.3.2"],
  networks: ["arbitrum-one", "optimism"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // `when: null` would also be correct here and is NOT a placeholder — on an
  // interval trigger it means "every interval, no extra gate", which is a real
  // configuration. It is replaced anyway because this app signs: `stale == false`
  // says do not rotate on a snapshot the enricher served from cache after a
  // throttle or a failed read. The weekly cadence lives in `intervalSec`, where
  // it belongs, so the condition is free to carry the freshness gate.
  triggers: [
    { on: "interval", when: "stale == false", run: "rotate", intervalSec: 604800 },
  ],
  actions: { rotate: { kind: "supply", target: VAULT_ROUTER, params: { minImprovementBps: 80 }, label: "Rotate" } },
  policy: {
    maxSpendUsd: 1200,
    maxPerTxUsd: 400,
    allowlist: [VAULT_ROUTER, ROUTER_OP],
    expiresAt: "2026-09-01T00:00:00.000Z",
  },
  createdDaysAgo: 15,
  priceUsd: 0.15,
  stats: { runs: 288, forks: 34, thumbsUp: 61, thumbsDown: 4, sourcesQueried: 22, sourcesHealthy: 19 },
  reviews: [{ id: "r13", rater: "mara.eth", score: "up", text: "Health-checking each deployment before querying it is the unglamorous part that decides whether the ranking means anything.", ranIt: true, at: daysAgo(4) }],
});

// `leverage` is my position divided by my collateral — per-account, so the old
// condition was false on every block. Open interest on the venue is the
// protocol-level fact, and a book that is heavily one-sided is the market
// condition that makes a leveraged position dangerous. Same instinct, one level
// out from the account.
const perpDeleverage = build({
  name: "perp-deleverage",
  title: "Perp deleverage guard — Arbitrum",
  intent:
    "When the Arbitrum perp venues I trade get crowded on the long side, trim my exposure. A one-sided book is where the cascades start.",
  category: "risk",
  tags: ["perps", "leverage", "autonomous"],
  tier: "autonomous",
  schemas: ["perp-futures@1.3.4", "dex-amm@1.3.2"],
  networks: ["arbitrum-one"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured $108.2M long open interest on the bound row (Mux, Arbitrum), against
  // $99.6M short. A magic number rather than `long > short` here — unlike
  // funding-divergence, which only notifies — because `long > short` is already
  // true and an app that can spend should not arrive pre-fired. $130M is ~20%
  // out: crowded, not merely uneven.
  triggers: [
    {
      on: "stream",
      when: "stale == false and perp.longOpenInterestUSD > 130000000",
      run: "trim",
    },
  ],
  actions: { trim: { kind: "withdraw", target: ROUTER_ARB, params: {}, label: "Trim exposure" } },
  policy: {
    maxSpendUsd: 300,
    maxPerTxUsd: 75,
    allowlist: [ROUTER_ARB],
    expiresAt: "2026-08-15T00:00:00.000Z",
  },
  createdDaysAgo: 10,
  priceUsd: 0.1,
  stats: { runs: 164, forks: 12, thumbsUp: 22, thumbsDown: 2, sourcesQueried: 6, sourcesHealthy: 6 },
  // The review text was cut back with the `forkedFrom` above it. It opened
  // "Aave-guard's shape with a different trigger, and forkedFrom says so on the
  // card" — a reviewer testifying to a fork that never happened, which is a
  // fabricated event wearing a rating's clothes (§14 #1a's exact phrase, and the
  // reason the seeded reviews were rewritten once already). What survives is an
  // opinion about a feature that genuinely exists: `forkManifest` really does
  // strip the wallet, the identity and the spending authority, and `forkApp`
  // really does say what it cleared.
  reviews: [{ id: "r14", rater: "0xdegen.eth", score: "up", text: "A fork inheriting nothing spendable is the right default. I want the copy to start with no authority, not with the parent's.", ranIt: true, at: daysAgo(6) }],
});

// "My rebates" is a per-account balance and `claimableUsd` never existed in the
// snapshot. What this app can actually see is how the protocol it farms is doing,
// so the claim is timed off the protocol recovering rather than off a balance it
// cannot read.
//
// Worth knowing when picking the path: this app declares `network@1.2.0` as well
// as `generic@3.0.0`, but a live read returns rows for `generic` only (1 of 3
// sources healthy on Optimism), so `network.*` resolves to nothing and a condition
// naming it would fail closed forever — the exact trap being removed here. Checked
// by running the fan-out, not by reading the schema list.
//
// And the declaration STAYS despite that: §13 found `network@1.2.0` has zero
// deployments on any network, the resolver answers with an explicit
// `PLACEHOLDER-network-optimism` marked `healthy: false`, and two surfaces render
// that refusal. See the block above `whale-alert-arb` for why removing it would
// delete a disclosure rather than a claim.
const gasRebate = build({
  name: "gas-rebate-claimer",
  title: "Rebate claimer — Optimism",
  intent:
    "Watch the Optimism protocol I farm and fire my claim once its deposits are back above the level where claiming is worth the gas.",
  category: "ops",
  tags: ["claims", "optimism", "autonomous"],
  tier: "autonomous",
  schemas: ["generic@3.0.0", "network@1.2.0"],
  networks: ["optimism"],
  stream: { package: SEED_SPKG, module: SEED_STREAM_MODULE },
  // Measured $5,232 locked on the bound row (Mountain Protocol, Optimism).
  // $7,500 is ~43% out. Not `cumulativeUniqueUsers`, which was the other populated
  // scalar here: user counts only ever go up, so it would latch true and never
  // re-arm.
  triggers: [
    {
      on: "stream",
      when: "stale == false and generic.totalValueLockedUSD > 7500",
      run: "claim",
    },
  ],
  actions: { claim: { kind: "claim", target: ROUTER_OP, params: {}, label: "Claim" } },
  policy: {
    maxSpendUsd: 100,
    maxPerTxUsd: 10,
    allowlist: [ROUTER_OP],
    expiresAt: "2026-10-01T00:00:00.000Z",
  },
  createdDaysAgo: 4,
  priceUsd: 0.02,
  stats: { runs: 96, forks: 5, thumbsUp: 14, thumbsDown: 0, sourcesQueried: 4, sourcesHealthy: 4 },
});

/* ================================================================== *
 * LIVE OVERLAY
 *
 * Matrix #1 says no mocks anywhere in the demo, and the risk register rates
 * "seed content is mistaken for live data" as fatal. `scripts/seed-live.ts`
 * runs every app above through the real pipeline — resolve, health-check, fan
 * out, compose — and writes the result to `kit/seed-live.generated.json`. This
 * overlay swaps the invented parts for the measured ones.
 *
 * A snapshot rather than a call at page load, for two reasons: the registry has
 * to render with no key and no network, and a demo must not re-roll its numbers
 * between the rehearsal and the take. Re-run the script to refresh it; the file
 * carries `generatedAt` so staleness is visible rather than assumed.
 *
 * WHAT THE OVERLAY DOES NOT TOUCH: `runs`, `forks`, `thumbsUp`/`thumbsDown` and
 * the reviews. Those are seeded *social* texture — there is no community yet, and
 * inventing a fan-out is a data claim while inventing a fork count is set
 * dressing. Said out loud in the README rather than blurred.
 *
 * WHAT THE OVERLAY NO LONGER HAS TO FIX: it never touched `identity`,
 * `agency.policy.wallet`, the money-shaped stats or the journals — so for a while
 * those were the one place a fabricated *claim* could reach the screen even with
 * the overlay applied, and the "no mocks" line above was not true of them. They
 * are now null / zero / empty in `build()` itself, which is the right layer: a
 * value that cannot be measured should be absent at the source rather than
 * papered over downstream. If an overlay run ever fails for an app, that app
 * degrades to no name, no token, no wallet and no receipts — which is honest —
 * instead of to a plausible set.
 * ================================================================== */

import liveSeed from "@/lib/kit/seed-live.generated.json";

interface LiveSeedEntry {
  live: boolean;
  reason?: string;
  generatedAt: string;
  sources: Source[];
  sourcesQueried: number;
  sourcesHealthy: number;
  rows: number;
  rowsSuspect: number;
  costUsd: number;
  ui?: unknown;
  componentsUsed?: string[];
}

const LIVE_SNAPSHOT = liveSeed as unknown as {
  generatedAt: string;
  appsLive: number;
  appsTotal: number;
  apps: Record<string, LiveSeedEntry | undefined>;
};

/** When the live figures in the registry were measured. Show this in the UI. */
export const LIVE_SEED_AT: string | null = LIVE_SNAPSHOT.generatedAt ?? null;

/**
 * How many seed apps the snapshot actually measured — counted from the per-app
 * `live` flags, not read off the header's `appsLive`.
 *
 * Those two can disagree: the header is written once by the generator, the flags
 * are what `withLiveData` and `SEED_DROPPED` consult. Reading the header meant
 * this number could say 16 while the registry rendered 15, which is the header
 * overstating coverage — the precise failure this whole pass is about. Counting
 * the flags makes `LIVE_SEED_COUNT === SEED_APPS.length` true by construction.
 */
export const LIVE_SEED_COUNT = Object.values(LIVE_SNAPSHOT.apps).filter(
  (e) => e?.live && e.ui,
).length;

/**
 * Returns the app with measured values folded in, or `null` if the snapshot has
 * no live entry for it.
 *
 * `null` rather than the app unchanged, and that is the whole point. This used
 * to `return app` on a miss, which meant a single failed resolve during a
 * `pnpm seed:live` run — a dead deployment, a rate limit, an expired gateway key
 * — silently put that app back on its fixture body and its invented sources,
 * with no signal anywhere on screen. The board would show a position card, a
 * health factor and a trade log that were pure invention, indistinguishable from
 * the fifteen apps beside it that were real. That is matrix row #1 failing
 * quietly, which is worse than failing loudly, and it is exactly how
 * `resetOwnedValues` came to be dead code nobody noticed.
 *
 * There is nothing left to fall back TO now (see EMPTY_SEED_BODY), so a miss can
 * only mean "we have no data for this app". The honest rendering of that is
 * absence.
 */
function withLiveData(app: MiniApp): MiniApp | null {
  const entry = LIVE_SNAPSHOT.apps[app.manifest.name];
  if (!entry?.live || !entry.ui) return null;

  return {
    ...app,
    // When the deployments behind this app were really probed. `app-runtime.tsx`
    // prints it as "probed <date>" underneath the measured `N of M deployments
    // live`, so it has to come from the same measurement those counts came from.
    // It used to be `ago(running ? 1 : 340)` from `build()` — a probe timestamp
    // computed from a hand-written boolean, sitting immediately below two real
    // numbers and reading exactly as real as they are.
    lastRunAt: entry.generatedAt,
    manifest: {
      ...app.manifest,
      data: {
        ...app.manifest.data,
        // Real deployment ids, with the dead ones still listed as dead — the
        // health check's whole point is that you can see what it skipped.
        sources: entry.sources,
      },
      // The composed A2UI document. `AppBody` renders this through the real
      // renderer, so a seed app now takes the same path a live-composed one does.
      ui: entry.ui,
      provenance: {
        ...app.manifest.provenance,
        // The body was composed by the rules engine in `scripts/seed-live.ts`,
        // not by a model on 0G. Claiming an attestation here would be the exact
        // thing §9 warns about.
        model: "seed-live",
        compute: "local",
        attestationRef: null,
        generatedAt: entry.generatedAt,
      },
    },
    stats: {
      ...app.stats,
      sourcesQueried: entry.sourcesQueried,
      sourcesHealthy: entry.sourcesHealthy,
      costPerRunUsd: entry.costUsd,
    },
  };
}

/**
 * Every app the seed set DECLARES, before the overlay gets a vote.
 *
 * `scripts/seed-live.ts` must iterate this list, not `SEED_APPS`. If the
 * generator read the filtered list, an app that failed to resolve once would be
 * dropped, therefore never re-measured, therefore dropped forever — a
 * lock-in where a transient rate limit permanently shrinks the registry.
 *
 * HISTORY, because this note used to describe a live defect and outlived it:
 * `scripts/seed-live.ts` did import `SEED_APPS`, which closed the recovery path
 * above — one transient failure and the app was never re-measured again. Fixed
 * in 422ec45 ("Measure every declared seed app, not just the ones already
 * live"), and the generator now reads this list. The note is kept as history
 * rather than deleted because the trap is easy to reintroduce: `SEED_APPS` is
 * the shorter name and the one every renderer imports, so it is the one a hand
 * reaches for. It is the wrong one HERE and only here.
 */
export const SEED_APPS_ALL: readonly MiniApp[] = [
  // autonomous first — the board sorts by tier and this is the payoff row
  aaveGuard,
  copyTraderArb,
  yieldRotator,
  perpDeleverage,
  gasRebate,
  // monitor
  healthFactorWatch,
  whaleAlertArb,
  fundingDivergence,
  staleOracleWatch,
  bridgeOutflowWatch,
  // readonly
  dexVolumeArb,
  tvlCrosschain,
  yieldLeaderboard,
  bridgeFlows,
  perpOiBoard,
  nftVolumeEth,
];

/**
 * Every review id this file invents, so a renderer can mark each seeded row as
 * seeded WITHOUT storing a flag on the review.
 *
 * Derived from `SEED_APPS_ALL` rather than written out, so it cannot fall behind
 * the reviews themselves; and read from CODE rather than from the persisted
 * board, which is the point. A browser that loaded the board before this existed
 * has the old unflagged reviews sitting in `localStorage`, and adding a `seeded`
 * field to the `Review` records would have left those rows unlabelled until the
 * storage version was bumped — a bump that discards apps the user published here
 * (see `STORAGE_VERSION` in `store.ts`). Deriving the set costs nothing and is
 * correct for stale and fresh boards alike.
 *
 * WHY LABEL EACH ROW AT ALL, given the panel already carries a note. Because the
 * note could not name them accurately: it said "every review signed with an .eth
 * handle", and `r5`, `r10` and `r12` are signed `anon`. A disclosure that misses
 * three of fourteen teaches the reader a rule that does not hold, which is worse
 * than the general statement it replaced. Per-row is the only version that is
 * exactly true.
 *
 * Ids are unique across the whole seed set (`r1`…`r14`) and a posted review is
 * `rev-<epoch>`, so a real review can never collide into this set.
 */
export const SEEDED_REVIEW_IDS: ReadonlySet<string> = new Set(
  SEED_APPS_ALL.flatMap((a) => a.reviews.map((r) => r.id)),
);

/** True for a review this file invented; false for one a visitor posted. */
export function isSeededReview(id: string): boolean {
  return SEEDED_REVIEW_IDS.has(id);
}

/**
 * The registry, and it contains only apps the pipeline actually measured.
 *
 * A SHORTER REGISTRY IS THE CORRECT FAILURE MODE. The instinct is to keep the
 * grid full — sixteen cards photograph better than twelve, and §12's "an empty
 * grid doesn't read like a platform" argument pulls the same way. But that
 * argument is about *social* texture, and it does not license showing a mini app
 * whose data does not exist. Matrix row #1 is "live Graph data, no mocks"; an app
 * with no live data has nothing to show, so it shows nothing. `sources.ts` makes
 * the same call one layer down, where a `placeholder` deployment ID is excluded
 * rather than queried and hoped for.
 *
 * And the drop is NOT SILENT. A silent truncation is its own dishonesty: the
 * registry would read "here is everything" while quietly meaning "here is what
 * survived". `SEED_DROPPED` names them so the UI can say "3 of 16 seed apps have
 * no live data in this snapshot" instead of implying full coverage.
 */
const OVERLAID: readonly (MiniApp | null)[] = SEED_APPS_ALL.map(withLiveData);

export const SEED_APPS: MiniApp[] = OVERLAID.filter((a): a is MiniApp => a !== null);

/**
 * Seed apps the snapshot could not measure, so they are not in `SEED_APPS`.
 * Empty is the expected state; non-empty means re-run `pnpm seed:live` and read
 * the `reason` in `seed-live.generated.json`. Surface the count wherever
 * `LIVE_SEED_COUNT` is surfaced — the two numbers only tell the truth together.
 */
export const SEED_DROPPED: readonly string[] = SEED_APPS_ALL.filter(
  (a) => !LIVE_SNAPSHOT.apps[a.manifest.name]?.live,
).map((a) => a.manifest.name);

/** Denominator for `LIVE_SEED_COUNT` and `SEED_DROPPED.length`. */
export const SEED_DECLARED_COUNT = SEED_APPS_ALL.length;

/**
 * The board's receipt log, and it starts empty.
 *
 * It used to open with four hand-written lines — a 412ms fan-out across 31
 * deployments, a 502 from `sonne-finance`, a health factor moving 1.61 → 1.52 —
 * plus every seed app's journal flattened in. Read on screen those are
 * measurements: timestamped, costed, in mono, in a panel whose entire visual
 * argument is "this is a receipt". None of them was measured. A ledger that
 * asserts a query latency nobody timed is the exact failure the risk register
 * calls fatal, and it is worse in the Ledger than anywhere else in the product
 * because the Ledger's only job is to be the audit trail.
 *
 * So it fills from the real paths instead: `runApp` when a fan-out actually
 * returns, the Substreams subscription when a block actually arrives, and the
 * policy engine + signer when an action is actually dispatched. Empty on first
 * load is the honest state — the board says "nothing has happened yet", which is
 * true, and the first line that lands is one you caused. Keep it empty; a
 * pre-populated receipt log is set dressing.
 */
export const SEED_LEDGER: LedgerLine[] = [];

/**
 * A fork inherits the interface but none of the parent's spending history. The
 * manifest already strips the wallet, the identity and the provenance
 * (`forkManifest`); this strips what the rendered body would otherwise still
 * show.
 *
 * ── Two document shapes, and why this handles both ──────────────────────────
 * This used to early-return unless the document had a `.blocks` array — the
 * local `UiDoc` fixture shape. Every seed app now carries a real A2UI document,
 * which is a JSON *array* of protocol messages (`createSurface`,
 * `updateComponents`, `updateDataModel`). So the guard silently stopped firing
 * the moment the data went live: forking an autonomous app reset nothing and
 * never showed its "the wallet is empty" banner. Dead code that looks alive is
 * how a safety affordance disappears without anyone noticing, which is why the
 * scope below is spelled out rather than assumed.
 *
 * ── What the A2UI path can reset ────────────────────────────────────────────
 * Values live in the data model, not on the components — a component carries a
 * `data: { path }` pointer and the renderer resolves it (see
 * `renderer.tsx` / `readSurface`). So the reset rewrites the data model at the
 * paths the parent's own components point at:
 *
 *   · the alert_banner's block — replaced with the fork banner. For an
 *     autonomous app this is the affordance that says the wallet is empty and
 *     nothing is armed, and it is the reason this function exists.
 *   · `policy_badge.spentUsd` and any USD `progress_bar` value — the spend-
 *     against-cap meter. The parent's lifetime spend is not the fork's.
 *   · `trade_log.entries` and the model's `journal` — receipts, including tx
 *     hashes, belonging to the parent's wallet.
 *   · `amount_input.value` and `inputs.amount` — a staged transaction size.
 *
 * ── What it CANNOT reset, stated so this does not rot again ─────────────────
 * The composed bodies mostly contain nothing user-owned to reset. Read one: the
 * leaderboards, the headline scalar and the raw rows are protocol-level scalars
 * — `totalValueLockedUSD` summed over Aave and Compound markets, not anybody's
 * position. That is not an oversight in this function, it is the README's "Not
 * in scope: per-account positions": the standardized fan-out reads protocol
 * aggregates, and no standardized family exposes a single user's balance in that
 * query shape. Protocol TVL is identical for parent and fork and re-measured on
 * the next run, so zeroing it would destroy live data, not private data.
 *
 * `held_position` blocks (position_card) WOULD be parent-owned, and the local
 * fixture bodies contain them — but the live composer cannot produce one from
 * protocol scalars, so none appears in any current document. They are left
 * alone here rather than half-handled: when per-account positions are built,
 * this is the function that needs a case for them.
 *
 * Deliberately narrow, in other words, and not a no-op: for a monitor-tier app
 * whose body is three protocol leaderboards and a banner, the banner is the only
 * thing there is to change, and it changes.
 */
export function resetOwnedValues(ui: unknown, tier: AgencyTier): unknown {
  if (Array.isArray(ui)) return resetA2uiOwnedValues(ui, tier);
  if (typeof ui !== "object" || ui === null) return ui;
  const doc = ui as UiDoc;
  if (!Array.isArray(doc.blocks)) return ui;
  const blocks = doc.blocks.map((b): UiBlock => {
    if (b.component === "progress_bar" && b.data.unit === "USD") {
      return { ...b, data: { ...b.data, value: 0 } };
    }
    if (b.component === "alert_banner" && tier !== "readonly") {
      return { ...b, data: { level: "risk", text: forkBannerText(tier) } };
    }
    return b;
  });
  return { ...doc, blocks };
}

function forkBannerText(tier: AgencyTier): string {
  return tier === "autonomous"
    ? "Forked copy. The wallet is empty and nothing is armed until you fund it."
    : "Forked copy. Run it once to subscribe.";
}

type Json = Record<string, unknown>;

function isJson(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Reads `{ path: "/blocks/foo" }` bindings into the model keys they name. */
function pointerHead(binding: unknown): string | null {
  if (!isJson(binding) || typeof binding.path !== "string") return null;
  const parts = binding.path.split("/").filter(Boolean);
  return parts.length === 2 && parts[0] === "blocks" ? parts[1] : null;
}

function usdLike(unit: unknown): boolean {
  return typeof unit === "string" && /^(usd|usdc?|\$)$/i.test(unit.trim());
}

/**
 * The A2UI half of `resetOwnedValues`. Walks the message array, learns which
 * data-model block each component reads, and rewrites only those blocks.
 * Components are never rewritten — the composer picked them from the data shape
 * and a fork asks the same question of the same schemas.
 */
function resetA2uiOwnedValues(doc: readonly unknown[], tier: AgencyTier): unknown[] {
  /** block key → component name, learned from every `updateComponents`. */
  const owner = new Map<string, string>();
  for (const msg of doc) {
    if (!isJson(msg) || !isJson(msg.updateComponents)) continue;
    const components = msg.updateComponents.components;
    if (!Array.isArray(components)) continue;
    for (const c of components) {
      if (!isJson(c) || typeof c.component !== "string") continue;
      const key = pointerHead(c.data);
      if (key) owner.set(key, c.component);
    }
  }

  return doc.map((msg) => {
    if (!isJson(msg) || !isJson(msg.updateDataModel)) return msg;
    const update = msg.updateDataModel;
    // Only the root snapshot the composer emits. A targeted `updateDataModel`
    // at some deeper path is a streamed delta, not the parent's stored state.
    if (update.path !== "/" && update.path !== "") return msg;
    if (!isJson(update.value)) return msg;
    return {
      ...msg,
      updateDataModel: { ...update, value: resetModel(update.value, owner, tier) },
    };
  });
}

function resetModel(model: Json, owner: Map<string, string>, tier: AgencyTier): Json {
  const next: Json = { ...model };

  if (isJson(next.blocks)) {
    const blocks: Json = { ...next.blocks };
    for (const [key, block] of Object.entries(blocks)) {
      if (!isJson(block)) continue;
      blocks[key] = resetBlock(block, owner.get(key), tier);
    }
    next.blocks = blocks;
  }

  // A staged amount is the user's input, not the fork's.
  if (isJson(next.inputs)) next.inputs = { ...next.inputs, amount: 0 };
  // The parent's action journal, tx hashes and all.
  if (Array.isArray(next.journal)) next.journal = [];
  // The policy view the badge and the action gate read. The wallet is already
  // null by the time this runs; the lifetime spend against the cap is not.
  if (isJson(next.policy) && typeof next.policy.spentUsd === "number") {
    next.policy = { ...next.policy, spentUsd: 0 };
  }

  return next;
}

function resetBlock(block: Json, component: string | undefined, tier: AgencyTier): Json {
  switch (component) {
    case "alert_banner":
      // The one affordance a fork must show. `triggered: false` keeps the panel
      // in its standing "watching" state rather than painting it as a breach,
      // and the observed/threshold figures go because they were the parent's.
      return tier === "readonly"
        ? block
        : {
            ...block,
            triggered: false,
            severity: "risk",
            message: forkBannerText(tier),
            value: null,
            threshold: null,
          };
    case "progress_bar":
      // Every alias `ProgressBar` reads for the current value, so the meter
      // cannot come back to life through a synonym.
      return usdLike(block.unit) || usdLike(isJson(block.hints) ? block.hints.unit : undefined)
        ? { ...block, value: 0, current: 0, spent: 0, v: 0 }
        : block;
    case "policy_badge":
      return typeof block.spentUsd === "number" ? { ...block, spentUsd: 0 } : block;
    case "amount_input":
      return { ...block, value: 0 };
    case "trade_log":
      return Array.isArray(block.entries) ? { ...block, entries: [] } : block;
    default:
      // Protocol-level aggregates and raw rows: nothing owned, nothing to
      // reset, and re-measured on the fork's first run. See the note above.
      return block;
  }
}

export function tierRank(tier: AgencyTier): number {
  return tier === "autonomous" ? 0 : tier === "monitor" ? 1 : 2;
}

export const TIER_LABEL: Record<AgencyTier, string> = {
  readonly: "Read only",
  monitor: "Monitor",
  autonomous: "Autonomous",
};

export const TIER_BLURB: Record<AgencyTier, string> = {
  readonly: "Reads data. Cannot act.",
  monitor: "Watches and alerts. Cannot spend.",
  autonomous: "Holds a wallet. Can spend.",
};

/* ------------------------------------------------------------------ *
 * Draft a manifest from a sentence.
 *
 * TODO(integrator): this is the local stand-in for `plan()` + `compose()`
 * from `@/lib/contracts/api` (W3 planner on 0G Compute, W4 composer). It
 * picks tier and schemas from the wording so the Studio runs end to end with
 * no API keys. Swap `draftFromIntent` for a call to the kit and the rest of
 * the Studio flow is unchanged.
 * ------------------------------------------------------------------ */

export interface PlanStep {
  key: string;
  label: string;
  /** Resolved detail, shown in mono once the step lands. */
  detail: string;
  /**
   * NOTHING READS THIS. Kept, not deleted, and only for a concurrency reason —
   * see below.
   *
   * It was a per-step fake duration: the Studio used to animate each plan row for
   * `ms` milliseconds, so a number nobody measured was rendered as if the step had
   * taken that long. `studio-input.tsx` replaced that with one declared reveal
   * cadence (`REVEAL_MS`) and its comment is explicit that the only durations on
   * screen are measured ones — the fan-out's own `elapsedMs`. By the house rule
   * ("a field that looks like a measurement and is not") this should be gone.
   *
   * It is still here because `livePlanSteps` in `store.ts` constructs `PlanStep`
   * literals WITH `ms:`, and store.ts is being edited by another agent right now.
   * Removing the field would break their file, which is not this file's call to
   * make. Delete it together with those five call sites.
   *
   * Until then: this is not a measurement, and no consumer treats it as one.
   */
  ms: number;
}

export interface Draft {
  manifest: Manifest;
  steps: PlanStep[];
}

const SCHEMA_HINTS: { match: RegExp; schema: SchemaFamily; label: string }[] = [
  { match: /\b(lend|borrow|aave|compound|health\s*factor|liquidat|collateral|cdp)/i, schema: "lending-cdp@3.1.0", label: "Lending / CDP" },
  { match: /\b(swap|dex|uniswap|camelot|pool|liquidity|volume|amm|sell|buy|price|trade|mirror|rotate)/i, schema: "dex-amm@1.3.2", label: "DEX AMM" },
  { match: /\b(aggregator|1inch|paraswap|best\s*route)/i, schema: "dex-aggregator@1.0.2", label: "DEX aggregator" },
  { match: /\b(vault|yield|apy|apr|farm|stablecoin)/i, schema: "yield-aggregator@1.3.1", label: "Yield aggregator" },
  { match: /\b(perp|funding|leverage|open\s*interest|futures|long|short)/i, schema: "perp-futures@1.3.4", label: "Perp futures" },
  { match: /\b(bridge|cross[- ]?chain|inflow|outflow)/i, schema: "bridge@1.2.0", label: "Bridge" },
  { match: /\b(nft|collection|floor|mint)/i, schema: "nft-marketplace@2.1.0", label: "NFT marketplace" },
  { match: /\b(gas|block|throughput|network)/i, schema: "network@1.2.0", label: "Network" },
  { match: /\b(option|strike|expiry)/i, schema: "options@1.3.2", label: "Options" },
];

const NETWORK_HINTS: { match: RegExp; network: Network }[] = [
  { match: /\barbitrum\b/i, network: "arbitrum-one" },
  { match: /\boptimism\b|\bop\s+mainnet\b/i, network: "optimism" },
  { match: /\bbase\b/i, network: "base" },
  { match: /\bmainnet\b|\bethereum\b/i, network: "mainnet" },
];

const AUTONOMOUS = /\b(sell|buy|swap|rebalance|mirror|copy|rotate|claim|close|trim|execute|trade|move my|bring it back)\b/i;
const MONITOR = /\b(alert|notify|tell me when|warn|watch|monitor|ping me|let me know)\b/i;

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter((w) => !["the", "my", "a", "an", "of", "on", "in", "to", "for", "and", "if", "when", "me"].includes(w))
    .slice(0, 3)
    .join("-")
    .replace(/-+/g, "-");
  const cleaned = base.replace(/^-|-$/g, "");
  return cleaned.length >= 3 ? cleaned.slice(0, 30) : "mini-app";
}

export function draftFromIntent(intent: string, now: Date = new Date()): Draft {
  const schemaHits = SCHEMA_HINTS.filter((h) => h.match.test(intent));
  const picked = schemaHits.length ? schemaHits : [SCHEMA_HINTS[1]];
  const schemas = Array.from(new Set(picked.map((h) => h.schema))).slice(0, 3);

  const netHits = NETWORK_HINTS.filter((h) => h.match.test(intent)).map((h) => h.network);
  const networks: Network[] = netHits.length ? Array.from(new Set(netHits)) : ["arbitrum-one"];

  const tier: AgencyTier = AUTONOMOUS.test(intent) ? "autonomous" : MONITOR.test(intent) ? "monitor" : "readonly";

  /**
   * Candidates from the REAL registry, best-reliability first.
   *
   * This used to be a hardcoded `catalogue` of invented base58-looking strings —
   * `Jd8k2Lp`, `5zvR82Q`, `Ck2mQ8x` — suffixed with a loop counter, plus health
   * faked as `seq % 7 !== 0`. That is the worst fabrication in this file's
   * blast radius, because an invented ID is *character-for-character
   * indistinguishable* from the 86 verified ones in `sources.ts`: nobody reading
   * the Studio, and no judge checking a subgraph ID against The Graph's
   * explorer, can tell which is which. Faking the health check is the same
   * problem one layer down — §5 makes the health check a correctness
   * requirement, not a progress animation.
   *
   * So the offline fallback now names deployments that genuinely exist, and
   * `entryToSource` marks every one `healthy: false` with `healthCheckedAt:
   * null` — because this path resolved no gateway and probed nothing. Unverified
   * is the truthful state of an offline draft, and it is a different claim from
   * dead. `placeholder` entries are dropped: `sources.ts` labels those "not a
   * real ID" for families with no standardized deployment on a chain, and
   * passing one through here would reintroduce exactly what was removed.
   *
   * If the registry has no coverage for the parsed schemas on the parsed chains
   * the pool is empty and the plan says so, which is the answer the real
   * resolver would give.
   */
  const pool: Source[] = candidateSources(schemas, networks)
    .filter((entry) => entry.verification !== "placeholder")
    .map(entryToSource);

  const blocks = draftBlocks(tier, intent);
  const nowIso = now.toISOString();
  const name = slugify(intent);

  const manifest: Manifest = {
    spec: "atlas/2",
    name,
    title: titleFromIntent(intent),
    intent,
    category: tier === "autonomous" ? "trading" : tier === "monitor" ? "risk" : "analytics",
    tags: schemas.map((s) => s.split("@")[0]),
    data: {
      schemas,
      networks,
      sources: pool,
      queries: Object.fromEntries(
        schemas.map((schema, i) => [`q${i}`, `query($first:Int!){ ${schema.split("@")[0].replace(/-/g, "_")}(first:$first){ id } }`]),
      ),
      variables: { first: 25 },
      stream:
        tier === "readonly"
          ? null
          // Was `substreams-common@v0.4.0` / `map_events` — invented, and not an
          // `.spkg` URL, so a watch on an offline draft failed at URL parse. The
          // real package, same as the seeds.
          : { package: SEED_SPKG, module: SEED_STREAM_MODULE, filter: {} },
      transport: tier === "readonly" ? "gateway" : "x402",
    },
    ui: { spec: "a2ui/0.9.1", blocks } satisfies UiDoc,
    agency: {
      tier,
      /**
       * The condition stays DELIBERATELY INEVALUABLE, and says so in words.
       *
       * This is the offline drafter: it has a sentence and a keyword table, and
       * no way to know which metric a stranger's intent means or what value
       * would count as crossing it. The two honest options are to leave the
       * condition unexpressed or to invent one, and inventing is worse in both
       * directions — a made-up threshold either never fires (inert, and inert is
       * the failure that hides) or fires on the wrong number in an app that can
       * spend. A guessed `dex_amm.cumulativeVolumeUSD > 250000` from the words
       * "swaps over $250,000" is not a translation, it is a fabrication with a
       * plausible shape, which is the category this whole pass has been removing.
       *
       * `"threshold breached"` / `"condition met"` was the old text and it was
       * the worst of both: unparseable, so it never fired, while reading on the
       * card as a configured trigger. `isConditionEvaluable` returns false for
       * the replacement too, but now `app-runtime` labels it "not machine-readable
       * — this trigger fails closed" and the words themselves name the missing
       * piece, so the fix is obvious to whoever opens the app.
       *
       * NOT `null`: `evaluateCondition(null)` is ALWAYS SATISFIED — an
       * on-every-block trigger. That is a real configuration, not an empty one,
       * and it is the last thing an unconfigured autonomous draft should carry.
       */
      triggers:
        tier === "readonly"
          ? []
          : [
              {
                on: "stream",
                when: "unset — no threshold could be derived from this intent",
                run: tier === "autonomous" ? "act" : "notify",
              },
            ],
      actions:
        tier === "autonomous"
          ? { act: { kind: "swap", target: ROUTER_ARB, params: {}, label: "Execute" } }
          : tier === "monitor"
            ? { notify: { kind: "notify", params: {}, label: "Alert me" } }
            : {},
      policy: {
        // `null` at every tier, never the zero address. A drafted app has not been
        // published, so no signer has been provisioned for it — and any surface
        // that renders `policy.wallet` raw would have shown 0x000…000 as the
        // address to fund. §8 makes the displayed address a safety primitive; the
        // zero address is the one value guaranteed to burn whatever reaches it.
        // The real signer comes from `POST /api/agency/register` at publish.
        wallet: null,
        maxSpendUsd: tier === "autonomous" ? 500 : 0,
        maxPerTxUsd: tier === "autonomous" ? 50 : 0,
        allowlist: tier === "autonomous" ? [ROUTER_ARB] : [],
        expiresAt: tier === "autonomous" ? new Date(now.getTime() + 30 * 86_400_000).toISOString() : null,
        requireConfirm: tier !== "autonomous",
        killSwitch: true,
        halted: false,
      },
    },
    identity: { ens: null, agenticId: null, manifestCid: null },
    provenance: {
      // Nothing here ran on 0G. This function is the rules-based fallback used
      // when the live plan/compose path is unavailable, so it reports the
      // offline planner and local compute. It used to claim
      // `deepseek-chat-v3` on `0g-private-computer` — a model §9 records as
      // gone from the router (live `GET /v1/models`, 2026-07-25) running on
      // compute this path never touches. `attestationRef` was already null,
      // which made the record self-contradictory as well as wrong: attested
      // compute that returned no attestation.
      model: OFFLINE_MODEL,
      compute: "local",
      attestationRef: null,
      generatedAt: nowIso,
    },
    author: null,
    appVersion: "1.0.0",
    forkedFrom: null,
    pricing: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const componentNames = Array.from(new Set(blocks.map((b) => b.component)));
  const steps: PlanStep[] = [
    { key: "intent", label: "Read the intent", detail: `tier ${tier}`, ms: 420 },
    { key: "schemas", label: "Resolve standardized schemas", detail: schemas.join(" · "), ms: 620 },
    // "In the registry", not "live": these came out of `SOURCE_REGISTRY`, which
    // is a list of deployments that exist, not a list of ones answering now.
    {
      key: "sources",
      label: "Look up deployments",
      detail: pool.length
        ? `${pool.length} in the registry across ${networks.length} ${networks.length === 1 ? "chain" : "chains"}`
        : "no standardized deployment for these schemas on these chains",
      ms: 700,
    },
    // The step stays in the plan because the real resolver runs it and the
    // Studio's whole argument is that the plan is legible. It reports that it
    // did not run rather than reporting a made-up result — "0 of 12 live" would
    // read as twelve dead deployments, which is a different and false claim.
    { key: "health", label: "Health-check sources", detail: "not run — offline draft, none probed", ms: 780 },
    ...(tier === "readonly"
      ? []
      : [{ key: "stream", label: "Subscribe Substreams", detail: "substreams-common@v0.4.0 · map_events", ms: 560 }]),
    { key: "shape", label: "Read the data shape", detail: shapeNote(blocks), ms: 520 },
    { key: "compose", label: "Choose components", detail: componentNames.join(" · "), ms: 640 },
    ...(tier === "autonomous"
      ? [
          { key: "actions", label: "Wire actions", detail: `swap via ${ROUTER_ARB.slice(0, 10)}…, allowlisted`, ms: 600 },
          { key: "policy", label: "Set policy", detail: "$500 lifetime · $50 per transaction · kill switch on", ms: 520 },
        ]
      : []),
  ];

  return { manifest, steps };
}

function shapeNote(blocks: UiBlock[]): string {
  const first = blocks[0];
  if (!first) return "no rows returned";
  switch (first.component) {
    case "gauge":
      return "bounded ratio → gauge";
    case "leaderboard":
      return "ranked categorical → leaderboard";
    case "time_series":
      return "timeseries, one metric → time series";
    case "alert_banner":
      return "triggered condition → alert banner";
    default:
      return "scalar with delta → metric card";
  }
}

function titleFromIntent(intent: string): string {
  // First clause carries the subject; the rest is usually the condition.
  const first = intent.trim().split(/(?<=[.?!])\s|,\s(?=if|when|and)/i)[0] ?? intent;
  const trimmed = first.trim().replace(/[.?!]+$/, "");
  const short = trimmed.length > 52 ? `${trimmed.slice(0, 49).trimEnd()}…` : trimmed;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function draftBlocks(tier: AgencyTier, intent: string): UiBlock[] {
  if (tier === "autonomous") {
    return [
      { id: "d1", component: "alert_banner", label: "Status", span: 3, data: { level: "live", text: "Subscribed. Waiting on the first qualifying event." } },
      { id: "d2", component: "gauge", label: "Trigger condition", data: { value: 1.62, min: 1, max: 3, threshold: 1.4, unit: "", status: "gain" } },
      {
        id: "d3",
        component: "position_card",
        label: "Position",
        data: { asset: "ETH / USDC", rows: [{ k: "Collateral", v: "$0.00" }, { k: "Debt", v: "$0.00" }, { k: "Wallet", v: "not funded yet", accent: "risk" }] },
      },
      { id: "d4", component: "progress_bar", label: "Spent against cap", data: { value: 0, target: 500, unit: "USD", note: "$50 per transaction" } },
    ];
  }
  if (tier === "monitor") {
    return [
      { id: "d1", component: "alert_banner", label: "Status", span: 3, data: { level: "live", text: "Subscribed. Nothing has crossed the threshold yet." } },
      { id: "d2", component: "gauge", label: "Watched value", data: { value: 1.62, min: 1, max: 3, threshold: 1.4, unit: "", status: "gain" } },
      { id: "d3", component: "metric_card", label: "Checks, today", data: { value: "0", sub: "since publish" } },
      { id: "d4", component: "metric_card", label: "Alerts, today", data: { value: "0" } },
    ];
  }
  const ranked = /\btop\b|\bbest\b|\brank\b|\bleader/i.test(intent);
  if (ranked) {
    return [
      { id: "d1", component: "metric_card", label: "Total, 7d", data: { value: "$4.21B", delta: "+8.4%", dir: "up" } },
      { id: "d2", component: "metric_card", label: "Deployments merged", data: { value: "27 / 31", sub: "4 skipped, unhealthy" } },
      {
        id: "d3",
        component: "leaderboard",
        label: "Ranked result",
        span: 2,
        data: {
          unit: "USD",
          accentIndex: 0,
          rows: [
            { label: "Uniswap v3", value: 2810000000 },
            { label: "Camelot v3", value: 486000000 },
            { label: "Balancer v2", value: 312000000 },
            { label: "Curve", value: 274000000 },
            { label: "Ramses", value: 188000000 },
          ],
        },
      },
    ];
  }
  return [
    { id: "d1", component: "metric_card", label: "Headline", data: { value: "$4.21B", delta: "+8.4%", dir: "up", sub: "7d" } },
    { id: "d2", component: "metric_card", label: "Observations", data: { value: "6,214,880" } },
    { id: "d3", component: "time_series", label: "Trend, 7d", span: 2, data: { unit: "USD", accent: "live", xFirst: "Jul 19", xLast: "Jul 26", points: [512, 604, 588, 641, 703, 590, 572] } },
  ];
}
