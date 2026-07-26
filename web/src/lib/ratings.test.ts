/**
 * The rating weight, and the one question it is allowed to ask.
 *
 * prd.md §12 specifies a rating "weighted by whether the rater actually ran the
 * app". The weighting itself was never in doubt — `score()` has multiplied a
 * `ranIt` review by three since it was written. What was wrong for a whole
 * release is what fed `ranIt`: `components/registry/ratings.tsx` computed it as
 * `app.stats.runs > 0`, and `stats.runs` opens at an invented figure on every
 * bundled app (`aave-guard` 1,204, `health-factor-watch` 5,120 — prd.md §14 #1a
 * names it as seeded texture). So the panel told a first-time visitor "you ran
 * this — counts 3×", stored `ranIt: true` on their review, and weighted a real
 * person's real opinion 3× on the strength of a constant in `seed.ts`.
 *
 * There was no test on any of it, which is why a defect this legible survived —
 * "the rater ran it" and "the counter is non-zero" produce identical results on
 * every board except the only one that matters, a fresh one.
 *
 * So these tests pin the DISTINCTION, not the arithmetic:
 *
 *   - a seeded run counter grants nothing;
 *   - a real `runApp` round trip grants 3×;
 *   - a `runApp` that FAILED grants nothing, because the evidence is the round
 *     trip coming back and it did not.
 *
 * They run against the real store, with `fetch` stubbed at the boundary
 * `runApp` actually uses. Nothing here reaches the network.
 *
 * IN THE SUITE. `src/lib/agency/all.test.ts` registers this file alongside the
 * rest, so `pnpm test` covers it and there is no second command to remember.
 * That line was briefly a handoff — this file was written while another agent
 * held the suite entry point — and a test nobody runs is worth about as much as
 * the assertion it does not make, so it did not stay one.
 *
 * `runStandalone()` below is kept for running this file alone while iterating on
 * it, which is faster than the whole suite. It is not the supported path.
 */
import { assert, assertEqual, describe, it, itAsync, report } from "@/lib/kit/testing";
import { score } from "@/components/registry/ratings";
import { boardSnapshot, localRunCount, ranHere, rateApp, runApp } from "@/lib/store";
import { SEED_APPS, isSeededReview, type MiniApp, type Review } from "@/lib/seed";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** A seed app with a seeded run counter — i.e. the exact case that was wrong. */
const SEEDED = SEED_APPS.find((a) => a.stats.runs > 0);

function appNamed(name: string): MiniApp {
  const app = boardSnapshot().apps.find((a) => a.manifest.name === name);
  if (!app) throw new Error(`no app called ${name} on the board`);
  return app;
}

/** The review `rateApp` just prepended. */
function newest(name: string): Review {
  const first = appNamed(name).reviews[0];
  if (!first) throw new Error(`no reviews on ${name}`);
  return first;
}

/**
 * `runApp` posts to `/api/graph` then `/api/compose`. Both are stubbed here with
 * the narrowest bodies the store actually reads, so a run either completes or
 * fails for the reason under test and never for a missing field.
 */
function stubFetch(opts: { ok: boolean }): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!opts.ok) return new Response("upstream is down", { status: 502 });
    const body = url.includes("/api/compose")
      ? { ui: { spec: "a2ui/0.9.1", blocks: [] }, componentsUsed: [] }
      : {
          rows: [{ id: "row-1" }],
          sourcesQueried: 2,
          sourcesHealthy: 2,
          costUsd: 0,
          elapsedMs: 12,
          live: true,
        };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/* ------------------------------------------------------------------ *
 * score() — the weighting itself, which is specified behaviour and stays
 * ------------------------------------------------------------------ */

describe("score()", () => {
  it("weights a rater who ran it 3×, and one who did not 1×", () => {
    const stats = { thumbsUp: 0, thumbsDown: 0 };
    assertEqual(score({ reviews: [{ score: "up", ranIt: true }], stats }).weighted, 3, "up + ran it");
    assertEqual(score({ reviews: [{ score: "up", ranIt: false }], stats }).weighted, 1, "up, did not run");
    assertEqual(score({ reviews: [{ score: "down", ranIt: true }], stats }).weighted, -3, "down + ran it");
    assertEqual(score({ reviews: [{ score: "down", ranIt: false }], stats }).weighted, -1, "down, did not run");
  });

  it("counts seeded thumbs in the total but never in the weight", () => {
    // The seeded half has no `ranIt` to read — it is two integers. It belongs in
    // the headline percentage, which is disclosed as seeded, and nowhere near a
    // weight that is supposed to mean somebody ran something.
    const s = score({
      reviews: [{ score: "up", ranIt: true }],
      stats: { thumbsUp: 96, thumbsDown: 4 },
    });
    assertEqual(s.total, 101, "100 seeded thumbs + 1 review");
    assertEqual(s.weighted, 3, "weight comes from reviews only");
  });
});

/* ------------------------------------------------------------------ *
 * The defect: what `ranIt` is allowed to be derived from
 * ------------------------------------------------------------------ */

describe("ranIt is the rater's own run, not the app's run counter", () => {
  it("a seed app carries an invented run count and grants no local run", () => {
    assert(SEEDED !== undefined, "the seed set should contain an app with a run counter");
    const app = SEEDED as MiniApp;
    assert(app.stats.runs > 0, `${app.manifest.name} should ship a seeded run count`);
    assertEqual(
      localRunCount(boardSnapshot(), app.manifest.name),
      0,
      "nobody has run it in this process, whatever the counter says",
    );
    assertEqual(ranHere(boardSnapshot(), app.manifest.name), false, "and ranHere agrees");
  });

  it("stores ranIt: false when the visitor has not run it — the old code stored true", () => {
    const name = (SEEDED as MiniApp).manifest.name;
    const before = score(appNamed(name)).weighted;

    rateApp(name, "up", "Rated without running it.", "0xtest");

    const posted = newest(name);
    assertEqual(posted.ranIt, false, "a rating from someone who has not run it");
    assertEqual(isSeededReview(posted.id), false, "and it is not seeded — a real person wrote it");
    assertEqual(score(appNamed(name)).weighted - before, 1, "weighted 1×, not 3×");
  });

  /*
   * ONE async test covering both run outcomes, in order, on purpose.
   *
   * `itAsync` in the harness starts each body the moment it is registered, so
   * two of these would run concurrently — and both install a global `fetch`
   * stub, so the second would capture the first's stub as "the original" and
   * restore a fake. The sequencing matters to the assertions too: the point of
   * the second half is that the counter moved only after the first half failed
   * to move it.
   */
  itAsync("a failed run grants nothing; a real one grants 3×", async () => {
    const name = (SEEDED as MiniApp).manifest.name;

    const failing = stubFetch({ ok: false });
    try {
      const outcome = await runApp(name);
      assertEqual(outcome.ok, false, "the run failed");
    } finally {
      failing();
    }
    assertEqual(ranHere(boardSnapshot(), name), false, "pressing Run is not running it");

    const runsBefore = appNamed(name).stats.runs;

    const restore = stubFetch({ ok: true });
    try {
      const outcome = await runApp(name);
      assertEqual(outcome.ok, true, "the run completed");
    } finally {
      restore();
    }

    assertEqual(localRunCount(boardSnapshot(), name), 1, "one run, by this browser");
    assertEqual(
      appNamed(name).stats.runs,
      runsBefore + 1,
      "the display total still moves — seeded base plus a measured run",
    );
    assert(
      appNamed(name).stats.runs > localRunCount(boardSnapshot(), name),
      "and the two are not the same number, which is why one cannot answer for the other",
    );

    const before = score(appNamed(name)).weighted;
    rateApp(name, "up", "Rated after really running it.", "0xtest");
    assertEqual(newest(name).ranIt, true, "the rater did run it");
    assertEqual(score(appNamed(name)).weighted - before, 3, "weighted 3×");
  });
});

/* ------------------------------------------------------------------ *
 * The seeded reviews, one layer down
 * ------------------------------------------------------------------ */

describe("seeded reviews are marked as seeded", () => {
  it("every review the seed set invents is identifiable without reading its handle", () => {
    // The panel's disclosure used to say "every review signed with an .eth
    // handle is seeded", and three of the fourteen are signed `anon`. A reader
    // applying the stated rule would have taken those three for real people.
    const seeded = SEED_APPS.flatMap((a) => a.reviews);
    assert(seeded.length > 0, "the seed set has reviews");
    for (const r of seeded) {
      assert(isSeededReview(r.id), `${r.id} (${r.rater}) must be identifiable as seeded`);
    }
    assert(
      seeded.some((r) => !r.rater.endsWith(".eth")),
      "at least one seeded review is not signed .eth — which is why the handle was never the test",
    );
  });

  it("a review a visitor posts is never mistaken for seeded", () => {
    const name = (SEEDED as MiniApp).manifest.name;
    rateApp(name, "down", "Mine, not seeded.", "0xtest");
    assertEqual(isSeededReview(newest(name).id), false, "posted here, not invented");
  });
});

/** Standalone entry point — see the header. Not called when imported by a suite. */
export function runStandalone(): Promise<void> {
  return report();
}
