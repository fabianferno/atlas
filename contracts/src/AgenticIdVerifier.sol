// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    IERC7857DataVerifier,
    PreimageProofOutput,
    TransferValidityProofOutput
} from "./interfaces/IERC7857.sol";

/**
 * @title AgenticIdVerifier
 * @notice The ERC-7857 data verifier — the "oracle" side of the standard.
 *
 * ## What is actually verified here
 *
 * Everything in this contract is real cryptography. There are no
 * `isValid = true` stubs — the reference `eip-7857-draft` verifier ships two
 * of those (`verifyPreimage` returns true for any 32-byte blob, and the TEE
 * signature check is a `// TODO`) and we did not copy them.
 *
 * Concretely, a proof is accepted only if all of these hold:
 *
 *   1. **Well-formedness.** The proof matches the byte layout below exactly.
 *   2. **Replay protection.** Its 48-byte nonce has never been consumed by
 *      this verifier before. Marked before use, so a proof is single-use even
 *      within one transaction.
 *   3. **Availability signature.** The 65-byte ECDSA signature recovers to a
 *      non-zero address over the exact digest the standard specifies. For a
 *      transfer, `AgenticId` then requires that recovered address to equal the
 *      receiver — meaning **you cannot push an Agentic ID onto someone who has
 *      not signed for it**, which is the property the encrypted-metadata
 *      handoff depends on.
 *   4. **Oracle attestation**, when `strictOracle` is on. A trailing 65-byte
 *      signature from a registered attestor over the same digest.
 *
 * ## What is NOT verified — stated plainly
 *
 * - **The TEE quote itself.** 0G publishes no onchain attestation-verifier
 *   address and no prover endpoint. `strictOracle` therefore checks that a
 *   *registered signing key* signed the proof, not that an Intel TDX enclave
 *   produced it. Registering the enclave's key via `setAttestor` is the whole
 *   of the remaining work; the verification path is already wired.
 * - **ZKP proofs.** `ProofType.ZKP` is rejected outright rather than accepted
 *   without checking, because silently accepting an unverified ZKP is strictly
 *   worse than not supporting it.
 * - **That the ciphertext decrypts to anything in particular.** No onchain
 *   verifier can do this; that is the point of the oracle.
 *
 * ## Proof byte layout (V2 `eip-7857-draft`)
 *
 * ```
 *  offset  len  field
 *  0       1    flags   bit 0x80 = proof type (0 TEE, 1 ZKP)
 *                       bit 0x40 = 1 when the data is private (encrypted)
 *  1       65   availability signature (r,s,v) by the receiving party
 *  66      48   nonce
 *  114     32   newDataHash
 *  146     32   oldDataHash    -- transfer proofs only
 *  178     16   sealedKey      -- private-data transfer proofs only
 *  194     65   oracle attestation signature   -- optional, our extension
 * ```
 *
 * DEVIATION 1: the reference verifier reads `sealedKey` as a `bytes16` out of a
 * *12-byte* slice (`proof[178:190]`), which silently pulls four bytes of
 * whatever follows. We use the full 16 bytes at `[178:194]`. The bug is in
 * their slicing, not in the format.
 *
 * DEVIATION 2: the trailing oracle signature at `[194:259]` is ours. Proofs
 * without it are still accepted when `strictOracle` is false, so the layout
 * stays backward compatible with the reference format.
 *
 * ## Signed digest
 *
 * ```
 * inner  = keccak256(abi.encodePacked(newDataHash[, oldDataHash], nonce))
 * digest = keccak256("\x19Ethereum Signed Message:\n66" || hexString(inner))
 * ```
 * where `hexString` is the 0x-prefixed, 64-hex-char lowercase form — 66 bytes.
 * This is `personal_sign` over the *hex string* of the inner hash, which is
 * what `ethers.signMessage(hash)` and `viem.signMessage({ message })` produce
 * when handed a hex string. Matching it exactly is why proofs can be built in
 * TypeScript with no special tooling.
 */
contract AgenticIdVerifier is IERC7857DataVerifier, Ownable {
    using ECDSA for bytes32;

    enum ProofType {
        TEE,
        ZKP
    }

    /* ---------------------------------------------------------------- */

    uint256 internal constant OFF_SIG = 1;
    uint256 internal constant OFF_NONCE = 66;
    uint256 internal constant OFF_NEW_HASH = 114;
    uint256 internal constant OFF_OLD_HASH = 146;
    uint256 internal constant OFF_SEALED_KEY = 178;
    uint256 internal constant OFF_ORACLE_SIG = 194;

    uint256 internal constant LEN_PREIMAGE = 146;
    uint256 internal constant LEN_TRANSFER_PUBLIC = 178;
    uint256 internal constant LEN_TRANSFER_PRIVATE = 194;

    uint8 internal constant FLAG_ZKP = 0x80;
    uint8 internal constant FLAG_PRIVATE = 0x40;

    /* ---------------------------------------------------------------- */

    /// Consumed nonces, keyed by keccak256(nonce). Single-use proofs.
    mapping(bytes32 => bool) public proofUsed;

    /// Signing keys we accept as oracle attestations. In production these are
    /// the public keys reported by a TEE quote; today they are set by the owner.
    mapping(address => bool) public attestors;

    /// When true, every proof must additionally carry a registered attestor's
    /// signature. Off by default so a testnet demo works without an enclave;
    /// flip it on the moment a real TEE key exists.
    bool public strictOracle;

    event AttestorSet(address indexed attestor, bool allowed);
    event StrictOracleSet(bool strict);

    error ProofTooShort(uint256 length, uint256 required);
    error ProofReplayed(bytes32 nonceKey);
    error UnsupportedProofType();
    error MissingOracleSignature();
    error UntrustedAttestor(address recovered);
    error EmptyProofSet();

    constructor(address owner_, address attestor_) Ownable(owner_) {
        if (attestor_ != address(0)) {
            attestors[attestor_] = true;
            emit AttestorSet(attestor_, true);
        }
    }

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        attestors[attestor] = allowed;
        emit AttestorSet(attestor, allowed);
    }

    function setStrictOracle(bool strict) external onlyOwner {
        strictOracle = strict;
        emit StrictOracleSet(strict);
    }

    /* ---------------------------------------------------------------- */
    /* digest                                                           */
    /* ---------------------------------------------------------------- */

    /// The exact digest a prover must sign. Exposed so an offchain signer can
    /// assert it agrees with the contract rather than hoping it does.
    function digestFor(bytes32 newDataHash, bytes32 oldDataHash, bytes memory nonce)
        public
        pure
        returns (bytes32)
    {
        bytes32 inner = oldDataHash == bytes32(0)
            ? keccak256(abi.encodePacked(newDataHash, nonce))
            : keccak256(abi.encodePacked(newDataHash, oldDataHash, nonce));
        return MessageHashUtils.toEthSignedMessageHash(
            bytes(Strings.toHexString(uint256(inner), 32))
        );
    }

    /* ---------------------------------------------------------------- */
    /* verification                                                     */
    /* ---------------------------------------------------------------- */

    struct Parsed {
        bytes32 newDataHash;
        bytes32 oldDataHash;
        bytes16 sealedKey;
        address signer;
        bool isPrivate;
    }

    function _parse(bytes calldata proof, bool isTransfer) internal returns (Parsed memory p) {
        uint8 flags = uint8(proof[0]);
        if (flags & FLAG_ZKP != 0) revert UnsupportedProofType();
        p.isPrivate = flags & FLAG_PRIVATE != 0;

        uint256 required = isTransfer
            ? (p.isPrivate ? LEN_TRANSFER_PRIVATE : LEN_TRANSFER_PUBLIC)
            : LEN_PREIMAGE;
        if (proof.length < required) revert ProofTooShort(proof.length, required);

        bytes memory nonce = proof[OFF_NONCE:OFF_NEW_HASH];
        bytes32 nonceKey = keccak256(nonce);
        if (proofUsed[nonceKey]) revert ProofReplayed(nonceKey);
        proofUsed[nonceKey] = true;

        p.newDataHash = bytes32(proof[OFF_NEW_HASH:OFF_OLD_HASH]);
        if (isTransfer) {
            p.oldDataHash = bytes32(proof[OFF_OLD_HASH:OFF_SEALED_KEY]);
            if (p.isPrivate) {
                p.sealedKey = bytes16(proof[OFF_SEALED_KEY:OFF_ORACLE_SIG]);
            }
        }

        bytes32 digest = digestFor(p.newDataHash, p.oldDataHash, nonce);
        p.signer = digest.recover(bytes(proof[OFF_SIG:OFF_NONCE]));

        if (strictOracle) {
            if (proof.length < OFF_ORACLE_SIG + 65) revert MissingOracleSignature();
            address oracle = digest.recover(bytes(proof[OFF_ORACLE_SIG:OFF_ORACLE_SIG + 65]));
            if (!attestors[oracle]) revert UntrustedAttestor(oracle);
        }
    }

    /// @inheritdoc IERC7857DataVerifier
    function verifyPreimage(bytes[] calldata _proofs)
        external
        override
        returns (PreimageProofOutput[] memory out)
    {
        if (_proofs.length == 0) revert EmptyProofSet();
        out = new PreimageProofOutput[](_proofs.length);
        for (uint256 i = 0; i < _proofs.length; ++i) {
            Parsed memory p = _parse(_proofs[i], false);
            out[i] = PreimageProofOutput({
                dataHash: p.newDataHash,
                isValid: p.signer != address(0) && p.newDataHash != bytes32(0)
            });
        }
    }

    /**
     * @notice Extension over ERC-7857: returns the recovered prover alongside
     *         each preimage result.
     * @dev The V2 `PreimageProofOutput` struct has nowhere to put the signer,
     *      which makes it impossible for a minting contract to check that the
     *      party being minted to actually signed. Rather than widen the
     *      standard struct, we add a sibling function. `AgenticId.mint` uses
     *      this one and enforces `provers[i] == _to`.
     */
    function verifyPreimageWithProver(bytes[] calldata _proofs)
        external
        returns (PreimageProofOutput[] memory out, address[] memory provers)
    {
        if (_proofs.length == 0) revert EmptyProofSet();
        out = new PreimageProofOutput[](_proofs.length);
        provers = new address[](_proofs.length);
        for (uint256 i = 0; i < _proofs.length; ++i) {
            Parsed memory p = _parse(_proofs[i], false);
            out[i] = PreimageProofOutput({
                dataHash: p.newDataHash,
                isValid: p.signer != address(0) && p.newDataHash != bytes32(0)
            });
            provers[i] = p.signer;
        }
    }

    /// @inheritdoc IERC7857DataVerifier
    function verifyTransferValidity(bytes[] calldata _proofs)
        external
        override
        returns (TransferValidityProofOutput[] memory out)
    {
        if (_proofs.length == 0) revert EmptyProofSet();
        out = new TransferValidityProofOutput[](_proofs.length);
        for (uint256 i = 0; i < _proofs.length; ++i) {
            Parsed memory p = _parse(_proofs[i], true);
            out[i] = TransferValidityProofOutput({
                oldDataHash: p.oldDataHash,
                newDataHash: p.newDataHash,
                // The availability signature IS the receiver's assertion that
                // it can take custody. Recovering it is how the receiver is
                // identified — it is never passed in as an unchecked argument.
                receiver: p.signer,
                sealedKey: p.sealedKey,
                isValid: p.signer != address(0) && p.newDataHash != bytes32(0)
            });
        }
    }
}
