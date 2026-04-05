import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";
import { BrowserProvider, ethers, isAddress } from "ethers";
import { hexToU8 } from "./hex";
import {
  createBaseUserOperation,
  ENTRY_POINT_ADDRESS,
  estimateUserOperationGas,
  getDummySignature,
  signUserOpHybrid,
  submitUserOperation,
  updateUserOpWithGasEstimates,
  UserOperation,
} from "./user-operation";

export type SendTransactionResult = {
  success: boolean;
  userOpHash?: string;
  userOp?: UserOperation;
  message?: string;
  error?: string;
};

export const sendERC4337Transaction = async (
  accountAddress: string,
  targetAddress: string,
  valueEth: string,
  callData: string,
  preQuantumSeed: string,
  postQuantumSeed: string,
  provider: BrowserProvider,
  bundlerUrl: string,
  log: (msg: string) => void
): Promise<SendTransactionResult> => {
  try {
    if (!isAddress(accountAddress)) throw new Error("Invalid account address: " + accountAddress);
    if (!isAddress(targetAddress)) throw new Error("Invalid recipient address: " + targetAddress);

    const network = await provider.getNetwork();
    const value = ethers.parseEther(valueEth);
    const accountBalance = await provider.getBalance(accountAddress);

    log("From: " + accountAddress);
    log("To: " + targetAddress);
    log("Value: " + valueEth + " ETH | Balance: " + ethers.formatEther(accountBalance) + " ETH");
    if (accountBalance === 0n) log("WARNING: Account has no balance!");

    const { secretKey } = ml_dsa44.keygen(hexToU8(postQuantumSeed, 32));

    let userOp = await createBaseUserOperation(accountAddress, targetAddress, value, callData, provider, bundlerUrl);
    log("Nonce: " + userOp.nonce.toString());

    if (!bundlerUrl || bundlerUrl.trim() === "") {
      userOp.signature = await signUserOpHybrid(userOp, ENTRY_POINT_ADDRESS, network.chainId, preQuantumSeed, secretKey);
      return { success: true, userOp, message: "UserOperation created and signed (no bundler URL — cannot submit)" };
    }

    // Use a dummy signature for gas estimation — bundler simulates the tx and needs a full-size sig.
    userOp.signature = getDummySignature();
    const gasEstimates = await estimateUserOperationGas(userOp, bundlerUrl);
    userOp = updateUserOpWithGasEstimates(userOp, gasEstimates);
    // Re-sign with the correct gas limits before submission.
    userOp.signature = await signUserOpHybrid(userOp, ENTRY_POINT_ADDRESS, network.chainId, preQuantumSeed, secretKey);

    try {
      log("Submitting to bundler...");
      const userOpHash = await submitUserOperation(userOp, bundlerUrl);
      log("Submitted! userOpHash: " + userOpHash);
      return { success: true, userOpHash };
    } catch (error) {
      log("Bundler submission failed: " + (error as Error).message);
      return { success: false, error: (error as Error).message, userOp };
    }
  } catch (e) {
    const error = e as { message: string };
    log("Error: " + error.message);
    return { success: false, error: error.message };
  }
};
