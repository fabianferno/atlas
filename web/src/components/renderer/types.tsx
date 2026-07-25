/**
 * The wire format lives in ONE place: `@/lib/kit/a2ui`. This module re-exports
 * it under the renderer's namespace and adds only the types the renderer itself
 * owns. Nothing here redeclares a field — if the renderer needs a new one, it
 * goes in the kit first (see the header of lib/kit/a2ui.ts).
 *
 * Shape of what we render, restated so it is next to the code that consumes it:
 *
 *   A2UIDocument = [
 *     { version, createSurface:    { surfaceId, catalogId, theme: { tier },
 *                                    sendDataModel, layout: { order, columns } } },
 *     { version, updateComponents: { surfaceId, components: A2UIComponent[] } },
 *     { version, updateDataModel:  { surfaceId, path: "/", value: <data model> } },
 *     …further updateComponents / updateDataModel messages while streaming
 *   ]
 *
 * The catalog is LEAF-ONLY. There is no Row/Column/Card and no `id: "root"`.
 * `layout.order` is the render order, and it is a flat permutation of the
 * component ids — so this renderer does not walk a tree, it walks a list.
 */

export type {
  A2UIAction,
  A2UIClientAction,
  A2UIClientError,
  A2UIClientMessage,
  A2UIComponent,
  A2UICreateSurface,
  A2UIDocument,
  A2UIFunctionCall,
  A2UIHints,
  A2UILayout,
  A2UIMessage,
  A2UIPathBinding,
  A2UIServerEvent,
  A2UISurfaceView,
  A2UITheme,
  A2UIUpdateComponents,
  A2UIUpdateDataModel,
  A2UIValidation,
  A2UIValidationIssue,
  JsonValue,
} from "@/lib/kit/a2ui";

export {
  A2UI_VERSION,
  ATLAS_CATALOG_ID,
  bind,
  buildDocument,
  createSurface,
  functionCall,
  getPointer,
  isA2UIDocument,
  isClientAction,
  isPathBinding,
  isServerEvent,
  readSurface,
  serverEvent,
  setPointer,
  updateComponents,
  updateDataModel,
  validateDocument,
} from "@/lib/kit/a2ui";

/** A client-side function the renderer will run for a `functionCall`. */
export type LocalFunction = (args: Record<string, unknown>) => void;

/** What a catalog component emits; bridged to A2UI by the renderer. */
export type CatalogDispatch = (event: {
  name: string;
  context: Record<string, unknown>;
}) => void;
