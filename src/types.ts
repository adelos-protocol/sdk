import { PublicKey } from "@solana/web3.js";

/** Represents a registry account data */
export interface RegistryAccount {
  owner: PublicKey;
  metaPubkey: Uint8Array;
  bump: number;
}

/** Options for initializing the Adelos SDK */
export interface AdelosOptions {
  /** Custom RPC URL (optional - uses devnet default if not set) */
  rpcUrl?: string;
  /** Helius API key for indexer webhooks (optional) */
  heliusApiKey?: string;
  /** Enable debug logging (optional - defaults to false) */
  debug?: boolean;
}

/** Result of a registry lookup */
export interface RegistryInfo {
  address: PublicKey;
  account: RegistryAccount;
  exists: boolean;
}

/** Stealth transaction detected during scanning */
export interface StealthTransaction {
  signature: string;
  blockTime: number | null;
  stealthAddress: PublicKey;
  amount: bigint;
  /** Ephemeral public key from memo - needed for withdraw */
  ephemeralPk: Uint8Array;
}

/** Stealth transaction ready for withdrawal */
export interface WithdrawableTransaction extends StealthTransaction {
  /** Recovered stealth secret key - used to sign withdraw tx */
  stealthSecretKey: Uint8Array;
}
