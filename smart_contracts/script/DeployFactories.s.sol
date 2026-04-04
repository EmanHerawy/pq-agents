// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {console} from "forge-std/Test.sol";
import {BaseScript} from "ETHDILITHIUM/script/BaseScript.sol";
import {IEntryPoint} from "account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {ZKNOX_AccountFactory} from "../src/ZKNOX_PQFactory.sol";

// ─── Abstract base ────────────────────────────────────────────────────────────

abstract contract FactoryDeployer is BaseScript {
    // EntryPoint v0.7 canonical address (same on all EVM chains)
    address constant ENTRYPOINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    string internal saltLabel;
    string internal preQuantumKey;   // verifier key in deployments.json
    string internal postQuantumKey;  // verifier key in deployments.json
    string internal factoryName;     // output key in deployments.json

    /// @dev Maps chainId to the deployments.json network key.
    ///      Falls back to vm.toString(chainId) for any unlisted chain.
    function _networkKey(uint256 chainId) internal view returns (string memory) {
        if (chainId == 11155111) return "sepolia";
        if (chainId == 1)        return "mainnet";
        if (chainId == 421614)   return "arbitrumSepolia";
        if (chainId == 84532)    return "baseSepolia";
        if (chainId == 5042002)  return "arcTestnet";
        return vm.toString(chainId);
    }

    function run() external returns (address) {
        string memory json    = vm.readFile("deployments/deployments.json");
        string memory network = _networkKey(block.chainid);

        string memory basePath = string.concat(".", network);
        address preQuantumVerifier = vm.parseJsonAddress(
            json,
            string.concat(basePath, ".verifiers.", preQuantumKey, ".address")
        );
        address postQuantumVerifier = vm.parseJsonAddress(
            json,
            string.concat(basePath, ".verifiers.", postQuantumKey, ".address")
        );

        bytes32 salt = keccak256(abi.encodePacked(saltLabel));

        console.log("Deploying factory:", factoryName, "on", network);
        console.log("  Salt label :", saltLabel);
        console.log("  Salt       :", vm.toString(salt));
        console.log("  EntryPoint :", ENTRYPOINT_V07);
        console.log("  PreQuantum :", preQuantumKey, "@", preQuantumVerifier);
        console.log("  PostQuantum:", postQuantumKey, "@", postQuantumVerifier);

        vm.startBroadcast();
        ZKNOX_AccountFactory factory = new ZKNOX_AccountFactory{salt: salt}(
            IEntryPoint(ENTRYPOINT_V07),
            preQuantumVerifier,
            postQuantumVerifier,
            saltLabel          // saltLabel doubles as the VERSION string inside the factory
        );
        vm.stopBroadcast();

        console.log("Factory deployed at:", address(factory));

        string memory outputJson = vm.serializeAddress(factoryName, "address", address(factory));
        outputJson = vm.serializeBytes32(factoryName, "salt", salt);
        outputJson = vm.serializeString(factoryName, "saltLabel", saltLabel);
        outputJson = vm.serializeString(factoryName, "preQuantum", preQuantumKey);
        outputJson = vm.serializeString(factoryName, "postQuantum", postQuantumKey);
        vm.writeJson(outputJson, "deployments/deployments.json",
            string.concat(basePath, ".accounts.", factoryName));

        console.log("Updated deployments.json:", string.concat(basePath, ".accounts.", factoryName));
        return address(factory);
    }
}

// ─── Standard (base-account) factories ───────────────────────────────────────

contract MLDSA_ECDSAk1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_MLDSA_K1_FACTORY_V0_0_10";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "mldsa";
        factoryName    = "mldsa_k1";
    }
}

contract MLDSAETH_ECDSAk1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_MLDSAETH_K1_FACTORY_V0_0_2";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "mldsaeth";
        factoryName    = "mldsaeth_k1";
    }
}

contract MLDSA_ECDSAr1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_MLDSA_R1_FACTORY_V0_0_2";
        preQuantumKey  = "ecdsa_r1";
        postQuantumKey = "mldsa";
        factoryName    = "mldsa_r1";
    }
}

contract MLDSAETH_ECDSAr1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_MLDSAETH_R1_FACTORY_V0_0_2";
        preQuantumKey  = "ecdsa_r1";
        postQuantumKey = "mldsaeth";
        factoryName    = "mldsaeth_r1";
    }
}

contract FALCON_ECDSAk1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_FALCON_K1_FACTORY_V0_0_4";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "falcon";
        factoryName    = "falcon_k1";
    }
}

contract FALCON_ECDSAr1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_FALCON_R1_FACTORY_V0_0_2";
        preQuantumKey  = "ecdsa_r1";
        postQuantumKey = "falcon";
        factoryName    = "falcon_r1";
    }
}

contract ETHFALCON_ECDSAk1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_ETHFALCON_K1_FACTORY_V0_0_2";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "ethfalcon";
        factoryName    = "ethfalcon_k1";
    }
}

contract ETHFALCON_ECDSAr1_Factory is FactoryDeployer {
    constructor() {
        saltLabel      = "ZKNOX_ETHFALCON_R1_FACTORY_V0_0_2";
        preQuantumKey  = "ecdsa_r1";
        postQuantumKey = "ethfalcon";
        factoryName    = "ethfalcon_r1";
    }
}

// ─── Agent-account factories (distinct salt/saltLabel) ───────────────────────
// These deploy the same ZKNOX_AccountFactory contract but with a dedicated
// VERSION string so agent-account CREATE2 salts are namespaced to this setup.

contract MLDSA_ECDSAk1_AgentFactory is FactoryDeployer {
    constructor() {
        saltLabel      = "PQ_AGENTS_MLDSA_K1_FACTORY_V0_0_1";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "mldsa";
        factoryName    = "mldsa_k1_agent";
    }
}

contract ETHFALCON_ECDSAk1_AgentFactory is FactoryDeployer {
    constructor() {
        saltLabel      = "PQ_AGENTS_ETHFALCON_K1_FACTORY_V0_0_1";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "ethfalcon";
        factoryName    = "ethfalcon_k1_agent";
    }
}

contract FALCON_ECDSAk1_AgentFactory is FactoryDeployer {
    constructor() {
        saltLabel      = "PQ_AGENTS_FALCON_K1_FACTORY_V0_0_1";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "falcon";
        factoryName    = "falcon_k1_agent";
    }
}

contract MLDSAETH_ECDSAk1_AgentFactory is FactoryDeployer {
    constructor() {
        saltLabel      = "PQ_AGENTS_MLDSAETH_K1_FACTORY_V0_0_1";
        preQuantumKey  = "ecdsa_k1";
        postQuantumKey = "mldsaeth";
        factoryName    = "mldsaeth_k1_agent";
    }
}
