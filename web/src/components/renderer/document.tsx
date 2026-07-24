/**
 * Normalising whatever arrives into an `A2uiDocument`.
 *
 * Callers hand us one of three things and should not have to care which:
 *   - a document object (a Manifest's `ui` field, replayed from IPFS)
 *   - an array of streamed server messages (a live agent turn)
 *   - garbage (an LLM had a bad day)
 *
 * The third case is the interesting one. Nothing here throws; a malformed
 * document degrades to an empty surface with a reason string, because the
 * renderer sits between an LLM and a screen that may hold a kill switch.
 */

import type { A2uiComponent, A2uiDocument, A2uiMessage } from "./types";
import { setPath } from "./paths";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readComponents(v: unknown): A2uiComponent[] {
  if (!Array.isArray(v)) return [];
  const out: A2uiComponent[] = [];
  for (const c of v) {
    if (!isObj(c)) continue;
    const id = typeof c.id === "string" ? c.id : "";
    const component = typeof c.component === "string" ? c.component : "";
    if (!id || !component) continue;
    out.push({
      id,
      component,
      properties: c.properties,
      children: Array.isArray(c.children)
        ? c.children.filter((x): x is string => typeof x === "string")
        : undefined,
      child: typeof c.child === "string" ? c.child : undefined,
      action: isObj(c.action) ? (c.action as A2uiComponent["action"]) : undefined,
      label: c.label,
    });
  }
  return out;
}

/** Folds a message stream into a single document. Last write wins per ID. */
export function applyMessages(messages: unknown[]): A2uiDocument {
  const doc: A2uiDocument = { version: "v0.9", components: [], dataModel: {} };
  const byId = new Map<string, A2uiComponent>();
  let deleted = false;

  for (const raw of messages) {
    if (!isObj(raw)) continue;

    if (isObj(raw.createSurface)) {
      const s = raw.createSurface;
      doc.surfaceId = typeof s.surfaceId === "string" ? s.surfaceId : doc.surfaceId;
      doc.catalogId = typeof s.catalogId === "string" ? s.catalogId : doc.catalogId;
      if (typeof s.root === "string") doc.root = s.root;
      deleted = false;
      continue;
    }

    if (isObj(raw.updateComponents)) {
      const u = raw.updateComponents;
      for (const c of readComponents(u.components)) byId.set(c.id, c);
      if (typeof u.root === "string") doc.root = u.root;
      continue;
    }

    if (isObj(raw.updateDataModel)) {
      const u = raw.updateDataModel;
      const path = typeof u.path === "string" ? u.path : "/";
      doc.dataModel = setPath(doc.dataModel ?? {}, path, u.contents);
      continue;
    }

    if (isObj(raw.deleteSurface)) {
      deleted = true;
      byId.clear();
      doc.dataModel = {};
    }
  }

  doc.components = deleted ? [] : [...byId.values()];
  return doc;
}

export interface Normalised {
  doc: A2uiDocument | null;
  reason: string;
}

export function normaliseDocument(input: unknown): Normalised {
  if (input === null || input === undefined) {
    return { doc: null, reason: "no interface yet" };
  }

  if (Array.isArray(input)) {
    const doc = applyMessages(input as A2uiMessage[]);
    return doc.components.length > 0
      ? { doc, reason: "" }
      : { doc: null, reason: "stream contained no components" };
  }

  if (!isObj(input)) return { doc: null, reason: "interface payload is not an object" };

  // A single message object, rather than a stream of them.
  if (input.createSurface || input.updateComponents || input.updateDataModel) {
    return normaliseDocument([input]);
  }

  const components = readComponents(input.components ?? input.surface);
  if (components.length === 0) {
    return { doc: null, reason: "document has no valid components" };
  }

  const dataModel = isObj(input.dataModel)
    ? input.dataModel
    : isObj(input.data)
      ? input.data
      : {};

  return {
    doc: {
      version: typeof input.version === "string" ? input.version : "v0.9",
      surfaceId: typeof input.surfaceId === "string" ? input.surfaceId : "surface",
      catalogId: typeof input.catalogId === "string" ? input.catalogId : undefined,
      root: typeof input.root === "string" ? input.root : undefined,
      components,
      dataModel,
    },
    reason: "",
  };
}

/**
 * Picks the entry point. Explicit `root`, then a component literally named
 * "root", then the first component with children, then everything in order.
 */
export function rootIds(doc: A2uiDocument): string[] {
  const ids = doc.components.map((c) => c.id);
  if (doc.root && ids.includes(doc.root)) return [doc.root];
  if (ids.includes("root")) return ["root"];

  const referenced = new Set<string>();
  for (const c of doc.components) {
    for (const child of c.children ?? []) referenced.add(child);
    if (c.child) referenced.add(c.child);
  }
  const orphans = ids.filter((id) => !referenced.has(id));
  return orphans.length > 0 ? orphans : ids;
}
