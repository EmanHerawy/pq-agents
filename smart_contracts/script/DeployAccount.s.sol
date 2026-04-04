// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title  DeployAccount
 * @notice Forge script that calls createAccount or createAgentAccount on a
 *         deployed ZKNOX_AccountFactory.
 *
 * Required env vars:
 *   FACTORY_ADDRESS        (default address of the deployed ZKNOX_AccountFactory
 *   PRE_QUANTUM_PUB_KEY    (default hex-encoded ECDSA public key (e.g. "0x<20-byte address>")
 *   POST_QUANTUM_PUB_KEY   (default hex-encoded expanded ML-DSA-44 public key
 *   ACCOUNT_TYPE           (default "base" (default) or "agent"
 *   MAX_ETH_PER_TX         (agent only) max ETH per transaction in wei, e.g. "500000000000000000" for 0.5 ETH
 *                            Set to 0 for unlimited.
 *   MAX_USDC_PER_TX        (agent only) max USDC per transaction in 6-decimal units, e.g. "100000000" for 100 USDC
 *                            Set to 0 for unlimited.
 *   USDC_ADDRESS           (agent only) address of the USDC token contract
 *
 * Usage:
 *   # Base account
 *   ACCOUNT_TYPE=base forge script script/DeployAccount.s.sol \
 *       --rpc-url $RPC --private-key $PRIVATE_KEY --broadcast --tc CreateBaseAccount
 *
 *   # Agent account (0.5 ETH limit, 100 USDC limit)
 *   ACCOUNT_TYPE=agent MAX_ETH_PER_TX=500000000000000000 MAX_USDC_PER_TX=100000000 USDC_ADDRESS=0x... \
 *   forge script script/DeployAccount.s.sol \
 *       --rpc-url $RPC --private-key $PRIVATE_KEY --broadcast --tc CreateAgentAccount
 */

import {console} from "forge-std/Test.sol";
import {BaseScript} from "ETHDILITHIUM/script/BaseScript.sol";
import {ZKNOX_AccountFactory} from "../src/ZKNOX_PQFactory.sol";
import {ZKNOX_ERC4337_account} from "../src/ZKNOX_ERC4337_account.sol";
import {ZKNOX_ERC4337_account_agent} from "../src/ZKNOX_ERC4337_account-agent.sol";

abstract contract AccountDeployer is BaseScript {
    function _readKeys()
        internal
        view
        returns (address factory, bytes memory preKey, bytes memory postKey)
    {
        factory = vm.envAddress("FACTORY_ADDRESS");
        preKey  = vm.envBytes("PRE_QUANTUM_PUB_KEY");
        postKey = vm.envBytes("POST_QUANTUM_PUB_KEY");
        require(factory != address(0),    "FACTORY_ADDRESS not set");
        require(preKey.length  > 0,       "PRE_QUANTUM_PUB_KEY not set");
        require(postKey.length > 0,       "POST_QUANTUM_PUB_KEY not set");
    }
}

// ─── CreateBaseAccount ────────────────────────────────────────────────────────

contract CreateBaseAccount is AccountDeployer {
    function run() external returns (address accountAddress) {
        (address factoryAddr, bytes memory preKey, bytes memory postKey) = _readKeys();
        ZKNOX_AccountFactory factory = ZKNOX_AccountFactory(factoryAddr);

        // Log counterfactual address before deploy
        address payable predicted = factory.getAddress(preKey, postKey);
        console.log("Factory       :", factoryAddr);
        console.log("Account type  : base");
        console.log("Predicted addr:", predicted);

        if (predicted.code.length > 0) {
            console.log("Already deployed - returning existing account.");
            return predicted;
        }

        vm.startBroadcast();
        ZKNOX_ERC4337_account acct = factory.createAccount(preKey, postKey);
        vm.stopBroadcast();

        accountAddress = address(acct);
        console.log("Deployed base account at:", accountAddress);
    }
}

// ─── CreateAgentAccount ───────────────────────────────────────────────────────

contract CreateAgentAccount is AccountDeployer {
    function run() external returns (address accountAddress) {
        (address factoryAddr, bytes memory preKey, bytes memory postKey) = _readKeys();
        ZKNOX_AccountFactory factory = ZKNOX_AccountFactory(factoryAddr);

        uint256 maxEthPerTx  = vm.envOr("MAX_ETH_PER_TX",   uint256(0));
        uint256 maxUsdcPerTx = vm.envOr("MAX_USDC_PER_TX",  uint256(0));
        address usdc         = vm.envOr("USDC_ADDRESS",      address(0));

        // Log counterfactual address before deploy
        address payable predicted = factory.getAgentAddress(preKey, postKey, maxEthPerTx, maxUsdcPerTx, usdc);
        console.log("Factory             :", factoryAddr);
        console.log("Account type        : agent");
        console.log("Max ETH / tx (wei)  :", maxEthPerTx);
        if (maxEthPerTx == 0) console.log("                     (0 = unlimited)");
        console.log("Max USDC / tx (6dp) :", maxUsdcPerTx);
        if (maxUsdcPerTx == 0) console.log("                     (0 = unlimited)");
        console.log("USDC contract       :", usdc);
        console.log("Predicted addr      :", predicted);

        if (predicted.code.length > 0) {
            console.log("Already deployed - returning existing agent account.");
            return predicted;
        }

        vm.startBroadcast();
        ZKNOX_ERC4337_account_agent acct = factory.createAgentAccount(preKey, postKey, maxEthPerTx, maxUsdcPerTx, usdc);
        vm.stopBroadcast();

        accountAddress = address(acct);
        console.log("Deployed agent account at:", accountAddress);
        console.log("  maxETHPerTransaction   :", ZKNOX_ERC4337_account_agent(acct).maxETHPerTransaction());
        console.log("  maxUSDCPerTransaction  :", ZKNOX_ERC4337_account_agent(acct).maxUSDCPerTransaction());
        console.log("  USDC                   :", ZKNOX_ERC4337_account_agent(acct).USDC());
    }
}
