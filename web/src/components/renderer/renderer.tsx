"use client";

/**
 * THE A2UI RENDERER.
 *
 * Takes an A2UI document (or a stream of A2UI messages), resolves its data
 * bindings, renders each component from the CLIENT-HELD catalog, and posts
 * Server Events back to the agent.
 *
 * ── The security property, stated where it is enforced ──────────────────────
 * The agent sends a component NAME and a data model. It does not send code,
 * markup, class names, styles, URLs to import, or anything else this file
 * executes. Rendering is a map lookup:
 *
 *     lookupCatalog(name) ?? lookupLayout(name) ?? <UnknownComponent/>
 *
 * There is no `eval`, no `new Function`, no `dangerouslySetInnerHTML`, and no
 * dynamic `import()` keyed on agent output anywhere in this directory. An
 * unknown name renders a visible, inert placeholder — never nothing, never
 * something executable. A generated interface that can move money must have
 * this property; it is the difference between this and "an LLM writes React".
 *
 * ── Enforcement the composer does not get a vote on ─────────────────────────
 * REQUIRED_FOR_AUTONOMOUS (policy_badge, trade_log, kill_switch) is applied
 * here, not in the composer. If an autonomous document omits its kill switch,
 * the renderer appends one. An agent must not be able to hide its own controls
 * by declining to emit them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgencyTier, Policy } from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";
import { REQUIRED_FOR_AUTONOMOUS, type ComponentName } from "@/lib/contracts/catalog";
import { KillSwitch, PolicyBadge, TradeLog, lookupCatalog } from "@/components/catalog";
import { BIND_EVENT } from "@/components/catalog/_shared";
import { RuntimeProvider, Label } from "@/components/brutal";
import { cn } from "@/lib/utils";

import { A2UI_VERSION, type A2uiActionPayload, type A2uiComponent } from "./types";
import { normaliseDocument, rootIds } from "./document";
import { resolveBindings, resolveContext, setPath } from "./paths";
import { lookupLayout } from "./layout";
import { DanglingRef, EmptySurface, UnknownComponent } from "./fallback";

export type LocalFunction = (args: Record<string, unknown>) => void;

export interface A2uiRendererProps {
  /** A2UI document, a message stream, or a Manifest's `ui` field. */
  document: unknown;
  /** Client-held. The document cannot change it — that is the whole point. */
  tier?: AgencyTier;
  policy?: Policy | null;
  spentUsd?: number;
  live?: boolean;
  /** Backs the injected trade_log when the document omits one. */
  journal?: JournalEntry[];
  /** Server Events. Post this to the agent as `client_to_server.json`. */
  onAction?: (payload: A2uiActionPayload) => void;
  /** Local Function Calls. A closed, client-held set; args are data only. */
  localFunctions?: Record<string, LocalFunction>;
  className?: string;
}

/** The default client-side function table. Additions are the host app's call. */
const DEFAULT_LOCALS: Record<string, LocalFunction> = {
  noop: () => {},
  openUrl: (args) => {
    const url = typeof args.url === "string" ? args.url : "";
    // Scheme allowlist: an agent-supplied `javascript:` URL is an XSS vector.
    if (!/^https?:\/\//i.test(url)) return;
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

interface RenderCtx {
  byId: Map<string, A2uiComponent>;
  model: Record<string, unknown>;
  makeDispatch: (c: A2uiComponent) => CatalogDispatch;
  /** Drives the staggered `--i` on `.snap-in` — the assembling animation. */
  counter: { i: number };
}

type CatalogDispatch = (event: { name: string; context: Record<string, unknown> }) => void;

/**
 * The recursive walk. Module scope on purpose: it is pure with respect to its
 * ctx, and defining it outside the component keeps React from treating each
 * render as a fresh component definition.
 *
 * Resolution order is the security boundary — layout, then catalog, then a
 * visible fallback. There is no fourth branch and there must never be one.
 */
function renderNode(ctx: RenderCtx, id: string, seen: Set<string>): React.ReactNode {
  if (seen.has(id)) return null; // an adjacency list can describe a cycle
  const c = ctx.byId.get(id);
  if (!c) return <DanglingRef key={id} id={id} index={ctx.counter.i++} />;

  const nextSeen = new Set(seen);
  nextSeen.add(id);

  const resolved = resolveBindings(c.properties ?? {}, ctx.model);
  const props: Record<string, unknown> =
    resolved && typeof resolved === "object" && !Array.isArray(resolved)
      ? (resolved as Record<string, unknown>)
      : { value: resolved };

  const resolvedLabel = resolveBindings(c.label, ctx.model);
  const label =
    typeof resolvedLabel === "string"
      ? resolvedLabel
      : typeof props.label === "string"
        ? props.label
        : undefined;

  // 1. layout container
  const Layout = lookupLayout(c.component);
  if (Layout) {
    const childIds = c.children ?? (c.child ? [c.child] : []);
    return (
      <Layout key={c.id} id={c.id} props={props} index={ctx.counter.i}>
        {childIds.map((cid) => renderNode(ctx, cid, nextSeen))}
      </Layout>
    );
  }

  // 2. approved catalog component
  const Catalog = lookupCatalog(c.component);
  if (Catalog) {
    // Catalog components are leaves: `data` is everything, children are not a
    // concept. A composer that nests inside a gauge gets ignored, quietly.
    return (
      <Catalog
        key={c.id}
        id={c.id}
        data={props}
        label={label}
        onAction={ctx.makeDispatch(c)}
        index={ctx.counter.i++}
      />
    );
  }

  // 3. not in the catalog — visible, inert, and definitely not executed
  return <UnknownComponent key={c.id} id={c.id} name={c.component} index={ctx.counter.i++} />;
}

export function A2uiRenderer({
  document: input,
  tier = "readonly",
  policy = null,
  spentUsd = 0,
  live = false,
  journal,
  onAction,
  localFunctions,
  className,
}: A2uiRendererProps) {
  const { doc, reason } = useMemo(() => normaliseDocument(input), [input]);

  // The live data model. Seeded by the document; mutated by streamed updates
  // and by two-way bindings (amount_input, allowlist_picker).
  const [model, setModel] = useState<Record<string, unknown>>(() => doc?.dataModel ?? {});
  const seeded = useRef<unknown>(doc?.dataModel);
  useEffect(() => {
    if (doc?.dataModel !== seeded.current) {
      seeded.current = doc?.dataModel;
      setModel(doc?.dataModel ?? {});
    }
  }, [doc]);

  const locals = useMemo(
    () => ({ ...DEFAULT_LOCALS, ...localFunctions }),
    [localFunctions],
  );

  const surfaceId = doc?.surfaceId ?? "surface";

  const byId = useMemo(() => {
    const m = new Map<string, A2uiComponent>();
    for (const c of doc?.components ?? []) m.set(c.id, c);
    return m;
  }, [doc]);

  /** Bridges a catalog component's `onAction` to A2UI's two action kinds. */
  const makeDispatch = useCallback(
    (c: A2uiComponent) =>
      (evt: { name: string; context: Record<string, unknown> }) => {
        // Two-way binding: never leaves the client, never reaches the agent.
        if (evt.name === BIND_EVENT) {
          const path = typeof evt.context.path === "string" ? evt.context.path : "";
          if (!path) return;
          setModel((m) => setPath(m, path, evt.context.value));
          return;
        }

        // Local Function Call — resolved against a closed table by name.
        const fc = c.action?.functionCall;
        if (fc && typeof fc.call === "string") {
          const fn = Object.prototype.hasOwnProperty.call(locals, fc.call)
            ? locals[fc.call]
            : undefined;
          fn?.({ ...resolveContext(fc.args, model), ...evt.context });
        }

        // Server Event — the component's own name wins, then the declared one.
        const name = evt.name || c.action?.event?.name || "";
        if (!name) return;
        const context = {
          ...resolveContext(c.action?.event?.context, model),
          ...evt.context,
        };
        onAction?.({
          version: A2UI_VERSION,
          action: { name, surfaceId, sourceComponentId: c.id, context },
        });
      },
    [locals, model, onAction, surfaceId],
  );

  /** Which catalog components this document actually contains. */
  const present = useMemo(() => {
    const s = new Set<ComponentName>();
    for (const c of doc?.components ?? []) {
      if (lookupCatalog(c.component)) s.add(c.component as ComponentName);
    }
    return s;
  }, [doc]);

  const body = useMemo(() => {
    if (!doc) return null;
    const ctx: RenderCtx = { byId, model, makeDispatch, counter: { i: 0 } };
    return rootIds(doc).map((id) => renderNode(ctx, id, new Set<string>()));
  }, [doc, byId, model, makeDispatch]);

  if (!doc) return <EmptySurface reason={reason || "nothing to render"} />;

  // Renderer-enforced floor for autonomous apps.
  const missing =
    tier === "autonomous"
      ? REQUIRED_FOR_AUTONOMOUS.filter((n) => !present.has(n))
      : [];

  return (
    <RuntimeProvider tier={tier} policy={policy} spentUsd={spentUsd} live={live}>
      <div className={cn("flex min-w-0 flex-col gap-4", className)}>
        {body}

        {missing.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Label>
              added by the client — an autonomous app must show these
            </Label>
            {missing.map((name, i) => (
              <RequiredComponent
                key={name}
                name={name}
                index={i}
                policy={policy}
                spentUsd={spentUsd}
                journal={journal ?? []}
                onAction={(evt) =>
                  onAction?.({
                    version: A2UI_VERSION,
                    action: {
                      name: evt.name || name,
                      surfaceId,
                      sourceComponentId: `client:${name}`,
                      context: evt.context,
                    },
                  })
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    </RuntimeProvider>
  );
}

/**
 * The three components an autonomous app must show, rendered by the client
 * when the document omits them. Written as an explicit switch rather than a
 * registry lookup: this is the safety floor, and it should be readable as such.
 */
function RequiredComponent({
  name,
  index,
  policy,
  spentUsd,
  journal,
  onAction,
}: {
  name: ComponentName;
  index: number;
  policy: Policy | null;
  spentUsd: number;
  journal: JournalEntry[];
  onAction: CatalogDispatch;
}) {
  const id = `client:${name}`;
  if (name === "policy_badge") {
    return <PolicyBadge id={id} data={{ policy, spentUsd }} index={index} />;
  }
  if (name === "trade_log") {
    return <TradeLog id={id} data={{ entries: journal }} index={index} />;
  }
  if (name === "kill_switch") {
    return (
      <KillSwitch
        id={id}
        data={{ halted: policy?.halted ?? false, event: "kill_switch" }}
        onAction={onAction}
        index={index}
      />
    );
  }
  return null;
}
