// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MiniAppRegistry
 * @notice The onchain half of the Graph Mini Apps identity binding.
 *
 * A published mini app is three things that must agree with each other:
 *   1. an ENS name        (`aave-guard.graphminis.eth`)
 *   2. a manifest         (an IPFS CID, pinned, the executable artifact)
 *   3. an Agentic ID      (an ERC-7857 token on 0G Chain, the ownable asset)
 *
 * This contract is where (1) and (2) are asserted against (3). It is
 * deliberately the *only* place a name→manifest claim can be made, and it
 * refuses any claim not signed for by the current owner of the token.
 *
 * ## Mutual verification (prd.md §8)
 *
 * The ENS name carries `agent-registration[<erc7930(this)>][<tokenId>] = "1"`
 * per ENSIP-25, pointing forward at the token. This contract stores the ENS
 * name against the same tokenId, pointing back. Neither direction is
 * self-attesting on its own:
 *
 *   - the ENS record proves the *name owner* asserts the token
 *   - `records[keccak(name)].tokenId` proves the *token owner* asserts the name
 *
 * A verifier that checks both has established that the same principal controls
 * the name and the agent. That is the property that makes it safe to fund a
 * mini app's wallet. `verify()` performs exactly this check for the onchain
 * half; the offchain half is `verifyBinding()` in web/src/lib/identity/ens.ts.
 *
 * ## Forking
 *
 * A fork is an ERC-7857 clone plus a fresh registry entry with `forkedFrom`
 * set. Forks never inherit the parent's wallet or attestation — enforced in
 * `forkManifest()` offchain, and mirrored here by requiring the forker to own
 * the *child* token, never the parent's.
 */
interface IAgenticIdOwnership {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract MiniAppRegistry {
    /* ---------------------------------------------------------------- */
    /* types                                                            */
    /* ---------------------------------------------------------------- */

    struct AppRecord {
        /// Full ENS name, e.g. "aave-guard.graphminis.eth". Empty == unset.
        string ensName;
        /// IPFS CID of the manifest JSON (the ENS contenthash target).
        string manifestCID;
        /// keccak256 of the 0G Compute TEE attestation for the generating run.
        /// Zero when the plan was produced without a verifiable compute path.
        bytes32 attestationHash;
        /// ENS namehash of `ensName`, supplied by the registrant. Lets an
        /// onchain consumer join against an ENS registry without string work.
        bytes32 ensNode;
        /// The author's address — the wallet that first registered the name.
        address author;
        /// The ERC-7857 Agentic ID token this name is bound to.
        uint256 tokenId;
        /// keccak256 of the parent's ENS name, for forks. Zero for originals.
        bytes32 forkedFrom;
        /// Manifest semver, mirrored from `manifest.appVersion`.
        string appVersion;
        uint64 registeredAt;
        uint64 updatedAt;
        /// Monotonic; bumped on every `update`.
        uint32 revision;
    }

    /* ---------------------------------------------------------------- */
    /* storage                                                          */
    /* ---------------------------------------------------------------- */

    /// The Agentic ID collection whose ownership gates every write here.
    IAgenticIdOwnership public immutable agenticId;

    /// keccak256(bytes(ensName)) => record
    mapping(bytes32 => AppRecord) private _records;

    /// tokenId => keccak256(bytes(ensName)). The reverse half of the binding.
    mapping(uint256 => bytes32) public nameKeyOf;

    /// Every registered key, so the registry (prd.md §12) can be enumerated
    /// without an indexer during the demo.
    bytes32[] private _keys;

    /// keccak256(parent name) => child keys. Powers "times forked".
    mapping(bytes32 => bytes32[]) private _forks;

    /* ---------------------------------------------------------------- */
    /* events                                                           */
    /* ---------------------------------------------------------------- */

    event AppRegistered(
        bytes32 indexed nameKey,
        uint256 indexed tokenId,
        address indexed author,
        string ensName,
        string manifestCID,
        bytes32 attestationHash
    );

    event AppUpdated(
        bytes32 indexed nameKey,
        uint256 indexed tokenId,
        string manifestCID,
        bytes32 attestationHash,
        uint32 revision
    );

    event AppForked(
        bytes32 indexed parentKey,
        bytes32 indexed childKey,
        uint256 indexed childTokenId
    );

    /* ---------------------------------------------------------------- */
    /* errors                                                           */
    /* ---------------------------------------------------------------- */

    error EmptyName();
    error EmptyManifest();
    error NameTaken(bytes32 nameKey);
    error NameUnknown(bytes32 nameKey);
    error TokenAlreadyBound(uint256 tokenId, bytes32 boundTo);
    error NotTokenOwner(uint256 tokenId, address caller);
    error ParentUnknown(bytes32 parentKey);

    /* ---------------------------------------------------------------- */

    constructor(address agenticId_) {
        agenticId = IAgenticIdOwnership(agenticId_);
    }

    /// The canonical key. Names are expected lowercase; casing is the
    /// caller's problem because ENS normalisation (UTS-46) is not something
    /// this contract can honestly claim to implement.
    function nameKey(string memory ensName) public pure returns (bytes32) {
        return keccak256(bytes(ensName));
    }

    modifier onlyTokenOwner(uint256 tokenId) {
        address owner = agenticId.ownerOf(tokenId);
        if (owner != msg.sender) revert NotTokenOwner(tokenId, msg.sender);
        _;
    }

    /* ---------------------------------------------------------------- */
    /* writes                                                           */
    /* ---------------------------------------------------------------- */

    /**
     * @notice Bind an ENS name to an Agentic ID and a manifest.
     * @dev Callable only by the current owner of `tokenId`. One name per
     *      token and one token per name — a token that already answers to a
     *      name cannot be re-pointed, because that would silently change what
     *      a funded name means.
     */
    function register(
        string calldata ensName,
        string calldata manifestCID,
        bytes32 attestationHash,
        bytes32 ensNode,
        uint256 tokenId,
        string calldata appVersion
    ) external onlyTokenOwner(tokenId) returns (bytes32 key) {
        if (bytes(ensName).length == 0) revert EmptyName();
        if (bytes(manifestCID).length == 0) revert EmptyManifest();

        key = nameKey(ensName);
        if (_records[key].author != address(0)) revert NameTaken(key);

        bytes32 bound = nameKeyOf[tokenId];
        if (bound != bytes32(0)) revert TokenAlreadyBound(tokenId, bound);

        _records[key] = AppRecord({
            ensName: ensName,
            manifestCID: manifestCID,
            attestationHash: attestationHash,
            ensNode: ensNode,
            author: msg.sender,
            tokenId: tokenId,
            forkedFrom: bytes32(0),
            appVersion: appVersion,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            revision: 1
        });
        nameKeyOf[tokenId] = key;
        _keys.push(key);

        emit AppRegistered(key, tokenId, msg.sender, ensName, manifestCID, attestationHash);
    }

    /**
     * @notice Same as `register`, but records the parent this app was forked
     *         from. `parentKey` must already exist so attribution cannot be
     *         faked against a name nobody published.
     */
    function registerFork(
        string calldata ensName,
        string calldata manifestCID,
        bytes32 attestationHash,
        bytes32 ensNode,
        uint256 tokenId,
        string calldata appVersion,
        bytes32 parentKey
    ) external returns (bytes32 key) {
        if (_records[parentKey].author == address(0)) revert ParentUnknown(parentKey);
        key = this.register(ensName, manifestCID, attestationHash, ensNode, tokenId, appVersion);
        _records[key].forkedFrom = parentKey;
        _forks[parentKey].push(key);
        emit AppForked(parentKey, key, tokenId);
    }

    /**
     * @notice Publish a new manifest revision under an existing name.
     * @dev Gated on *current* token ownership, not on `author`. Selling an
     *      Agentic ID transfers the right to ship updates, which is the whole
     *      point of the app being an ownable asset. `author` is immutable
     *      attribution and is never rewritten.
     */
    function update(
        bytes32 key,
        string calldata manifestCID,
        bytes32 attestationHash,
        string calldata appVersion
    ) external {
        AppRecord storage rec = _records[key];
        if (rec.author == address(0)) revert NameUnknown(key);
        if (bytes(manifestCID).length == 0) revert EmptyManifest();
        address owner = agenticId.ownerOf(rec.tokenId);
        if (owner != msg.sender) revert NotTokenOwner(rec.tokenId, msg.sender);

        rec.manifestCID = manifestCID;
        rec.attestationHash = attestationHash;
        rec.appVersion = appVersion;
        rec.updatedAt = uint64(block.timestamp);
        unchecked {
            rec.revision += 1;
        }
        emit AppUpdated(key, rec.tokenId, manifestCID, attestationHash, rec.revision);
    }

    /* ---------------------------------------------------------------- */
    /* reads                                                            */
    /* ---------------------------------------------------------------- */

    function get(bytes32 key) external view returns (AppRecord memory) {
        return _records[key];
    }

    function getByName(string calldata ensName) external view returns (AppRecord memory) {
        return _records[nameKey(ensName)];
    }

    function getByToken(uint256 tokenId) external view returns (AppRecord memory) {
        return _records[nameKeyOf[tokenId]];
    }

    function exists(bytes32 key) external view returns (bool) {
        return _records[key].author != address(0);
    }

    /**
     * @notice The onchain half of the ENSIP-25 mutual check.
     * @return ok        true when `ensName` is bound to `tokenId` here AND the
     *                   token still exists with a live owner.
     * @return owner     current owner of the Agentic ID — the party a verifier
     *                   must find asserting the matching ENS text record.
     * @return manifestCID the manifest a resolver should have pointed at.
     *
     * A caller completes the proof by reading
     * `agent-registration[erc7930(this)][tokenId]` from `ensName` and finding
     * `"1"`. Both halves passing means one principal controls both.
     */
    function verify(string calldata ensName, uint256 tokenId)
        external
        view
        returns (bool ok, address owner, string memory manifestCID)
    {
        bytes32 key = nameKey(ensName);
        AppRecord storage rec = _records[key];
        if (rec.author == address(0) || rec.tokenId != tokenId) {
            return (false, address(0), "");
        }
        if (nameKeyOf[tokenId] != key) return (false, address(0), "");
        owner = agenticId.ownerOf(tokenId);
        return (owner != address(0), owner, rec.manifestCID);
    }

    function totalApps() external view returns (uint256) {
        return _keys.length;
    }

    function keyAt(uint256 index) external view returns (bytes32) {
        return _keys[index];
    }

    /// Paged enumeration — the registry grid reads this directly on testnet.
    function page(uint256 offset, uint256 limit) external view returns (AppRecord[] memory out) {
        uint256 total = _keys.length;
        if (offset >= total) return new AppRecord[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        out = new AppRecord[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = _records[_keys[i]];
        }
    }

    function forkCount(bytes32 parentKey) external view returns (uint256) {
        return _forks[parentKey].length;
    }

    function forksOf(bytes32 parentKey) external view returns (bytes32[] memory) {
        return _forks[parentKey];
    }
}
