/**
 * The three pure decisions behind the drawer's tabs.
 *
 * `missingRequired` is the one that carries weight: it is the render-time half
 * of REQUIRED_FOR_AUTONOMOUS, and the whole duplication fix rests on it
 * answering "on screen" rather than "in the document". The Studio case below is
 * not a formality — `studio-input.tsx` renders a bare draft with no policy strip
 * around it, so if the default ever stops being "provide nothing", a draft
 * autonomous app silently loses its kill switch.
 */
import { describe, it, assert, assertEqual } from "@/lib/kit/testing";
import { HOST_PROVIDED, missingRequired, tabsFor, seamLine } from "@/lib/app-view";
import type { ComponentName } from "@/lib/contracts/catalog";

const none = new Set<ComponentName>();

describe("missingRequired", () => {
  it("asks nothing of a read-only app", () => {
    assertEqual(missingRequired("readonly", none).length, 0, "readonly requires none");
  });

  it("asks nothing of a monitor", () => {
    assertEqual(missingRequired("monitor", none).length, 0, "monitor requires none");
  });

  it("names all three when an autonomous document omits them and no host provides them", () => {
    const missing = missingRequired("autonomous", none, []);
    assertEqual(missing.length, 3, "Studio's bare draft must re-append all three");
    assert(missing.includes("policy_badge"), "policy_badge missing");
    assert(missing.includes("trade_log"), "trade_log missing");
    assert(missing.includes("kill_switch"), "kill_switch missing");
  });

  it("defaults to providing nothing, so an unaware caller keeps the old behaviour", () => {
    assertEqual(missingRequired("autonomous", none).length, 3, "default must be []");
  });

  it("names none when the host guarantees all three", () => {
    assertEqual(
      missingRequired("autonomous", none, HOST_PROVIDED).length,
      0,
      "AppRuntime's strip and Activity tab cover the trio",
    );
  });

  it("still names one the host does not cover", () => {
    const missing = missingRequired("autonomous", none, ["policy_badge", "trade_log"]);
    assertEqual(missing.length, 1, "one uncovered");
    assertEqual(missing[0], "kill_switch", "the uncovered one");
  });

  it("names none when the document itself carries them", () => {
    const present = new Set<ComponentName>(["policy_badge", "trade_log", "kill_switch"]);
    assertEqual(missingRequired("autonomous", present).length, 0, "document satisfies it");
  });
});

describe("tabsFor", () => {
  it("gives a read-only app four tabs and no Safety", () => {
    const keys = tabsFor("readonly").map((t) => t.key);
    assertEqual(keys.join(","), "app,data,activity,about", "readonly tab set");
  });

  it("gives a monitor four tabs and no Safety", () => {
    const keys = tabsFor("monitor").map((t) => t.key);
    assertEqual(keys.join(","), "app,data,activity,about", "monitor tab set");
  });

  it("gives an autonomous app all five, with Safety after Data", () => {
    const keys = tabsFor("autonomous").map((t) => t.key);
    assertEqual(keys.join(","), "app,data,safety,activity,about", "autonomous tab set");
  });

  it("always opens on the composed body", () => {
    for (const tier of ["readonly", "monitor", "autonomous"] as const) {
      assertEqual(tabsFor(tier)[0].key, "app", `${tier} opens on app`);
    }
  });
});

describe("seamLine", () => {
  it("claims only the deployments when no run has happened", () => {
    assertEqual(
      seamLine({ rows: null, sourcesHealthy: 3, sourcesQueried: 4, live: null }),
      "Composed by the agent · 3 of 4 deployments live",
      "no run, no row count",
    );
  });

  it("counts rows after a live run", () => {
    assertEqual(
      seamLine({ rows: 412, sourcesHealthy: 3, sourcesQueried: 4, live: true }),
      "Composed by the agent from 412 rows · 3 of 4 deployments live",
      "live run",
    );
  });

  it("says fixtures when the run was not live, rather than letting the count imply a query", () => {
    assertEqual(
      seamLine({ rows: 12, sourcesHealthy: 0, sourcesQueried: 4, live: false }),
      "Composed by the agent from 12 rows · 0 of 4 deployments live · fixtures, not a live query",
      "fixture run must say so",
    );
  });

  it("does not pluralise a single row", () => {
    assertEqual(
      seamLine({ rows: 1, sourcesHealthy: 1, sourcesQueried: 1, live: true }),
      "Composed by the agent from 1 row · 1 of 1 deployments live",
      "singular row",
    );
  });
});
