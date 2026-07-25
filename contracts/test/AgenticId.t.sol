// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgenticIdVerifier} from "../src/AgenticIdVerifier.sol";
import {AgenticId} from "../src/AgenticId.sol";
import {MiniAppRegistry} from "../src/MiniAppRegistry.sol";

/**
 * These tests exist for one reason beyond the usual: the proof byte layout and
 * the signed digest are also implemented in TypeScript
 * (`web/src/lib/identity/agentic-id.ts`). If the two ever disagree, publishing
 * fails on 0G with an opaque revert at the demo. `test_ProofLayoutIsStable`
 * pins the exact bytes both sides must produce.
 */
contract AgenticIdTest is Test {
    AgenticIdVerifier internal verifier;
    AgenticId internal nft;
    MiniAppRegistry internal registry;

    uint256 internal alicePk = 0xA11CE;
    uint256 internal bobPk = 0xB0B;
    address internal alice;
    address internal bob;

    function setUp() public {
        alice = vm.addr(alicePk);
        bob = vm.addr(bobPk);
        verifier = new AgenticIdVerifier(address(this), address(0));
        nft = new AgenticId("Atlas", "GMINI", "ipfs://", address(verifier), address(this));
        registry = new MiniAppRegistry(address(nft));
    }

    /* ---------------------------------------------------------------- */
    /* proof construction — mirrors buildPreimageProof/buildTransferProof */
    /* ---------------------------------------------------------------- */

    function _nonce(uint256 seed) internal pure returns (bytes memory n) {
        n = new bytes(48);
        for (uint256 i = 0; i < 48; ++i) {
            n[i] = bytes1(uint8(uint256(keccak256(abi.encode(seed, i)))));
        }
    }

    function _sign(uint256 pk, bytes32 newHash, bytes32 oldHash, bytes memory nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = verifier.digestFor(newHash, oldHash, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _preimageProof(uint256 pk, bytes32 dataHash, uint256 seed)
        internal
        view
        returns (bytes memory)
    {
        bytes memory nonce = _nonce(seed);
        // flags 0x40 = private data, TEE proof type.
        return abi.encodePacked(bytes1(0x40), _sign(pk, dataHash, bytes32(0), nonce), nonce, dataHash);
    }

    function _transferProof(uint256 pk, bytes32 newHash, bytes32 oldHash, bytes16 sealedKey, uint256 seed)
        internal
        view
        returns (bytes memory)
    {
        bytes memory nonce = _nonce(seed);
        return abi.encodePacked(
            bytes1(0x40), _sign(pk, newHash, oldHash, nonce), nonce, newHash, oldHash, sealedKey
        );
    }

    /* ---------------------------------------------------------------- */

    function test_ProofLayoutIsStable() public view {
        bytes memory proof = _preimageProof(alicePk, keccak256("manifest"), 1);
        // 1 flag + 65 sig + 48 nonce + 32 hash
        assertEq(proof.length, 146, "preimage proof must be exactly 146 bytes");

        bytes memory t = _transferProof(alicePk, keccak256("new"), keccak256("old"), bytes16(uint128(7)), 2);
        // + 32 oldHash + 16 sealedKey
        assertEq(t.length, 194, "private transfer proof must be exactly 194 bytes");
    }

    function _mintTo(address to, uint256 pk, string memory ensName, uint256 seed)
        internal
        returns (uint256 tokenId, bytes32 dataHash)
    {
        dataHash = keccak256(abi.encodePacked("ciphertext", seed));
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _preimageProof(pk, dataHash, seed);
        string[] memory descs = new string[](1);
        descs[0] = "manifest:aes-256-gcm";
        vm.prank(to);
        tokenId = nft.mintAgent(proofs, descs, to, ensName, "ipfs://bafytest");
    }

    function test_MintBindsEnsNameAndRecoversProver() public {
        (uint256 tokenId,) = _mintTo(alice, alicePk, "aave-guard.atlas-apps.eth", 1);
        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), alice);
        assertEq(nft.ensNameOf(tokenId), "aave-guard.atlas-apps.eth");
        assertEq(nft.tokenIdByEnsName(keccak256("aave-guard.atlas-apps.eth")), tokenId);
    }

    function test_MintRejectsProofSignedBySomeoneElse() public {
        bytes32 dataHash = keccak256("ciphertext");
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _preimageProof(bobPk, dataHash, 9); // bob signs, alice receives
        string[] memory descs = new string[](1);
        descs[0] = "manifest";
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AgenticId.ProverIsNotReceiver.selector, 0, bob, alice)
        );
        nft.mintAgent(proofs, descs, alice, "x.atlas-apps.eth", "");
    }

    function test_NonceIsSingleUse() public {
        bytes32 dataHash = keccak256("ciphertext");
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _preimageProof(alicePk, dataHash, 3);
        string[] memory descs = new string[](1);
        descs[0] = "manifest";
        vm.prank(alice);
        nft.mintAgent(proofs, descs, alice, "a.atlas-apps.eth", "");
        vm.prank(alice);
        vm.expectRevert();
        nft.mintAgent(proofs, descs, alice, "b.atlas-apps.eth", "");
    }

    function test_PlainErc721TransferReverts() public {
        (uint256 tokenId,) = _mintTo(alice, alicePk, "a.atlas-apps.eth", 1);
        vm.prank(alice);
        vm.expectRevert(AgenticId.PlainTransferDisabled.selector);
        nft.transferFrom(alice, bob, tokenId);
    }

    function test_TransferRequiresReceiverSignature() public {
        (uint256 tokenId, bytes32 oldHash) = _mintTo(alice, alicePk, "a.atlas-apps.eth", 1);
        bytes32 newHash = keccak256("resealed");
        bytes[] memory proofs = new bytes[](1);
        // Alice signs, but bob is the receiver — must be rejected.
        proofs[0] = _transferProof(alicePk, newHash, oldHash, bytes16(uint128(1)), 10);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgenticId.ReceiverMismatch.selector, 0, alice, bob));
        nft.transfer(bob, tokenId, proofs);

        // Bob signs: accepted, hash rotates, ownership moves.
        proofs[0] = _transferProof(bobPk, newHash, oldHash, bytes16(uint128(1)), 11);
        vm.prank(alice);
        nft.transfer(bob, tokenId, proofs);
        assertEq(nft.ownerOf(tokenId), bob);
        assertEq(nft.dataHashesOf(tokenId)[0], newHash);
    }

    function test_TransferRejectsStaleOldHash() public {
        (uint256 tokenId,) = _mintTo(alice, alicePk, "a.atlas-apps.eth", 1);
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _transferProof(bobPk, keccak256("new"), keccak256("wrong"), bytes16(0), 12);
        vm.prank(alice);
        vm.expectRevert();
        nft.transfer(bob, tokenId, proofs);
    }

    function test_CloneIsAFork() public {
        (uint256 parent, bytes32 oldHash) = _mintTo(alice, alicePk, "aave-guard.atlas-apps.eth", 1);
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _transferProof(bobPk, keccak256("bobs-copy"), oldHash, bytes16(uint128(2)), 20);
        vm.prank(alice);
        uint256 child = nft.clone(bob, parent, proofs);

        assertEq(nft.ownerOf(parent), alice, "parent must not move");
        assertEq(nft.ownerOf(child), bob);
        assertEq(nft.clonedFrom(child), parent, "attribution retained");
        // A fork inherits no ENS name and therefore no funded identity.
        assertEq(bytes(nft.ensNameOf(child)).length, 0);
    }

    /* ---------------------------------------------------------------- */
    /* the mutual verification claim                                    */
    /* ---------------------------------------------------------------- */

    function test_RegistryHoldsTheReverseHalfOfTheBinding() public {
        string memory ensName = "aave-guard.atlas-apps.eth";
        (uint256 tokenId,) = _mintTo(alice, alicePk, ensName, 1);

        vm.prank(alice);
        registry.register(ensName, "bafkreitest", keccak256("attestation"), bytes32(0), tokenId, "1.0.0");

        (bool ok, address owner, string memory cid) = registry.verify(ensName, tokenId);
        assertTrue(ok, "token owner asserts the name");
        assertEq(owner, alice);
        assertEq(cid, "bafkreitest");

        // A name the token never claimed does not verify.
        (bool bad,,) = registry.verify("someone-else.atlas-apps.eth", tokenId);
        assertFalse(bad);
    }

    function test_RegistryRefusesNonOwner() public {
        (uint256 tokenId,) = _mintTo(alice, alicePk, "a.atlas-apps.eth", 1);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(MiniAppRegistry.NotTokenOwner.selector, tokenId, bob)
        );
        registry.register("a.atlas-apps.eth", "cid", bytes32(0), bytes32(0), tokenId, "1.0.0");
    }

    function test_UpdateFollowsTokenOwnershipNotAuthorship() public {
        string memory ensName = "a.atlas-apps.eth";
        (uint256 tokenId, bytes32 oldHash) = _mintTo(alice, alicePk, ensName, 1);
        vm.prank(alice);
        registry.register(ensName, "cid-v1", bytes32(0), bytes32(0), tokenId, "1.0.0");

        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _transferProof(bobPk, keccak256("resealed"), oldHash, bytes16(0), 30);
        vm.prank(alice);
        nft.transfer(bob, tokenId, proofs);

        // Hoisted: `nameKey` is an external staticcall and would otherwise
        // consume the prank/expectRevert intended for `update`.
        bytes32 key = registry.nameKey(ensName);

        // Alice authored it but no longer owns it.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MiniAppRegistry.NotTokenOwner.selector, tokenId, alice)
        );
        registry.update(key, "cid-v2", bytes32(0), "2.0.0");

        vm.prank(bob);
        registry.update(key, "cid-v2", bytes32(0), "2.0.0");
        MiniAppRegistry.AppRecord memory rec = registry.getByName(ensName);
        assertEq(rec.manifestCID, "cid-v2");
        assertEq(rec.author, alice, "attribution is immutable");
        assertEq(rec.revision, 2);
    }

    function test_StrictOracleRequiresAttestorSignature() public {
        verifier.setStrictOracle(true);
        bytes32 dataHash = keccak256("ciphertext");
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _preimageProof(alicePk, dataHash, 40); // no trailing oracle sig
        string[] memory descs = new string[](1);
        descs[0] = "manifest";
        vm.prank(alice);
        vm.expectRevert(AgenticIdVerifier.MissingOracleSignature.selector);
        nft.mintAgent(proofs, descs, alice, "a.atlas-apps.eth", "");
    }

    function test_ZkpProofsAreRejectedNotSilentlyAccepted() public {
        bytes32 dataHash = keccak256("ciphertext");
        bytes memory nonce = _nonce(50);
        bytes memory proof =
            abi.encodePacked(bytes1(0xC0), _sign(alicePk, dataHash, bytes32(0), nonce), nonce, dataHash);
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;
        string[] memory descs = new string[](1);
        descs[0] = "manifest";
        vm.prank(alice);
        vm.expectRevert(AgenticIdVerifier.UnsupportedProofType.selector);
        nft.mintAgent(proofs, descs, alice, "a.atlas-apps.eth", "");
    }
}
