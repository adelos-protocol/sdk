import { PublicKey } from "@solana/web3.js";
import { ADELOS_CONFIG } from "./constants";

/**
 * Derives the registry PDA for a given owner
 */
export function deriveRegistryPda(
  owner: PublicKey,
  programId: PublicKey = ADELOS_CONFIG.PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ADELOS_CONFIG.REGISTRY_SEED), owner.toBuffer()],
    programId
  );
}

/**
 * Validates a meta pubkey (must be 32 bytes and not all zeros)
 * @param metaPubkey - The meta public key to validate
 * @returns True if valid, false otherwise
 */
export function isValidMetaPubkey(metaPubkey: Uint8Array): boolean {
  if (metaPubkey.length !== 32) return false;
  // Check if all zeros (invalid)
  return !metaPubkey.every((byte) => byte === 0);
}

/**
 * Converts a hex string to Uint8Array
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to hex string
 * @param bytes - Uint8Array
 * @returns Hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Gets the instruction discriminator for an Anchor instruction
 * @param instructionName - Name of the instruction (snake_case)
 * @returns 8-byte discriminator
 */
export function getDiscriminator(instructionName: string): Uint8Array {
  // Using pre-computed discriminators for efficiency
  const discriminators: Record<string, Uint8Array> = {
    register_identity: new Uint8Array([164, 118, 227, 177, 47, 176, 187, 248]),
    update_identity: new Uint8Array([130, 54, 88, 104, 222, 124, 238, 252]),
    close_registry: new Uint8Array([76, 32, 154, 180, 51, 159, 218, 102]),
  };

  const disc = discriminators[instructionName];
  if (!disc) {
    throw new Error(`Unknown instruction: ${instructionName}`);
  }
  return disc;
}
