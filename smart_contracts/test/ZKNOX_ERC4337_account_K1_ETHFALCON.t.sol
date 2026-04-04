// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";

import {EntryPoint} from "account-abstraction/contracts/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {IStakeManager} from "account-abstraction/contracts/interfaces/IStakeManager.sol";
import {PackedUserOperation} from "account-abstraction/contracts/interfaces/PackedUserOperation.sol";

import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

import {ZKNOX_ERC4337_account} from "../src/ZKNOX_ERC4337_account.sol";
import {ZKNOX_ERC4337_account_agent} from "../src/ZKNOX_ERC4337_account-agent.sol";
import {ZKNOX_AccountFactory} from "../src/ZKNOX_PQFactory.sol";

import {PythonSigner} from "ETHFALCON/src/ZKNOX_PythonSigner.sol";
import {_packUint256Array, _packSignature} from "ETHFALCON/src/ZKNOX_common.sol";

import {Constants} from "ETHDILITHIUM/test/ZKNOX_seed.sol";

import {ZKNOX_ethfalcon} from "ETHFALCON/src/ZKNOX_ethfalcon.sol";
import {ECDSAk1Verifier} from "ETHDILITHIUM/lib/InterfaceVerifier/src/VerifierECDSAk1.sol";


function bytes32ToHex(bytes32 value) pure returns (string memory) {
    return Strings.toHexString(uint256(value), 32);
}

contract TestERC4337_Account is Test {
    ZKNOX_ERC4337_account public account;
    IEntryPoint public entryPoint;
    TestTarget target;

    address public owner;
    uint256 public ownerPrivateKey;
    PythonSigner pythonSigner = new PythonSigner();

    function setUp() public {
        /**
         *
         */

        address postQuantumLogicAddress = address(new ZKNOX_ethfalcon());
        address preQuantumLogicAddress = address(new ECDSAk1Verifier());

        entryPoint = new EntryPoint();

        bytes memory preQuantumPubKey = abi.encodePacked(Constants.ADDR_PREQUANTUM);

        // Signing a nonce to get access to pubkey
        string memory seedStr = Constants.SEED_POSTQUANTUM_STR;
        (uint256[32] memory pkCompact,,) = pythonSigner.sign("lib/ETHFALCON/pythonref", "0xabcd", "ETH", seedStr);
        bytes memory postQuantumPubKey = _packUint256Array(pkCompact);

        // Deploy the Smart Account
        account = new ZKNOX_ERC4337_account(
            entryPoint,
            preQuantumPubKey,
            postQuantumPubKey,
            preQuantumLogicAddress,
            postQuantumLogicAddress
        );
        // Deploy TestTarget
        target = new TestTarget();

        // Fund the account
        vm.deal(address(account), 10 ether);

        owner = 0x1234567890123456789012345678901234567890;
    }

    function testValidateUserOpSuccess() public {
        // Create a UserOperation
        PackedUserOperation memory userOp = _createUserOp();

        // Generate the userOpHash
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Sign the userOpHash with both FNDSA and ECDSA
        string memory data = bytes32ToHex(userOpHash);
        string memory seedStr = Constants.SEED_POSTQUANTUM_STR;
        (, bytes memory salt, uint256[32] memory s2Compact) =
            pythonSigner.sign("lib/ETHFALCON/pythonref", data, "ETH", seedStr);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(Constants.SEED_PREQUANTUM, userOpHash);
        bytes memory preQuantumSig = abi.encodePacked(r, s, v);
        bytes memory postQuantumSig = _packSignature(salt, s2Compact);
        userOp.signature = abi.encode(preQuantumSig, postQuantumSig);

        vm.prank(address(entryPoint));
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);

        // Check that validation succeeded (0 = success)
        assertEq(validationData, 0, "Signature validation should succeed");
    }

    function testValidateUserOpInvalidSignature() public {
        PackedUserOperation memory userOp = _createUserOp();
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Create invalid signatures
        (uint8 v, bytes32 r, bytes32 s) = (28, bytes32(0), bytes32(0));
        bytes memory s2 = hex"00";
        bytes memory invalidPreQuantumSig = abi.encodePacked(r, s, v);
        bytes memory invalidPostQuantumSig = abi.encodePacked(s2);
        userOp.signature = abi.encode(invalidPreQuantumSig, invalidPostQuantumSig);

        vm.prank(address(entryPoint));
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);

        // Check that validation failed (1 = SIG_VALIDATION_FAILED)
        assertEq(validationData, 1, "Invalid signature should fail");
    }

    function testExecute() public {
        // Create a UserOperation
        PackedUserOperation memory userOp = _createUserOp();

        // Generate the userOpHash
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Sign the userOpHash with both FNDSA and ECDSA
        string memory data = bytes32ToHex(userOpHash);
        string memory seedStr = Constants.SEED_POSTQUANTUM_STR;
        (, bytes memory salt, uint256[32] memory s2Compact) =
            pythonSigner.sign("lib/ETHFALCON/pythonref", data, "ETH", seedStr);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(Constants.SEED_PREQUANTUM, userOpHash);
        bytes memory preQuantumSig = abi.encodePacked(r, s, v);
        bytes memory postQuantumSig = _packSignature(salt, s2Compact);
        userOp.signature = abi.encode(preQuantumSig, postQuantumSig);

        // Create an array with a single UserOperation
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        vm.expectEmit(true, false, false, false, address(entryPoint));
        emit IStakeManager.Deposited(address(account), 0);
        emit IEntryPoint.BeforeExecution();
        emit TestTarget.Hello("Hello from UserOp");
        emit IEntryPoint.UserOperationEvent(userOpHash, address(account), address(0), 0, true, 0, 0);

        // Call handleOps on the EntryPoint
        uint256 gasStart = gasleft();
        address eoa = makeAddr("eoa");
        vm.prank(eoa, eoa);
        entryPoint.handleOps(ops, payable(owner));
        uint256 gasUsed = gasStart - gasleft();
        console.log("Gas used:", gasUsed);

        assertEq(target.lastGreeting(), "Hello from UserOp", "Target call should succeed");
    }

    function _createUserOp() internal view returns (PackedUserOperation memory) {
        // Encode the call to sayHello
        bytes memory callData = abi.encodeWithSelector(
            account.execute.selector,
            address(target),
            0,
            abi.encodeWithSignature("sayHello(string)", "Hello from UserOp")
        );

        return PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(abi.encodePacked(uint128(20_000_000), uint128(500_000))),
            preVerificationGas: 100000,
            gasFees: bytes32(abi.encodePacked(uint128(1 gwei), uint128(2 gwei))),
            paymasterAndData: "",
            signature: ""
        });
    }

    // ── Factory tests ────────────────────────────────────────────────────────

    /// @notice Factory deploys the agent account at the predicted CREATE2 address
    ///         and is idempotent (second call returns the existing account).
    function testCreateAgentAccountViaFactory() public {
        // Deploy fresh verifiers + factory (independent of setUp account)
        address postQuantumLogicAddress = address(new ZKNOX_ethfalcon());
        address preQuantumLogicAddress  = address(new ECDSAk1Verifier());
        ZKNOX_AccountFactory factory = new ZKNOX_AccountFactory(
            entryPoint,
            preQuantumLogicAddress,
            postQuantumLogicAddress,
            "TEST_AGENT_FACTORY_V1"
        );

        bytes memory preKey = abi.encodePacked(Constants.ADDR_PREQUANTUM);
        string memory seedStr = Constants.SEED_POSTQUANTUM_STR;
        (uint256[32] memory pkCompact,,) = pythonSigner.sign("lib/ETHFALCON/pythonref", "0xabcd", "ETH", seedStr);
        bytes memory postKey = _packUint256Array(pkCompact);

        uint256 ethLimit  = 0.1 ether;
        uint256 usdcLimit = 100e6; // 100 USDC
        address usdc      = makeAddr("usdc");

        // Predict address before deployment
        address payable predicted = factory.getAgentAddress(preKey, postKey, ethLimit, usdcLimit, usdc);
        assertEq(predicted.code.length, 0, "Should not exist yet");

        // Deploy via factory
        ZKNOX_ERC4337_account_agent agentAccount = factory.createAgentAccount(preKey, postKey, ethLimit, usdcLimit, usdc);

        // Deployed at the predicted address
        assertEq(address(agentAccount), predicted, "Deployed address must match prediction");
        assertGt(predicted.code.length, 0, "Contract should be deployed");

        // Spending limits recorded correctly
        assertEq(agentAccount.maxETHPerTransaction(),  ethLimit,  "ETH limit should match");
        assertEq(agentAccount.maxUSDCPerTransaction(), usdcLimit, "USDC limit should match");
        assertEq(agentAccount.USDC(),                 usdc,      "USDC address should match");

        // Idempotent: second call returns same account without reverting
        ZKNOX_ERC4337_account_agent same = factory.createAgentAccount(preKey, postKey, ethLimit, usdcLimit, usdc);
        assertEq(address(same), address(agentAccount), "Should return existing account");
    }

    /// @notice Agent account enforces the ETH spending limit and allows transfers within it.
    function testAgentSpendingLimitEnforced() public {
        // Deploy factory + agent account with 0.5 ETH limit
        address postQuantumLogicAddress = address(new ZKNOX_ethfalcon());
        address preQuantumLogicAddress  = address(new ECDSAk1Verifier());
        ZKNOX_AccountFactory factory = new ZKNOX_AccountFactory(
            entryPoint,
            preQuantumLogicAddress,
            postQuantumLogicAddress,
            "TEST_AGENT_FACTORY_V1"
        );

        bytes memory preKey = abi.encodePacked(Constants.ADDR_PREQUANTUM);
        string memory seedStr = Constants.SEED_POSTQUANTUM_STR;
        (uint256[32] memory pkCompact,,) = pythonSigner.sign("lib/ETHFALCON/pythonref", "0xabcd", "ETH", seedStr);
        bytes memory postKey = _packUint256Array(pkCompact);

        uint256 ethLimit  = 0.5 ether;
        uint256 usdcLimit = 0;           // no USDC limit for this test
        address usdc      = makeAddr("usdc2");
        ZKNOX_ERC4337_account_agent agentAccount = factory.createAgentAccount(preKey, postKey, ethLimit, usdcLimit, usdc);
        vm.deal(address(agentAccount), 10 ether);

        address recipient = makeAddr("recipient");

        // ── Within limit: execute succeeds ───────────────────────────────────
        PackedUserOperation memory userOpOk = _buildAgentUserOp(
            agentAccount, recipient, 0.4 ether, ""
        );
        bytes32 hashOk = entryPoint.getUserOpHash(userOpOk);
        userOpOk.signature = _signBoth(hashOk, seedStr);

        PackedUserOperation[] memory opsOk = new PackedUserOperation[](1);
        opsOk[0] = userOpOk;
        vm.prank(makeAddr("bundler"), makeAddr("bundler"));
        entryPoint.handleOps(opsOk, payable(makeAddr("beneficiary")));
        assertEq(recipient.balance, 0.4 ether, "Transfer within limit should succeed");

        // ── Above limit: execute reverts through EntryPoint ──────────────────
        PackedUserOperation memory userOpFail = _buildAgentUserOp(
            agentAccount, recipient, 0.6 ether, ""
        );
        // Nonce incremented after first op
        userOpFail.nonce = 1;
        bytes32 hashFail = entryPoint.getUserOpHash(userOpFail);
        userOpFail.signature = _signBoth(hashFail, seedStr);

        PackedUserOperation[] memory opsFail = new PackedUserOperation[](1);
        opsFail[0] = userOpFail;
        vm.prank(makeAddr("bundler2"), makeAddr("bundler2"));
        // EntryPoint emits UserOperationRevertReason when inner call reverts
        vm.expectEmit(false, false, false, false);
        emit IEntryPoint.UserOperationRevertReason(hashFail, address(agentAccount), 1, "");
        entryPoint.handleOps(opsFail, payable(makeAddr("beneficiary2")));
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _buildAgentUserOp(
        ZKNOX_ERC4337_account_agent _account,
        address dest,
        uint256 value,
        bytes memory data
    ) internal view returns (PackedUserOperation memory) {
        bytes memory callData = abi.encodeWithSelector(
            _account.execute.selector,
            dest, value, data
        );
        return PackedUserOperation({
            sender: address(_account),
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(abi.encodePacked(uint128(20_000_000), uint128(500_000))),
            preVerificationGas: 100000,
            gasFees: bytes32(abi.encodePacked(uint128(1 gwei), uint128(2 gwei))),
            paymasterAndData: "",
            signature: ""
        });
    }

    function _signBoth(bytes32 userOpHash, string memory seedStr)
        internal
        returns (bytes memory signature)
    {
        string memory data = bytes32ToHex(userOpHash);
        (, bytes memory salt2, uint256[32] memory s2Compact) =
            pythonSigner.sign("lib/ETHFALCON/pythonref", data, "ETH", seedStr);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(Constants.SEED_PREQUANTUM, userOpHash);
        bytes memory preQuantumSig  = abi.encodePacked(r, s, v);
        bytes memory postQuantumSig = _packSignature(salt2, s2Compact);
        signature = abi.encode(preQuantumSig, postQuantumSig);
    }
}

contract TestTarget {
    event Hello(string greeting);
    string public lastGreeting;

    function sayHello(string memory greeting) external {
        lastGreeting = greeting;
        emit Hello(greeting);
    }
}
