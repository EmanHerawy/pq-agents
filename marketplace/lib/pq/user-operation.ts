import { ml_dsa44 } from "@noble/post-quantum/ml-dsa";
import { BrowserProvider, ethers } from "ethers";

export const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const ACCOUNT_ABI = [
  "function execute(address dest, uint256 value, bytes calldata func) external",
  "function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external",
  "function getNonce() external view returns (uint256)",
];

export type UserOperation = {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: bigint;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
};

export type GasEstimates = {
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
};

const packUint128 = (a: bigint, b: bigint): string =>
  ethers.solidityPacked(["uint128", "uint128"], [a, b]);

const unpackUint128 = (packed: string): [bigint, bigint] => {
  const bytes = ethers.getBytes(packed);
  const first = BigInt("0x" + ethers.hexlify(bytes.slice(0, 16)).slice(2));
  const second = BigInt("0x" + ethers.hexlify(bytes.slice(16, 32)).slice(2));
  return [first, second];
};

export const createBaseUserOperation = async (
  accountAddress: string,
  targetAddress: string,
  value: bigint,
  callData: string,
  provider: BrowserProvider,
  bundlerUrl: string
): Promise<UserOperation> => {
  const account = new ethers.Contract(accountAddress, ACCOUNT_ABI, provider);
  // ZKNOX accounts expose getNonce() which wraps the EntryPoint nonce — use it directly (matches scaffold)
  let nonce: bigint;
  try { nonce = await account.getNonce(); } catch { nonce = 0n; }
  console.log("[user-operation] nonce:", nonce.toString());

  const executeCallData = account.interface.encodeFunctionData("execute", [targetAddress, value, callData]);

  let maxPriority: bigint;
  let maxFee: bigint;
  try {
    const gasResponse = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "pimlico_getUserOperationGasPrice", params: [] }),
    });
    const gasResult = await gasResponse.json();
    if (!gasResult.result) throw new Error("No gas price returned");
    maxFee = BigInt(gasResult.result.standard.maxFeePerGas);
    maxPriority = BigInt(gasResult.result.standard.maxPriorityFeePerGas);
  } catch {
    maxPriority = ethers.parseUnits("0.1", "gwei");
    maxFee = ethers.parseUnits("0.2", "gwei");
  }

  return {
    sender: accountAddress,
    nonce,
    initCode: "0x",
    callData: executeCallData,
    accountGasLimits: packUint128(13_500_000n, 500_000n),
    preVerificationGas: 1_000_000n,
    gasFees: packUint128(maxPriority, maxFee),
    paymasterAndData: "0x",
    signature: "0x",
  };
};

export const userOpToBundlerFormat = (userOp: UserOperation) => {
  const [verificationGasLimit, callGasLimit] = unpackUint128(userOp.accountGasLimits);
  const [maxPriorityFeePerGas, maxFeePerGas] = unpackUint128(userOp.gasFees);
  return {
    sender: userOp.sender,
    nonce: "0x" + BigInt(userOp.nonce).toString(16),
    callData: userOp.callData,
    verificationGasLimit: "0x" + verificationGasLimit.toString(16),
    callGasLimit: "0x" + callGasLimit.toString(16),
    preVerificationGas: "0x" + BigInt(userOp.preVerificationGas).toString(16),
    maxFeePerGas: "0x" + maxFeePerGas.toString(16),
    maxPriorityFeePerGas: "0x" + maxPriorityFeePerGas.toString(16),
    signature: userOp.signature,
  };
};

/**
 * Dummy signature for gas estimation — bundler simulation requires a correctly-sized
 * signature even though the values are meaningless. ML-DSA-44 signatures are 2420 bytes;
 * ECDSA secp256k1 signatures are 65 bytes. Both are zero-filled here.
 */
export const getDummySignature = (): string =>
  ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "bytes"],
    [new Uint8Array(65), new Uint8Array(2420)]
  );

export const estimateUserOperationGas = async (
  userOp: UserOperation,
  bundlerUrl: string
): Promise<GasEstimates> => {
  const epAddr = ENTRY_POINT_ADDRESS;
  const MIN_VERIFICATION = 13_500_000n;
  try {
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateUserOperationGas", params: [userOpToBundlerFormat(userOp), epAddr] }),
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error.message || "Estimation failed");
    if (!result.result) throw new Error("No estimate returned");

    let verificationGasLimit = BigInt(result.result.verificationGasLimit);
    if (verificationGasLimit < MIN_VERIFICATION) verificationGasLimit = MIN_VERIFICATION;
    // ML-DSA signatures are ~2.5 KB; multiply preVerificationGas by 4× to cover extra calldata cost.
    const preVerificationGas = BigInt(result.result.preVerificationGas || userOp.preVerificationGas) * 4n;
    return { verificationGasLimit, callGasLimit: BigInt(result.result.callGasLimit), preVerificationGas };
  } catch {
    return { verificationGasLimit: MIN_VERIFICATION, callGasLimit: 500_000n, preVerificationGas: userOp.preVerificationGas * 4n };
  }
};

export const updateUserOpWithGasEstimates = (userOp: UserOperation, gas: GasEstimates): UserOperation => ({
  ...userOp,
  accountGasLimits: packUint128(gas.verificationGasLimit, gas.callGasLimit),
  preVerificationGas: gas.preVerificationGas,
});

export const getUserOpHash = (userOp: UserOperation, entryPointAddress: string, chainId: bigint): string => {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const packed = abi.encode(
    ["address", "uint256", "bytes32", "bytes32", "bytes32", "uint256", "bytes32", "bytes32"],
    [
      userOp.sender,
      userOp.nonce,
      ethers.keccak256(userOp.initCode),
      ethers.keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      ethers.keccak256(userOp.paymasterAndData),
    ]
  );
  return ethers.keccak256(abi.encode(["bytes32", "address", "uint256"], [ethers.keccak256(packed), entryPointAddress, chainId]));
};

export const signUserOpHybrid = async (
  userOp: UserOperation,
  entryPointAddress: string,
  chainId: bigint,
  preQuantumPrivateKey: string,
  postQuantumSecretKey: Uint8Array
): Promise<string> => {
  const hash = getUserOpHash(userOp, entryPointAddress, chainId);
  const preQuantumSig = new ethers.Wallet(preQuantumPrivateKey).signingKey.sign(hash).serialized;
  // ml_dsa44.sign(msg, secretKey) — msg first, secretKey second
  const postQuantumSig = ethers.hexlify(ml_dsa44.sign(postQuantumSecretKey, ethers.getBytes(hash)));
  return ethers.AbiCoder.defaultAbiCoder().encode(["bytes", "bytes"], [preQuantumSig, postQuantumSig]);
};

export const submitUserOperation = async (userOp: UserOperation, bundlerUrl: string): Promise<string> => {
  const epAddr = ENTRY_POINT_ADDRESS;
  const response = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendUserOperation", params: [userOpToBundlerFormat(userOp), epAddr] }),
  });
  const result = await response.json();
  if (result.error) throw new Error("Bundler error: " + (result.error.message || "Unknown"));
  return result.result;
};
