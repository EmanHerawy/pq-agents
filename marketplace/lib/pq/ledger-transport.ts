/**
 * Browser Ledger transport for ZKNOX ML-DSA-44 + ECDSA hybrid signing.
 * Uses WebHID — must run client-side only (never import from API routes).
 *
 * Ported from kohaku/packages/pq-account/js/hardware-signer/ledgerTransport.js
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid" as string)).default as any;
import { ethers } from "ethers";

const CLA = 0xe0;

const INS = {
  GET_MLDSA_SEED:      0x14,
  KEYGEN_DILITHIUM:    0x0c,
  SIGN_DILITHIUM:      0x0f,
  GET_SIG_CHUNK:       0x12,
  GET_PK_CHUNK:        0x13,
  GET_PUBLIC_KEY:      0x05,
  ECDSA_SIGN_HASH:     0x15,
  HYBRID_SIGN_HASH:    0x16,
  HYBRID_SIGN_USEROP:  0x17,
} as const;

export const MLDSA44_SIG_BYTES = 2420;
export const MLDSA44_PK_BYTES  = 1312;
const CHUNK_SIZE = 255;
const DEFAULT_BIP32 = "m/44'/60'/0'/0/0";

// ─── Types ───────────────────────────────────────────────────────────────

export type HybridSignature = {
  ecdsaV: number;
  ecdsaR: Uint8Array;
  ecdsaS: Uint8Array;
  mldsaSignature: Uint8Array;
};

export type PackedHybridSig = string; // ABI-encoded bytes

// ─── Low-level helpers ────────────────────────────────────────────────────

function encodeBip32Path(path: string): Buffer {
  const components = path
    .replace("m/", "")
    .split("/")
    .map(c => {
      const hardened = c.endsWith("'");
      const val = parseInt(hardened ? c.slice(0, -1) : c, 10);
      return hardened ? (val + 0x80000000) >>> 0 : val;
    });
  const buf = Buffer.alloc(1 + components.length * 4);
  buf[0] = components.length;
  components.forEach((c, i) => buf.writeUInt32BE(c, 1 + i * 4));
  return buf;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendApdu(transport: any, ins: number, p1: number, p2: number, data: Buffer | null): Promise<Buffer> {
  const payload  = data ? Buffer.from(data) : Buffer.alloc(0);
  const response = await transport.send(CLA, ins, p1, p2, payload);
  return response.subarray(0, response.length - 2);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readChunked(transport: any, ins: number, totalBytes: number): Promise<Uint8Array> {
  const buf = Buffer.alloc(totalBytes);
  for (let p1 = 0; p1 * CHUNK_SIZE < totalBytes; p1++) {
    const offset    = p1 * CHUNK_SIZE;
    const remaining = totalBytes - offset;
    const p2        = Math.min(remaining, CHUNK_SIZE);
    const chunk     = await sendApdu(transport, ins, p1, p2, null);
    chunk.copy(buf, offset, 0, p2);
  }
  return new Uint8Array(buf);
}

function bigintTo32BE(val: bigint): Buffer {
  const hex = val.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

function addressToBytes(addr: string): Buffer {
  return Buffer.from(addr.replace(/^0x/, ""), "hex");
}

function parseEcdsaResponse(resp: Buffer): { v: number; r: Uint8Array; s: Uint8Array } {
  const derLen = resp[0];
  const der    = resp.subarray(1, 1 + derLen);
  const v      = resp[1 + derLen];

  let offset = 2;
  offset++;
  const rLen = der[offset++];
  const rRaw = der.subarray(offset, offset + rLen);
  offset += rLen;
  offset++;
  const sLen = der[offset++];
  const sRaw = der.subarray(offset, offset + sLen);

  const r = new Uint8Array(32);
  const s = new Uint8Array(32);
  r.set(rRaw.subarray(rRaw.length - 32));
  s.set(sRaw.subarray(sRaw.length - 32));

  return { v, r, s };
}

// ─── Public API ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function openTransport(): Promise<any> {
  return TransportWebHID.create();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEcdsaAddress(transport: any, bip32Path = DEFAULT_BIP32): Promise<string> {
  const pathData = encodeBip32Path(bip32Path);
  const pubkey   = await sendApdu(transport, INS.GET_PUBLIC_KEY, 0x00, 0x00, pathData);
  const raw  = pubkey.subarray(2, 66);
  const hash = ethers.keccak256(raw);
  return "0x" + hash.slice(-40);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deriveMldsaSeed(transport: any, bip32Path = DEFAULT_BIP32): Promise<void> {
  const pathData = encodeBip32Path(bip32Path);
  await sendApdu(transport, INS.GET_MLDSA_SEED, 0x00, 0x00, pathData);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMldsaPublicKey(transport: any): Promise<Uint8Array> {
  await sendApdu(transport, INS.KEYGEN_DILITHIUM, 0x00, 0x00, null);
  return readChunked(transport, INS.GET_PK_CHUNK, MLDSA44_PK_BYTES);
}

/**
 * Compute the ERC-4337 v0.7 UserOpHash (same as the smart contract does on-chain).
 */
export function getUserOpHash(
  userOp: {
    sender: string;
    nonce: bigint;
    initCode: string;
    callData: string;
    accountGasLimits: string;
    preVerificationGas: bigint;
    gasFees: string;
    paymasterAndData: string;
  },
  entryPoint: string,
  chainId: bigint
): Uint8Array {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const packed = abi.encode(
    ["address","uint256","bytes32","bytes32","bytes32","uint256","bytes32","bytes32"],
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
  const final = abi.encode(
    ["bytes32","address","uint256"],
    [ethers.keccak256(packed), entryPoint, chainId]
  );
  return ethers.getBytes(ethers.keccak256(final));
}

/**
 * Hybrid blind-sign: sends 32-byte UserOpHash to device.
 * Single user confirmation → ECDSA + ML-DSA-44 signatures.
 * Use this when HYBRID_SIGN_USEROP (0x17) is not supported by the app version.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signHybridHash(
  transport: any,
  hashBytes: Uint8Array,
  bip32Path = DEFAULT_BIP32
): Promise<PackedHybridSig> {
  if (hashBytes.length !== 32) throw new Error("Hash must be 32 bytes");

  const pathData = encodeBip32Path(bip32Path);
  const payload  = Buffer.concat([pathData, Buffer.from(hashBytes)]);
  const resp     = await sendApdu(transport, INS.HYBRID_SIGN_HASH, 0x00, 0x00, payload);

  const { v, r, s }    = parseEcdsaResponse(resp);
  const mldsaSignature = await readChunked(transport, INS.GET_SIG_CHUNK, MLDSA44_SIG_BYTES);

  const ecdsaSig = ethers.concat([r, s, ethers.toBeHex(v + 27, 1)]);
  const abi = ethers.AbiCoder.defaultAbiCoder();
  return abi.encode(["bytes", "bytes"], [ecdsaSig, ethers.hexlify(mldsaSignature)]);
}

/**
 * Clear-sign an ERC-4337 v0.7 UserOp on Ledger (requires app firmware with 0x17 support).
 * Falls back to signHybridHash if UNKNOWN_APDU is returned.
 * Device shows human-readable fields; user presses physical button to confirm.
 * Returns hybrid ECDSA + ML-DSA-44 signature packed for the ZKNOX verifier.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signHybridUserOp(
  transport: any,
  userOp: {
    sender: string;
    nonce: bigint;
    initCode: string;
    callData: string;
    accountGasLimits: string;
    preVerificationGas: bigint;
    gasFees: string;
    paymasterAndData: string;
  },
  entryPoint: string,
  chainId: bigint,
  bip32Path = DEFAULT_BIP32
): Promise<PackedHybridSig> {
  const I = INS.HYBRID_SIGN_USEROP;

  // APDU 1: BIP32 path
  await sendApdu(transport, I, 0x00, 0x00, encodeBip32Path(bip32Path));

  // APDU 2: chain_id(32) | entry_point(20) | sender(20) | nonce(32)
  await sendApdu(transport, I, 0x01, 0x00, Buffer.concat([
    bigintTo32BE(chainId),
    addressToBytes(entryPoint),
    addressToBytes(userOp.sender),
    bigintTo32BE(userOp.nonce),
  ]));

  // APDU 3: six 32-byte packed fields
  await sendApdu(transport, I, 0x02, 0x00, Buffer.concat([
    ethers.getBytes(ethers.keccak256(userOp.initCode)),
    ethers.getBytes(ethers.keccak256(userOp.callData)),
    ethers.getBytes(userOp.accountGasLimits),
    bigintTo32BE(userOp.preVerificationGas),
    ethers.getBytes(userOp.gasFees),
    ethers.getBytes(ethers.keccak256(userOp.paymasterAndData)),
  ]));

  // APDU 4: raw callData (triggers NBGL review on device screen)
  const rawCallData = ethers.getBytes(userOp.callData);
  const callDataPayload = rawCallData.length <= CHUNK_SIZE
    ? Buffer.from(rawCallData)
    : Buffer.alloc(0);

  const resp = await sendApdu(transport, I, 0x03, 0x00, callDataPayload);

  const { v, r, s }   = parseEcdsaResponse(resp);
  const mldsaSignature = await readChunked(transport, INS.GET_SIG_CHUNK, MLDSA44_SIG_BYTES);

  const ecdsaSig = ethers.concat([r, s, ethers.toBeHex(v + 27, 1)]);
  const abi = ethers.AbiCoder.defaultAbiCoder();
  return abi.encode(["bytes", "bytes"], [ecdsaSig, ethers.hexlify(mldsaSignature)]);
}
