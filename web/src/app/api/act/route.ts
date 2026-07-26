/**
 * W6 — THE ACTION ENDPOINT.
 *
 * Receives an A2UI server event (a Button the user pressed) or a stream signal
 * (a trigger firing), runs the policy gate, signs if allowed, and journals
 * either way.
 *
 * What this endpoint will NOT accept from the caller:
 *   - a policy. Caps, allowlists and expiry are read from the server-side app
 *     registry. A client that could post its own policy would be a client that
 *     could raise its own spending limit.
 *   - a target. The contract to call comes from the manifest action, never from
 *     the request body.
 * An amount may come from the request, because the per-tx and lifetime caps
 * bound it no matter what the caller asks for.
 *
 * A policy rejection is a 200 with `allowed: false`. It is an expected outcome
 * of a working system, not a transport error, and the journal entries it
 * produced are part of the response.
 *
 * INTEGRATOR RESPONSIBILITY, stated plainly: `userInitiated` and `confirmed`
 * arrive in the request body, so a hostile client can set them. Today they are
 * taken at face value. Before this is exposed to the internet, verify the Privy
 * auth token on this route and derive both flags from the authenticated
 * session, not from the payload. Note what they can and cannot buy an attacker:
 * they only satisfy the confirmation check. Caps, allowlist, expiry and the
 * kill switch are read from the server-side registry and are unreachable from
 * here.
 *
 * WHY THIS ENDPOINT CAN 404 AN APP THAT IS DEFINITELY PUBLISHED, and why that
 * 404 is the correct answer rather than a bug to paper over. The registry it
 * reads is an in-memory `Map` on `globalThis` (`lib/agency/wallet.ts`), so it is
 * scoped to ONE server process. On Vercel the `POST /api/agency/register` that
 * seeded the app and the `POST /api/act` that follows it can land on different
 * serverless instances, and the second instance has never heard of the app. In
 * `pnpm dev` this never reproduces — one process — which is why it went
 * undisclosed until now.
 *
 * The tempting repair is to let this route accept a manifest and provision from
 * it on the spot. That is the one thing the list above refuses: a caller that can
 * attach a policy to the request that spends is a caller that sets its own
 * spending limit. Failing loudly is therefore the answer, and the 404 body now
 * carries `registry` (`registryScope()`, with a per-process `instanceId`) and an
 * explicit `recover` string, so the caller is told exactly what to do instead of
 * guessing. `lib/store.ts` already does it: on a 404 it re-POSTs the manifest to
 * `/api/agency/register` — a separate, explicit, first-write-wins call — and
 * retries once.
 *
 * `demo` is the exception and it is not a special case, it is the rule working:
 * its policy is a server-side constant, so `ensureDemoApp` can rebuild the exact
 * grant on a cold instance with nothing taken from the caller.
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { getJournal } from "@/lib/agency/journal";
import { runAction } from "@/lib/agency/signer";
import { runTriggers, type TriggerSignal } from "@/lib/agency/triggers";
import {
  enforcementReport,
  ensureDemoApp,
  getApp,
  haltApp,
  registryScope,
  resumeApp,
} from "@/lib/agency/wallet";
import type { AgencyProposedAction } from "@/lib/agency/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A2UI client_to_server: an event name plus a resolved context object. */
const zServerEvent = z.object({
  name: z.string().min(1).max(64),
  context: z.record(z.string(), z.unknown()).default({}),
});

const zSignal = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(["stream", "interval", "manual"]),
  at: z.string().datetime().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

const zBody = z.object({
  appId: z.string().min(1).max(64),
  /** A human pressed a Button. */
  event: zServerEvent.optional(),
  /** A Substreams tick / timer / manual poke arrived. */
  signal: zSignal.optional(),
  /** The kill switch, and its counterpart. */
  control: z.enum(["halt", "resume"]).optional(),
  /** True when this came from a user gesture. Never trusted on its own — the
   *  policy still requires the app to be allowed to act at all. */
  userInitiated: z.boolean().default(false),
  /** A human explicitly approved an action a trigger proposed. */
  confirmed: z.boolean().default(false),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * The "unknown mini app" 404, with the one thing it never used to carry: what
 * the caller should do about it.
 *
 * It used to be a bare `{ ok: false, error: 'Unknown mini app "x"' }`, which
 * reads as "you asked for something that does not exist" — and on a serverless
 * deployment that is very often not what happened. What happened is that this
 * instance is not the instance the app was registered on. THIS PROCESS CANNOT
 * TELL THE TWO APART: from in here, an app id that was never registered and an
 * app registered on a sibling instance are the same absence, and saying so is
 * more useful than picking one. `registry.instanceId` is what lets a client that
 * remembers the id it saw at register time make the distinction the server
 * cannot.
 */
function unknownApp(appId: string, extra: Record<string, unknown> = {}): Response {
  return json(
    {
      ok: false,
      error: `Unknown mini app "${appId}"`,
      recover:
        "This server instance has no registration for that app. It cannot distinguish " +
        "'never registered' from 'registered on another instance'. POST the manifest to " +
        "/api/agency/register, then retry this call. A policy will never be read from this " +
        "request body, which is why recovery has to be a separate, explicit call.",
      registry: registryScope(),
      ...extra,
    },
    404,
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Body must be JSON" }, 400);
  }

  const parsed = zBody.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid request", issues: parsed.error.issues }, 400);
  }
  const body = parsed.data;

  // Seed the demo app so a cold start is demoable with no configuration.
  if (body.appId === "demo") await ensureDemoApp("demo");

  const app = getApp(body.appId);
  if (!app) return unknownApp(body.appId);

  const store = getJournal();

  /* ---- kill switch ---------------------------------------------- */
  if (body.control) {
    const changed = body.control === "halt" ? haltApp(body.appId) : resumeApp(body.appId);
    await store.append(body.appId, {
      kind: "POLICY",
      message: body.control === "halt" ? "KILL SWITCH TRIPPED — all actions blocked" : "Kill switch reset",
      ok: body.control === "resume",
    });
    return json({
      ok: changed,
      halted: app.agency.policy.halted,
      entries: await store.list(body.appId, 20),
    });
  }

  /* ---- trigger path --------------------------------------------- */
  if (body.signal) {
    const signal: TriggerSignal = {
      id: body.signal.id,
      kind: body.signal.kind,
      at: body.signal.at ? new Date(body.signal.at) : new Date(),
      data: body.signal.data,
    };
    const runs = await runTriggers({
      appId: body.appId,
      agency: app.agency,
      wallet: app.wallet,
      signal,
    });
    return json({
      ok: true,
      fired: runs.filter((r) => r.firing.fired).length,
      runs: runs.map((r) => ({
        trigger: r.firing.triggerKey,
        fired: r.firing.fired,
        reason: r.firing.reason,
        allowed: r.result?.decision.allowed ?? false,
        rejection: r.result && !r.result.decision.allowed ? r.result.decision : undefined,
        txHash: r.result?.txHash,
        simulated: r.result?.simulated,
      })),
      entries: await store.list(body.appId, 50),
    });
  }

  /* ---- A2UI server event path ------------------------------------ */
  if (!body.event) {
    return json({ ok: false, error: "Provide one of: event, signal, control" }, 400);
  }

  const action = app.agency.actions[body.event.name];
  if (!action) {
    await store.append(body.appId, {
      kind: "ERROR",
      message: `Unknown action "${body.event.name}" — not declared in this manifest`,
      ok: false,
    });
    return json(
      { ok: false, error: `Unknown action "${body.event.name}"`, entries: await store.list(body.appId, 20) },
      404,
    );
  }

  // Amount: from the event context when the UI supplied one, else the amount
  // declared in the manifest, else Infinity so the per-tx cap rejects it.
  const contextAmount = body.event.context["amountUsd"];
  const declaredAmount = action.params?.["amountUsd"];
  const amountUsd =
    typeof contextAmount === "number" && Number.isFinite(contextAmount)
      ? contextAmount
      : typeof declaredAmount === "number" && Number.isFinite(declaredAmount)
        ? declaredAmount
        : Number.POSITIVE_INFINITY;

  const proposed: AgencyProposedAction = {
    actionKey: body.event.name,
    action,
    // Target comes from the manifest. Not from the request. Not negotiable.
    target: action.target ?? "",
    amountUsd,
    userInitiated: body.userInitiated,
    confirmed: body.confirmed,
  };

  const result = await runAction({
    appId: body.appId,
    proposed,
    agency: app.agency,
    wallet: app.wallet,
    store,
    source: "a2ui",
  });

  return json({
    ok: result.executed,
    allowed: result.decision.allowed,
    rejection: result.decision.allowed ? undefined : result.decision,
    txHash: result.txHash,
    error: result.error,
    simulated: result.simulated,
    enforcement: result.enforcement,
    spentUsd: result.spentUsd,
    remainingUsd: Math.max(0, app.agency.policy.maxSpendUsd - result.spentUsd),
    entries: await store.list(body.appId, 50),
  });
}

/** The trade log, for the on-screen journal. */
export async function GET(request: NextRequest): Promise<Response> {
  const appId = request.nextUrl.searchParams.get("appId") ?? "demo";
  if (appId === "demo") await ensureDemoApp("demo");
  const app = getApp(appId);
  if (!app) return unknownApp(appId);

  const store = getJournal();
  const entries = await store.list(appId);
  const spentUsd = await store.totalSpentUsd(appId);
  return json({
    ok: true,
    appId,
    tier: app.agency.tier,
    wallet: {
      address: app.wallet.address,
      kind: app.wallet.kind,
      chainId: app.wallet.chainId,
      chainName: app.wallet.chainName,
      sessionKeyAddress: app.wallet.sessionKeyAddress,
      onchainEnforced: app.wallet.onchainEnforced,
      permissionId: app.wallet.permissionId,
    },
    /** Per-constraint: chain or server. Render this next to the spend meter. */
    enforcement: enforcementReport(app.wallet),
    /**
     * Where the policy printed below actually lives. Every field in `policy` is
     * read out of a process-local Map, so a reader who takes this response as
     * durable state is wrong in a way that only shows up in production.
     */
    registry: registryScope(),
    policy: {
      maxPerTxUsd: app.agency.policy.maxPerTxUsd,
      maxSpendUsd: app.agency.policy.maxSpendUsd,
      allowlist: app.agency.policy.allowlist,
      expiresAt: app.agency.policy.expiresAt,
      requireConfirm: app.agency.policy.requireConfirm,
      halted: app.agency.policy.halted,
    },
    spentUsd,
    remainingUsd: Math.max(0, app.agency.policy.maxSpendUsd - spentUsd),
    entries,
  });
}
