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

    // ── Spending limits (immutable after construction) ────────────────────────

    /// @notice Maximum ETH value allowed per single transaction (0 = unlimited).
    uint256 public immutable maxETHPerTransaction;

    /// @notice Maximum USDC amount (in USDC's 6-decimal units) per single transaction (0 = unlimited).
    uint256 public immutable maxUSDCPerTransaction;

    /// @notice Address of the USDC token contract whose transfers are capped.
    address public immutable USDC;

    /// @notice ERC-20 transfer(address,uint256) selector.
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;

    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        IEntryPoint _entryPoint0,
        bytes memory _preQuantumPubKey,
        bytes memory _postQuantumPubKey,
        address _preQuantumLogicContractAddress,
        address _postQuantumLogicContractAddress,
        uint256 _maxETHPerTransaction,
        uint256 _maxUSDCPerTransaction,
        address _usdc
    ) {
        _entryPoint = _entryPoint0;
        preQuantumLogicContractAddress = _preQuantumLogicContractAddress;
        preQuantumPubKey = ISigVerifier(preQuantumLogicContractAddress).setKey(_preQuantumPubKey);
        postQuantumLogicContractAddress = _postQuantumLogicContractAddress;
        postQuantumPubKey = ISigVerifier(postQuantumLogicContractAddress).setKey(_postQuantumPubKey);
        maxETHPerTransaction  = _maxETHPerTransaction;
        maxUSDCPerTransaction = _maxUSDCPerTransaction;
        USDC = _usdc;
    }

    // ── ERC-4337 plumbing ─────────────────────────────────────────────────────

    /// @inheritdoc BaseAccount
    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    /// @inheritdoc BaseAccount
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        virtual
        override
        returns (uint256 validationData)
    {
        (bytes memory preQuantumSig, bytes memory postQuantumSig) =
            abi.decode(userOp.signature, (bytes, bytes));
        bool result = isValid(
            preQuantumPubKey,
            postQuantumPubKey,
            preQuantumLogicContractAddress,
            postQuantumLogicContractAddress,
            userOpHash,
            preQuantumSig,
            postQuantumSig
        );
        return result ? SIG_VALIDATION_SUCCESS : SIG_VALIDATION_FAILED;
    }

    // ── Signature verification ────────────────────────────────────────────────

    /// @notice Verify hybrid (pre- + post-quantum) signature.
    function isValid(
        bytes memory preQPubKey,
        bytes memory postQPubKey,
        address preQLogicContractAddress,
        address postQLogicContractAddress,
        bytes32 digest,
        bytes memory preQuantumSig,
        bytes memory postQuantumSig
    ) public view returns (bool) {
        if (digest.length > 32) return false;

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

    // ── Execution ─────────────────────────────────────────────────────────────

    /// @notice Execute a single transaction, enforcing ETH and USDC spending limits.
    function execute(address dest, uint256 value, bytes calldata func) external override {
        _requireFromEntryPoint();
        _checkSpendingLimit(dest, value, func);
        _call(dest, value, func);
    }

    /// @notice Execute a batch of transactions, enforcing limits on each.
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external {
        _requireFromEntryPoint();
        require(
            dest.length == value.length && value.length == func.length,
            "Array length mismatch"
        );
        for (uint256 i = 0; i < dest.length; i++) {
            _checkSpendingLimit(dest[i], value[i], func[i]);
            _call(dest[i], value[i], func[i]);
        }
    }

    // ── Spending limit enforcement ────────────────────────────────────────────

    /// @dev Reverts if value exceeds maxETHPerTransaction, or if the call is an
    ///      ERC-20 transfer to the USDC contract that exceeds maxUSDCPerTransaction.
    ///
    ///      ERC-20 transfer calldata layout:
    ///        [0:4]   selector  (bytes4)
    ///        [4:36]  to        (address, padded to 32 bytes)
    ///        [36:68] amount    (uint256)
    function _checkSpendingLimit(
        address dest,
        uint256 value,
        bytes calldata func
    ) internal view {
        // ETH limit
        if (maxETHPerTransaction > 0 && value > 0) {
            require(value <= maxETHPerTransaction, "ETH amount exceeds limit");
        }

        // USDC limit: only applies when dest == USDC and the call is transfer()
        if (
            maxUSDCPerTransaction > 0 &&
            dest == USDC &&
            func.length >= 68 &&
            bytes4(func[:4]) == TRANSFER_SELECTOR
        ) {
            uint256 amount = uint256(bytes32(func[36:68]));
            require(amount <= maxUSDCPerTransaction, "USDC amount exceeds limit");
        }
    }

    /// @dev Low-level call; bubbles up revert data.
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
