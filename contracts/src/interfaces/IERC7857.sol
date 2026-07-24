// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ERC-7857 — Intelligent NFTs / "Agentic ID" on 0G Chain.
 *
 * ## Which version of the standard is this?
 *
 * There are three mutually incompatible things called `IERC7857` in circulation:
 *
 *   V1  the prose sketch on docs.0g.ai (`transfer(from,to,id,sealedKey,proof)`).
 *       Matches no shipped code and does not compile against OpenZeppelin 5.
 *   V2  `0gfoundation/0g-agent-nft` branch `eip-7857-draft` — the tree the 0G
 *       docs actually link to. Flat interface, `bytes[]` proofs, a concrete
 *       `Verifier` with a documented proof byte layout.
 *   V3  the Final ERC text and repo `main` — structs instead of raw bytes,
 *       `iTransferFrom` instead of `transfer`, upgradeable beacon proxies,
 *       `mint` moved off the interface entirely.
 *
 * **We implement V2 verbatim**, because it is what 0G's own developer docs
 * point a builder at, and because its `Verifier` proof format is specified
 * precisely enough that we can generate genuinely valid proofs offchain
 * without a TEE attestation service that 0G does not publish an endpoint for.
 * Deviations from V2 are marked `DEVIATION:` and there are exactly two.
 *
 * Every deliberate scope decision is recorded in `contracts/README.md` under
 * "What is real and what is scoped". Nothing below is a stub that pretends.
 */

/// A single unit of encrypted agent metadata. V2 keeps hashes and descriptions
/// in parallel arrays; we keep the same shape.
struct PreimageProofOutput {
    bytes32 dataHash;
    bool isValid;
}

struct TransferValidityProofOutput {
    bytes32 oldDataHash;
    bytes32 newDataHash;
    address receiver;
    bytes16 sealedKey;
    bool isValid;
}

interface IERC7857DataVerifier {
    /// Verify that the prover holds the preimage of each claimed data hash.
    function verifyPreimage(bytes[] calldata _proofs)
        external
        returns (PreimageProofOutput[] memory);

    /// Verify that a transfer/clone is valid: the receiver is available, the
    /// metadata was re-encrypted, and the sealed key is bound to the receiver.
    function verifyTransferValidity(bytes[] calldata _proofs)
        external
        returns (TransferValidityProofOutput[] memory);
}

interface IERC7857 {
    event Minted(
        uint256 indexed _tokenId,
        address indexed _creator,
        address indexed _owner,
        bytes32[] _dataHashes,
        string[] _dataDescriptions
    );
    event Authorization(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event Transferred(uint256 _tokenId, address indexed _from, address indexed _to);
    event Cloned(
        uint256 indexed _tokenId, uint256 indexed _newTokenId, address _from, address _to
    );
    event PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes16[] _sealedKeys);

    function verifier() external view returns (IERC7857DataVerifier);

    function mint(bytes[] calldata _proofs, string[] calldata _dataDescriptions, address _to)
        external
        payable
        returns (uint256 _tokenId);

    function transfer(address _to, uint256 _tokenId, bytes[] calldata _proofs) external;

    function clone(address _to, uint256 _tokenId, bytes[] calldata _proofs)
        external
        returns (uint256 _newTokenId);

    function authorizeUsage(uint256 _tokenId, address _user) external;

    function ownerOf(uint256 _tokenId) external view returns (address);

    function authorizedUsersOf(uint256 _tokenId) external view returns (address[] memory);
}

interface IERC7857Metadata {
    event Updated(uint256 indexed _tokenId, bytes32[] _oldDataHashes, bytes32[] _newDataHashes);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 _tokenId) external view returns (string memory);
    function update(uint256 _tokenId, bytes[] calldata _proofs) external;
    function dataHashesOf(uint256 _tokenId) external view returns (bytes32[] memory);
    function dataDescriptionsOf(uint256 _tokenId) external view returns (string[] memory);
}
