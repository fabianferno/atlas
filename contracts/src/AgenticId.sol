// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {
    IERC7857,
    IERC7857Metadata,
    IERC7857DataVerifier,
    PreimageProofOutput,
    TransferValidityProofOutput
} from "./interfaces/IERC7857.sol";

interface IAgenticIdVerifierExt {
    function verifyPreimageWithProver(bytes[] calldata _proofs)
        external
        returns (PreimageProofOutput[] memory out, address[] memory provers);
}

/**
 * @title AgenticId
 * @notice ERC-7857 "Agentic ID" for Atlas, on 0G Chain.
 *
 * Every published mini app is minted here. That is not decoration: a mini app
 * holds a wallet and can spend, so it needs an owner, and an owner needs
 * something to own. ERC-7857 is the standard for exactly that — an agent as an
 * onchain asset whose *metadata is encrypted*, so transferring the token
 * transfers real, private capability rather than a pointer to a public file.
 *
 * The fit is unusually literal:
 *
 *   - a mini app **is** an agent (it has a plan, a policy, and triggers)
 *   - a mini app **is** ownable (someone published it and can sell it)
 *   - **forking a mini app is an ERC-7857 clone** — the same encrypted
 *     capability, re-sealed to a new owner, with attribution retained
 *
 * ## Encrypted metadata
 *
 * `dataHashes[i]` is `keccak256(ciphertext_i)` where `ciphertext_i` is the
 * AES-256-GCM encryption of one metadata blob (the manifest; the agent's
 * memory journal). The ciphertext lives in 0G Storage — or IPFS, or a local
 * store, see `web/src/lib/identity/agentic-id.ts` — and the *content key* is
 * never onchain. On transfer, the key is re-sealed to the receiver and
 * published as `sealedKey` in `PublishedSealedKey`.
 *
 * ## Why plain ERC-721 transfers revert
 *
 * `transferFrom` and `safeTransferFrom` are disabled on purpose. Moving an
 * Agentic ID with the standard ERC-721 path would hand the new owner a token
 * whose metadata they hold no key for — the token would be "theirs" and
 * inert. ERC-7857 exists precisely to prevent that, so the only way out of a
 * wallet is `transfer(to, tokenId, proofs)`, which cannot succeed unless the
 * receiver signed for it and a re-sealed key was published.
 *
 * The token is still a real ERC-721 for *reading* — `ownerOf`, `balanceOf`,
 * `tokenURI`, enumeration in explorers all work. It is a non-transferable-by-
 * default asset with a verified transfer path, which is the honest description.
 *
 * ## Mutual verification with ENS (prd.md §8)
 *
 * `ensNameOf[tokenId]` is the token's claim on an ENS name. The name's
 * `agent-registration[<erc7930(registry)>][<tokenId>]` text record is the
 * name's claim on the token. Neither is sufficient alone; together they prove
 * one principal controls both. `MiniAppRegistry.verify()` checks the onchain
 * half, `verifyEnsSideOfBinding()` in the web app checks the ENS half.
 */
contract AgenticId is ERC721, IERC7857, IERC7857Metadata, Ownable, ReentrancyGuard {
    using Strings for uint256;

    /* ---------------------------------------------------------------- */
    /* storage                                                          */
    /* ---------------------------------------------------------------- */

    IERC7857DataVerifier private _verifier;

    uint256 private _nextTokenId = 1;

    /// Where the encrypted blobs live: an 0G Storage indexer URL, or an IPFS
    /// gateway. Descriptive only — the hashes are the authority.
    string public storageInfo;

    /// Optional fee, refunded above cost. Zero by default.
    uint256 public mintFee;

    mapping(uint256 => bytes32[]) private _dataHashes;
    mapping(uint256 => string[]) private _dataDescriptions;
    mapping(uint256 => address) public creatorOf;
    mapping(uint256 => uint256) public clonedFrom;
    mapping(uint256 => string) private _tokenURIs;

    /// The token's claim on an ENS name. Set once, by the owner, at mint.
    mapping(uint256 => string) public ensNameOf;
    /// keccak256(bytes(ensName)) => tokenId. Reverse lookup, one name per token.
    mapping(bytes32 => uint256) public tokenIdByEnsName;

    mapping(uint256 => address[]) private _authorizedUsers;
    mapping(uint256 => mapping(address => bool)) private _usageAuthorized;

    /// Cap so `authorizedUsersOf` can never become unreadable.
    uint256 public constant MAX_AUTHORIZED_USERS = 64;

    /* ---------------------------------------------------------------- */
    /* events (beyond IERC7857)                                         */
    /* ---------------------------------------------------------------- */

    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event EnsNameBound(uint256 indexed tokenId, bytes32 indexed nameKey, string ensName);
    event AuthorizationRevoked(address indexed from, address indexed to, uint256 indexed tokenId);
    event MintFeeUpdated(uint256 fee);

    /* ---------------------------------------------------------------- */
    /* errors                                                           */
    /* ---------------------------------------------------------------- */

    error PlainTransferDisabled();
    error NotOwner(uint256 tokenId, address caller);
    error EmptyProofs();
    error ProofCountMismatch(uint256 proofs, uint256 descriptions);
    error InvalidProof(uint256 index);
    error ProverIsNotReceiver(uint256 index, address prover, address receiver);
    error ReceiverMismatch(uint256 index, address recovered, address expected);
    error StaleDataHash(uint256 index, bytes32 expected, bytes32 got);
    error InsufficientFee(uint256 sent, uint256 required);
    error EnsNameTaken(bytes32 nameKey, uint256 tokenId);
    error EnsNameAlreadyBound(uint256 tokenId);
    error TooManyAuthorizedUsers();
    error NotAuthorized(uint256 tokenId, address user);

    /* ---------------------------------------------------------------- */

    constructor(
        string memory name_,
        string memory symbol_,
        string memory storageInfo_,
        address verifierAddr,
        address owner_
    ) ERC721(name_, symbol_) Ownable(owner_) {
        _verifier = IERC7857DataVerifier(verifierAddr);
        storageInfo = storageInfo_;
    }

    /* ---------------------------------------------------------------- */
    /* admin                                                            */
    /* ---------------------------------------------------------------- */

    function setVerifier(address newVerifier) external onlyOwner {
        emit VerifierUpdated(address(_verifier), newVerifier);
        _verifier = IERC7857DataVerifier(newVerifier);
    }

    function setStorageInfo(string calldata info) external onlyOwner {
        storageInfo = info;
    }

    function setMintFee(uint256 fee) external onlyOwner {
        mintFee = fee;
        emit MintFeeUpdated(fee);
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    /* ---------------------------------------------------------------- */
    /* views                                                            */
    /* ---------------------------------------------------------------- */

    function verifier() external view override returns (IERC7857DataVerifier) {
        return _verifier;
    }

    function ownerOf(uint256 tokenId)
        public
        view
        override(ERC721, IERC7857)
        returns (address)
    {
        return super.ownerOf(tokenId);
    }

    function name() public view override(ERC721, IERC7857Metadata) returns (string memory) {
        return super.name();
    }

    function symbol() public view override(ERC721, IERC7857Metadata) returns (string memory) {
        return super.symbol();
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, IERC7857Metadata)
        returns (string memory)
    {
        _requireOwned(tokenId);
        string memory uri = _tokenURIs[tokenId];
        if (bytes(uri).length > 0) return uri;
        return string.concat(storageInfo, "/", tokenId.toString());
    }

    function dataHashesOf(uint256 tokenId)
        external
        view
        override
        returns (bytes32[] memory)
    {
        return _dataHashes[tokenId];
    }

    function dataDescriptionsOf(uint256 tokenId)
        external
        view
        override
        returns (string[] memory)
    {
        return _dataDescriptions[tokenId];
    }

    function authorizedUsersOf(uint256 tokenId)
        external
        view
        override
        returns (address[] memory)
    {
        return _authorizedUsers[tokenId];
    }

    function isAuthorized(uint256 tokenId, address user) external view returns (bool) {
        return _usageAuthorized[tokenId][user] || _ownerOf(tokenId) == user;
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721) returns (bool) {
        return interfaceId == type(IERC7857).interfaceId
            || interfaceId == type(IERC7857Metadata).interfaceId
            || super.supportsInterface(interfaceId);
    }

    /* ---------------------------------------------------------------- */
    /* mint                                                             */
    /* ---------------------------------------------------------------- */

    /// @inheritdoc IERC7857
    function mint(bytes[] calldata _proofs, string[] calldata _dataDescriptionsIn, address _to)
        external
        payable
        override
        nonReentrant
        returns (uint256 tokenId)
    {
        return _mintAgent(_proofs, _dataDescriptionsIn, _to, "", "");
    }

    /**
     * @notice Mint and bind an ENS name and token URI in one transaction.
     * @dev The convenience the product actually uses. Binding the name at mint
     *      time is what makes the ENSIP-25 record verifiable immediately —
     *      there is never a window where the token exists but claims nothing.
     */
    function mintAgent(
        bytes[] calldata _proofs,
        string[] calldata _dataDescriptionsIn,
        address _to,
        string calldata ensName,
        string calldata uri
    ) external payable nonReentrant returns (uint256 tokenId) {
        return _mintAgent(_proofs, _dataDescriptionsIn, _to, ensName, uri);
    }

    function _mintAgent(
        bytes[] calldata _proofs,
        string[] calldata descriptions,
        address _to,
        string memory ensName,
        string memory uri
    ) internal returns (uint256 tokenId) {
        if (_proofs.length == 0) revert EmptyProofs();
        if (_proofs.length != descriptions.length) {
            revert ProofCountMismatch(_proofs.length, descriptions.length);
        }
        if (msg.value < mintFee) revert InsufficientFee(msg.value, mintFee);

        // Preimage proofs, with the prover recovered. Requiring prover == _to
        // means a mint is an assertion *by the receiving wallet* that it holds
        // the content key — not something a third party can do on its behalf.
        (PreimageProofOutput[] memory outputs, address[] memory provers) =
            IAgenticIdVerifierExt(address(_verifier)).verifyPreimageWithProver(_proofs);

        bytes32[] memory hashes = new bytes32[](outputs.length);
        for (uint256 i = 0; i < outputs.length; ++i) {
            if (!outputs[i].isValid) revert InvalidProof(i);
            if (provers[i] != _to) revert ProverIsNotReceiver(i, provers[i], _to);
            hashes[i] = outputs[i].dataHash;
        }

        tokenId = _nextTokenId++;
        _safeMint(_to, tokenId);

        _dataHashes[tokenId] = hashes;
        for (uint256 i = 0; i < descriptions.length; ++i) {
            _dataDescriptions[tokenId].push(descriptions[i]);
        }
        creatorOf[tokenId] = _to;
        if (bytes(uri).length > 0) _tokenURIs[tokenId] = uri;
        if (bytes(ensName).length > 0) _bindEnsName(tokenId, ensName);

        emit Minted(tokenId, _to, _to, hashes, descriptions);

        if (msg.value > mintFee) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - mintFee}("");
            require(ok, "refund failed");
        }
    }

    /* ---------------------------------------------------------------- */
    /* ENS binding                                                      */
    /* ---------------------------------------------------------------- */

    /// Bind after the fact — used when the subname is issued post-mint.
    function bindEnsName(uint256 tokenId, string calldata ensName) external {
        if (_ownerOf(tokenId) != msg.sender) revert NotOwner(tokenId, msg.sender);
        _bindEnsName(tokenId, ensName);
    }

    function _bindEnsName(uint256 tokenId, string memory ensName) internal {
        if (bytes(ensNameOf[tokenId]).length != 0) revert EnsNameAlreadyBound(tokenId);
        bytes32 key = keccak256(bytes(ensName));
        uint256 existing = tokenIdByEnsName[key];
        if (existing != 0) revert EnsNameTaken(key, existing);
        ensNameOf[tokenId] = ensName;
        tokenIdByEnsName[key] = tokenId;
        emit EnsNameBound(tokenId, key, ensName);
    }

    /* ---------------------------------------------------------------- */
    /* transfer / clone                                                 */
    /* ---------------------------------------------------------------- */

    /**
     * @inheritdoc IERC7857
     * @dev The receiver is *recovered from the proof*, never taken on trust,
     *      and must equal `_to`. The sealed keys are published so the receiver
     *      can decrypt what it now owns.
     */
    function transfer(address _to, uint256 _tokenId, bytes[] calldata _proofs)
        external
        override
        nonReentrant
    {
        address from = _ownerOf(_tokenId);
        if (from != msg.sender) revert NotOwner(_tokenId, msg.sender);

        (bytes32[] memory newHashes, bytes16[] memory sealedKeys) =
            _consumeTransferProofs(_tokenId, _to, _proofs);

        _dataHashes[_tokenId] = newHashes;
        _clearAuthorizations(_tokenId);

        // Bypass the plain-transfer guard: this path has done the work the
        // guard exists to require.
        _update(_to, _tokenId, address(0));

        emit PublishedSealedKey(_to, _tokenId, sealedKeys);
        emit Transferred(_tokenId, from, _to);
    }

    /**
     * @inheritdoc IERC7857
     * @dev **This is what forking a mini app does.** The child gets its own
     *      token, its own re-sealed metadata, and `clonedFrom` set for
     *      attribution. The parent keeps its token, its wallet and its
     *      authorizations — a fork must never inherit spending authority
     *      (prd.md §12), which is why nothing is copied except the data hashes
     *      the proofs re-attest.
     */
    function clone(address _to, uint256 _tokenId, bytes[] calldata _proofs)
        external
        override
        nonReentrant
        returns (uint256 newTokenId)
    {
        if (_ownerOf(_tokenId) != msg.sender) revert NotOwner(_tokenId, msg.sender);

        (bytes32[] memory newHashes, bytes16[] memory sealedKeys) =
            _consumeTransferProofs(_tokenId, _to, _proofs);

        newTokenId = _nextTokenId++;
        _safeMint(_to, newTokenId);
        _dataHashes[newTokenId] = newHashes;
        string[] memory descs = _dataDescriptions[_tokenId];
        for (uint256 i = 0; i < descs.length; ++i) {
            _dataDescriptions[newTokenId].push(descs[i]);
        }
        creatorOf[newTokenId] = _to;
        clonedFrom[newTokenId] = _tokenId;

        emit PublishedSealedKey(_to, newTokenId, sealedKeys);
        emit Cloned(_tokenId, newTokenId, msg.sender, _to);
    }

    function _consumeTransferProofs(uint256 _tokenId, address _to, bytes[] calldata _proofs)
        internal
        returns (bytes32[] memory newHashes, bytes16[] memory sealedKeys)
    {
        if (_proofs.length == 0) revert EmptyProofs();
        bytes32[] memory current = _dataHashes[_tokenId];
        if (_proofs.length != current.length) {
            revert ProofCountMismatch(_proofs.length, current.length);
        }

        TransferValidityProofOutput[] memory outputs = _verifier.verifyTransferValidity(_proofs);
        newHashes = new bytes32[](outputs.length);
        sealedKeys = new bytes16[](outputs.length);

        for (uint256 i = 0; i < outputs.length; ++i) {
            if (!outputs[i].isValid) revert InvalidProof(i);
            if (outputs[i].receiver != _to) {
                revert ReceiverMismatch(i, outputs[i].receiver, _to);
            }
            // The proof must attest re-encryption *of the data this token
            // currently holds*. Without this a holder could swap in unrelated
            // metadata during a sale.
            if (outputs[i].oldDataHash != current[i]) {
                revert StaleDataHash(i, current[i], outputs[i].oldDataHash);
            }
            newHashes[i] = outputs[i].newDataHash;
            sealedKeys[i] = outputs[i].sealedKey;
        }
    }

    /* ---------------------------------------------------------------- */
    /* metadata update                                                  */
    /* ---------------------------------------------------------------- */

    /**
     * @inheritdoc IERC7857Metadata
     * @dev How a new manifest revision lands: re-encrypt, re-prove, update the
     *      hashes. Ownership does not move.
     */
    function update(uint256 _tokenId, bytes[] calldata _proofs) external override nonReentrant {
        address owner_ = _ownerOf(_tokenId);
        if (owner_ != msg.sender) revert NotOwner(_tokenId, msg.sender);
        if (_proofs.length == 0) revert EmptyProofs();

        (PreimageProofOutput[] memory outputs, address[] memory provers) =
            IAgenticIdVerifierExt(address(_verifier)).verifyPreimageWithProver(_proofs);

        bytes32[] memory oldHashes = _dataHashes[_tokenId];
        bytes32[] memory newHashes = new bytes32[](outputs.length);
        for (uint256 i = 0; i < outputs.length; ++i) {
            if (!outputs[i].isValid) revert InvalidProof(i);
            if (provers[i] != owner_) revert ProverIsNotReceiver(i, provers[i], owner_);
            newHashes[i] = outputs[i].dataHash;
        }
        _dataHashes[_tokenId] = newHashes;
        emit Updated(_tokenId, oldHashes, newHashes);
    }

    /// Update the token URI without re-proving metadata. Pointer only.
    function setTokenURI(uint256 tokenId, string calldata uri) external {
        if (_ownerOf(tokenId) != msg.sender) revert NotOwner(tokenId, msg.sender);
        _tokenURIs[tokenId] = uri;
    }

    /* ---------------------------------------------------------------- */
    /* authorization                                                    */
    /* ---------------------------------------------------------------- */

    /// @inheritdoc IERC7857
    function authorizeUsage(uint256 _tokenId, address _user) external override {
        address owner_ = _ownerOf(_tokenId);
        if (owner_ != msg.sender) revert NotOwner(_tokenId, msg.sender);
        if (_usageAuthorized[_tokenId][_user]) return;
        if (_authorizedUsers[_tokenId].length >= MAX_AUTHORIZED_USERS) {
            revert TooManyAuthorizedUsers();
        }
        _usageAuthorized[_tokenId][_user] = true;
        _authorizedUsers[_tokenId].push(_user);
        emit Authorization(owner_, _user, _tokenId);
    }

    function revokeUsage(uint256 _tokenId, address _user) external {
        address owner_ = _ownerOf(_tokenId);
        if (owner_ != msg.sender) revert NotOwner(_tokenId, msg.sender);
        if (!_usageAuthorized[_tokenId][_user]) revert NotAuthorized(_tokenId, _user);
        _usageAuthorized[_tokenId][_user] = false;
        address[] storage users = _authorizedUsers[_tokenId];
        for (uint256 i = 0; i < users.length; ++i) {
            if (users[i] == _user) {
                users[i] = users[users.length - 1];
                users.pop();
                break;
            }
        }
        emit AuthorizationRevoked(owner_, _user, _tokenId);
    }

    /// Authorizations are per-owner. Selling the agent must not carry over who
    /// the previous owner let use it.
    function _clearAuthorizations(uint256 tokenId) internal {
        address[] storage users = _authorizedUsers[tokenId];
        for (uint256 i = 0; i < users.length; ++i) {
            _usageAuthorized[tokenId][users[i]] = false;
        }
        delete _authorizedUsers[tokenId];
    }

    /* ---------------------------------------------------------------- */
    /* plain ERC-721 transfer guard                                     */
    /* ---------------------------------------------------------------- */

    function transferFrom(address, address, uint256) public pure override {
        revert PlainTransferDisabled();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert PlainTransferDisabled();
    }
}
