import { describe, it, expect } from "vitest";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// Polyfill sha512 for noble
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// Helper: Convert scalar bytes to BigInt (Little Endian)
const toScalar = (bytes: Uint8Array): bigint => {
  const reversed = Uint8Array.from(bytes).reverse();
  return ed.etc.mod(BigInt("0x" + Buffer.from(reversed).toString("hex")), ed.CURVE.n);
};

// Custom signWithScalar implementation
async function signWithScalar(message: Uint8Array, scalarBytes: Uint8Array): Promise<Uint8Array> {
  const scalar = toScalar(scalarBytes);
  const pubPoint = ed.ExtendedPoint.BASE.multiply(scalar);
  const pubBytes = pubPoint.toRawBytes();

  // 1. Generate random nonce r
  const rBytes = ed.utils.randomPrivateKey();
  const rScalar = toScalar(rBytes);

  // 2. R = r * G
  const R = ed.ExtendedPoint.BASE.multiply(rScalar);
  const RBytes = R.toRawBytes();

  // 3. k = SHA512(R || A || M)
  const content = new Uint8Array(RBytes.length + pubBytes.length + message.length);
  content.set(RBytes);
  content.set(pubBytes, RBytes.length);
  content.set(message, RBytes.length + pubBytes.length);

  const hram = sha512(content);
  const hramReversed = Uint8Array.from(hram).reverse();
  const k = ed.etc.mod(BigInt("0x" + Buffer.from(hramReversed).toString("hex")), ed.CURVE.n);

  // 4. S = (r + k * s) mod L
  const S = ed.etc.mod(rScalar + k * scalar, ed.CURVE.n);

  // 5. Serialize S (Little Endian)
  let sHex = S.toString(16);
  if (sHex.length % 2 !== 0) sHex = "0" + sHex;
  sHex = sHex.padStart(64, "0");
  const SBytes = Buffer.from(sHex, "hex").reverse();

  const signature = new Uint8Array(64);
  signature.set(RBytes);
  signature.set(SBytes, 32);

  return signature;
}

describe("Ed25519 Signature", () => {
  it("should create valid signature with scalar", async () => {
    // 1. Create a random scalar (simulating stealth private key)
    const scalarBytes = ed.utils.randomPrivateKey();

    // 2. Derive expected Public Key manually
    const scalar = toScalar(scalarBytes);
    const pubPoint = ed.ExtendedPoint.BASE.multiply(scalar);
    const pubKeyBytes = pubPoint.toRawBytes();

    // 3. Create a dummy message
    const message = new TextEncoder().encode("Hello Solana Stealth");

    // 4. Sign using our custom function
    const signature = await signWithScalar(message, scalarBytes);

    // 5. Verify using Noble Ed25519 (Standard)
    const isValid = await ed.verify(signature, message, pubKeyBytes);

    expect(isValid).toBe(true);
  });

  it("should produce 64-byte signatures", async () => {
    const scalarBytes = ed.utils.randomPrivateKey();
    const message = new TextEncoder().encode("Test message");
    const signature = await signWithScalar(message, scalarBytes);

    expect(signature.length).toBe(64);
  });

  it("should fail verification with wrong message", async () => {
    const scalarBytes = ed.utils.randomPrivateKey();
    const scalar = toScalar(scalarBytes);
    const pubKeyBytes = ed.ExtendedPoint.BASE.multiply(scalar).toRawBytes();

    const message = new TextEncoder().encode("Original message");
    const wrongMessage = new TextEncoder().encode("Wrong message");

    const signature = await signWithScalar(message, scalarBytes);
    const isValid = await ed.verify(signature, wrongMessage, pubKeyBytes);

    expect(isValid).toBe(false);
  });
});
