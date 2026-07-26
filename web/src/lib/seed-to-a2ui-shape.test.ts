/**
 * What the autonomous branch of `seedToA2ui` is allowed to put in the document.
 *
 * This test is the duplication rule made checkable. `policy_badge`, `trade_log`
 * and `kill_switch` are rendered by `AppRuntime`'s own chrome — the policy strip
 * above the tabs and the Activity tab's TradeLog — so a composed document that
 * also carries them renders the same fact twice, in two hands, which is exactly
 * why a reader could not tell which part of the drawer the agent wrote.
 *
 * The action surface must survive: removing the trio must not remove the app.
 *
 * Lives in `src/` rather than in the package because it reads a real seed
 * manifest, and `packages/atlas-kit` may not import from `@/lib/seed`.
 */
import { describe, it, assert } from "@/lib/kit/testing";
import { seedToA2ui } from "@/lib/kit/seed-to-a2ui";
import { SEED_APPS, SEED_EPOCH } from "@/lib/seed";

/**
 * Every component name present in a composed document, in order.
 *
 * `buildDocument` (kit/a2ui.ts) puts the flat component list on the
 * `updateComponents` message, not `createSurface` — `createSurface` only
 * carries the surface id, theme and layout order. Reading `createSurface`
 * here would silently find nothing on every document, autonomous or not,
 * which would make every "emits no X" assertion below pass vacuously
 * whether or not the fix in `seed-to-a2ui.ts` actually landed.
 */
function componentsOf(doc: unknown): string[] {
  const names: string[] = [];
  for (const msg of Array.isArray(doc) ? doc : []) {
    const m = msg as { updateComponents?: { components?: { component?: string }[] } };
    for (const c of m.updateComponents?.components ?? []) {
      if (typeof c.component === "string") names.push(c.component);
    }
  }
  return names;
}

const autonomous = SEED_APPS.filter((a) => a.manifest.agency.tier === "autonomous");

describe("seedToA2ui autonomous branch", () => {
  it("has autonomous seed apps to test", () => {
    assert(autonomous.length > 0, "no autonomous seed app found — this test proves nothing");
  });

  for (const app of autonomous) {
    const name = app.manifest.name;
    const names = componentsOf(seedToA2ui(app.manifest, { journal: [], epoch: SEED_EPOCH }));

    it(`${name}: emits no policy_badge — the strip owns it`, () => {
      assert(!names.includes("policy_badge"), `${name} still emits policy_badge`);
    });

    it(`${name}: emits no trade_log — the Activity tab owns it`, () => {
      assert(!names.includes("trade_log"), `${name} still emits trade_log`);
    });

    it(`${name}: emits no kill_switch — the strip owns it`, () => {
      assert(!names.includes("kill_switch"), `${name} still emits kill_switch`);
    });

    it(`${name}: keeps its action surface`, () => {
      assert(names.includes("action_button"), `${name} lost its action_button`);
      assert(names.includes("amount_input"), `${name} lost its amount_input`);
      assert(names.includes("allowlist_picker"), `${name} lost its allowlist_picker`);
    });

    it(`${name}: still renders something`, () => {
      assert(names.length > 3, `${name} composed down to ${names.length} components`);
    });
  }
});
