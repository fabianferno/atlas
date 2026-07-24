/**
 * A2UI v0.9 wire types, narrowed to what this client accepts.
 *
 * Spec: https://a2ui.org/specification/v0.9-a2ui/
 *
 * Two intake shapes are supported, both flat-list + data-model:
 *
 * 1. DOCUMENT (what our composer emits and what a Manifest stores in `ui`):
 *    {
 *      "version": "v0.9",
 *      "surfaceId": "app",
 *      "catalogId": "graphmini/1",
 *      "root": "root",
 *      "components": [ …A2uiComponent ],
 *      "dataModel": { … }
 *    }
 *
 * 2. STREAM (a list of server messages, each with exactly one of
 *    createSurface | updateComponents | updateDataModel | deleteSurface).
 *    `applyMessages()` folds a stream into a document.
 *
 * The tree is an adjacency list: components reference children by ID. There is
 * no nesting in the wire format, which is precisely why an agent cannot smuggle
 * markup through it.
 */

/** A component's declared action. Either goes to the agent, or stays local. */
export interface A2uiAction {
  /** Server Event — dispatched to the agent. */
  event?: {
    name: string;
    context?: Record<string, unknown>;
  };
  /** Local Function Call — handled client-side, never leaves the browser. */
  functionCall?: {
    call: string;
    args?: Record<string, unknown>;
  };
}

export interface A2uiComponent {
  id: string;
  /** A name from the client-held catalog, or a layout container. Never code. */
  component: string;
  /** Bindable props. May itself be a `{path}` binding. */
  properties?: unknown;
  children?: string[];
  child?: string;
  action?: A2uiAction;
  /** Convenience: some composers put the label outside `properties`. */
  label?: unknown;
}

export interface A2uiDocument {
  version?: string;
  surfaceId?: string;
  catalogId?: string;
  root?: string;
  components: A2uiComponent[];
  dataModel?: Record<string, unknown>;
}

export interface CreateSurfaceMsg {
  version?: string;
  createSurface: { surfaceId: string; catalogId?: string; root?: string };
}
export interface UpdateComponentsMsg {
  version?: string;
  updateComponents: {
    surfaceId?: string;
    components: A2uiComponent[];
    root?: string;
  };
}
export interface UpdateDataModelMsg {
  version?: string;
  updateDataModel: {
    surfaceId?: string;
    /** JSON Pointer. Absent or "/" replaces at the root (upsert semantics). */
    path?: string;
    contents: unknown;
  };
}
export interface DeleteSurfaceMsg {
  version?: string;
  deleteSurface: { surfaceId: string };
}

export type A2uiMessage =
  | CreateSurfaceMsg
  | UpdateComponentsMsg
  | UpdateDataModelMsg
  | DeleteSurfaceMsg;

/** What the client posts back when a Server Event fires. */
export interface A2uiActionPayload {
  version: string;
  action: {
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    context: Record<string, unknown>;
  };
}

/** A data binding: `{"path": "/healthFactor"}`. */
export interface A2uiBinding {
  path: string;
  default?: unknown;
}

export const A2UI_VERSION = "v0.9";
