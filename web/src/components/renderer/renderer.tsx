"use client";

/**
 * THE A2UI RENDERER.
 *
 * Takes an A2UI document (the three-message array the composer emits, plus any
 * streamed updates), folds it with the kit's `readSurface`, resolves its data
 * bindings, renders each component from the CLIENT-HELD catalog in
 * `layout.order`, and posts Server Events back to the agent.
 *
 * ── The security property, stated where it is enforced ──────────────────────
 * The agent sends a component NAME and a data model. It does not send code,
 * markup, class names, styles, URLs to import, or anything else this file
 * executes. Rendering is a map lookup:
 *
 *     lookupCatalog(name) ?? <UnknownComponent/>
 *
 * There is no `eval`, no `new Function`, no `dangerouslySetInnerHTML`, and no
 * dynamic `import()` keyed on agent output anywhere in this directory. A name
 * outside the catalog renders a visible, inert placeholder — never nothing,
 * never something executable. A generated interface that can move money must
 * have this property; it is the difference between this and "an LLM writes
 * React". `validateDocument()` catches the same class of problem earlier, and
 * its issues are surfaced rather than swallowed.
 *
 * ── Leaf-only catalog ───────────────────────────────────────────────────────
 * There is no Row/Column/Card and no `id: "root"`. The surface IS the root
 * container, `layout.order` is the render order, and every component is a
 * self-contained panel. So this walks a flat list, not a tree — which is what
 * keeps the agent's output space equal to `ALL_COMPONENTS` and nothing more.
 *
 * ── Enforcement the composer does not get a vote on ─────────────────────────
 * REQUIRED_FOR_AUTONOMOUS (policy_badge, trade_log, kill_switch) is applied
 * here as well as in the composer. If an autonomous document arrives without
 * its kill switch — a hand-edited manifest, an older fork, a truncated stream —
 * the renderer appends one. An agent must not be able to hide its own controls
 * by declining to emit them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgencyTier, Policy } from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";
import { REQUIRED_FOR_AUTONOMOUS, type ComponentName } from "@/lib/contracts/catalog";
import { KillSwitch, PolicyBadge, TradeLog, lookupCatalog } from "@/components/catalog";
import { BIND_EVENT } from "@/components/catalog/_shared";
import { RuntimeProvider, Label, Fig } from "@/components/brutal";
import { cn } from "@/lib/utils";

import {
  A2UI_VERSION,
  readSurface,
  validateDocument,
  type A2UIClientAction,
  type A2UIComponent,
  type A2UIValidationIssue,
  type CatalogDispatch,
  type JsonValue,
  type LocalFunction,
} from "./types";
import { resolveBindings, resolveBoolean, resolveContext, resolveString, safeSetPointer } from "./paths";
import { EmptySurface, UnknownComponent } from "./fallback";

export interface A2uiRendererProps {
  /** `ComposeResult.ui` / `Manifest.ui` — an array of A2UI messages. */
  document: unknown;
  /**
   * Overrides `createSurface.theme.tier`. The host app passes this when it
   * knows the manifest's real tier; otherwise the surface's own theme wins.
   * The document can never raise its tier past what the host allows here.
   */
  tier?: AgencyTier;
  policy?: Policy | null;
  spentUsd?: number;
  /** Backs the injected trade_log when the document omits one. */
  journal?: JournalEntry[];
  /** Server Events, shaped as `client_to_server.json`. Post these to the agent. */
  onAction?: (payload: A2UIClientAction) => void;
  /** Local Function Calls. A closed, client-held table; args are data only. */
  localFunctions?: Record<string, LocalFunction>;
  className?: string;
}

/** 12-column grid spans, mapped to Tailwind classes at build time. */
const SPAN_CLASS: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  12: "lg:col-span-12",
};

function spanClass(span: unknown): string {
  const n = typeof span === "number" ? span : 12;
  if (SPAN_CLASS[n]) return SPAN_CLASS[n];
  if (n <= 4) return SPAN_CLASS[4];
  if (n <= 6) return SPAN_CLASS[6];
  if (n <= 9) return SPAN_CLASS[9];
  return SPAN_CLASS[12];
}

export function A2uiRenderer({
  document: input,
  tier: tierOverride,
  policy = null,
  spentUsd = 0,
  journal,
  onAction,
  localFunctions,
  className,
}: A2uiRendererProps) {
  const surface = useMemo(() => readSurface(input), [input]);
  const validation = useMemo(() => validateDocument(input), [input]);

  // The live data model. Seeded by the document; mutated by two-way bindings
  // (amount_input, allowlist_picker) and by local functions like setHalted.
  const [model, setModel] = useState<JsonValue>(() => surface?.dataModel ?? {});
  const seeded = useRef<unknown>(surface?.dataModel);
  useEffect(() => {
    if (surface?.dataModel !== seeded.current) {
      seeded.current = surface?.dataModel;
      setModel(surface?.dataModel ?? {});
    }
  }, [surface]);

  const surfaceId = surface?.surfaceId ?? "surface";
  const tier: AgencyTier = tierOverride ?? surface?.theme?.tier ?? "readonly";
  const streaming = resolveBindings({ path: "/status/streaming" }, model) === true;
  const halted = resolveBindings({ path: "/status/halted" }, model) === true;

  /**
   * The client-side function table. Closed by construction: a `functionCall`
   * naming anything not in here is a no-op, never a lookup on window.
   */
  const locals = useMemo<Record<string, LocalFunction>>(
    () => ({
      noop: () => {},
      /** kill_switch's local half — halts the UI before the network round trip. */
      setHalted: (args) => {
        const next = args.halted === undefined ? true : args.halted === true;
        setModel((m) => safeSetPointer(m, "/status/halted", next));
      },
      openUrl: (args) => {
        const url = typeof args.url === "string" ? args.url : "";
        // Scheme allowlist: an agent-supplied `javascript:` URL is an XSS vector.
        if (!/^https?:\/\//i.test(url)) return;
        window.open(url, "_blank", "noopener,noreferrer");
      },
      ...localFunctions,
    }),
    [localFunctions],
  );

  /** Bridges a catalog component's `onAction` to A2UI's two action kinds. */
  const makeDispatch = useCallback(
    (c: A2UIComponent): CatalogDispatch =>
      (evt) => {
        // Two-way binding: never leaves the client, never reaches the agent.
        if (evt.name === BIND_EVENT) {
          const path = typeof evt.context.path === "string" ? evt.context.path : "";
          if (!path) return;
          setModel((m) => safeSetPointer(m, path, evt.context.value as JsonValue));
          return;
        }

        // The `localAction` extension: fires alongside the server event, not
        // instead of it. kill_switch is the only component that needs both.
        const runLocal = (call: string, args: Record<string, unknown> | undefined) => {
          const fn = Object.prototype.hasOwnProperty.call(locals, call)
            ? locals[call]
            : undefined;
          fn?.({ ...resolveContext(args, model), ...evt.context });
        };

        if (c.localAction?.call) runLocal(c.localAction.call, c.localAction.args);

        const action = c.action;
        if (action && "functionCall" in action && action.functionCall.call) {
          runLocal(action.functionCall.call, action.functionCall.args);
          return; // a pure Local Function Call never becomes a server event
        }

        const declared = action && "event" in action ? action.event : undefined;
        const name = evt.name || declared?.name || "";
        if (!name) return;

        onAction?.({
          version: A2UI_VERSION,
          action: {
            name,
            surfaceId,
            sourceComponentId: c.id,
            timestamp: new Date().toISOString(),
            context: {
              ...resolveContext(declared?.context, model),
              ...evt.context,
            } as Record<string, JsonValue>,
          },
        });
      },
    [locals, model, onAction, surfaceId],
  );

  const present = useMemo(() => {
    const s = new Set<ComponentName>();
    for (const c of surface?.components ?? []) s.add(c.component);
    return s;
  }, [surface]);

  if (!surface) {
    return <EmptySurface reason="no createSurface message — nothing to render" issues={validation.issues} />;
  }
  if (surface.ordered.length === 0) {
    return <EmptySurface reason="surface has no components" issues={validation.issues} />;
  }

  const missing =
    tier === "autonomous" ? REQUIRED_FOR_AUTONOMOUS.filter((n) => !present.has(n)) : [];

  const errors = validation.issues.filter((i) => i.level === "error");

  return (
    <RuntimeProvider tier={tier} policy={policy} spentUsd={spentUsd} live={streaming && !halted}>
      <div className={cn("flex min-w-0 flex-col gap-4", className)}>
        {errors.length > 0 ? <IssueList issues={errors} /> : null}

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          {surface.ordered.map((c, i) => {
            const payload = c.data ? resolveBindings(c.data, model) : undefined;
            const base: Record<string, unknown> =
              payload && typeof payload === "object" && !Array.isArray(payload)
                ? (payload as Record<string, unknown>)
                : payload === undefined
                  ? {}
                  : { value: payload };

            // What the component sees: its precomputed block payload plus the
            // advisory presentation hints and the resolved `disabled` flag.
            const data = {
              ...base,
              hints: c.hints,
              disabled: c.disabled === undefined ? undefined : resolveBoolean(c.disabled, model),
            };

            const label = resolveString(c.label, model) ?? undefined;
            const caption = resolveString(c.caption, model);
            const Component = lookupCatalog(c.component);

            return (
              <div
                key={c.id}
                className={cn("flex min-w-0 flex-col gap-1", spanClass(c.hints?.span))}
              >
                {Component ? (
                  <Component
                    id={c.id}
                    data={data}
                    label={label}
                    onAction={makeDispatch(c)}
                    index={i}
                  />
                ) : (
                  <UnknownComponent id={c.id} name={c.component} index={i} />
                )}
                {caption ? (
                  // Provenance, not decoration: why this panel exists.
                  <p className="px-0.5 text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
                    {caption}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {missing.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Label className="text-loss">
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
                halted={halted}
                onAction={(evt) =>
                  onAction?.({
                    version: A2UI_VERSION,
                    action: {
                      name: evt.name || "halt_agent",
                      surfaceId,
                      sourceComponentId: `client:${name}`,
                      timestamp: new Date().toISOString(),
                      context: evt.context as Record<string, JsonValue>,
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
 * Validation failures are shown, never swallowed. A blank panel in a demo reads
 * as a broken renderer; a named issue reads as a broken document, which is the
 * truth and is actionable.
 */
function IssueList({ issues }: { issues: A2UIValidationIssue[] }) {
  return (
    <div className="panel border-loss p-3">
      <Label className="text-loss">document rejected {issues.length} thing(s)</Label>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {issues.slice(0, 6).map((i, n) => (
          <li key={n}>
            <Fig size="xs" className="text-[var(--muted-ink)]">
              {i.code}
              {i.componentId ? ` · ${i.componentId}` : ""} — {i.message}
            </Fig>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The three components an autonomous app must show, rendered by the client when
 * the document omits them. An explicit switch rather than a registry lookup:
 * this is the safety floor and it should read as one.
 */
function RequiredComponent({
  name,
  index,
  policy,
  spentUsd,
  journal,
  halted,
  onAction,
}: {
  name: ComponentName;
  index: number;
  policy: Policy | null;
  spentUsd: number;
  journal: JournalEntry[];
  halted: boolean;
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
        data={{ halted, scope: "app", event: "halt_agent" }}
        onAction={onAction}
        index={index}
      />
    );
  }
  return null;
}
