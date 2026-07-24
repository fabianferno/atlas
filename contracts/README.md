# Identity contracts — 0G Chain

Three contracts. Together they are the onchain half of "the mini app **is** an
ENS name": the name says which agent it is, and the agent says which name it is.

| Contract | What it is |
|---|---|
| `AgenticIdVerifier.sol` | ERC-7857 data verifier — the oracle seam. Signature recovery, single-use nonces, attestor registry. |
| `AgenticId.sol` | ERC-7857 Agentic ID. Every published mini app is one of these tokens. |
| `MiniAppRegistry.sol` | `keccak(ensName) → (manifestCID, attestationHash, author, tokenId)`. The reverse half of the ENSIP-25 binding. |

Toolchain: Foundry, solc 0.8.28, `evm_version = "cancun"` (0G Chain runs
Cancun-Deneb/Pectra — leaving this on Foundry's default breaks deploys there),
OpenZeppelin 5.0.2, `via_ir = true`.

---

## Mutual verification — the point of all three

```
                    ENSIP-25 text record
  aave-guard.graphminis.eth ──────────────────────► Agentic ID #142
    agent-registration[erc7930(registry)][142]="1"
              ▲                                            │
              │        MiniAppRegistry.verify()             │
              └────────────────────────────────────────────┘
                    records[keccak(name)].tokenId == 142
                    AgenticId.ensNameOf(142) == name
```

Neither arrow is worth anything alone.

- The ENS record only proves the **name owner** asserts the token.
- The registry entry only proves the **token owner** asserts the name.

A client that checks both has established that one principal controls the name
*and* the agent. That is what makes "should I fund this mini app's wallet?" a
question with an answer, and it is the reason ENS and 0G are one story here
rather than two slides.

Check it:

```solidity
(bool ok, address owner, string memory cid) = registry.verify(ensName, tokenId);
```
```ts
await verifyEnsSideOfBinding(ensName, { chainId, registry, tokenId });  // ens.ts
await verifyOnchainSideOfBinding(ensName, tokenId);                     // agentic-id.ts
```
`resolveWithReport()` runs both and reports `mutuallyVerified`.

---

## ERC-7857: what is real and what is scoped

There are **three mutually incompatible interfaces** in circulation under the
name `IERC7857`:

| | Where | Shape |
|---|---|---|
| V1 | prose on `docs.0g.ai` | `transfer(from,to,id,sealedKey,proof)`. Matches no shipped code; imports OZ v4 paths and does not compile against OZ 5. |
| **V2** | `0gfoundation/0g-agent-nft` branch `eip-7857-draft` — **the tree the 0G docs link to** | flat interface, `bytes[]` proofs, a `Verifier` with a documented byte layout |
| V3 | the Final ERC text + repo `main` | structs, `iTransferFrom`, beacon proxies, `mint` off the interface |

**We implement V2**, because it is what 0G's own developer docs point a builder
at and because its proof format is specified precisely enough to generate
genuinely valid proofs offchain without a TEE attestation service that 0G does
not publish an endpoint for.

### Real

| Piece | Status |
|---|---|
| `mint` / `transfer` / `clone` / `authorizeUsage` / `update` | Implemented, V2 signatures verbatim. |
| `Minted` / `Transferred` / `Cloned` / `Authorization` / `PublishedSealedKey` / `Updated` events | All emitted. |
| ERC-721 base | Real. `ownerOf`, `balanceOf`, `tokenURI`, explorer enumeration all work. |
| **AES-256-GCM** metadata encryption | Real, in `web/src/lib/identity/agentic-id.ts`. Random 96-bit IV, auth tag retained, `dataHash = keccak256(ciphertext)`. |
| **ECDSA proof verification** | Real. The verifier recovers the signer over the exact digest the standard specifies and returns it. |
| **Receiver binding** | Real and load-bearing: `transfer`/`clone` require the recovered signer to equal `_to`. You cannot push an Agentic ID onto a wallet that has not signed for it. |
| **Stale-metadata rejection** | Real: a transfer proof must attest against the hash the token holds *now*, so a holder cannot swap in unrelated metadata mid-sale. |
| **Replay protection** | Real: 48-byte nonces, marked before use, single-use across the contract's lifetime. |
| **Attestor registry + `strictOracle`** | Real. Flip it on and every proof must additionally carry a registered attestor's signature. |

The reference `eip-7857-draft` verifier ships two stubs — `verifyPreimage`
returns `isValid = true` for any 32-byte blob, and the TEE signature check is a
`// TODO` — and neither was copied.

### Scoped down, deliberately

| Piece | What we did | What is missing | Cost to close |
|---|---|---|---|
| **TEE attestation** | `strictOracle` mode verifies that a **registered signing key** signed the proof. | Verifying the Intel TDX quote itself. 0G publishes no onchain attestation-verifier address and no prover endpoint. | `setAttestor(enclaveKey, true)` + `setStrictOracle(true)`. The verification path is already wired; only the key is missing. |
| **ZKP proofs** | `ProofType.ZKP` **reverts**. | ZKP verification. | Silently accepting an unverified ZKP would be strictly worse than not supporting it, so we reject. |
| **0G Storage** | Encrypted blobs go to the configured content store (IPFS/local). | Upload via `@0gfoundation/0g-storage-ts-sdk` (merkle-segment upload). | Pure transport swap — the token commits to `keccak256(ciphertext)`, which is identical either way. |
| **Key re-sealing to the receiver's pubkey** | We publish a 16-byte key *commitment* (`keccak256(key)[0:16]`) in `sealedKey` and carry the wrapped key beside the ciphertext. | An in-band ECIES envelope. | Not closable within V2: `sealedKey` is typed `bytes16`, which cannot hold any wrapped AES-256 key. This is a limitation of the standard's own field width, and V3 widens it to `bytes`. |

### Two documented deviations from V2

1. **`sealedKey` slice.** The reference verifier reads a `bytes16` out of a
   *12-byte* slice (`proof[178:190]`), silently pulling four bytes of whatever
   follows. We read the full 16 bytes at `[178:194]`.
2. **Trailing oracle signature.** Bytes `[194:259]` are ours. Proofs without it
   are still accepted when `strictOracle` is false, so the layout stays
   backward compatible with the reference format.

### Proof byte layout

```
 offset  len  field
 0       1    flags   bit 0x80 = proof type (0 TEE, 1 ZKP)
                      bit 0x40 = 1 when the data is private (encrypted)
 1       65   availability signature (r,s,v) by the receiving party
 66      48   nonce
 114     32   newDataHash
 146     32   oldDataHash    -- transfer/clone proofs only
 178     16   sealedKey      -- private-data transfer proofs only
 194     65   oracle attestation signature -- optional (our extension)
```

Signed digest:

```
inner  = keccak256(newDataHash [|| oldDataHash] || nonce)
digest = keccak256("\x19Ethereum Signed Message:\n66" || hexString(inner))
```

`hexString` is the 0x-prefixed 64-hex-char lowercase form — 66 bytes. This is
`personal_sign` over the *hex string* of the inner hash, which is exactly what
`viem.signMessage({ message })` produces for a plain string. That is why proofs
can be built in TypeScript with no special tooling.

**This layout is implemented twice** — in `AgenticIdVerifier.sol` and in
`web/src/lib/identity/agentic-id.ts`. If they ever disagree, publishing fails
on 0G with an opaque revert at the worst possible moment, so
`test_ProofLayoutIsStable` pins the exact byte counts on the Solidity side.

### Why plain ERC-721 transfers revert

`transferFrom` and `safeTransferFrom` revert with `PlainTransferDisabled`.
Moving an Agentic ID through the standard path would hand the new owner a token
whose metadata they hold no key for — theirs, and inert. ERC-7857 exists to
prevent exactly that. The only way out of a wallet is
`transfer(to, tokenId, proofs)`, which cannot succeed unless the receiver signed
for it and a re-sealed key was published.

Honest description: a non-transferable-by-default ERC-721 with a verified
transfer path.

---

## Forking is cloning

`forkManifest()` (frozen, `web/src/lib/contracts/manifest.ts`) strips the
wallet, the identity and the attestation. `AgenticId.clone()` mirrors that
onchain: the child gets a fresh token with its own re-sealed metadata and
`clonedFrom` set for attribution; the parent keeps its token, its wallet, and
its authorizations. Nothing about spending authority is inherited. This is a
security requirement, not a design preference (prd.md §12).

---

## Build, test, deploy

```bash
cd contracts
# On a fresh clone: OpenZeppelin is a git submodule (forge-std is vendored
# plainly). Without this, `forge build` fails on missing imports.
git submodule update --init --recursive

forge build
forge test -vvv          # 13 tests, incl. both directions of the binding
```

### Deploy to 0G Galileo testnet

```bash
cd contracts
export ZEROG_DEPLOYER_KEY=0x<funded key>      # faucet: https://faucet.0g.ai

forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --broadcast -vvv
```

Optional env, all with sane defaults:

| Var | Default |
|---|---|
| `AGENTIC_ID_NAME` | `Graph Mini Apps` |
| `AGENTIC_ID_SYMBOL` | `GMINI` |
| `ZEROG_STORAGE_INDEXER` | `https://indexer-storage-testnet-turbo.0g.ai` |
| `ZEROG_TEE_ATTESTOR` | `address(0)` — verifier stays permissive |

The script prints the three addresses and writes
`deployments/<chainId>.json`. Copy them into `web/.env.local`:

```
ZEROG_CHAIN_ID=16602
ZEROG_AGENTIC_ID_ADDRESS=0x...
ZEROG_REGISTRY_ADDRESS=0x...
ZEROG_VERIFIER_ADDRESS=0x...
ZEROG_RPC=https://evmrpc-testnet.0g.ai
ZEROG_DEPLOYER_KEY=0x...
```

The moment `ZEROG_REGISTRY_ADDRESS` is set, the ENSIP-25 `agent-registration`
key switches from a derived stand-in to the real deployment — nothing else in
the record set changes.

### Network

| | Chain ID | RPC | Explorer |
|---|---|---|---|
| **0G Galileo testnet** (default) | **16602** | `https://evmrpc-testnet.0g.ai` | `https://chainscan-galileo.0g.ai` |
| 0G mainnet | 16661 | `https://evmrpc.0g.ai` | `https://chainscan.0g.ai` |

> Chain id **16601** is the earlier Galileo V3 launch and still appears on
> ChainList and in stale configs. It is not this network.

Testnet is the default everywhere. Mainnet requires setting `ZEROG_CHAIN_ID`
explicitly and is never inferred from the presence of a key.

### Verify on the explorer

```bash
forge verify-contract <address> src/AgenticId.sol:AgenticId \
  --chain-id 16602 \
  --verifier blockscout \
  --verifier-url https://chainscan-galileo.0g.ai/api
```
