"use client";

/**
 * Point an agent at this mini app.
 *
 * The URL a published app writes into its `agent-endpoint[mcp]` ENS record is
 * not a description of a server — it *is* the server, live, six read-only
 * tools. The landing page has said so since W11; the board never did, so the
 * one place you are actually looking at a running app was the one place that
 * did not tell you how to reach it from your own client. This is that endpoint,
 * the config block you paste into one, and the call that resolves *this* app by
 * name.
 *
 * The tool list is `MCP_TOOLS` — the same array `/api/mcp` answers `tools/list`
 * from — so this panel cannot drift from the server it is advertising.
 *
 * Read-only is stated here rather than assumed, for the same reason the route
 * says it: an MCP endpoint is a URL strangers point agents at, so what it
 * cannot do is the most important thing about it.
 */

import { Plug } from "lucide-react";
import { CopyButton, CopyField, HeaderPopover, useOrigin } from "@/components/board/header-popover";
import { MCP_TOOLS } from "@/lib/mcp-tools";

/** What you paste into a client's `mcpServers` map. */
function clientConfig(endpoint: string): string {
  return JSON.stringify({ mcpServers: { atlas: { type: "http", url: endpoint } } }, null, 2);
}

/** The call that returns this app's manifest, wallet, and Agentic ID. */
function resolveCall(name: string): string {
  return JSON.stringify({ tool: "resolve_mini_app", arguments: { name } }, null, 2);
}

export function McpButton({ name }: { name: string | null }): React.JSX.Element {
  const origin = useOrigin();
  const endpoint = origin ? `${origin}/api/mcp` : "";

  return (
    <HeaderPopover
      icon={<Plug className="h-4 w-4" aria-hidden />}
      label="MCP endpoint"
      title="Reach this mini app from an agent"
      disabled={!endpoint}
      // Wider than the share panel — it holds a config block — and capped so a
      // long tool list scrolls inside the panel rather than off the screen.
      panelClassName="max-h-[70vh] overflow-y-auto sm:w-[min(26rem,calc(100vw-2rem))]"
    >
      <p className="mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
        MCP endpoint · read-only
      </p>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--muted-ink)]">
        The URL every published app writes into its{" "}
        <span className="fig">agent-endpoint[mcp]</span> ENS record. Stateless Streamable HTTP, one
        JSON-RPC message per POST.
      </p>

      <div className="mt-2">
        <CopyField value={endpoint} label="MCP endpoint URL" />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <CopyButton value={endpoint} label="Copy endpoint" className="flex-1" />
        <CopyButton value={clientConfig(endpoint)} label="Copy config" className="flex-1" />
      </div>

      <pre className="mono mt-2 overflow-x-auto rounded-lg border border-hairline bg-[var(--card-b)] p-2 text-[0.625rem] leading-relaxed">
        <code>{clientConfig(endpoint)}</code>
      </pre>

      {name ? (
        <>
          <p className="mono mt-3 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
            This app, by name
          </p>
          <pre className="mono mt-2 overflow-x-auto rounded-lg border border-hairline bg-[var(--card-b)] p-2 text-[0.625rem] leading-relaxed">
            <code>{resolveCall(name)}</code>
          </pre>
          <div className="mt-2">
            <CopyButton value={resolveCall(name)} label="Copy call" className="w-full" />
          </div>
        </>
      ) : null}

      <p className="mono mt-3 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
        {MCP_TOOLS.length} tools
      </p>
      <ul className="mono mt-2 space-y-1 text-[0.625rem] text-[var(--muted-ink)]">
        {MCP_TOOLS.map((tool) => (
          <li key={tool.name} className="truncate">
            {tool.name}
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-hairline pt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        Nothing here signs or spends. <span className="fig">/api/act</span> owns the action loop and
        reads its policy server-side.
      </p>
    </HeaderPopover>
  );
}
