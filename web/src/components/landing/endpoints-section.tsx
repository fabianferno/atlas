/**
 * Where to point an agent, and where to read the code.
 *
 * The tool table renders `MCP_TOOLS` — the same array `/api/mcp` answers
 * `tools/list` from. Parity with the server is therefore a compile-time
 * property rather than a promise, which is the whole reason that array was
 * lifted out of the route.
 */
import Link from "next/link";
import { SectionHead } from "@/components/board/chrome";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { ENS_PARENT } from "./facts";

export function EndpointsSection() {
  return (
    <section className="py-16 sm:py-24">
      <SectionHead title="Reachable by an agent" note="read-only by design" />

      <div className="mt-6 max-w-[52rem] space-y-4 text-sm leading-relaxed">
        <p>
          Every published mini app writes this URL into its{" "}
          <span className="fig">agent-endpoint[mcp]</span> ENS record. Stateless Streamable HTTP, one
          JSON-RPC message per POST.
        </p>

        <pre className="mono overflow-x-auto rounded-[var(--radius)] border border-hairline bg-[var(--card-b)] p-4 text-xs">
          <code>{`{ "mcpServers": { "atlas": { "type": "http", "url": "<origin>/api/mcp" } } }`}</code>
        </pre>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-hairline">
                <th className="mono py-2 pr-4 align-top text-[0.625rem] uppercase tracking-[0.08em] font-normal text-[var(--muted-ink)]">
                  Tool
                </th>
                <th className="mono py-2 align-top text-[0.625rem] uppercase tracking-[0.08em] font-normal text-[var(--muted-ink)]">
                  Does
                </th>
              </tr>
            </thead>
            <tbody>
              {MCP_TOOLS.map((tool) => (
                <tr key={tool.name} className="border-b border-hairline align-top">
                  <td className="mono whitespace-nowrap py-2 pr-4">{tool.name}</td>
                  {/* First sentence only: these descriptions are written for a
                      model deciding whether to call the tool, and some run to a
                      paragraph. The server still serves them whole. */}
                  <td className="py-2 leading-relaxed text-[var(--muted-ink)]">
                    {tool.description.split(". ")[0]}.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[var(--muted-ink)]">
          Nothing here signs or spends. <span className="fig">/api/act</span> owns the action loop
          and reads its policy server-side, because an MCP endpoint is a URL strangers point agents
          at.
        </p>

        <ul className="mono mt-6 space-y-2 border-t border-hairline pt-4 text-[0.6875rem]">
          <li>
            ENS parent · <span className="fig">{ENS_PARENT}</span>
          </li>
          <li>
            Browse the registry ·{" "}
            <Link href="/registry" className="underline underline-offset-2">
              /registry
            </Link>{" "}
            — describe a new one in the Studio there
          </li>
          <li>
            Source ·{" "}
            <a
              href="https://github.com/fabianferno/atlas"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              github.com/fabianferno/atlas
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
