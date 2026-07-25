/**
 * READ-ONLY preflight for registering the Atlas parent 2LD on Sepolia.
 * Fires no transactions. Confirms the three things that would otherwise waste
 * gas on a guaranteed revert:
 *   1. `atlas-apps.eth` is actually available on Sepolia's BaseRegistrar.
 *   2. The registrar key is funded enough to register + wrap.
 *   3. The TestnetV1PremigrationRegistrar still has code (it is undocumented
 *      and testnet-only; ens.ts warns to verify it still answers).
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/ens-register-preflight.ts [label]
 */
import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  formatEther,
  getAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const LABEL = (process.argv[2] ?? "atlas").toLowerCase();

const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85" as Address;
const PREMIGRATION_REGISTRAR = "0xdf60C561Ca35AD3C89D24BbA854654b1c3477078" as Address;

const rpc = process.env.ENS_RPC_URL;
const pk = process.env.ENS_REGISTRAR_PRIVATE_KEY;

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function main() {
  console.log(`\nPreflight — registering "${LABEL}.eth" on Sepolia\n`);

  if (!pk) fail("ENS_REGISTRAR_PRIVATE_KEY is not set in the loaded env.");
  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`,
  );
  console.log(`registrar key   ${account.address}`);
  console.log(`rpc             ${rpc ?? "(viem default sepolia public rpc)"}`);

  const client = createPublicClient({ chain: sepolia, transport: http(rpc) });

  // 0. chain sanity
  const chainId = await client.getChainId();
  if (chainId !== sepolia.id) fail(`RPC is chainId ${chainId}, not Sepolia (${sepolia.id}).`);

  // 1. availability
  const labelhash = keccak256(toHex(LABEL));
  const tokenId = BigInt(labelhash);
  const available = (await client.readContract({
    address: BASE_REGISTRAR,
    abi: [
      {
        type: "function",
        name: "available",
        stateMutability: "view",
        inputs: [{ name: "id", type: "uint256" }],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "available",
    args: [tokenId],
  })) as boolean;
  console.log(`\nlabelhash       ${labelhash}`);
  console.log(`available()     ${available ? "✅ true" : "❌ false (already registered)"}`);

  // If taken, report the current owner so it is obvious whether it is ours.
  if (!available) {
    try {
      const owner = (await client.readContract({
        address: BASE_REGISTRAR,
        abi: [
          {
            type: "function",
            name: "ownerOf",
            stateMutability: "view",
            inputs: [{ name: "id", type: "uint256" }],
            outputs: [{ name: "", type: "address" }],
          },
        ],
        functionName: "ownerOf",
        args: [tokenId],
      })) as Address;
      const mine = getAddress(owner) === getAddress(account.address);
      console.log(`current owner   ${owner} ${mine ? "(this is your key)" : "(NOT your key)"}`);
    } catch {
      console.log(`current owner   (ownerOf reverted — likely expired/gracePeriod)`);
    }
  }

  // 2. balance
  const bal = await client.getBalance({ address: account.address });
  console.log(`\nbalance         ${formatEther(bal)} SepoliaETH`);
  if (bal === 0n) console.log(`                ⚠️  zero balance — cannot pay gas for register/wrap`);

  // 3. registrar liveness
  const code = await client.getCode({ address: PREMIGRATION_REGISTRAR });
  const hasCode = Boolean(code && code !== "0x");
  console.log(`\npremigration    ${PREMIGRATION_REGISTRAR}`);
  console.log(`  has code      ${hasCode ? "✅ yes" : "❌ no — registrar is gone, path is dead"}`);

  console.log(`\n─────────────────────────────────────────`);
  const ready = available && bal > 0n && hasCode && chainId === sepolia.id;
  console.log(ready ? "READY to register." : "NOT ready — see ❌/⚠️ above.");
  console.log(``);
  process.exit(ready ? 0 : 2);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
