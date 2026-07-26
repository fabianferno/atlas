/**
 * WHO IS PUBLISHED — read off MiniAppRegistry, never off a list.
 *
 * `MiniAppRegistry` keeps `_keys` "so the registry (prd.md §12) can be
 * enumerated without an indexer during the demo". This module is the caller
 * that comment always assumed. Before it existed, the Registry page carried a
 * literal array of five labels while the contract held nine entries and
 * contracts/deployments/ens-sepolia.json held eight — three records of one
 * onchain fact, none of them agreeing.
 *
 * This module knows about the registry and nothing else. It does not resolve
 * ENS, does not fetch manifests and does not decide what a UI should show. The
 * one interpretive step it takes — `selectUnderParent` — is a pure function
 * over a parent supplied by the caller, so the parent is never baked in here
 * either.
 */
import type { Address, Hex, PublicClient } from "viem";
import { MINI_APP_REGISTRY_ABI, agenticIdConfig, zeroGPublicClient } from "./agentic-id";

/** One `AppRecord` tuple exactly as viem decodes it. */
export interface RawAppRecord {
  ensName: string;
  manifestCID: string;
  attestationHash: Hex;
  ensNode: Hex;
  author: Address;
  tokenId: bigint;
  forkedFrom: Hex;
  appVersion: string;
  registeredAt: bigint;
  updatedAt: bigint;
  revision: number;
}

/** The same record, JSON-safe. */
export interface RegisteredApp {
  ensName: string;
  manifestCid: string;
  tokenId: number;
  author: Address;
  appVersion: string;
  ensNode: Hex;
  /** null for an original. A zero word is "no parent", not a parent named zero. */
  forkedFrom: Hex | null;
  /** Unix seconds. */
  registeredAt: number;
  updatedAt: number;
  revision: number;
}

/**
 * The two reads this module needs. An interface rather than a client so the
 * paging logic is testable without a chain — the same seam
 * `src/lib/coverage/registry.test.ts` uses for `fetch`.
 */
export interface RegistryReader {
  totalApps(): Promise<bigint>;
  page(offset: bigint, limit: bigint): Promise<readonly RawAppRecord[]>;
}

const ZERO_WORD = `0x${"00".repeat(32)}`;

/**
 * Rows per `page()` call. The registry holds single digits today; this exists
 * so a registry that grows does not blow the RPC's response limit and
 * silently return a truncated list.
 */
const PAGE_SIZE = 50n;

/**
 * A reader against the configured 0G deployment, or null when no registry
 * address is set.
 *
 * Deliberately NOT gated on `agenticIdConfig().mode`. That flag is "mock"
 * whenever `ZEROG_DEPLOYER_KEY` is absent, because it describes whether we can
 * *sign*. Enumerating is a read: it needs an address and an RPC, and nothing
 * else.
 */
export function registryReaderFromEnv(client?: PublicClient): RegistryReader | null {
  const address = agenticIdConfig().registryAddress;
  if (!address) return null;
  const rpc = client ?? zeroGPublicClient();
  return {
    totalApps: () =>
      rpc.readContract({
        address,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "totalApps",
      }) as Promise<bigint>,
    page: (offset, limit) =>
      rpc.readContract({
        address,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "page",
        args: [offset, limit],
      }) as Promise<readonly RawAppRecord[]>,
  };
}

/**
 * Every record in the registry, in registry order — which is publish order,
 * because `_keys` is append-only.
 */
export async function listRegisteredApps(reader?: RegistryReader): Promise<RegisteredApp[]> {
  const source = reader ?? registryReaderFromEnv();
  if (!source) {
    // No address configured is not the same fact as an empty registry — the
    // former means this call never opened a connection, and rendering it as
    // the latter is a positive claim about the chain that nothing checked.
    throw new Error("ZEROG_REGISTRY_ADDRESS is not set, so the registry cannot be enumerated");
  }

  const total = await source.totalApps();
  const out: RegisteredApp[] = [];
  let offset = 0n;

  while (offset < total) {
    const rows = await source.page(offset, PAGE_SIZE);
    // A node that truncates or refuses a page must end the loop rather than
    // spin it, so this break still happens. But arriving short of `total` is
    // not returned as a partial success: a denominator silently narrowed to
    // "whatever showed up" is the same lie as the empty-registry case above.
    if (rows.length === 0) break;
    for (const row of rows) out.push(normalise(row));
    offset += BigInt(rows.length);
  }

  if (BigInt(out.length) !== total) {
    throw new Error(`the registry reported ${total} entries but served only ${out.length}`);
  }

  return out;
}

function normalise(row: RawAppRecord): RegisteredApp {
  return {
    ensName: row.ensName,
    manifestCid: row.manifestCID,
    tokenId: Number(row.tokenId),
    author: row.author,
    appVersion: row.appVersion,
    ensNode: row.ensNode,
    forkedFrom: row.forkedFrom === ZERO_WORD ? null : row.forkedFrom,
    registeredAt: Number(row.registeredAt),
    updatedAt: Number(row.updatedAt),
    revision: row.revision,
  };
}

/**
 * The records issued under one parent, plus the denominator.
 *
 * Some entries on the deployed registry name `graphminis.eth` (three, at time
 * of writing), the parent this project used before the Atlas rebrand: the ENS
 * records were re-issued under the new parent but the registry entries were
 * never re-registered, and the token→name binding is immutable by design, so
 * they cannot be. They are history. `retired` reports how many were set aside
 * so a caller can say so out loud — dropping them silently would trade one
 * misleading denominator for another.
 *
 * Matching is on the label boundary (`.` + parent), so `notatlas-apps.eth`
 * does not pass as a subname of `atlas-apps.eth`, and the parent itself is not
 * a mini app. Case is folded because ENS names are case-insensitive while
 * `MiniAppRegistry.nameKey` is a raw keccak of the bytes — the contract's own
 * comment says casing is the caller's problem.
 */
export function selectUnderParent(
  apps: RegisteredApp[],
  parent: string,
): { apps: RegisteredApp[]; total: number; retired: number } {
  const suffix = `.${parent.toLowerCase()}`;
  const under = apps.filter((a) => a.ensName.toLowerCase().endsWith(suffix));
  return { apps: under, total: apps.length, retired: apps.length - under.length };
}
