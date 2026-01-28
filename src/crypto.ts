/**
 * Adelos Cryptography Module
 * Implements Single-Key Stealth Address (SKSA) using Pure Ed25519 Scalar Operations.
 */

import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import * as ed from "@noble/ed25519";
import { bytesToHex, hexToBytes } from "./utils";
import { ADELOS_CONFIG } from "./constants";

// --- Library Configuration ---

ed.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  m.forEach((msg) => h.update(msg));
  return h.digest();
};

const encoder = new TextEncoder();

/** Helper: Mengubah bytes menjadi BigInt scalar yang valid (mod L) */
const toScalar = (bytes: Uint8Array): bigint => {
  const cleanBytes = bytes.length === 64 ? bytes.slice(0, 32) : bytes;
  // Ed25519 scalars are Little-Endian. BigInt("0x...") expects Big-Endian.
  // We must reverse the bytes before creating BigInt.
  const reversed = Uint8Array.from(cleanBytes).reverse();
  return ed.etc.mod(BigInt("0x" + bytesToHex(reversed)), ed.CURVE.n);
};

// --- Core Stealth Functions ---

/** Generate Ephemeral Keypair (Pure Scalar) */
export function generateEphemeralKeypair() {
  const secretKey = ed.utils.randomPrivateKey();
  const scalar = toScalar(secretKey);
  const publicKey = ed.ExtendedPoint.BASE.multiply(scalar).toRawBytes();
  return { secretKey, publicKey };
}

/** Derive Public Key from Secret Key */
export function derivePublicKey(secretKey: Uint8Array): Uint8Array {
  const scalar = toScalar(secretKey);
  return ed.ExtendedPoint.BASE.multiply(scalar).toRawBytes();
}

/** Compute Shared Secret (Sender) */
export function computeSharedSecret(ephemeralSk: Uint8Array, recipientMetaPk: Uint8Array): Uint8Array {
  const point = ed.ExtendedPoint.fromHex(bytesToHex(recipientMetaPk));
  const scalar = toScalar(ephemeralSk);
  return sha256(point.multiply(scalar).toRawBytes());
}

/** Compute Shared Secret (Recipient) */
export function computeSharedSecretAsRecipient(metaSk: Uint8Array, ephemeralPk: Uint8Array): Uint8Array {
  const point = ed.ExtendedPoint.fromHex(bytesToHex(ephemeralPk));
  const scalar = toScalar(metaSk);
  return sha256(point.multiply(scalar).toRawBytes());
}

/** Derive Stealth Public Key */
export function deriveStealthPubkey(metaPk: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  const domain = encoder.encode(ADELOS_CONFIG.STEALTH_DOMAIN);
  const scalarBytes = sha256(new Uint8Array([...sharedSecret, ...domain]));
  const scalar = toScalar(scalarBytes);

  const metaPoint = ed.ExtendedPoint.fromHex(bytesToHex(metaPk));
  const stealthPoint = metaPoint.add(ed.ExtendedPoint.BASE.multiply(scalar));

  return stealthPoint.toRawBytes();
}

/** Recover Stealth Private Key */
export function recoverStealthSecretKey(metaSk: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  const domain = encoder.encode(ADELOS_CONFIG.STEALTH_DOMAIN);
  const scalarBytes = sha256(new Uint8Array([...sharedSecret, ...domain]));

  const scalar = toScalar(scalarBytes);
  const metaScalar = toScalar(metaSk);

  const stealthScalar = ed.etc.mod(metaScalar + scalar, ed.CURVE.n);
  const hex = stealthScalar.toString(16).padStart(64, "0"); // Big-Endian Hex

  // Output must be Little-Endian bytes to be used as a valid scalar input later
  return hexToBytes(hex).reverse();
}

// --- Utilities ---

export function generateStealthMemo(ephemeralPubkey: Uint8Array): string {
  return `${ADELOS_CONFIG.MEMO_PREFIX}${bytesToHex(ephemeralPubkey)}`;
}

export function parseStealthMemo(memo: string): Uint8Array | null {
  if (!memo.startsWith(ADELOS_CONFIG.MEMO_PREFIX)) return null;

  // Memotong prefix untuk mendapatkan hex public key
  const pubkeyHex = memo.slice(ADELOS_CONFIG.MEMO_PREFIX.length);

  if (pubkeyHex.length !== 64) return null;
  try {
    return hexToBytes(pubkeyHex);
  } catch {
    return null;
  }
}

/** Full Stealth Address Generation Flow */
export function generateStealthAddress(recipientMetaPk: Uint8Array) {
  const ephemeralKeypair = generateEphemeralKeypair();
  const sharedSecret = computeSharedSecret(ephemeralKeypair.secretKey, recipientMetaPk);
  const stealthPubkey = deriveStealthPubkey(recipientMetaPk, sharedSecret);
  const memo = generateStealthMemo(ephemeralKeypair.publicKey);

  return { stealthPubkey, ephemeralKeypair, sharedSecret, memo };
}

/** 
 * Sign a message using a raw private SCALAR (not seed). 
 * Required because derived stealth keys are scalars, not seeds.
 * Uses a random nonce for R, valid for Ed25519.
 */
export async function signWithScalar(message: Uint8Array, scalarBytes: Uint8Array): Promise<Uint8Array> {
  const scalar = toScalar(scalarBytes);
  const pubPoint = ed.ExtendedPoint.BASE.multiply(scalar);
  const pubBytes = pubPoint.toRawBytes();

  // 1. Generate random nonce r (deterministic would be better but random is safe/valid)
  const rBytes = ed.utils.randomPrivateKey();
  const rScalar = toScalar(rBytes);

  // 2. R = r * G
  const R = ed.ExtendedPoint.BASE.multiply(rScalar);
  const RBytes = R.toRawBytes();

  // 3. k = SHA512(R || A || M) interpreted as scalar
  const content = new Uint8Array(RBytes.length + pubBytes.length + message.length);
  content.set(RBytes);
  content.set(pubBytes, RBytes.length);
  content.set(message, RBytes.length + pubBytes.length);

  const hram = sha512(content);
  // HRAM is 64 bytes, also must be treated as Little-Endian for scalar reduction
  const hramReversed = Uint8Array.from(hram).reverse();
  const k = ed.etc.mod(BigInt("0x" + bytesToHex(hramReversed)), ed.CURVE.n);

  // 4. S = (r + k * s) mod L
  const S = ed.etc.mod(rScalar + k * scalar, ed.CURVE.n);

  // 5. Signature = R || S
  // S must be serialized as Little-Endian bytes
  const sHexPadded = S.toString(16).padStart(64, "0"); // 32 bytes BE
  const SBytes = hexToBytes(sHexPadded).reverse(); // 32 bytes LE

  const signature = new Uint8Array(64);
  signature.set(RBytes);
  signature.set(SBytes, 32);

  return signature;
}