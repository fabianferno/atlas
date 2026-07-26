/**
 * A2UI v0.9.1 document types and builders.
 *
 * W4 (composer) emits these. W5 (renderer) imports these types and renders
 * them. This module is the *only* place the wire format is described — if the
 * renderer needs a field, add it here first.
 *
 * ── The security property ────────────────────────────────────────────────
 * An A2UI document is declarative data, never executable code. The client
 * holds the approved catalog (`ALL_COMPONENTS` in contracts/catalog.ts) and
 * the agent may only reference components by name. Nothing here can express
 * "run this". `validateDocument()` enforces that at the seam.
 *
 * ── Our catalog is leaf-only ─────────────────────────────────────────────
 * The A2UI basic catalog ships container primitives (Row/Column/Card) and
 * requires a component with `id: "root"`. Our catalog (contracts/catalog.ts)
 * is deliberately leaf-only: every component is a self-contained panel and
 * the surface itself is the root container. Render order is
 * `createSurface.layout.order`, which is always a permutation of the
 * component ids. This is a documented, single deviation from the reference
 * catalog and it is what keeps the agent's output space finite.
 *
 * Spec: https://a2ui.org/specification/v0.9-a2ui/
 * Client-to-server: specification/v0_9_1/json/client_to_server.json
 */
import type { ComponentName } from "@/lib/contracts/catalog";
import { ALL_COMPONENTS } from "@/lib/contracts/catalog";
import type { AgencyTier } from "@/lib/contracts/manifest";

export const A2UI_VERSION = "v0.9.1" as const;

/** Our approved catalog. The renderer implements exactly this and nothing else. */
export const ATLAS_CATALOG_ID =
  "https://atlas-apps.eth/specification/v1/catalogs/atlas/catalog.json";

/* ────────────────────────────────────────────────────────────────────────
 * Primitives
 * ──────────────────────────────────────────────────────────────────────── */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** RFC 6901 JSON Pointer into the surface's data model. */
export interface A2UIPathBinding {
  path: string;
}

/** A literal value, or a binding resolved against the local data model. */
export type A2UIDynamic<T extends JsonValue> = T | A2UIPathBinding;

export type A2UIDynamicString = A2UIDynamic<string>;
export type A2UIDynamicNumber = A2UIDynamic<number>;
export type A2UIDynamicBoolean = A2UIDynamic<boolean>;

export function isPathBinding(v: unknown): v is A2UIPathBinding {
  return typeof v === "object" && v !== null && typeof (v as A2UIPathBinding).path === "string";
}

/** `bind("/blocks/tvl")` → `{ path: "/blocks/tvl" }` */
export function bind(path: string): A2UIPathBinding {
  return { path };
}

/* ────────────────────────────────────────────────────────────────────────
 * Actions
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Dispatched to the agent. Context values may be path bindings; the client
 * resolves them against the local data model before posting a payload
 * conforming to `client_to_server.json`.
 */
export interface A2UIServerEvent {
  name: string;
  context: Record<string, A2UIDynamic<JsonValue>>;
}

/** Handled entirely client-side. Never reaches the agent, never signs. */
export interface A2UIFunctionCall {
  call: string;
  args?: Record<string, A2UIDynamic<JsonValue>>;
}

export type A2UIAction = { event: A2UIServerEvent } | { functionCall: A2UIFunctionCall };

export function serverEvent(
  name: string,
  context: Record<string, A2UIDynamic<JsonValue>> = {},
): A2UIAction {
  return { event: { name, context } };
}

export function functionCall(
  call: string,
  args: Record<string, A2UIDynamic<JsonValue>> = {},
): A2UIAction {
  return { functionCall: { call, args } };
}

export function isServerEvent(a: A2UIAction): a is { event: A2UIServerEvent } {
  return "event" in a;
}

/* ────────────────────────────────────────────────────────────────────────
 * Components
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Presentation hints. Advisory only — the renderer owns the visual system
 * (prd.md §6) and may ignore every one of these. They exist so the composer
 * can say "this is the series the question was about" without the renderer
 * having to re-derive it.
 */
export interface A2UIHints {
  /** Column/field name of the one series that carries the semantic accent. */
  accentField?: string;
  /** Semantic accent to use. Maps to the five tokens in prd.md §6 Rule 2. */
  accent?: "live" | "gain" | "loss" | "risk" | "spend";
  /** Field roles resolved by shape detection: category, time, metrics, etc. */
  fields?: Record<string, string | string[] | number | undefined>;
  /**
   * Unit for figures in this block.
   *
   * "eth" was added because Messari's NFT-marketplace family denominates in
   * ether — `cumulativeTradeVolumeETH`, `creatorRevenueETH`,
   * `marketplaceRevenueETH` are all live fields — and every one of them used to
   * be drawn with a dollar sign. `components/brutal/format.ts` treats a unit it
   * does not recognise as a literal suffix, which is exactly the behaviour
   * wanted here, so this widening needs nothing on the renderer side.
   *
   * "token" is the deliberate absence of a denomination: a raw token amount in
   * the token's own decimals, printed as a bare magnitude because that is all
   * that can be backed.
   */
  unit?: "usd" | "eth" | "pct" | "count" | "token" | "ratio" | "none";
  /** Fraction digits for the primary figure. */
  precision?: number;
  /** Panel span on a 12-column grid. Renderer may clamp. */
  span?: number;
}

/**
 * One entry in the flat component list.
 *
 * `component` is constrained to `ComponentName` at the type level — that is
 * the composer/renderer seam from contracts/catalog.ts, enforced by the
 * compiler rather than by convention.
 */
export interface A2UIComponent {
  /** Unique within the surface. */
  id: string;
  component: ComponentName;
  /** Human-readable panel title. */
  label?: A2UIDynamicString;
  /** Secondary line under the label. */
  caption?: A2UIDynamicString;
  /** Binding to this component's slice of the data model. */
  data?: A2UIPathBinding;
  /** Server Event or Local Function Call. Interactive components only. */
  action?: A2UIAction;
  /**
   * Extension: a client-side effect that fires alongside `action`. Used by
   * `kill_switch`, which must both halt locally (instant) and tell the agent
   * (durable). A2UI's `action` is one-or-the-other; the kill switch needs both.
   */
  localAction?: A2UIFunctionCall;
  /** True when the component is disabled by policy at render time. */
  disabled?: A2UIDynamicBoolean;
  /** Agency tier this component belongs to. Drives border weight (§6 Rule 1). */
  tier?: AgencyTier;
  /** Why this component was chosen. Rendered as provenance, not decoration. */
  rationale?: string;
  hints?: A2UIHints;
}

/* ────────────────────────────────────────────────────────────────────────
 * Messages
 * ──────────────────────────────────────────────────────────────────────── */

export interface A2UILayout {
  /** Render order. Always a permutation of the component ids. */
  order: string[];
  /** Grid columns the renderer should lay `order` out on. */
  columns?: number;
}

export interface A2UITheme {
  primaryColor?: string;
  /** Agency tier for the whole surface. Sets base border weight. */
  tier?: AgencyTier;
}

export interface A2UICreateSurface {
  surfaceId: string;
  catalogId: string;
  theme?: A2UITheme;
  sendDataModel?: boolean;
  /** Extension: leaf-only catalog, so the surface is the root container. */
  layout?: A2UILayout;
}

export interface A2UIUpdateComponents {
  surfaceId: string;
  components: A2UIComponent[];
}

export interface A2UIUpdateDataModel {
  surfaceId: string;
  /** JSON Pointer. `"/"` replaces the whole model. */
  path: string;
  value: JsonValue;
}

export interface A2UIDeleteSurface {
  surfaceId: string;
}

export type A2UIMessage =
  | { version: typeof A2UI_VERSION; createSurface: A2UICreateSurface }
  | { version: typeof A2UI_VERSION; updateComponents: A2UIUpdateComponents }
  | { version: typeof A2UI_VERSION; updateDataModel: A2UIUpdateDataModel }
  | { version: typeof A2UI_VERSION; deleteSurface: A2UIDeleteSurface };

/**
 * An A2UI document is an ordered list of messages. This is what goes in
 * `Manifest.ui` and what `ComposeResult.ui` carries.
 *
 * The canonical minimal document is exactly three messages:
 *   [0] createSurface   — id, catalog, theme, layout order
 *   [1] updateComponents — the flat component list
 *   [2] updateDataModel  — path "/" with the whole model
 *
 * Streaming updates append further `updateComponents` / `updateDataModel`
 * messages; the renderer applies them in order.
 */
export type A2UIDocument = A2UIMessage[];

/* ────────────────────────────────────────────────────────────────────────
 * Client → server
 * ──────────────────────────────────────────────────────────────────────── */

/** Conforms to specification/v0_9_1/json/client_to_server.json. */
export interface A2UIClientAction {
  version: "v0.9" | "v0.9.1";
  action: {
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    /** ISO 8601. */
    timestamp: string;
    /** `action.event.context` with every path binding already resolved. */
    context: Record<string, JsonValue>;
  };
}

export interface A2UIClientError {
  version: "v0.9" | "v0.9.1";
  error: {
    code: string;
    surfaceId: string;
    message: string;
    path?: string;
  };
}

export type A2UIClientMessage = A2UIClientAction | A2UIClientError;

export function isClientAction(m: A2UIClientMessage): m is A2UIClientAction {
  return "action" in m;
}

/* ────────────────────────────────────────────────────────────────────────
 * Builders
 * ──────────────────────────────────────────────────────────────────────── */

export function createSurface(surface: A2UICreateSurface): A2UIMessage {
  return { version: A2UI_VERSION, createSurface: surface };
}

export function updateComponents(
  surfaceId: string,
  components: A2UIComponent[],
): A2UIMessage {
  return { version: A2UI_VERSION, updateComponents: { surfaceId, components } };
}

export function updateDataModel(
  surfaceId: string,
  path: string,
  value: JsonValue,
): A2UIMessage {
  return { version: A2UI_VERSION, updateDataModel: { surfaceId, path, value } };
}

export function deleteSurface(surfaceId: string): A2UIMessage {
  return { version: A2UI_VERSION, deleteSurface: { surfaceId } };
}

export interface BuildDocumentInput {
  surfaceId: string;
  components: A2UIComponent[];
  dataModel: JsonValue;
  catalogId?: string;
  theme?: A2UITheme;
  /** Defaults to the order `components` were passed in. */
  order?: string[];
  columns?: number;
}

/** Assemble the canonical three-message document. */
export function buildDocument(input: BuildDocumentInput): A2UIDocument {
  const order = input.order ?? input.components.map((c) => c.id);
  return [
    createSurface({
      surfaceId: input.surfaceId,
      catalogId: input.catalogId ?? ATLAS_CATALOG_ID,
      theme: input.theme,
      sendDataModel: true,
      layout: { order, columns: input.columns ?? 12 },
    }),
    updateComponents(input.surfaceId, input.components),
    updateDataModel(input.surfaceId, "/", input.dataModel),
  ];
}

/* ────────────────────────────────────────────────────────────────────────
 * Reading
 * ──────────────────────────────────────────────────────────────────────── */

export interface A2UISurfaceView {
  surfaceId: string;
  catalogId: string;
  theme: A2UITheme | null;
  layout: A2UILayout;
  components: A2UIComponent[];
  /** Components already sorted by `layout.order`. */
  ordered: A2UIComponent[];
  dataModel: JsonValue;
}

function hasKey<K extends string>(v: unknown, k: K): v is Record<K, unknown> {
  return typeof v === "object" && v !== null && k in v;
}

/**
 * Fold a document into the flat view a renderer actually wants. Applies
 * `updateComponents` and root-level `updateDataModel` messages in order.
 * Returns null if the document has no surface.
 */
export function readSurface(doc: unknown): A2UISurfaceView | null {
  if (!Array.isArray(doc)) return null;
  let surfaceId = "";
  let catalogId = ATLAS_CATALOG_ID;
  let theme: A2UITheme | null = null;
  let layout: A2UILayout = { order: [], columns: 12 };
  const byId = new Map<string, A2UIComponent>();
  let dataModel: JsonValue = {};

  for (const msg of doc as unknown[]) {
    if (hasKey(msg, "createSurface")) {
      const s = msg.createSurface as A2UICreateSurface;
      surfaceId = s.surfaceId;
      catalogId = s.catalogId ?? catalogId;
      theme = s.theme ?? null;
      if (s.layout) layout = s.layout;
    } else if (hasKey(msg, "updateComponents")) {
      const u = msg.updateComponents as A2UIUpdateComponents;
      for (const c of u.components ?? []) byId.set(c.id, c);
    } else if (hasKey(msg, "updateDataModel")) {
      const u = msg.updateDataModel as A2UIUpdateDataModel;
      dataModel = u.path === "/" || u.path === "" ? u.value : setPointer(dataModel, u.path, u.value);
    }
  }

  if (!surfaceId) return null;
  const components = [...byId.values()];
  const order = layout.order.length > 0 ? layout.order : components.map((c) => c.id);
  const ordered = order.map((id) => byId.get(id)).filter((c): c is A2UIComponent => Boolean(c));
  return { surfaceId, catalogId, theme, layout: { ...layout, order }, components, ordered, dataModel };
}

function decodeToken(t: string): string {
  return t.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** RFC 6901 read. Returns undefined when the pointer does not resolve. */
export function getPointer(model: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return model;
  let cur: unknown = model;
  for (const raw of pointer.replace(/^\//, "").split("/")) {
    const token = decodeToken(raw);
    if (Array.isArray(cur)) {
      const i = Number(token);
      if (!Number.isInteger(i)) return undefined;
      cur = cur[i];
    } else if (typeof cur === "object" && cur !== null) {
      cur = (cur as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** RFC 6901 write, non-mutating at the top level. Creates intermediate objects. */
export function setPointer(model: JsonValue, pointer: string, value: JsonValue): JsonValue {
  if (pointer === "" || pointer === "/") return value;
  const tokens = pointer.replace(/^\//, "").split("/").map(decodeToken);
  const root: JsonValue =
    typeof model === "object" && model !== null && !Array.isArray(model) ? { ...model } : {};
  let cur = root as Record<string, JsonValue>;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = cur[t];
    cur[t] = typeof next === "object" && next !== null && !Array.isArray(next) ? { ...next } : {};
    cur = cur[t] as Record<string, JsonValue>;
  }
  cur[tokens[tokens.length - 1]] = value;
  return root;
}

/* ────────────────────────────────────────────────────────────────────────
 * Validation — the composer/renderer seam, checked
 * ──────────────────────────────────────────────────────────────────────── */

export interface A2UIValidationIssue {
  level: "error" | "warning";
  code:
    | "not_an_array"
    | "no_surface"
    | "unknown_component"
    | "duplicate_id"
    | "empty_surface"
    | "layout_mismatch"
    | "dangling_binding"
    | "bad_version";
  message: string;
  componentId?: string;
}

export interface A2UIValidation {
  valid: boolean;
  issues: A2UIValidationIssue[];
  componentsUsed: ComponentName[];
}

const CATALOG = new Set<string>(ALL_COMPONENTS);

/**
 * Rejects anything the renderer cannot draw. Run this before a document is
 * pinned into a manifest — an invalid document is a blank screen at demo time.
 */
export function validateDocument(doc: unknown): A2UIValidation {
  const issues: A2UIValidationIssue[] = [];
  if (!Array.isArray(doc)) {
    return {
      valid: false,
      issues: [{ level: "error", code: "not_an_array", message: "A2UI document must be an array of messages." }],
      componentsUsed: [],
    };
  }

  for (const msg of doc as unknown[]) {
    if (hasKey(msg, "version") && msg.version !== "v0.9" && msg.version !== A2UI_VERSION) {
      issues.push({
        level: "warning",
        code: "bad_version",
        message: `Unexpected message version ${String(msg.version)}.`,
      });
    }
  }

  const view = readSurface(doc);
  if (!view) {
    return {
      valid: false,
      issues: [...issues, { level: "error", code: "no_surface", message: "No createSurface message." }],
      componentsUsed: [],
    };
  }

  const seen = new Set<string>();
  const used = new Set<ComponentName>();
  for (const c of view.components) {
    if (seen.has(c.id)) {
      issues.push({ level: "error", code: "duplicate_id", message: `Duplicate component id "${c.id}".`, componentId: c.id });
    }
    seen.add(c.id);
    if (!CATALOG.has(c.component)) {
      issues.push({
        level: "error",
        code: "unknown_component",
        message: `"${c.component}" is not in the approved catalog.`,
        componentId: c.id,
      });
    } else {
      used.add(c.component);
    }
    if (c.data && getPointer(view.dataModel, c.data.path) === undefined) {
      issues.push({
        level: "error",
        code: "dangling_binding",
        message: `Component "${c.id}" binds ${c.data.path}, which is not in the data model.`,
        componentId: c.id,
      });
    }
  }

  if (view.components.length === 0) {
    issues.push({ level: "error", code: "empty_surface", message: "Surface has no components." });
  }
  if (view.ordered.length !== view.components.length) {
    issues.push({
      level: "warning",
      code: "layout_mismatch",
      message: "layout.order is not a permutation of the component ids.",
    });
  }

  return {
    valid: !issues.some((i) => i.level === "error"),
    issues,
    componentsUsed: [...used],
  };
}

/** Narrowing guard for `Manifest.ui` / `ComposeResult.ui`. */
export function isA2UIDocument(doc: unknown): doc is A2UIDocument {
  return validateDocument(doc).valid;
}
