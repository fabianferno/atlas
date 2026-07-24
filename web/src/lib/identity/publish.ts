/**
 * W7 — `publish` and `resolve`, the two functions in the kit's public API
 * (`contracts/api.ts`) that the identity layer owns.
 *
 * ```
 * publish()   manifest ──► pin ──► mint Agentic ID ──► issue subname
 *                                       │                    │
 *                                       └── register ────────┘
 *                                    (mutual verification)
 *
 * resolve()   ens name ──► contenthash ──► manifest ──► re-run against
 *                                                       LIVE data
 * ```
 *
 * ## The one design decision worth stating
 *
 * **The pinned manifest carries a null `identity`.** Identity is *derived from
 * the name*, not baked into the content. Doing it the other way needs the CID
 * inside the object the CID is computed from, which is circular; every
 * workaround produces a manifest whose `manifestCid` field disagrees with its
 * own CID. So the artifact on IPFS is the canonical, content-addressed plan,
 * and `resolve()` rehydrates `identity` from the ENS records and the onchain
 * registry it just read. A round-trip therefore returns a *fully populated*
 * manifest, and the CID stays stable across republishes of identical content —
 * which is also what makes fork attribution meaningful.
 *
 * ## Degradation
 *
 * Every step is independently optional. No IPFS key → a real CID over a local
 * store. No 0G key → a deterministic mocked token id. No ENS key → a mock
 * name. A publish never fails because a sponsor's API is down mid-demo; it
 * reports what it could and could not do in `PublishReport.warnings`.
 */
import { namehash, type Address, type Hex } from "viem";
import {
  zManifest,
  type AgencyTier,
  type Manifest,
} from "@/lib/contracts/manifest";
import type { Publish, PublishOptions, PublishResult, Resolve } from "@/lib/contracts/api";
import { cidFromUri, fetchManifestJson, pinManifest, resolveIpfsMode } from "./ipfs";
import {
  assertLabel,
  buildRecordSet,
  decodeErc7930,
  fullName,
  getEnsBackend,
  parentDomain,
  parseAgentRegistrations,
  readRecordsWithRegistration,
  splitName,
  verifyEnsSideOfBinding,
  type AgentEndpoints,
  type AgenticIdRef,
  type EnsRecordSet,
} from "./ens";
import {
  agenticIdConfig,
  cloneAgenticId,
  ensip25Registry,
  explorerTokenUrl,
  miniAppNameKey,
  mintAgenticId,
  registerMiniApp,
  verifyOnchainSideOfBinding,
  zeroGChain,
  MINI_APP_REGISTRY_ABI,
  zeroGPublicClient,
} from "./agentic-id";

/* ========================================================================== */
/* endpoints                                                                  */
/* ========================================================================== */

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_ORIGIN ??
    "https://graphminis.xyz"
  ).replace(/\/$/, "");
}

/** ENSIP-26 endpoints for a mini app. `/a/<name>` is the runtime route. */
export function endpointsFor(label: string): AgentEndpoints {
  const mcp = process.env.MCP_ENDPOINT ?? `${appOrigin().replace(/^https?:\/\//, "https://mcp.")}/sse`;
  return {
    web: `${appOrigin()}/a/${label}`,
    mcp,
  };
}

/* ========================================================================== */
/* publish                                                                    */
/* ========================================================================== */

export interface PublishReport extends PublishResult {
  /** Fully qualified name, even when the backend is the mock. */
  name: string;
  /** Which ENS backend actually issued. */
  ensMode: string;
  ipfsMode: string;
  agenticIdMode: string;
  /** The exact ENSIP-25 key written, so it can be shown in the UI verbatim. */
  agentRegistrationKey: string | null;
  agenticIdContract: Address | null;
  agenticIdExplorerUrl: string | null;
  registryTxHash: string | null;
  mintTxHash: string | null;
  ensTxHash: string | null;
  /** Every record that was written, for the "one lookup returns everything" beat. */
  records: EnsRecordSet;
  /** Things that degraded. Empty on a fully live publish. */
  warnings: string[];
}

function applyOptions(manifest: Manifest, options: PublishOptions): Manifest {
  const now = new Date().toISOString();
  const tier: AgencyTier = options.tier;
  return {
    ...manifest,
    name: options.name,
    agency: {
      ...manifest.agency,
      tier,
      policy: { ...manifest.agency.policy, ...(options.policy ?? {}) },
    },
    pricing:
      options.priceUsd !== undefined
        ? { x402: { enabled: options.priceUsd > 0, priceUsd: options.priceUsd } }
        : manifest.pricing,
    updatedAt: now,
  };
}

/**
 * The canonical artifact that gets pinned. `identity` is nulled — see the
 * header. Everything else is exactly what the planner produced.
 */
function canonicalForPinning(manifest: Manifest): Manifest {
  return { ...manifest, identity: { ens: null, agenticId: null, manifestCid: null } };
}

/**
 * pin → mint → issue → register.
 *
 * The order is not arbitrary. The CID must exist before the mint so the token
 * URI points at something. The token must exist before the subname so the
 * ENSIP-25 record can be written in the same pass the name is created —
 * otherwise there is a window where the name exists and claims nothing, which
 * is precisely the ambiguity the whole binding is meant to remove.
 */
export const publish: Publish = async (
  manifest: Manifest,
  options: PublishOptions,
): Promise<PublishResult> => {
  return publishWithReport(manifest, options);
};

export async function publishWithReport(
  manifest: Manifest,
  options: PublishOptions,
): Promise<PublishReport> {
  assertLabel(options.name);
  const warnings: string[] = [];

  const prepared = applyOptions(manifest, options);
  const parsed = zManifest.safeParse(prepared);
  if (!parsed.success) {
    throw new Error(`publish: manifest failed validation — ${parsed.error.message}`);
  }
  const base = parsed.data;

  const backend = getEnsBackend();
  const label = options.name;
  const name = `${label}.${backend.parent}`;
  const endpoints = endpointsFor(label);

  /* 1 — pin the canonical manifest. */
  const pin = await pinManifest(canonicalForPinning(base));
  if (!pin.pinned) {
    warnings.push(
      `manifest is content-addressed (${pin.cid}) but not announced to IPFS — set PINATA_JWT or W3S_TOKEN to pin for real`,
    );
  }

  /* 2 — mint the Agentic ID, binding the ENS name at mint time. */
  const zg = agenticIdConfig();
  let tokenId: number | null = null;
  let mintTxHash: string | null = null;
  let agenticIdContract: Address | null = zg.agenticIdAddress;
  try {
    const mint = await mintAgenticId({
      manifest: base,
      ensName: name,
      tokenUri: pin.uri,
    });
    tokenId = mint.tokenId;
    mintTxHash = mint.txHash;
    agenticIdContract = mint.contract;
    if (mint.mode === "mock") {
      warnings.push(
        "Agentic ID is mocked — set ZEROG_AGENTIC_ID_ADDRESS, ZEROG_REGISTRY_ADDRESS and ZEROG_DEPLOYER_KEY to mint on 0G Chain",
      );
    }
  } catch (err) {
    warnings.push(`Agentic ID mint failed: ${errText(err)}`);
  }

  /* 3 — the ENSIP-25 reference. The *registry* is MiniAppRegistry, not the NFT:
         ENSIP-25's `<registry>` is the contract that answers "is this name this
         agent?", which is the registry's whole job. */
  const registry = ensip25Registry();
  const agenticIdRef: AgenticIdRef | null =
    tokenId !== null
      ? { chainId: zg.chainId, registry: registry.address, tokenId }
      : null;
  if (registry.mocked && tokenId !== null) {
    warnings.push(
      `ENSIP-25 agent-registration record uses a derived stand-in registry (${registry.address}) — set ZEROG_REGISTRY_ADDRESS to the deployed MiniAppRegistry`,
    );
  }

  /* 4 — build the full record set and issue the subname. */
  const records = buildRecordSet({
    manifest: base,
    manifestCid: pin.cid,
    endpoints,
    agenticId: agenticIdRef,
  });

  let ensName: string | null = null;
  let ensTxHash: string | null = null;
  try {
    const issued = await backend.issue(label, records);
    ensName = issued.name;
    ensTxHash = issued.txHash;
    if (!issued.live) {
      warnings.push(
        `ENS name is local-only (${backend.mode}) — set NAMESTONE_API_KEY or ENS_REGISTRAR_PRIVATE_KEY to issue a resolvable subname`,
      );
    }
  } catch (err) {
    // A name that already exists is a normal republish, not a failure.
    try {
      await backend.setRecords(label, records);
      ensName = name;
      warnings.push(`${name} already existed — records updated in place`);
    } catch (err2) {
      warnings.push(`ENS issuance failed: ${errText(err)} / ${errText(err2)}`);
    }
  }

  /* 5 — register onchain. This is the half of the mutual proof that lives on
         0G: the token owner asserting the name. */
  let registryTxHash: string | null = null;
  if (tokenId !== null && zg.registryAddress) {
    try {
      const reg = await registerMiniApp({
        ensName: name,
        manifestCid: pin.cid,
        attestationRef: base.provenance.attestationRef,
        ensNode: namehash(name),
        tokenId,
        appVersion: base.appVersion,
        parentKey: base.forkedFrom ? miniAppNameKey(forkParentName(base.forkedFrom)) : null,
      });
      registryTxHash = reg.txHash;
    } catch (err) {
      warnings.push(`registry write failed: ${errText(err)}`);
    }
  }

  /* 6 — the manifest we hand back has identity populated, even though the
         pinned copy does not. Callers want the whole picture in one object. */
  const published: Manifest = {
    ...base,
    identity: {
      ens: ensName,
      agenticId:
        tokenId !== null && agenticIdContract
          ? { chain: "0g", contract: agenticIdContract, tokenId }
          : null,
      manifestCid: pin.cid,
    },
  };

  return {
    manifest: published,
    ens: ensName,
    manifestCid: pin.cid,
    agenticIdTokenId: tokenId,
    txHash: registryTxHash ?? mintTxHash ?? ensTxHash,
    name,
    ensMode: backend.mode,
    ipfsMode: resolveIpfsMode(),
    agenticIdMode: zg.mode,
    agentRegistrationKey: agenticIdRef
      ? Object.keys(records.texts).find((k) => k.startsWith("agent-registration[")) ?? null
      : null,
    agenticIdContract,
    agenticIdExplorerUrl:
      tokenId !== null && agenticIdContract && zg.mode === "live"
        ? explorerTokenUrl(agenticIdContract, tokenId)
        : null,
    registryTxHash,
    mintTxHash,
    ensTxHash,
    records,
    warnings,
  };
}

/** `forkedFrom` is `"<name>@<version>"`; the registry keys on the full ENS name. */
function forkParentName(forkedFrom: string): string {
  const label = forkedFrom.split("@")[0];
  return label.includes(".") ? label : `${label}.${parentDomain()}`;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ========================================================================== */
/* fork                                                                       */
/* ========================================================================== */

export interface ForkResult extends PublishReport {
  parentTokenId: number | null;
  cloneTxHash: string | null;
}

/**
 * Fork = ERC-7857 clone + a fresh publish.
 *
 * `forkManifest()` (frozen, in `contracts/manifest.ts`) has already stripped
 * the wallet, the identity and the attestation before this is called — a fork
 * inherits attribution and nothing else. We clone the parent's token so the
 * lineage is onchain, then publish the child normally.
 */
export async function publishFork(
  childManifest: Manifest,
  options: PublishOptions,
  parentTokenId: number | null,
): Promise<ForkResult> {
  let cloneTxHash: string | null = null;
  if (parentTokenId !== null) {
    try {
      const cloned = await cloneAgenticId(
        parentTokenId,
        childManifest,
        `${options.name}.${parentDomain()}`,
      );
      cloneTxHash = cloned.txHash;
    } catch {
      // Cloning is attribution, not correctness. A failed clone must not stop
      // someone from publishing their fork.
    }
  }
  const report = await publishWithReport(childManifest, options);
  return { ...report, parentTokenId, cloneTxHash };
}

/* ========================================================================== */
/* resolve                                                                    */
/* ========================================================================== */

export interface ResolveReport {
  name: string;
  manifest: Manifest | null;
  manifestCid: string | null;
  /** The mini app's wallet, from the `addr` record. */
  address: Address | null;
  /** ENSIP-26 `agent-context`, verbatim. */
  agentContext: string | null;
  endpoints: { web: string | null; mcp: string | null; a2a: string | null };
  agenticId: { chainId: number; registry: Address; tokenId: string }[];
  /** Both halves of the mutual verification. */
  verification: {
    ensAssertsToken: boolean;
    registryAssertsName: boolean;
    tokenAssertsName: boolean;
    mutuallyVerified: boolean;
    owner: Address | null;
    checked: boolean;
  } | null;
  texts: Record<string, string>;
  source: "contenthash" | "registry" | null;
}

/**
 * ENS name → a rehydrated, live manifest.
 *
 * A resolved name must be *runnable*, not a cached screenshot: the manifest
 * that comes back carries the query plan, so the caller re-runs it against
 * live subgraph data. Nothing about the rendered result is stored.
 */
export const resolve: Resolve = async (ensName: string): Promise<Manifest | null> => {
  const report = await resolveWithReport(ensName);
  return report.manifest;
};

export async function resolveWithReport(ensName: string): Promise<ResolveReport> {
  const name = normaliseName(ensName);
  const records = await readRecordsWithRegistration(name);
  const texts = records?.texts ?? {};

  const registrations = parseAgentRegistrations(texts)
    .map((r) => {
      const decoded = decodeErc7930(r.registry);
      return decoded
        ? { chainId: decoded.chainId, registry: decoded.address, tokenId: r.agentId }
        : null;
    })
    .filter((r): r is { chainId: number; registry: Address; tokenId: string } => r !== null);

  /* Manifest: contenthash first, then the onchain registry. The registry
     fallback matters — an onchain-issued name whose contenthash write ran out
     of gas still resolves to the right manifest. */
  let cid = records?.contenthash ? cidFromUri(records.contenthash) : null;
  let source: ResolveReport["source"] = cid ? "contenthash" : null;
  if (!cid) {
    const fromRegistry = await manifestCidFromRegistry(name);
    if (fromRegistry) {
      cid = fromRegistry;
      source = "registry";
    }
  }

  let manifest: Manifest | null = null;
  if (cid) {
    const json = await fetchManifestJson(cid);
    if (json) {
      const parsed = zManifest.safeParse(json);
      if (parsed.success) {
        manifest = parsed.data;
      } else {
        // A malformed manifest at a valid CID is a real failure and must not
        // be silently turned into a half-populated object.
        console.warn(`[resolve] ${name} -> ${cid} is not a valid manifest`, parsed.error.message);
      }
    }
  }

  // Rehydrate identity from what we just resolved. This is the half of the
  // manifest that is deliberately not content-addressed.
  if (manifest) {
    const primary = registrations[0];
    manifest = {
      ...manifest,
      identity: {
        ens: name,
        agenticId: primary
          ? {
              chain: "0g",
              contract: agenticIdConfig().agenticIdAddress ?? primary.registry,
              tokenId: Number(primary.tokenId),
            }
          : null,
        manifestCid: cid,
      },
    };
  }

  /* Mutual verification, both directions, only when there is a token to check. */
  let verification: ResolveReport["verification"] = null;
  const primary = registrations[0];
  if (primary) {
    const [ens, onchain] = await Promise.all([
      verifyEnsSideOfBinding(name, {
        chainId: primary.chainId,
        registry: primary.registry,
        tokenId: primary.tokenId,
      }),
      verifyOnchainSideOfBinding(name, Number(primary.tokenId)),
    ]);
    verification = {
      ensAssertsToken: ens.ensAssertsToken,
      registryAssertsName: onchain.registryAssertsName,
      tokenAssertsName: onchain.tokenAssertsName,
      // Both directions, or it is not mutual. A one-sided claim proves nothing.
      mutuallyVerified: ens.ensAssertsToken && onchain.registryAssertsName,
      owner: onchain.owner,
      checked: onchain.checked,
    };
  }

  return {
    name,
    manifest,
    manifestCid: cid,
    address: records?.addr ?? null,
    agentContext: texts["agent-context"] ?? null,
    endpoints: {
      web: texts["agent-endpoint[web]"] ?? texts.url ?? null,
      mcp: texts["agent-endpoint[mcp]"] ?? null,
      a2a: texts["agent-endpoint[a2a]"] ?? null,
    },
    agenticId: registrations,
    verification,
    texts,
    source,
  };
}

async function manifestCidFromRegistry(name: string): Promise<string | null> {
  const zg = agenticIdConfig();
  if (!zg.registryAddress) return null;
  try {
    const rec = await zeroGPublicClient().readContract({
      address: zg.registryAddress,
      abi: MINI_APP_REGISTRY_ABI,
      functionName: "getByName",
      args: [name],
    });
    return rec.manifestCID || null;
  } catch {
    return null;
  }
}

/** Accepts a bare label or a full name; always returns a full name. */
export function normaliseName(input: string): string {
  const trimmed = input.toLowerCase().trim().replace(/\.$/, "");
  if (!trimmed.includes(".")) return fullName(trimmed);
  return trimmed;
}

/* ========================================================================== */
/* status                                                                     */
/* ========================================================================== */

export interface IdentityStatus {
  ens: { mode: string; parent: string; configured: boolean };
  ipfs: { mode: string };
  zeroG: {
    mode: string;
    chainId: number;
    chainName: string;
    agenticId: Address | null;
    registry: Address | null;
    verifier: Address | null;
    explorer: string;
  };
  app: { origin: string };
}

/** What is live and what is mocked. Rendered in the Studio's publish panel. */
export function identityStatus(): IdentityStatus {
  const backend = getEnsBackend();
  const zg = agenticIdConfig();
  const chain = zeroGChain();
  return {
    ens: { mode: backend.mode, parent: backend.parent, configured: backend.configured },
    ipfs: { mode: resolveIpfsMode() },
    zeroG: {
      mode: zg.mode,
      chainId: zg.chainId,
      chainName: chain.name,
      agenticId: zg.agenticIdAddress,
      registry: zg.registryAddress,
      verifier: zg.verifierAddress,
      explorer: chain.blockExplorers.default.url,
    },
    app: { origin: appOrigin() },
  };
}

export { splitName, type Hex };
