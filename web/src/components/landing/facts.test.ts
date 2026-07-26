/**
 * The landing page prints numbers. This asserts they come from the code that
 * holds them rather than from a copy-paste of the README, so a `pnpm seed:live`
 * re-run that changes a count changes the page too instead of silently making
 * it wrong.
 */
import { describe, it, assert, assertEqual } from "@/lib/kit/testing";
import { SOURCE_REGISTRY } from "@/lib/kit/sources";
import { LIVE_SEED_COUNT, SEED_DECLARED_COUNT, SEED_DROPPED } from "@/lib/seed";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { ENS_PARENT, ONCHAIN, REGISTRY, SEED, SUBSTREAMS, ZEROG } from "./facts";

describe("landing facts", () => {
  it("counts registry entries off SOURCE_REGISTRY, not a constant", () => {
    assertEqual(REGISTRY.entries, SOURCE_REGISTRY.length);
    assertEqual(
      REGISTRY.verified,
      SOURCE_REGISTRY.filter((e) => e.verification === "verified").length,
    );
    assert(REGISTRY.verified < REGISTRY.entries, "placeholders exist, so verified is a subset");
  });

  it("counts schema families declared and live separately", () => {
    assertEqual(REGISTRY.familiesDeclared, new Set(SOURCE_REGISTRY.map((e) => e.schema)).size);
    assert(
      REGISTRY.familiesLive <= REGISTRY.familiesDeclared,
      "a family cannot be live without being declared",
    );
  });

  it("lists only networks that have a verified deployment", () => {
    assert(REGISTRY.networks.length > 0, "some network is covered");
    for (const n of REGISTRY.networks) {
      assert(
        SOURCE_REGISTRY.some((e) => e.network === n && e.verification === "verified"),
        `network ${n} has a verified deployment`,
      );
    }
  });

  it("reads seed coverage off the snapshot", () => {
    assertEqual(SEED.live, LIVE_SEED_COUNT);
    assertEqual(SEED.declared, SEED_DECLARED_COUNT);
    assertEqual(SEED.dropped.length, SEED_DROPPED.length);
    assert(SEED.totalCostUsd > 0, "the snapshot records what the run cost");
    // The regression guard above passes trivially while SEED_DROPPED is empty.
    // This constrains the relationship between the three counts instead: every
    // declared app is accounted for as either live or dropped, never both and
    // never neither, so a future snapshot that drops an app has to move it here
    // too or this fails.
    assertEqual(
      SEED.live + SEED.dropped.length,
      SEED.declared,
      "every declared app is either live or dropped, with no overlap and no gap",
    );
  });

  it("pins onchain constants in the shape they are claimed in", () => {
    assert(/^0x[0-9a-f]{64}$/i.test(ONCHAIN.txHash), "a 32-byte tx hash");
    assert(ONCHAIN.basescanUrl.includes(ONCHAIN.txHash), "the link points at the hash we print");
    assertEqual(ONCHAIN.kind, "approve");
    assert(ONCHAIN.arbitrumBlock > 0 && ONCHAIN.baseBlock > 0, "real block heights");
  });

  it("keeps the Substreams control run, which is the half that proves anything", () => {
    assert(
      SUBSTREAMS.breach.toBlock > SUBSTREAMS.breach.fromBlock,
      "the breach run spans forward",
    );
    assert(
      SUBSTREAMS.control.toBlock > SUBSTREAMS.control.fromBlock,
      "the control run spans forward",
    );
    assertEqual(SUBSTREAMS.control.firings, 0);
    assertEqual(SUBSTREAMS.breach.firings, 1);
  });

  it("names the ENS parent and the 0G identity", () => {
    assert(ENS_PARENT.endsWith(".eth"), "a real ENS name");
    assertEqual(ZEROG.chainId, 16602);
    assert(ZEROG.tokenId > 0, "a minted token");
  });
});

/**
 * The endpoints section renders this list. It is the same array `/api/mcp`
 * serves from `tools/list`, imported rather than retyped — the README proved
 * what retyping costs by tabulating five of these and omitting `check_coverage`
 * while its own footer said six. Parity with the server is therefore a
 * compile-time property; what is left to assert is that the list is fit to
 * render.
 */
describe("mcp tool list", () => {
  it("is non-empty and has unique names", () => {
    assert(MCP_TOOLS.length > 0, "the server advertises tools");
    assertEqual(new Set(MCP_TOOLS.map((t) => t.name)).size, MCP_TOOLS.length);
  });

  it("every tool describes itself, because the list is rendered on the landing", () => {
    for (const t of MCP_TOOLS) {
      assert(t.description.trim().length > 0, `${t.name} has a description`);
    }
  });

  it("still advertises check_coverage, the one the README dropped", () => {
    assert(
      MCP_TOOLS.some((t) => t.name === "check_coverage"),
      "check_coverage is served — the README table must list it",
    );
  });
});
