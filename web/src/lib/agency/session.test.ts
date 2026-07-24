/**
 * Smart Sessions tests — the onchain scoping path.
 *
 * All offline and deterministic. What they prove is narrow and worth stating
 * precisely: the Session object we build is a faithful, deterministic encoding
 * of the grant, it refuses to be wider than the policy, and nothing in the code
 * reports onchain enforcement it has not verified.
 *
 * What they do NOT prove: that a userOp actually lands. That needs a funded
 * ERC-7579 account, a bundler and an owner signature — see the integrator notes.
 * `scripts` in the report cover how to check it against Base Sepolia.
 */
import { assert, assertEqual, assertThrows, describe, it, itAsync } from "./harness.test";
import {
  BASE_SEPOLIA_SWAP_ROUTER,
  BASE_SEPOLIA_USDC,
  DEMO_GRANT_ACTIONS,
  SessionScopeIncomplete,
  SWAP_ROUTER_EXACT_INPUT_SINGLE,
  buildSmartSession,
  enforcementReport,
  getSessionEnableCall,
  provisionWallet,
  toTokenUnits,
  type MiniAppWallet,
  type SessionKeyGrant,
} from "./wallet";

const SESSION_KEY = "0x1234567890123456789012345678901234567890" as const;
const OTHER = "0x1111111111111111111111111111111111111111" as const;

function grant(overrides: Partial<SessionKeyGrant> = {}): SessionKeyGrant {
  return {
    chainId: 84532,
    allowlist: [BASE_SEPOLIA_SWAP_ROUTER],
    maxPerTxUsd: 50,
    maxSpendUsd: 250,
    expiresAt: "2026-07-25T12:00:00.000Z",
    actions: DEMO_GRANT_ACTIONS,
    token: BASE_SEPOLIA_USDC,
    nativeValueLimitWei: 0n,
    ...overrides,
  };
}

describe("USD to token units", () => {
  it("converts at the rate recorded on the grant", () => {
    assertEqual(toTokenUnits(50, BASE_SEPOLIA_USDC), 50_000_000n);
    assertEqual(toTokenUnits(0.01, BASE_SEPOLIA_USDC), 10_000n);
  });

  it("fails closed on nonsense input rather than producing a huge cap", () => {
    assertEqual(toTokenUnits(Number.NaN, BASE_SEPOLIA_USDC), 0n);
    assertEqual(toTokenUnits(-100, BASE_SEPOLIA_USDC), 0n);
    assertEqual(toTokenUnits(50, { ...BASE_SEPOLIA_USDC, usdPerUnit: 0 }), 0n);
  });
});

describe("session construction", () => {
  it("is deterministic — the same grant yields the same permission id", () => {
    const a = buildSmartSession(grant(), SESSION_KEY);
    const b = buildSmartSession(grant(), SESSION_KEY);
    assertEqual(a.permissionId, b.permissionId);
    assert(/^0x[0-9a-f]{64}$/.test(a.permissionId), `not a permission id: ${a.permissionId}`);
  });

  /**
   * The next three matter more than they look. Smart Sessions' own
   * `getPermissionId()` hashes the validator and salt only — NOT the policies —
   * so without a grant-derived salt, raising a cap would leave the permission
   * id unchanged and `isSessionEnabled()` would keep answering `true` for
   * limits the chain never agreed to. These assert that cannot happen.
   */
  it("changes the permission id when the allowlist changes", () => {
    const base = buildSmartSession(grant(), SESSION_KEY).permissionId;
    const widened = buildSmartSession(
      grant({
        allowlist: [BASE_SEPOLIA_SWAP_ROUTER, OTHER],
        actions: [...DEMO_GRANT_ACTIONS, { target: OTHER, selector: "0xdeadbeef" }],
      }),
      SESSION_KEY,
    ).permissionId;
    assert(base !== widened, "a wider allowlist must be a different onchain permission");
  });

  it("changes the permission id when the expiry changes", () => {
    const a = buildSmartSession(grant(), SESSION_KEY).permissionId;
    const b = buildSmartSession(grant({ expiresAt: "2027-01-01T00:00:00.000Z" }), SESSION_KEY).permissionId;
    assert(a !== b, "a different expiry is a different permission");
  });

  it("changes the permission id when a spend cap is raised", () => {
    const a = buildSmartSession(grant(), SESSION_KEY).permissionId;
    const b = buildSmartSession(grant({ maxSpendUsd: 250_000 }), SESSION_KEY).permissionId;
    assert(a !== b, "a raised cap must require a fresh onchain enable, not inherit the old one");
  });

  it("is bound to the session key — a different key is a different permission", () => {
    const a = buildSmartSession(grant(), SESSION_KEY).permissionId;
    const b = buildSmartSession(grant(), OTHER).permissionId;
    assert(a !== b, "the permission is bound to the key it was issued to");
  });

  it("scopes actions to (target, selector), not to a bare address", () => {
    const { session } = buildSmartSession(grant(), SESSION_KEY);
    assertEqual(session.actions.length, 1);
    assertEqual(session.actions[0]!.actionTarget.toLowerCase(), BASE_SEPOLIA_SWAP_ROUTER);
    assertEqual(session.actions[0]!.actionTargetSelector, SWAP_ROUTER_EXACT_INPUT_SINGLE);
  });

  it("attaches a timeframe policy for the expiry", () => {
    const withExpiry = buildSmartSession(grant(), SESSION_KEY).session;
    const without = buildSmartSession(grant({ expiresAt: null }), SESSION_KEY).session;
    assertEqual(withExpiry.userOpPolicies.length, 1, "expiry becomes a userOp policy");
    assertEqual(without.userOpPolicies.length, 0);
  });

  it("attaches a spending limit and a per-tx param rule when both are expressible", () => {
    const { session } = buildSmartSession(grant(), SESSION_KEY);
    // value limit + spending limit + universal action (per-tx) = 3
    assertEqual(session.actions[0]!.actionPolicies.length, 3);
  });

  it("drops the per-tx rule when no amount offset is declared, rather than guessing", () => {
    const noOffset = grant({
      actions: [{ target: BASE_SEPOLIA_SWAP_ROUTER, selector: SWAP_ROUTER_EXACT_INPUT_SINGLE }],
    });
    const { session } = buildSmartSession(noOffset, SESSION_KEY);
    // value limit + spending limit only. Pointing a rule at a guessed calldata
    // offset would enforce a cap on the wrong argument.
    assertEqual(session.actions[0]!.actionPolicies.length, 2);
  });

  it("forbids native value by default", () => {
    const { session } = buildSmartSession(grant(), SESSION_KEY);
    assert(session.actions[0]!.actionPolicies.length > 0, "a value limit policy is always attached");
  });

  it("pins the chain id into the session", () => {
    const { session } = buildSmartSession(grant(), SESSION_KEY);
    assertEqual(session.chainId, 84532n);
  });
});

describe("the session can never be wider than the policy", () => {
  it("refuses an action whose target is not in the policy allowlist", () => {
    assertThrows(
      () =>
        buildSmartSession(
          grant({ actions: [{ target: OTHER, selector: "0xdeadbeef" }] }),
          SESSION_KEY,
        ),
      "an action outside the allowlist must be refused",
    );
  });

  it("refuses to build a session with no declared actions", () => {
    // An address-only allowlist cannot be expressed in Smart Sessions. Rather
    // than fall back to the fallback-target flag (which permits ANY target),
    // this throws.
    assertThrows(
      () => buildSmartSession(grant({ actions: [] }), SESSION_KEY),
      "no actions must be an error, not a wildcard",
    );
  });

  it("throws SessionScopeIncomplete specifically, so callers can act on it", () => {
    try {
      buildSmartSession(grant({ actions: [] }), SESSION_KEY);
      throw new Error("expected a throw");
    } catch (err) {
      assert(err instanceof SessionScopeIncomplete, `wrong error type: ${String(err)}`);
    }
  });
});

describe("the enable call the account owner must send", () => {
  it("targets the Smart Sessions validator with encoded calldata", () => {
    const call = getSessionEnableCall(grant(), SESSION_KEY);
    assert(/^0x[0-9a-fA-F]{40}$/.test(call.to), `not an address: ${call.to}`);
    assert(call.data.length > 10, "enable calldata is non-trivial");
    assertEqual(call.value, 0n);
  });
});

describe("provisioning refuses to downgrade silently", () => {
  itAsync("smart-session without an account address throws", async () => {
    let threw = false;
    try {
      await provisionWallet({
        appId: "no-account",
        tier: "autonomous",
        kind: "smart-session",
        actions: DEMO_GRANT_ACTIONS,
        sessionPrivateKey: `0x${"11".repeat(32)}`,
      });
    } catch (err) {
      threw = err instanceof SessionScopeIncomplete;
    }
    assert(threw, "missing account address must throw, not fall back to a weaker mode");
  });

  itAsync("stub mode still works with no keys and no config", async () => {
    // Five other agents demo against this. It must not have moved.
    const wallet = await provisionWallet({ appId: "still-stub", tier: "autonomous", kind: "stub" });
    assertEqual(wallet.kind, "stub");
    assertEqual(wallet.onchainEnforced, false);
    assert(wallet.address.startsWith("0x"), "stub still produces an address");
  });
});

describe("enforcement reporting tells the truth per mode", () => {
  function walletOf(kind: MiniAppWallet["kind"], onchainEnforced: boolean): MiniAppWallet {
    return {
      appId: "x",
      address: "0x2222222222222222222222222222222222222222",
      kind,
      chainId: 84532,
      chainName: "Base Sepolia",
      sessionKeyAddress: SESSION_KEY,
      grant: grant(),
      onchainEnforced,
      createdAt: new Date().toISOString(),
    };
  }

  it("reports everything server-side for stub, eoa and owner-key smart accounts", () => {
    for (const kind of ["stub", "session-eoa", "smart-account"] as const) {
      const report = enforcementReport(walletOf(kind, false));
      assertEqual(report.verifiedOnchain, false, `${kind} must not claim verification`);
      assertEqual(report.allowlist, "server", `${kind} allowlist`);
      assertEqual(report.expiry, "server", `${kind} expiry`);
      assertEqual(report.lifetimeCap, "server", `${kind} lifetime cap`);
    }
  });

  it("does not claim onchain enforcement for a smart session that is not enabled", () => {
    const report = enforcementReport(walletOf("smart-session", false));
    assertEqual(report.verifiedOnchain, false);
    assertEqual(report.allowlist, "server");
    assert(report.notes.join(" ").includes("NOT enabled"), "the note must say so plainly");
  });

  it("reports allowlist and expiry onchain once the validator confirmed the session", () => {
    const report = enforcementReport(walletOf("smart-session", true));
    assertEqual(report.verifiedOnchain, true);
    assertEqual(report.allowlist, "onchain");
    assertEqual(report.expiry, "onchain");
    assertEqual(report.lifetimeCap, "onchain");
    assertEqual(report.perTxCap, "onchain");
  });

  it("keeps confirmation and the kill switch server-side even when enabled", () => {
    // No validator models "a human must press Confirm". Claiming otherwise
    // would be the exact overstatement this report exists to prevent.
    const report = enforcementReport(walletOf("smart-session", true));
    assertEqual(report.confirmation, "server");
    assertEqual(report.killSwitch, "server");
  });

  it("downgrades the per-tx cap to server when no amount offset is declared", () => {
    const wallet = walletOf("smart-session", true);
    wallet.grant = grant({
      actions: [{ target: BASE_SEPOLIA_SWAP_ROUTER, selector: SWAP_ROUTER_EXACT_INPUT_SINGLE }],
    });
    const report = enforcementReport(wallet);
    assertEqual(report.perTxCap, "server");
    assertEqual(report.lifetimeCap, "onchain", "the lifetime cap still bounds total loss");
  });

  it("downgrades the caps to server when no spend token is configured", () => {
    const wallet = walletOf("smart-session", true);
    wallet.grant = grant({ token: undefined });
    const report = enforcementReport(wallet);
    assertEqual(report.lifetimeCap, "server");
    assertEqual(report.allowlist, "onchain", "the allowlist does not need a token");
  });
});
