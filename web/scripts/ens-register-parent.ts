/**
 * Register + wrap the Atlas parent 2LD on Sepolia, replaying the exact call
 * shapes that succeeded for the original parent (see ens-sepolia.json txs).
 *
 *   cd web && pnpm dlx tsx --env-file=.env.local scripts/ens-register-parent.ts [label]
 *          add --execute to actually send (default is a dry run)
 *
 * The three steps and their known-good selectors are asserted before anything
 * is sent — if an ABI is wrong the selector will not match and the script
 * aborts without spending gas. Sepolia's documented register() path reverts;
 * this uses TestnetV1PremigrationRegistrar. See ens.ts SEPOLIA_PARENT_REGISTRATION.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  namehash,
  slice,
  concat,
  encodeFunctionData,
  encodeAbiParameters,
  getAddress,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LABEL = (process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) ?? "atlas-apps").toLowerCase();
const EXECUTE = process.argv.includes("--execute");
const DURATION = 31_536_000n; // 365 days, matching the original registration
const FUSES = 0;

const DEPLOY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "contracts", "deployments", "ens-sepolia.json",
);

// Known-good selectors decoded from the original parent's on-chain txs.
const EXPECT = {
  register: "0xef9c8805" as Hex,
  setApprovalForAll: "0xa22cb465" as Hex,
  wrapETH2LD: "0x8cf8b41e" as Hex,
};

// The premigration registrar's register() selector (0xef9c8805) does not match
// any tuple/flat type signature we could reconstruct, so we do NOT let viem
// derive it. Instead we ABI-encode the argument tuple (the scalar fields encode
// identically regardless of their declared width) and prepend the known-good
// selector, then prove the encoding is correct by reproducing the ORIGINAL
// graphminis calldata byte-for-byte before trusting it for our label.
const REGISTER_TUPLE = [{ type: "tuple", components: [
  { name: "name", type: "string" },
  { name: "owner", type: "address" },
  { name: "duration", type: "uint256" },
  { name: "secret", type: "bytes32" },
  { name: "resolver", type: "address" },
  { name: "data", type: "bytes[]" },
  { name: "reverseRecord", type: "bool" },
  { name: "ownerControlledFuses", type: "uint16" },
]}] as const;

// Exact input of the original successful register tx (ens-sepolia.json register).
const ORIGINAL_REGISTER_INPUT =
  "0xef9c8805000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001000000000000000000000000005a09e3ec3efdd91205cbb097142a4f4dcefc7f020000000000000000000000000000000000000000000000000000000001e133800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e99638b40e4fff0129d56f03b55b6bbc4bbe49b5000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a67726170686d696e6973000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000".toLowerCase();

const ORIGINAL_OWNER = "0x5a09e3eC3EFDD91205Cbb097142a4f4dCEFc7f02" as Address;
const ORIGINAL_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as Address;

function buildRegisterCalldata(label: string, owner: Address, resolver: Address): Hex {
  const args = encodeAbiParameters(REGISTER_TUPLE, [{
    name: label, owner, duration: DURATION,
    secret: ("0x" + "00".repeat(32)) as Hex, resolver, data: [],
    reverseRecord: false, ownerControlledFuses: FUSES,
  }]);
  return concat([EXPECT.register, args]);
}

const BASE_REGISTRAR_ABI = [
  { type: "function", name: "available", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable",
    inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
] as const;

const WRAPPER_ABI = [
  { type: "function", name: "wrapETH2LD", stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "wrappedOwner", type: "address" },
      { name: "ownerControlledFuses", type: "uint16" },
      { name: "resolver", type: "address" },
    ], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "ownerOf", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
] as const;

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }
function assertSelector(data: Hex, expect: Hex, name: string) {
  const got = slice(data, 0, 4);
  if (got.toLowerCase() !== expect.toLowerCase())
    fail(`selector mismatch for ${name}: built ${got}, expected ${expect}. ABI is wrong — aborting before send.`);
}

async function main() {
  const deploy = JSON.parse(readFileSync(DEPLOY_PATH, "utf8"));
  const REGISTRAR = "0xdf60C561Ca35AD3C89D24BbA854654b1c3477078" as Address; // TestnetV1PremigrationRegistrar
  const BASE_REGISTRAR = getAddress(deploy.contracts.baseRegistrar) as Address;
  const NAME_WRAPPER = getAddress(deploy.contracts.nameWrapper) as Address;
  const RESOLVER = getAddress(deploy.contracts.publicResolver) as Address;

  const pk = process.env.ENS_REGISTRAR_PRIVATE_KEY;
  if (!pk) fail("ENS_REGISTRAR_PRIVATE_KEY not set");
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  const rpc = process.env.ENS_RPC_URL;

  const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) });

  const fqdn = `${LABEL}.eth`;
  const labelhash = keccak256(toHex(LABEL));
  const tokenId = BigInt(labelhash);
  const node = namehash(fqdn);

  console.log(`\nRegister parent 2LD  ${fqdn}`);
  console.log(`mode                 ${EXECUTE ? "🚨 EXECUTE (will send txs)" : "dry run"}`);
  console.log(`account              ${account.address}`);
  console.log(`node (namehash)      ${node}`);
  console.log(`labelhash            ${labelhash}`);
  console.log(`resolver             ${RESOLVER}`);
  console.log(`nameWrapper          ${NAME_WRAPPER}`);

  if (await pub.getChainId() !== sepolia.id) fail("not on Sepolia");

  const available = await pub.readContract({ address: BASE_REGISTRAR, abi: BASE_REGISTRAR_ABI, functionName: "available", args: [tokenId] });
  console.log(`available            ${available ? "✅" : "❌"}`);
  if (!available) fail(`${fqdn} is not available — cannot register.`);

  const bal = await pub.getBalance({ address: account.address });
  console.log(`balance              ${formatEther(bal)} ETH`);
  if (bal === 0n) fail("zero balance");

  // Prove the register encoder is correct: rebuild the ORIGINAL graphminis call
  // and require it to equal the on-chain input byte-for-byte. If this passes,
  // the only thing that changes for our label is the name segment.
  const reproduced = buildRegisterCalldata("graphminis", ORIGINAL_OWNER, ORIGINAL_RESOLVER).toLowerCase();
  if (reproduced !== ORIGINAL_REGISTER_INPUT)
    fail(`register encoder does not reproduce the original calldata:\n  built ${reproduced}\n  want  ${ORIGINAL_REGISTER_INPUT}`);
  console.log(`\nregister encoder     ✅ reproduces original graphminis calldata byte-for-byte`);

  // Build all three calldatas up front.
  const registerData = buildRegisterCalldata(LABEL, account.address, RESOLVER);
  const approveData = encodeFunctionData({ abi: BASE_REGISTRAR_ABI, functionName: "setApprovalForAll", args: [NAME_WRAPPER, true] });
  const wrapData = encodeFunctionData({ abi: WRAPPER_ABI, functionName: "wrapETH2LD", args: [LABEL, account.address, FUSES, RESOLVER] });
  assertSelector(registerData, EXPECT.register, "register");
  assertSelector(approveData, EXPECT.setApprovalForAll, "setApprovalForAll");
  assertSelector(wrapData, EXPECT.wrapETH2LD, "wrapETH2LD");
  console.log(`selectors            ✅ all three match the original on-chain txs`);

  // Simulate the register (the only one whose preconditions already hold).
  await pub.estimateGas({ account, to: REGISTRAR, data: registerData, value: 0n })
    .then((g) => console.log(`register estGas      ${g}`))
    .catch((e) => fail(`register would revert: ${e instanceof Error ? e.message : e}`));

  if (!EXECUTE) {
    console.log(`\nDry run only. Re-run with --execute to send.\n`);
    return;
  }

  const send = async (label: string, to: Address, data: Hex) => {
    const hash = await wallet.sendTransaction({ to, data, value: 0n });
    console.log(`  ${label} sent ${hash}`);
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    if (rcpt.status !== "success") fail(`${label} reverted (${hash})`);
    console.log(`  ${label} ✅ block ${rcpt.blockNumber}`);
    return hash;
  };

  console.log(`\nExecuting:`);
  const registerTx = await send("register        ", REGISTRAR, registerData);
  const approveTx = await send("approveWrapper  ", BASE_REGISTRAR, approveData);
  const wrapTx = await send("wrapETH2LD      ", NAME_WRAPPER, wrapData);

  const owner = await pub.readContract({ address: NAME_WRAPPER, abi: WRAPPER_ABI, functionName: "ownerOf", args: [BigInt(node)] });
  const wrappedOk = getAddress(owner) === getAddress(account.address);
  console.log(`\nwrapped owner        ${owner} ${wrappedOk ? "✅ (your key)" : "❌ unexpected"}`);
  if (!wrappedOk) fail("wrap did not leave the name owned by your key");

  console.log(`\n✅ Registered + wrapped ${fqdn}`);
  console.log(JSON.stringify({ parent: fqdn, node, owner: account.address, wrapped: true,
    transactions: { register: registerTx, approveNameWrapper: approveTx, wrapETH2LD: wrapTx } }, null, 2));
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
