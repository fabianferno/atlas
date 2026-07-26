/**
 * W1 — transport to The Graph.
 *
 * Two transports, two reasons:
 *
 *   gateway  Fast and effectively free, but needs an API key. The key lives in
 *            the server process and nowhere else — see app/api/graph/route.ts.
 *   x402     Keyless. ~$0.01 USDC on Base per query, paid by the mini app's own
 *            wallet. This is what makes forking work: a fork cannot inherit the
 *            parent's API key, but it can inherit the ability to pay for itself.
 *
 * With no `GRAPH_API_KEY` present the whole module answers from fixtures, so
 * every consumer works before any key exists and switches to live the moment
 * one does. Nothing downstream needs to know which mode it is in.
 */
import type { DataPlan } from "../contracts/manifest";
import { fixtureFor, type FixtureHint } from "./fixtures";

export type Transport = DataPlan["transport"];

export const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_GRAPH_GATEWAY ?? "https://gateway.thegraph.com";

/** The Graph's published x402 price. Verified against a live 402 challenge:
 *  amount "10000" of USDC (6 decimals) on Base = $0.01. */
export const X402_COST_PER_QUERY_USD = 0.01;

/** Gateway queries are billed out of a plan, not per call. This is the blended
 *  rate we attribute per query so `costUsd` is never a lie by omission. */
export const GATEWAY_COST_PER_QUERY_USD = 0.0001;

export const DEFAULT_QUERY_TIMEOUT_MS = 8_000;

/** Base mainnet USDC — the asset the gateway's x402 facilitator settles in. */
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export interface GraphQueryOptions {
  subgraphId: string;
  query: string;
  variables?: Record<string, unknown>;
  transport?: Transport;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Ignored in live mode. Lets fixture mode name a deployment it has no
   *  hand-written row for, instead of emitting `0x9f2a…` as a protocol name. */
  fixtureHint?: FixtureHint;
}

export interface GraphQueryResult<T> {
  data: T | null;
  errors: string[];
  costUsd: number;
  elapsedMs: number;
  transport: Transport;
  /** False when the answer came from fixtures. Surface this in the UI — a demo
   *  that can't tell you whether it is live is worse than one that is not. */
  live: boolean;
}

/**
 * Live mode is a function of credentials, never of a flag someone can forget to
 * flip. `mcp` is not a query transport — the MCP server is for *discovery* — so
 * it resolves through the gateway.
 */
export function isLive(transport: Transport = "gateway"): boolean {
  if (transport === "x402") return Boolean(process.env.X402_PRIVATE_KEY);
  return Boolean(process.env.GRAPH_API_KEY);
}

export function graphEndpoint(subgraphId: string, transport: Transport = "gateway"): string {
  if (transport === "x402") {
    return `${GATEWAY_BASE}/api/x402/subgraphs/id/${subgraphId}`;
  }
  const key = process.env.GRAPH_API_KEY;
  return key
    ? `${GATEWAY_BASE}/api/${key}/subgraphs/id/${subgraphId}`
    : // Keyless read path. Heavily rate-limited, but it means a misconfigured
      // deploy degrades to "slow" rather than "broken".
      `${GATEWAY_BASE}/api/subgraphs/id/${subgraphId}`;
}

function costOf(transport: Transport): number {
  return transport === "x402" ? X402_COST_PER_QUERY_USD : GATEWAY_COST_PER_QUERY_USD;
}

/** AbortSignal.timeout is not reliably present across our runtime targets, and a
 *  timeout that silently does nothing is the worst possible failure here. */
function withTimeout(ms: number, outer?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${ms}ms`)), ms);
  const onOuterAbort = () => controller.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuterAbort);
    },
  };
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

interface GraphQLEnvelope<T> {
  data?: T;
  errors?: { message?: string }[];
}

/**
 * Execute one GraphQL query against one deployment.
 *
 * Never throws. Callers fan this out across dozens of sources and a rejection
 * anywhere would take the batch with it; the contract is that every failure
 * comes back as `{ data: null, errors: [...] }`.
 */
export async function graphQuery<T = Record<string, unknown>>(
  options: GraphQueryOptions,
): Promise<GraphQueryResult<T>> {
  const transport: Transport = options.transport ?? "gateway";
  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  const started = Date.now();

  if (!isLive(transport)) {
    const data = fixtureFor<T>(options.subgraphId, options.query, options.fixtureHint);
    return {
      data,
      errors: data === null ? ["no fixture for this subgraph/query"] : [],
      // Fixtures cost nothing. Reporting a fake spend would make the cost
      // readout untrustworthy exactly where it needs to be trusted.
      costUsd: 0,
      elapsedMs: Date.now() - started,
      transport,
      live: false,
    };
  }

  // `globalThis` rather than a bare `window`. The check is the same one — is
  // this running in a browser — but a bare `window` is a DOM global, and the
  // published package compiles against `lib: ["esnext"]` with no DOM, where the
  // identifier does not exist. It was the ONLY thing in the kit that assumed a
  // browser typing environment, and it surfaced the moment the package was
  // built on its own rather than inside the Next app's tsconfig.
  if (transport === "gateway" && typeof (globalThis as { window?: unknown }).window !== "undefined") {
    return {
      data: null,
      errors: ["gateway transport is server-only; call /api/graph from the client"],
      costUsd: 0,
      elapsedMs: Date.now() - started,
      transport,
      live: true,
    };
  }

  const { signal, done } = withTimeout(timeoutMs, options.signal);
  try {
    const body = JSON.stringify({ query: options.query, variables: options.variables ?? {} });
    const response =
      transport === "x402"
        ? await x402Fetch(graphEndpoint(options.subgraphId, "x402"), body, signal)
        : await fetch(graphEndpoint(options.subgraphId, transport), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal,
          });

    if (!response.ok) {
      return {
        data: null,
        errors: [`HTTP ${response.status} ${response.statusText}`],
        costUsd: 0,
        elapsedMs: Date.now() - started,
        transport,
        live: true,
      };
    }

    const envelope = (await response.json()) as GraphQLEnvelope<T>;
    const errors = (envelope.errors ?? []).map((x) => x.message ?? "unknown GraphQL error");
    return {
      data: envelope.data ?? null,
      errors,
      // The gateway bills a served response whether or not the query validated,
      // so cost is charged unless the request itself failed.
      costUsd: costOf(transport),
      elapsedMs: Date.now() - started,
      transport,
      live: true,
    };
  } catch (err) {
    return {
      data: null,
      errors: [messageOf(err)],
      costUsd: 0,
      elapsedMs: Date.now() - started,
      transport,
      live: true,
    };
  } finally {
    done();
  }
}

// ---------------------------------------------------------------------------
// x402
// ---------------------------------------------------------------------------

interface X402Accept {
  scheme: string;
  network: string;
  amount: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string; assetTransferMethod?: string };
}

interface X402Challenge {
  x402Version?: number;
  accepts?: X402Accept[];
}

/**
 * Pay-per-query fetch, implemented directly on viem rather than pulling in
 * `@graphprotocol/client-x402`. The protocol is a single EIP-3009 signature and
 * a header; a dependency here would add a lockfile change and a bundle for no
 * behaviour we don't already have.
 *
 * Flow: POST unpaid → gateway answers 402 with a payment manifest → sign a
 * USDC TransferWithAuthorization for the quoted amount → replay with the
 * signature attached.
 */
async function x402Fetch(url: string, body: string, signal: AbortSignal): Promise<Response> {
  const headers = { "content-type": "application/json" };
  const first = await fetch(url, { method: "POST", headers, body, signal });
  if (first.status !== 402) return first;

  const privateKey = process.env.X402_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("x402 payment required but X402_PRIVATE_KEY is not set");
  }

  const challenge = await readChallenge(first);
  const accept = challenge.accepts?.find((a) => a.scheme === "exact") ?? challenge.accepts?.[0];
  if (!accept) throw new Error("x402 challenge carried no acceptable payment method");

  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? (privateKey as `0x${string}`) : (`0x${privateKey}` as `0x${string}`),
  );

  const chainId = Number(accept.network.split(":")[1] ?? "8453");
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + (accept.maxTimeoutSeconds ?? 300));
  const nonce = randomNonce();

  const authorization = {
    from: account.address,
    to: accept.payTo as `0x${string}`,
    value: BigInt(accept.amount),
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await account.signTypedData({
    domain: {
      name: accept.extra?.name ?? "USD Coin",
      version: accept.extra?.version ?? "2",
      chainId,
      verifyingContract: accept.asset as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  const payload = toBase64(
    JSON.stringify({
      x402Version: challenge.x402Version ?? 2,
      scheme: accept.scheme,
      network: accept.network,
      payload: {
        signature,
        authorization: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          nonce: authorization.nonce,
        },
      },
    }),
  );

  return fetch(url, {
    method: "POST",
    // v2 reads `Payment-Signature`; v1 facilitators read `X-PAYMENT`. Sending
    // both is free and spares us a protocol-version guess at 3am.
    headers: { ...headers, "payment-signature": payload, "x-payment": payload },
    body,
    signal,
  });
}

async function readChallenge(response: Response): Promise<X402Challenge> {
  const header = response.headers.get("payment-required");
  if (header) {
    try {
      return JSON.parse(fromBase64(header)) as X402Challenge;
    } catch {
      // Fall through to the body — some gateway versions send it unencoded.
    }
  }
  try {
    return (await response.json()) as X402Challenge;
  } catch {
    return {};
  }
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function toBase64(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "utf8").toString("base64");
  return btoa(value);
}

function fromBase64(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64").toString("utf8");
  return atob(value);
}
