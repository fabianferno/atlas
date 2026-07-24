// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AgenticIdVerifier} from "../src/AgenticIdVerifier.sol";
import {AgenticId} from "../src/AgenticId.sol";
import {MiniAppRegistry} from "../src/MiniAppRegistry.sol";

/**
 * Deploys the identity layer to 0G Chain.
 *
 *   AgenticIdVerifier  — ERC-7857 data verifier (the oracle seam)
 *   AgenticId          — ERC-7857 Agentic ID collection
 *   MiniAppRegistry    — ENS name <-> Agentic ID binding
 *
 * Run:
 *   cd contracts
 *   export ZEROG_DEPLOYER_KEY=0x...
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url https://evmrpc-testnet.0g.ai \
 *     --broadcast -vvv
 *
 * Testnet by default. `ZEROG_RPC` pointing at mainnet is the only way to get
 * mainnet, and the script prints the chain id it is about to write to so a
 * mistake is visible before the first transaction, not after.
 */
contract Deploy is Script {
    // 0G Galileo testnet. Chain 16601 is the older Galileo V3 launch and is
    // NOT this network — if you see 16601 anywhere, the config is stale.
    uint256 internal constant OG_TESTNET = 16602;
    uint256 internal constant OG_MAINNET = 16661;

    function run() external {
        uint256 pk = vm.envUint("ZEROG_DEPLOYER_KEY");
        address deployer = vm.addr(pk);

        string memory collectionName = vm.envOr("AGENTIC_ID_NAME", string("Graph Mini Apps"));
        string memory collectionSymbol = vm.envOr("AGENTIC_ID_SYMBOL", string("GMINI"));
        string memory storageInfo =
            vm.envOr("ZEROG_STORAGE_INDEXER", string("https://indexer-storage-testnet-turbo.0g.ai"));
        // The TEE's signing key, when one exists. Zero is fine — the verifier
        // stays in permissive mode and `setAttestor` can be called later.
        address attestor = vm.envOr("ZEROG_TEE_ATTESTOR", address(0));

        console2.log("chain id  ", block.chainid);
        console2.log("deployer  ", deployer);
        console2.log("balance   ", deployer.balance);
        if (block.chainid == OG_MAINNET) {
            console2.log("!! DEPLOYING TO 0G MAINNET !!");
        } else if (block.chainid != OG_TESTNET) {
            console2.log("note: not 0G Galileo testnet (16602) - double-check --rpc-url");
        }

        vm.startBroadcast(pk);

        AgenticIdVerifier verifier = new AgenticIdVerifier(deployer, attestor);
        AgenticId agenticId =
            new AgenticId(collectionName, collectionSymbol, storageInfo, address(verifier), deployer);
        MiniAppRegistry registry = new MiniAppRegistry(address(agenticId));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== deployed ===");
        console2.log("AgenticIdVerifier ", address(verifier));
        console2.log("AgenticId         ", address(agenticId));
        console2.log("MiniAppRegistry   ", address(registry));
        console2.log("");
        console2.log("Put these in web/.env.local:");
        console2.log("  ZEROG_CHAIN_ID=%s", vm.toString(block.chainid));
        console2.log("  ZEROG_AGENTIC_ID_ADDRESS=%s", vm.toString(address(agenticId)));
        console2.log("  ZEROG_REGISTRY_ADDRESS=%s", vm.toString(address(registry)));
        console2.log("  ZEROG_VERIFIER_ADDRESS=%s", vm.toString(address(verifier)));
        console2.log("");
        console2.log("ENSIP-25 registry key component (ERC-7930) is derived from");
        console2.log("ZEROG_CHAIN_ID + ZEROG_REGISTRY_ADDRESS in ens.ts.");

        _writeDeployment(address(verifier), address(agenticId), address(registry));
    }

    function _writeDeployment(address verifier, address agenticId, address registry) internal {
        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(block.chainid),
            ",\n",
            '  "AgenticIdVerifier": "',
            vm.toString(verifier),
            '",\n',
            '  "AgenticId": "',
            vm.toString(agenticId),
            '",\n',
            '  "MiniAppRegistry": "',
            vm.toString(registry),
            '"\n}\n'
        );
        string memory path =
            string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeFile(path, json);
        console2.log("wrote", path);
    }
}
