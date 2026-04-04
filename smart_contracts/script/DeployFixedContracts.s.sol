// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {console} from "forge-std/Test.sol";

import {BaseScript} from "ETHDILITHIUM/script/BaseScript.sol";
import {ZKNOX_dilithium} from "ETHDILITHIUM/src/ZKNOX_dilithium.sol";
import {ZKNOX_ethdilithium} from "ETHDILITHIUM/src/ZKNOX_ethdilithium.sol";

import {ECDSAk1Verifier} from "../lib/InterfaceVerifier/src/VerifierECDSAk1.sol";
import {ECDSAr1Verifier} from "../lib/InterfaceVerifier/src/VerifierECDSAr1.sol";

import {ZKNOX_falcon} from "ETHFALCON/src/ZKNOX_falcon.sol";
import {ZKNOX_ethfalcon} from "ETHFALCON/src/ZKNOX_ethfalcon.sol";

abstract contract VerifierDeployer is BaseScript {
    string internal saltLabel;
    string internal verifierKey; // json key name

    function deployContract(bytes32 salt) internal virtual returns (address);

    function _networkKey(uint256 chainId) internal view returns (string memory) {
        if (chainId == 11155111) return "sepolia";
        if (chainId == 1)        return "mainnet";
        if (chainId == 421614)   return "arbitrumSepolia";
        if (chainId == 84532)    return "baseSepolia";
        if (chainId == 5042002)  return "arcTestnet";
        return vm.toString(chainId);
    }

    function run() external returns (address) {
        string memory json = vm.readFile("deployments/deployments.json");

        string memory network = _networkKey(block.chainid);

        string memory basePath =
            string.concat(".", network, ".verifiers.", verifierKey);

        bytes32 salt = keccak256(abi.encodePacked(saltLabel));

        console.log("Deploying", verifierKey, "on", network);
        console.log("Salt label:", saltLabel);
        console.log("Salt:", vm.toString(salt));

        vm.startBroadcast();
        address deployed = deployContract(salt);
        vm.stopBroadcast();

        console.log("Deployed at:", deployed);

        string memory out = vm.serializeAddress(verifierKey, "address", deployed);
        out = vm.serializeBytes32(verifierKey, "salt", salt);
        out = vm.serializeString(verifierKey, "saltLabel", saltLabel);

        vm.writeJson(out, "deployments/deployments.json", basePath);

        console.log("deployments.json updated at", basePath);

        return deployed;
    }
}

contract MLDSAFixedContract is VerifierDeployer {
    constructor() {
        saltLabel = "ZKNOX_MLDSA_VERIFIER_V0_0_10";
        verifierKey = "mldsa";
    }
    function deployContract(bytes32 salt) internal override returns (address) {
        return address(new ZKNOX_dilithium{salt: salt}());
    }
}

contract MLDSAETHFixedContract is VerifierDeployer {
    constructor() {
        saltLabel = "ZKNOX_MLDSAETH_VERIFIER_V0_0_3";
        verifierKey = "mldsaeth";
    }
    function deployContract(bytes32 salt) internal override returns (address) {
        return address(new ZKNOX_ethdilithium{salt: salt}());
    }
}

contract FALCONFixedContract is VerifierDeployer {
    constructor() {
        saltLabel = "ZKNOX_FALCON_VERIFIER_V0_0_4";
        verifierKey = "falcon";
    }
    function deployContract(bytes32 salt) internal override returns (address) {
        return address(new ZKNOX_falcon{salt: salt}());
    }
}

contract ETHFALCONFixedContract is VerifierDeployer {
    constructor() {
        saltLabel = "ZKNOX_ETHFALCON_VERIFIER_V0_0_2";
        verifierKey = "ethfalcon";
    }
    function deployContract(bytes32 salt) internal override returns (address) {
        return address(new ZKNOX_ethfalcon{salt: salt}());
    }
}

contract ECDSAk1FixedContract is VerifierDeployer {
    constructor() {
        saltLabel = "ZKNOX_ECDSA_K1_VERIFIER_V0_0_1";
        verifierKey = "ecdsa_k1";
    }
    function deployContract(bytes32 salt) internal override returns (address) {
        return address(new ECDSAk1Verifier{salt: salt}());
    }
}

contract ECDSAr1FixedContract is VerifierDeployer {
    constructor() {
        saltLabel = "ZKNOX_ECDSA_R1_VERIFIER_V0_0_1";
        verifierKey = "ecdsa_r1";
    }
    function deployContract(bytes32 salt) internal override returns (address) {
        return address(new ECDSAr1Verifier{salt: salt}());
    }
}