// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IEntryPoint} from "account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {ZKNOX_ERC4337_account} from "./ZKNOX_ERC4337_account.sol";
import {ZKNOX_ERC4337_account_agent} from "./ZKNOX_ERC4337_account-agent.sol";

contract ZKNOX_AccountFactory {
    IEntryPoint public immutable ENTRY_POINT;
    address public immutable PRE_QUANTUM_LOGIC;
    address public immutable POST_QUANTUM_LOGIC;
    string public VERSION;

    constructor(
        IEntryPoint _entryPoint,
        address _preQuantumLogic,
        address _postQuantumLogic,
        string memory _version
    ) {
        ENTRY_POINT = _entryPoint;
        PRE_QUANTUM_LOGIC = _preQuantumLogic;
        POST_QUANTUM_LOGIC = _postQuantumLogic;
        VERSION = _version;
    }

    // ─── Base account ───────────────────────────────────────────────────────

    function createAccount(
        bytes calldata preQuantumPubKey,
        bytes calldata postQuantumPubKey
    ) external returns (ZKNOX_ERC4337_account) {
        address payable addr = getAddress(preQuantumPubKey, postQuantumPubKey);
        if (addr.code.length > 0) {
            return ZKNOX_ERC4337_account(addr);
        }
        bytes32 salt = keccak256(abi.encodePacked(preQuantumPubKey, postQuantumPubKey, VERSION));
        return new ZKNOX_ERC4337_account{salt: salt}(
            ENTRY_POINT,
            preQuantumPubKey,
            postQuantumPubKey,
            PRE_QUANTUM_LOGIC,
            POST_QUANTUM_LOGIC
        );
    }

    /// @notice Compute the counterfactual address of a base account.
    function getAddress(
        bytes calldata preQuantumPubKey,
        bytes calldata postQuantumPubKey
    ) public view returns (address payable) {
        bytes32 salt = keccak256(abi.encodePacked(preQuantumPubKey, postQuantumPubKey, VERSION));
        bytes32 bytecodeHash = keccak256(abi.encodePacked(
            type(ZKNOX_ERC4337_account).creationCode,
            abi.encode(
                ENTRY_POINT,
                preQuantumPubKey,
                postQuantumPubKey,
                PRE_QUANTUM_LOGIC,
                POST_QUANTUM_LOGIC
            )
        ));
        return payable(address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            bytecodeHash
        ))))));
    }

    // ─── Agent account (with ETH spending limit) ────────────────────────────

    /// @notice Deploy (or return existing) an agent account with ETH and USDC spending limits.
    /// @param preQuantumPubKey      ECDSA public key (20-byte address or uncompressed)
    /// @param postQuantumPubKey     Post-quantum public key (ML-DSA-44 expanded bytes)
    /// @param _maxETHPerTransaction  Maximum ETH value allowed per single tx (0 = unlimited)
    /// @param _maxUSDCPerTransaction Maximum USDC amount (6-decimal units) per single tx (0 = unlimited)
    /// @param _usdc                  Address of the USDC token contract
    /// @dev  The "AGENT" suffix in the salt guarantees agent accounts never collide with
    ///       base accounts sharing the same key pair.
    function createAgentAccount(
        bytes calldata preQuantumPubKey,
        bytes calldata postQuantumPubKey,
        uint256 _maxETHPerTransaction,
        uint256 _maxUSDCPerTransaction,
        address _usdc
    ) external returns (ZKNOX_ERC4337_account_agent) {
        address payable addr = getAgentAddress(preQuantumPubKey, postQuantumPubKey, _maxETHPerTransaction, _maxUSDCPerTransaction, _usdc);
        if (addr.code.length > 0) {
            return ZKNOX_ERC4337_account_agent(addr);
        }
        bytes32 salt = _agentSalt(preQuantumPubKey, postQuantumPubKey, _maxETHPerTransaction, _maxUSDCPerTransaction, _usdc);
        return new ZKNOX_ERC4337_account_agent{salt: salt}(
            ENTRY_POINT,
            preQuantumPubKey,
            postQuantumPubKey,
            PRE_QUANTUM_LOGIC,
            POST_QUANTUM_LOGIC,
            _maxETHPerTransaction,
            _maxUSDCPerTransaction,
            _usdc
        );
    }

    /// @notice Compute the counterfactual address of an agent account.
    function getAgentAddress(
        bytes calldata preQuantumPubKey,
        bytes calldata postQuantumPubKey,
        uint256 _maxETHPerTransaction,
        uint256 _maxUSDCPerTransaction,
        address _usdc
    ) public view returns (address payable) {
        bytes32 salt = _agentSalt(preQuantumPubKey, postQuantumPubKey, _maxETHPerTransaction, _maxUSDCPerTransaction, _usdc);
        bytes32 bytecodeHash = keccak256(abi.encodePacked(
            type(ZKNOX_ERC4337_account_agent).creationCode,
            abi.encode(
                ENTRY_POINT,
                preQuantumPubKey,
                postQuantumPubKey,
                PRE_QUANTUM_LOGIC,
                POST_QUANTUM_LOGIC,
                _maxETHPerTransaction,
                _maxUSDCPerTransaction,
                _usdc
            )
        ));
        return payable(address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            bytecodeHash
        ))))));
    }

    /// @dev Separate salt namespace ("AGENT") prevents address collisions with base accounts.
    function _agentSalt(
        bytes calldata preQuantumPubKey,
        bytes calldata postQuantumPubKey,
        uint256 _maxETHPerTransaction,
        uint256 _maxUSDCPerTransaction,
        address _usdc
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            preQuantumPubKey,
            postQuantumPubKey,
            VERSION,
            "AGENT",
            _maxETHPerTransaction,
            _maxUSDCPerTransaction,
            _usdc
        ));
    }
}
