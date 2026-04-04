// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {BaseAccount, PackedUserOperation} from "account-abstraction/contracts/core/BaseAccount.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "account-abstraction/contracts/core/Helpers.sol";
import {IEntryPoint} from "account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";

contract ZKNOX_ERC4337_account_agent is BaseAccount {
    IEntryPoint private _entryPoint;
    bytes private preQuantumPubKey;
    bytes private postQuantumPubKey;
    address private preQuantumLogicContractAddress;
    address private postQuantumLogicContractAddress;

    // --- Spending Limit Storage ---
    /// @notice Maximum ETH allowed per single transaction (0 = unlimited)
    uint256 public maxETHPerTransaction;
    
    /// @notice Maximum token amount allowed per transaction for specific tokens
    /// @dev Token address => max amount (0 = unlimited for that token)
    mapping(address => uint256) public maxTokenPerTransaction;
    
    /// @notice ERC20 transfer selector: keccak256("transfer(address,uint256)")
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;

    constructor(
        IEntryPoint _entryPoint0,
        bytes memory _preQuantumPubKey,
        bytes memory _postQuantumPubKey,
        address _preQuantumLogicContractAddress,
        address _postQuantumLogicContractAddress,
        uint256 _maxETHPerTransaction
    ) {
        _entryPoint = _entryPoint0;
        preQuantumLogicContractAddress = _preQuantumLogicContractAddress;
        preQuantumPubKey = ISigVerifier(preQuantumLogicContractAddress).setKey(_preQuantumPubKey);
        postQuantumLogicContractAddress = _postQuantumLogicContractAddress;
        postQuantumPubKey = ISigVerifier(postQuantumLogicContractAddress).setKey(_postQuantumPubKey);
        maxETHPerTransaction = _maxETHPerTransaction;
    }

    /// @notice Modifier to ensure only the account itself can call (via execute)
    modifier onlySelf() {
        require(msg.sender == address(this), "Only self");
        _;
    }

    /// @notice Update the ETH spending limit (must be called via execute)
    /// @param _limit New maximum ETH per transaction (0 for unlimited)
    function setMaxETHPerTransaction(uint256 _limit) external onlySelf {
        maxETHPerTransaction = _limit;
    }

    /// @notice Update token spending limit for a specific token (must be called via execute)
    /// @param _token ERC20 token address
    /// @param _limit New maximum amount per transaction (0 for unlimited)
    function setMaxTokenPerTransaction(address _token, uint256 _limit) external onlySelf {
        maxTokenPerTransaction[_token] = _limit;
    }

    /// @inheritdoc BaseAccount
    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    /// @notice Verify hybrid signature (pre- and post-quantum)
    function isValid(
        bytes memory preQPubKey,
        bytes memory postQPubKey,
        address preQLogicContractAddress,
        address postQLogicContractAddress,
        bytes32 digest,
        bytes memory preQuantumSig,
        bytes memory postQuantumSig
    ) public view returns (bool) {
        if (digest.length > 32) {
            return false;
        }

        ISigVerifier preQuantumCore = ISigVerifier(preQLogicContractAddress);
        if (preQuantumCore.verify(preQPubKey, digest, preQuantumSig) != preQuantumCore.verify.selector) {
            return false;
        }

        ISigVerifier postQuantumCore = ISigVerifier(postQLogicContractAddress);
        if (postQuantumCore.verify(postQPubKey, digest, postQuantumSig) != postQuantumCore.verify.selector) {
            return false;
        }
        return true;
    }

    /// @inheritdoc BaseAccount
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        virtual
        override
        returns (uint256 validationData)
    {
        (bytes memory preQuantumSig, bytes memory postQuantumSig) = abi.decode(userOp.signature, (bytes, bytes));
        bool result = isValid(
            preQuantumPubKey,
            postQuantumPubKey,
            preQuantumLogicContractAddress,
            postQuantumLogicContractAddress,
            userOpHash,
            preQuantumSig,
            postQuantumSig
        );
        if (!result) {
            return SIG_VALIDATION_FAILED;
        }
        return SIG_VALIDATION_SUCCESS;
    }

    /// @notice Execute a transaction with spending limit check
    /// @param dest Destination address
    /// @param value ETH value to send
    /// @param func Function call data
    /// @dev Reverts if ETH value exceeds maxETHPerTransaction or if ERC20 transfer exceeds token limit
    function execute(address dest, uint256 value, bytes calldata func) external override{
        _requireFromEntryPoint();
        _checkSpendingLimit(dest, value, func);
        _call(dest, value, func);
    }

    /// @notice Execute a batch of transactions with spending limit checks
    /// @param dest Array of destination addresses
    /// @param value Array of ETH values
    /// @param func Array of function call data
    /// @dev Checks each transaction individually against limits
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external   {
        _requireFromEntryPoint();
        require(dest.length == value.length && value.length == func.length, "Array length mismatch");
        
        for (uint256 i = 0; i < dest.length; i++) {
            _checkSpendingLimit(dest[i], value[i], func[i]);
            _call(dest[i], value[i], func[i]);
        }
    }

    /// @notice Internal function to check spending limits before execution
    /// @param dest Destination address (used to identify token for ERC20 transfers)
    /// @param value ETH value being sent
    /// @param func Function call data (checked for ERC20 transfer selector)
    function _checkSpendingLimit(address dest, uint256 value, bytes calldata func) internal view {
        // Check ETH transfer limit
        if (value > 0 && maxETHPerTransaction > 0) {
            require(value <= maxETHPerTransaction, "ETH amount exceeds limit");
        }
        
        // Check ERC20 transfer limit
        // Transfer encoding: 4 bytes selector + 32 bytes to (padded) + 32 bytes amount
        if (func.length >= 68 && maxTokenPerTransaction[dest] > 0) {
            bytes4 selector = bytes4(func[:4]);
            if (selector == TRANSFER_SELECTOR) {
                // Extract amount from bytes 36-68 (skip selector + address padding)
                uint256 amount = uint256(bytes32(func[36:68]));
                require(amount <= maxTokenPerTransaction[dest], "Token amount exceeds limit");
            }
        }
    }

    /// @notice Internal low-level call execution
    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    receive() external payable {}
    fallback() external payable {}
}