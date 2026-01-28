import { PublicKey, clusterApiUrl } from "@solana/web3.js";

export type SolanaCluster = "devnet";

export const ADELOS_CONFIG = {
  PROGRAM_ID: new PublicKey("7T1UxHJ6psKiQheKZXxANu6mhgsmgaX55eNKZZL5u4Rp"),
  RPC_URL: clusterApiUrl("devnet"),
  MEMO_PROGRAM_ID: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
  REGISTRY_SEED: "registry",
  MEMO_PREFIX: "ADLSv1:",
  STEALTH_DOMAIN: "adelos:stealth:v1",
  UNLOCK_MESSAGE: "Adelos Protocol: Unlock Privacy Identity\n\nThis will derive your unique privacy key for stealth addresses. This does not cost gas.",
} as const;

// Re-exports for convenience
export const PROGRAM_ID = ADELOS_CONFIG.PROGRAM_ID;
export const RPC_URL = ADELOS_CONFIG.RPC_URL;
export const MEMO_PROGRAM_ID = ADELOS_CONFIG.MEMO_PROGRAM_ID;
export const REGISTRY_SEED = ADELOS_CONFIG.REGISTRY_SEED;
export const MEMO_PREFIX = ADELOS_CONFIG.MEMO_PREFIX;
export const STEALTH_DOMAIN = ADELOS_CONFIG.STEALTH_DOMAIN;
