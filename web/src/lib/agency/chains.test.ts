/**
 * CHAIN MAP TESTS — which network a mini app wallet is pointed at.
 *
 * These exist because of one wrong import. `SUPPORTED_CHAINS` used to map
 * `0g-galileo` to viem's `zeroGGalileoTestnet`, which is chain id 16601 — the
 * earlier Galileo V3 launch. Every 0G contract this project deployed is on
 * 16602. The two definitions share an RPC URL and a block explorer, so nothing
 * would have failed to connect; the only symptom would have been a signed
 * transaction rejected by the node for an unrecognisable chain id.
 *
 * A chain id is exactly the kind of constant that is never wrong until it is
 * catastrophically wrong, and the drift was between two files that agreed on
 * everything else. So the first test does not assert `16602` in isolation — it
 * asserts that the agency layer and `identity/agentic-id.ts` are reading the
 * SAME object, which is the property that stops it recurring.
 */
import { zeroGTestnet } from "../identity/agentic-id";
import { assert, assertEqual, assertThrows, describe, it } from "@/lib/kit/testing";
import { DEFAULT_CHAIN_KEY, SUPPORTED_CHAINS, resolveChain } from "./wallet";

describe("supported chains", () => {
  it("points 0g-galileo at the chain the contracts are actually on", () => {
    const zeroG = SUPPORTED_CHAINS["0g-galileo"];
    assertEqual(zeroG.id, 16602, "0G Galileo is 16602; 16601 is the earlier V3 launch");
    assert(
      zeroG === zeroGTestnet,
      "must be the SAME object identity/agentic-id.ts exports — a copy would drift again",
    );
  });

  it("does not carry viem's 16601 definition by any other name", () => {
    // Belt and braces: the id above could be right while the currency came from
    // the wrong object. viem's 16601 entry calls the native token A0GI; the live
    // network calls it 0G.
    assertEqual(SUPPORTED_CHAINS["0g-galileo"].nativeCurrency.symbol, "0G");
  });

  it("refuses anything that is not a declared testnet", () => {
    for (const [key, chain] of Object.entries(SUPPORTED_CHAINS)) {
      assertEqual(chain.testnet, true, `${key} must declare testnet: true`);
    }
    assertThrows(() => resolveChain("mainnet"), "an unknown key must throw MainnetRefused");
    assertThrows(() => resolveChain("ethereum"), "and so must a plausible-looking one");
  });

  it("resolves each key to its own chain", () => {
    assertEqual(resolveChain("0g-galileo").id, 16602);
    assertEqual(resolveChain("base-sepolia").id, 84532);
  });

  it("still defaults to Base Sepolia, which is what actually signs today", () => {
    // Pins the honest scope of the 16601→16602 correction: the 0G entry is
    // reachable only by setting NEXT_PUBLIC_AGENCY_CHAIN, and nothing sets it, so
    // `session-eoa` provisions on Base Sepolia and `POST /api/agency/register`
    // returns chainId 84532 for every app. Skipped rather than failed when the
    // env var IS set — a developer pointing the stack at 0G on purpose is not a
    // regression, and asserting on their machine would just be wrong.
    assertEqual(DEFAULT_CHAIN_KEY, "base-sepolia");
    if (process.env.NEXT_PUBLIC_AGENCY_CHAIN) return;
    assertEqual(resolveChain().id, 84532, "the default signing chain is Base Sepolia");
  });
});
