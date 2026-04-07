import { ml_dsa44 } from "@noble/post-quantum/ml-dsa";
import { ethers, Signer } from "ethers";
import { hexToU8 } from "./hex";
import { to_expanded_encoded_bytes } from "./utils-mldsa";

const SEPARATOR = "=".repeat(60);

const ACCOUNT_FACTORY_ABI = [
  "function createAccount(bytes calldata preQuantumPubKey, bytes calldata postQuantumPubKey) external returns (address)",
  "function getAddress(bytes calldata preQuantumPubKey, bytes calldata postQuantumPubKey) external view returns (address payable)",
];

export type DeploymentResult = {
  success: boolean;
  address?: string;
  transactionHash?: string;
  alreadyExists?: boolean;
  error?: string;
  gasUsed?: string;
  actualCost?: string;
};

export const validateSeed = (seed: string, name: string): void => {
  if (!seed.startsWith("0x"))
    throw new Error(name + ' must start with "0x"');
  if (seed.length !== 66)
    throw new Error(name + " must be 32 bytes (66 characters including 0x, got " + seed.length + ")");
  if (!/^0x[0-9a-fA-F]{64}$/.test(seed))
    throw new Error(name + " contains invalid hex");
};

export const getPublicKeys = (preQuantumSeed: string, postQuantumSeed: string) => {
  const preQuantumPubKey = new ethers.Wallet(preQuantumSeed).address;
  const { publicKey } = ml_dsa44.keygen(hexToU8(postQuantumSeed, 32));
  const postQuantumPubKey = to_expanded_encoded_bytes(publicKey);
  return { preQuantumPubKey, postQuantumPubKey };
};

export const deployERC4337Account = async (
  factoryAddress: string,
  preQuantumPubKey: string,
  postQuantumPubKey: string,
  signer: Signer,
  log: (msg: string) => void
): Promise<DeploymentResult> => {
  try {
    const { provider } = signer;
    if (!provider) throw new Error("Signer must have a provider");

    log("Connecting to wallet...");
    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);
    const network = await provider.getNetwork();
    log("Wallet: " + address);
    log("Balance: " + ethers.formatEther(balance) + " ETH");
    log("Chain: " + network.chainId);

    const factoryCode = await provider.getCode(factoryAddress);
    if (factoryCode === "0x") throw new Error("No contract at factory address!");

    const factory = new ethers.Contract(factoryAddress, ACCOUNT_FACTORY_ABI, signer);
    const iface = new ethers.Interface(ACCOUNT_FACTORY_ABI);
    const callData = iface.encodeFunctionData("getAddress", [preQuantumPubKey, postQuantumPubKey]);
    const result = await provider.call({ to: factoryAddress, data: callData });
    const [expectedAddress] = iface.decodeFunctionResult("getAddress", result);

    if (!ethers.isAddress(expectedAddress)) throw new Error("Invalid address from getAddress()");
    log("Expected account: " + expectedAddress);

    const code = await provider.getCode(expectedAddress);
    if (code !== "0x") {
      log(SEPARATOR);
      log("ACCOUNT ALREADY EXISTS: " + expectedAddress);
      log(SEPARATOR);
      return { success: true, address: expectedAddress, alreadyExists: true };
    }

    let estimatedGas;
    try {
      estimatedGas = await factory.createAccount.estimateGas(preQuantumPubKey, postQuantumPubKey);
    } catch {
      estimatedGas = 5000000n;
      log("Gas estimation failed, using fallback: " + estimatedGas);
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    log("Estimated gas: " + estimatedGas + " @ " + ethers.formatUnits(gasPrice, "gwei") + " gwei");
    log("Creating account — confirm in wallet...");

    const tx = await factory.createAccount(preQuantumPubKey, postQuantumPubKey, {
      gasLimit: (estimatedGas * 120n) / 100n,
    });
    log("Tx: " + tx.hash);

    let receipt = null;
    let attempts = 0;
    while (!receipt && attempts < 60) {
      try {
        receipt = await provider.getTransactionReceipt(tx.hash);
        if (!receipt) { attempts++; await new Promise((r) => setTimeout(r, 5000)); }
      } catch { attempts++; await new Promise((r) => setTimeout(r, 5000)); }
    }

    if (!receipt) return { success: false, error: "Transaction timeout", transactionHash: tx.hash };
    if (receipt.status === 0) return { success: false, error: "Transaction reverted", transactionHash: tx.hash };

    const actualCost = receipt.gasUsed * (receipt.gasPrice ?? 0n);
    log(SEPARATOR);
    log("DEPLOYMENT COMPLETE!");
    log("Account: " + expectedAddress);
    log("Gas used: " + receipt.gasUsed + " | Cost: " + ethers.formatEther(actualCost) + " ETH");
    log(SEPARATOR);

    return { success: true, address: expectedAddress, transactionHash: tx.hash, gasUsed: receipt.gasUsed.toString(), actualCost: ethers.formatEther(actualCost) };
  } catch (e) {
    const err = e as { message: string; code?: string | number };
    log("Error: " + err.message);
    if (err.code === "ACTION_REJECTED" || err.code === 4001) log("(User rejected)");
    return { success: false, error: err.message };
  }
};
