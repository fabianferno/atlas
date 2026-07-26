/**
 * The morph is scripted, but it renders through the real renderer and the real
 * catalog. So the three documents have to satisfy exactly what a composed
 * document satisfies — a name outside the catalog would render an inert
 * placeholder on the landing page's centrepiece, which is a worse failure than
 * a red test, because it looks like the product is broken rather than like the
 * demo is.
 */
import { describe, it, assert, assertEqual } from "@/lib/kit/testing";
import { readSurface, validateDocument } from "@/lib/kit/a2ui";
import { ALL_COMPONENTS } from "@/lib/contracts/catalog";
import { SCENES, SCENE_DOCS } from "./fixtures";

const CATALOG = new Set<string>(ALL_COMPONENTS);

describe("morph scene documents", () => {
  it("validates with zero issues", () => {
    for (const [key, doc] of Object.entries(SCENE_DOCS)) {
      const v = validateDocument(doc);
      assert(v.valid, `${key}: ${v.issues.map((i) => `${i.code} ${i.message}`).join("; ")}`);
      assertEqual(v.issues.length, 0, `${key} has no warnings either`);
    }
  });

  it("names only components the client-held catalog holds", () => {
    for (const [key, doc] of Object.entries(SCENE_DOCS)) {
      const surface = readSurface(doc);
      assert(surface !== null, `${key} has a surface`);
      for (const c of surface!.components) {
        assert(CATALOG.has(c.component), `${key}: ${c.component} is in the catalog`);
      }
    }
  });

  it("gives each scene the tier its frame will claim", () => {
    assertEqual(readSurface(SCENE_DOCS.analytics)?.theme?.tier, "readonly");
    assertEqual(readSurface(SCENE_DOCS.monitor)?.theme?.tier, "monitor");
    assertEqual(readSurface(SCENE_DOCS.autonomous)?.theme?.tier, "autonomous");
  });

  it("makes the autonomous scene show what it is allowed to do", () => {
    const names = new Set<string>(
      readSurface(SCENE_DOCS.autonomous)!.components.map((c) => c.component),
    );
    for (const required of ["policy_badge", "trade_log", "kill_switch"]) {
      assert(names.has(required), `autonomous scene renders its ${required}`);
    }
  });

  it("makes the three scenes look different, which is the whole argument", () => {
    const set = (k: keyof typeof SCENE_DOCS) =>
      new Set(readSurface(SCENE_DOCS[k])!.components.map((c) => c.component));
    const a = set("analytics");
    const m = set("monitor");
    assert(!a.has("gauge"), "the ranked question does not produce a gauge");
    assert(m.has("gauge"), "the bounded-ratio question does");
    assert(a.has("leaderboard"), "the ranked question produces a leaderboard");
    assert(!m.has("leaderboard"), "the threshold question does not produce a leaderboard");
  });

  /*
   * Scenes 2 and 3 must differ ONLY by agency. That is the sentence the third
   * scene exists to say — same question, same instrument, now allowed to act —
   * and it stops being said the moment someone edits one gauge and not the
   * other.
   */
  it("keeps the autonomous scene's gauge identical to the monitor scene's", () => {
    const gaugeOf = (k: keyof typeof SCENE_DOCS) => {
      const surface = readSurface(SCENE_DOCS[k])!;
      const gauge = surface.components.find((c) => c.component === "gauge")!;
      const path = (gauge.data as { path: string }).path;
      const id = path.slice("/blocks/".length);
      return (surface.dataModel as { blocks: Record<string, unknown> }).blocks[id];
    };
    assertEqual(JSON.stringify(gaugeOf("autonomous")), JSON.stringify(gaugeOf("monitor")));
  });

  it("carries a prompt and a four-line trace per scene, in play order", () => {
    assertEqual(SCENES.length, 3);
    assertEqual(
      SCENES.map((s) => s.key).join(","),
      "analytics,monitor,autonomous",
      "the tier ladder climbs",
    );
    for (const s of SCENES) {
      assert(s.prompt.trim().length > 0, `${s.key} has a prompt`);
      assertEqual(s.trace.length, 4, `${s.key} traces resolve/health/fan-out/compose`);
    }
  });
});
