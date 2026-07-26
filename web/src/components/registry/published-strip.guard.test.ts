/**
 * The Published names strip must not carry a list of names.
 *
 * This is a test and not a comment because the thing it prevents already
 * happened: the component shipped with a literal array of five labels while
 * the contract held nine entries and contracts/deployments/ens-sepolia.json
 * held eight. The list is easy to reintroduce — a "temporary" fallback during
 * an RPC outage is the obvious way — and impossible to notice once it is
 * there, because a stale list renders exactly like a fresh one.
 *
 * Path is relative to `web/`, which is where the suite runs from —
 * `pnpm dlx tsx src/lib/agency/all.test.ts`.
 *
 * `aave-guard-fork` is deliberately absent from the list below: the component's
 * doc comment names it while explaining why a name with no registry entry does
 * not appear on the strip. Prose about an incident is not a list of what to
 * render, and this guard is about the latter.
 */
import { readFileSync } from "node:fs";
import { assert, describe, it } from "@/lib/kit/testing";

const SOURCE = readFileSync("src/components/registry/published-strip.tsx", "utf8");

describe("published-strip has no baked-in names", () => {
  it("does not name any of the labels it used to hardcode", () => {
    for (const label of [
      "atlas-market-guard",
      "durable-market-guard",
      "attested-market-guard",
      "wallet-bound-guard",
      "aave-health-guard",
      "rebalance-arbitrum-dex",
      "lineage-fallback-probe",
    ]) {
      assert(!SOURCE.includes(label), `${label} must not appear in the component`);
    }
  });

  it("does not mention the parent domain", () => {
    // The parent comes from the server, which reads it from config. A literal
    // here would survive a rebrand the way the last one did.
    assert(!SOURCE.includes("atlas-apps.eth"), "no parent literal");
    assert(!SOURCE.includes("graphminis.eth"), "no retired parent literal");
  });

  it("reads its list from the registry route", () => {
    assert(SOURCE.includes("/api/registry/published"), "the strip must call the enumeration route");
  });
});
