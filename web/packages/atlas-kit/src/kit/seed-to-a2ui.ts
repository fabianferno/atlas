/**
 * Seed fixture → A2UI document.
 *
 * The 16 seed mini apps carry a local fixture body (`UiDoc` with `blocks`) so
 * the board and registry stay populated without a planner round trip. That
 * fixture path renders display panels only — it has no buttons, no inputs and
 * no action loop. A live-composed app, by contrast, is a real A2UI document
 * (`components`) rendered by `A2uiRenderer`, which owns the whole action
 * surface: amount_input, allowlist_picker, action_button, kill_switch.
 *
 * This module makes an autonomous seed app behave like a live-composed one. It
 * translates each fixture block into the catalog component it names, then — for
 * the autonomous tier — synthesises the action chrome the composer would have
 * added, sourced from `manifest.agency` (policy, actions, triggers) and the
 * app's real journal. The result is a canonical three-message A2UI document
 * that `A2uiRenderer` draws directly.
 *
 * The mapping is deliberately faithful to what each catalog component reads
 * (see `components/catalog/_shared.tsx` coercers): fixture field names are
 * renamed to the keys the component expects, display-string deltas are parsed
 * to numbers, and `time_series` bare-number points are given synthetic
 * timestamps so the renderer has an X axis to draw.
 */
import type { Manifest, Policy } from "../contracts/manifest";
import type { JournalEntry } from "../contracts/policy";
import type { Accent, UiBlock, UiDoc } from "./ui-doc";
import { ACTION_COMPONENTS } from "../contracts/catalog";
import {
  bind,
  buildDocument,
  readSurface,
  serverEvent,
  type A2UIComponent,
  type A2UIDocument,
  type A2UIHints,
  type JsonValue,
} from "./a2ui";

/** True for the local fixture shape. A real A2UI document is an array. */
export function isUiDoc(v: unknown): v is UiDoc {
  return typeof v === "object" && v !== null && Array.isArray((v as { blocks?: unknown }).blocks);
}

/* ────────────────────────────────────────────────────────────────────────
 * Normalisation
 * ──────────────────────────────────────────────────────────────────────── */

/** Fixture accent vocabulary → A2UI hint accent. `ink` has no semantic accent. */
function normAccent(a?: Accent): A2UIHints["accent"] {
  return a && a !== "ink" ? a : undefined;
}

/** Fixture display units ("USD", "%", "×") → the composer's canonical tokens. */
function normUnit(u?: string): A2UIHints["unit"] {
  switch ((u ?? "").trim().toUpperCase()) {
    case "USD":
      return "usd";
    case "%":
      return "pct";
    case "×":
    case "X":
      return "ratio";
    default:
      return "none";
  }
}

/** Fixture span (thirds) → 12-column span, with a per-component default. */
function spanFor(block: UiBlock): number {
  if (block.span === 3) return 12;
  if (block.span === 2) return 8;
  if (block.span === 1) return 4;
  switch (block.component) {
    case "metric_card":
    case "gauge":
    case "progress_bar":
    case "position_card":
      return 4;
    case "bar_chart":
    case "leaderboard":
    case "distribution":
      return 6;
    default:
      return 12;
  }
}

/** Drops undefined keys so the payload conforms to JsonValue. */
function clean(o: Record<string, JsonValue | undefined>): JsonValue {
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * A fixture delta is a pre-formatted string ("+8.4%", "+11"). The catalog
 * renders `deltaPct` as a coloured percentage; only use it when the string is
 * actually a percentage. An absolute delta is folded into the sublabel so it
 * still shows, verbatim, rather than being mislabelled as a percent.
 */
function parseDelta(delta?: string): { deltaPct?: number; abs?: string } {
  if (!delta) return {};
  const m = delta.match(/-?\d+(?:\.\d+)?/);
  if (!m) return {};
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return {};
  return delta.includes("%") ? { deltaPct: n } : { abs: delta.trim() };
}

/* ────────────────────────────────────────────────────────────────────────
 * Display blocks → catalog components
 * ──────────────────────────────────────────────────────────────────────── */

interface Converted {
  component: A2UIComponent;
  payload: JsonValue;
}

function convertBlock(block: UiBlock, tier: Manifest["agency"]["tier"], epoch: number): Converted {
  const id = block.id;
  const hints: A2UIHints = { span: spanFor(block) };
  let payload: JsonValue;

  switch (block.component) {
    case "metric_card": {
      const d = block.data;
      const { deltaPct, abs } = parseDelta(d.delta);
      const note = [abs, d.sub].filter(Boolean).join(" · ") || undefined;
      payload = clean({ value: d.value, deltaPct, note, unit: "none" });
      break;
    }
    case "leaderboard": {
      const d = block.data;
      hints.unit = normUnit(d.unit);
      hints.accent = "live";
      payload = clean({
        unit: hints.unit,
        accent: d.accentIndex,
        rows: d.rows.map((r) => clean({ label: r.label, value: r.value, sublabel: r.note })),
      });
      break;
    }
    case "bar_chart": {
      const d = block.data;
      hints.unit = normUnit(d.unit);
      payload = clean({
        unit: hints.unit,
        accent: d.accentIndex,
        rows: d.rows.map((r) => ({ label: r.label, value: r.value })),
      });
      break;
    }
    case "time_series": {
      const d = block.data;
      hints.unit = normUnit(d.unit);
      hints.accent = normAccent(d.accent) ?? "live";
      // The fixture carries bare numbers; the catalog needs [{t,v}] with a
      // finite t to draw an axis. Space the points hourly, ending at the seed
      // clock — fixture data, so the exact stamps are cosmetic.
      const n = d.points.length;
      payload = clean({
        unit: hints.unit,
        points: d.points.map((v, i) => ({ t: epoch - (n - 1 - i) * 3_600_000, v })),
      });
      break;
    }
    case "gauge": {
      const d = block.data;
      hints.unit = normUnit(d.unit);
      payload = clean({
        value: d.value,
        min: d.min,
        max: d.max,
        riskAt: d.threshold,
        unit: hints.unit,
      });
      break;
    }
    case "progress_bar": {
      const d = block.data;
      hints.unit = normUnit(d.unit);
      payload = clean({
        value: d.value,
        target: d.target,
        unit: hints.unit,
        spend: hints.unit === "usd" ? true : undefined,
        note: d.note,
      });
      if (hints.unit === "usd") hints.accent = "spend";
      break;
    }
    case "comparison_grid": {
      const d = block.data;
      payload = clean({
        entities: d.columns,
        rows: d.rows.map((r) => ({ metric: r.label, values: r.cells })),
      });
      break;
    }
    case "data_table": {
      const d = block.data;
      payload = clean({ columns: d.columns, rows: d.rows });
      break;
    }
    case "position_card": {
      const d = block.data;
      payload = clean({
        asset: d.asset,
        entries: d.rows.map((r) => ({ label: r.k, value: r.v })),
      });
      break;
    }
    case "alert_banner": {
      const d = block.data;
      payload = clean({ severity: d.level, message: d.text, triggered: true });
      break;
    }
    case "flow_diagram": {
      const d = block.data;
      hints.unit = normUnit(d.unit);
      payload = clean({
        unit: hints.unit,
        flows: d.flows.map((f) => ({ source: f.from, target: f.to, value: f.value })),
      });
      break;
    }
    case "distribution": {
      const d = block.data;
      hints.unit = normUnit(d.unit);
      // The catalog needs numeric bucket ranges; the fixture only labels them.
      payload = clean({
        unit: hints.unit,
        buckets: d.buckets.map((b, i) => ({ from: i, to: i + 1, count: b.count, label: b.label })),
      });
      break;
    }
  }

  return {
    payload,
    component: {
      id,
      component: block.component,
      label: block.label,
      data: bind(`/blocks/${id}`),
      tier,
      hints,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Autonomous action chrome
 *
 * Mirrors the composer's autonomous branch (lib/kit/composer.ts), sourced from
 * the manifest instead of a plan.
 *
 * WHAT IS DELIBERATELY NOT HERE. `policy_badge`, `trade_log` and `kill_switch`
 * are the REQUIRED_FOR_AUTONOMOUS trio and this function used to push all three.
 * `AppRuntime` renders each of them in its own chrome — the policy strip above
 * the tab strip carries the policy summary and the kill switch, the Activity tab
 * carries the journal — so emitting them here rendered the same three facts
 * twice, in two different hands. That is the reason a reader could not tell
 * which part of the drawer the agent had actually composed.
 *
 * The invariant is not weakened, it is relocated: `AppRuntime` passes
 * `HOST_PROVIDED` to the renderer, which is how the renderer knows not to
 * re-append them. A caller that renders this document with no chrome around it
 * — the Studio preview — passes nothing and gets all three appended, as before.
 * See `lib/app-view.ts` and `renderer.tsx`.
 * ──────────────────────────────────────────────────────────────────────── */

function appendAutonomous(
  components: A2UIComponent[],
  blocks: Record<string, JsonValue>,
  manifest: Manifest,
  journal: JournalEntry[],
): void {
  const agency = manifest.agency;
  const policy = agency.policy;
  const tier = agency.tier;

  const push = (
    id: string,
    component: A2UIComponent["component"],
    payload: JsonValue,
    extra: Partial<A2UIComponent> = {},
  ) => {
    blocks[id] = payload;
    components.push({ id, component, data: bind(`/blocks/${id}`), tier, ...extra });
  };

  // The action a human can fire: the one the primary trigger runs, else the
  // first declared action.
  const entries = Object.entries(agency.actions);
  const runKey = agency.triggers[0]?.run;
  const [actionKey, action] = entries.find(([k]) => k === runKey) ?? entries[0] ?? [undefined, undefined];
  const key = actionKey ?? "execute";
  const blocked = policy.allowlist.length === 0;

  push("amount-input", "amount_input", {
    value: 0,
    min: 0,
    max: policy.maxPerTxUsd,
    step: 1,
    unit: "usd",
    cap: policy.maxPerTxUsd,
    note: "Bounded by the per-transaction cap at render time, not just at signing.",
  }, {
    label: "Amount (USD)",
    action: serverEvent("amount_changed", { amount: bind("/inputs/amount") }),
    hints: { accent: "spend", span: 6 },
  });

  push("allowlist-picker", "allowlist_picker", clean({
    options: policy.allowlist.map((addr) => ({ address: addr, label: addr })),
    selected: policy.allowlist[0] ?? null,
    empty: blocked,
    note: "Only policy-approved targets are ever offered.",
  }), {
    label: "Target",
    action: serverEvent("target_changed", { target: bind("/inputs/target") }),
    disabled: blocked,
    hints: { span: 6 },
  });

  push("action-" + key, "action_button", clean({
    label: action?.label ?? "Execute",
    kind: action?.kind ?? "swap",
    actionKey: key,
    blocked,
    blockedReason: blocked ? "Allowlist is empty — the policy engine will reject every target." : undefined,
  }), {
    label: action?.label ?? "Execute",
    disabled: bind("/status/halted"),
    action: serverEvent("execute_action", {
      actionKey: key,
      kind: action?.kind ?? "swap",
      amountUsd: bind("/inputs/amount"),
      target: bind("/inputs/target"),
      userInitiated: true,
    }),
    hints: { accent: "spend", span: 6 },
  });

  if (policy.requireConfirm) {
    push("confirm-dialog", "confirm_dialog", {
      title: `Confirm ${action?.label ?? "action"}`,
      body: "This moves value out of the app's wallet. The policy engine still applies.",
      actionKey: key,
      requireConfirm: true,
    }, {
      label: `Confirm ${action?.label ?? "action"}`,
      action: serverEvent("confirm_action", {
        actionKey: key,
        amountUsd: bind("/inputs/amount"),
        target: bind("/inputs/target"),
        confirmed: true,
      }),
      hints: { accent: "spend", span: 6 },
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Entry point
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Pulls the display half out of an already-composed A2UI document.
 *
 * WHY THE ACTION HALF IS DISCARDED. `compose()` works from a `PlanResult`, which
 * carries no policy — and by design it does not invent one: "the composer renders
 * a policy; it never grants one" (composer.ts `defaultPolicy`). So a composed
 * document's `policy_badge` reports an empty allowlist, its `action_button` is
 * blocked, and its `trade_log` is empty, no matter what the published manifest
 * actually allows. That is the correct output pre-publish and the wrong output
 * for a published app, where the policy exists and is the whole point.
 *
 * Rather than teach the composer about policies (which would let a generated
 * document assert its own spending authority — exactly the inversion §7 forbids),
 * the display components are kept and the action surface is rebuilt from the
 * manifest, where the policy actually lives.
 */
function displayHalf(doc: unknown): { components: A2UIComponent[]; blocks: Record<string, JsonValue> } | null {
  const surface = readSurface(doc);
  if (!surface) return null;

  const actionNames = new Set<string>(ACTION_COMPONENTS);
  const components = surface.ordered.filter((c) => !actionNames.has(c.component));

  // Carry over only the data the surviving components bind to. Leaving the
  // dropped components' payloads behind would keep a stale empty-allowlist
  // object in the data model for anything that walked it.
  const model = surface.dataModel;
  const sourceBlocks =
    typeof model === "object" && model !== null && !Array.isArray(model)
      ? ((model as Record<string, unknown>)["blocks"] as Record<string, JsonValue> | undefined)
      : undefined;

  const blocks: Record<string, JsonValue> = {};
  if (sourceBlocks) {
    for (const component of components) {
      const payload = sourceBlocks[component.id];
      if (payload !== undefined) blocks[component.id] = payload;
    }
  }

  return { components, blocks };
}

/**
 * Turn a manifest's body into a real A2UI document whose action surface reflects
 * the manifest's ACTUAL policy.
 *
 * Two inputs, one output. A fixture body (`UiDoc`) is converted block by block.
 * An already-composed A2UI document keeps its display components and has its
 * action surface rebuilt — see `displayHalf` for why the composed one is not
 * trusted. Either way an autonomous app ends up with the policy badge, the
 * bounded amount input, the allowlist picker, the action button, the journal and
 * the kill switch, all sourced from `manifest.agency`.
 */
export function seedToA2ui(
  manifest: Manifest,
  /*
   * `epoch` replaces an import of `SEED_EPOCH` from the app's seed file. It is
   * used for one thing — giving bare-number `time_series` points synthetic
   * hourly stamps so the renderer has an X axis — and a fixed demo clock is app
   * content, not kit behaviour, so the kit takes it as a parameter and defaults
   * to now. The app passes its seed epoch and keeps the deterministic render it
   * had; anyone else gets a sensible axis without inheriting our clock.
   */
  opts: { journal?: JournalEntry[]; epoch?: number } = {},
): A2UIDocument {
  const epoch = opts.epoch ?? Date.now();
  const ui = manifest.ui;
  const tier = manifest.agency.tier;
  const components: A2UIComponent[] = [];
  const blocks: Record<string, JsonValue> = {};

  if (isUiDoc(ui)) {
    for (const block of ui.blocks) {
      const { component, payload } = convertBlock(block, tier, epoch);
      blocks[component.id] = payload;
      components.push(component);
    }
  } else {
    const display = displayHalf(ui);
    // Not a fixture and not a readable surface: nothing to rebuild against, so
    // hand back what was there rather than replacing a body with an empty one.
    if (!display) return ui as A2UIDocument;
    components.push(...display.components);
    Object.assign(blocks, display.blocks);
  }

  if (tier === "autonomous") {
    appendAutonomous(components, blocks, manifest, opts.journal ?? []);
  }

  const policy: Policy = manifest.agency.policy;
  const dataModel: JsonValue = {
    meta: {
      intent: manifest.intent,
      tier,
      title: manifest.title,
    },
    blocks,
    policy: {
      tier,
      wallet: policy.wallet,
      maxSpendUsd: policy.maxSpendUsd,
      maxPerTxUsd: policy.maxPerTxUsd,
      allowlist: policy.allowlist,
      expiresAt: policy.expiresAt,
      requireConfirm: policy.requireConfirm,
      killSwitch: policy.killSwitch,
      halted: policy.halted,
    },
    inputs: { amount: 0, target: policy.allowlist[0] ?? null },
    status: { halted: policy.halted, streaming: tier !== "readonly" },
    journal: (opts.journal ?? []) as unknown as JsonValue,
  };

  return buildDocument({
    surfaceId: `mini-${manifest.name}`,
    components,
    dataModel,
    theme: { tier, primaryColor: "#0047FF" },
    columns: 12,
  });
}

export default seedToA2ui;
