/**
 * Adelos Light Protocol Integration
 *
 * Provides ZK-Compression for confidential transfers using Light Protocol.
 * Compressed tokens are stored in Merkle trees instead of regular accounts,
 * providing significant cost savings and enhanced privacy.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "../constants";

/** Light Protocol program IDs */
export const LIGHT_PROGRAM_IDS = {
  LIGHT_SYSTEM_PROGRAM: new PublicKey(
    "SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7"
  ),
  COMPRESSED_TOKEN_PROGRAM: new PublicKey(
    "cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m"
  ),
  ACCOUNT_COMPRESSION_PROGRAM: new PublicKey(
    "compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq"
  ),
};

/** Configuration for Light Protocol RPC */
export interface LightConfig {
  /** Light Protocol RPC endpoint */
  rpcUrl: string;
  /** Compression public key (for tree) */
  compressionPubkey?: PublicKey;
}

/** Compressed account info */
export interface CompressedAccount {
  /** Account hash */
  hash: string;
  /** Owner public key */
  owner: PublicKey;
  /** Lamports in account */
  lamports: number;
  /** Account data */
  data: Uint8Array;
  /** Merkle tree address */
  tree: PublicKey;
  /** Leaf index in tree */
  leafIndex: number;
}

/** Compressed token balance */
export interface CompressedTokenBalance {
  /** Token mint */
  mint: PublicKey;
  /** Balance amount */
  amount: bigint;
  /** Source accounts */
  accounts: CompressedAccount[];
}

/**
 * Light Protocol client for ZK-Compression operations
 */
export class LightClient {
  private connection: Connection;
  private config: LightConfig;

  constructor(connection: Connection, config: LightConfig) {
    this.connection = connection;
    this.config = config;
  }

  /**
   * Creates a new Light Protocol client
   *
   * @param rpcUrl - Solana RPC URL with Light Protocol support
   * @returns LightClient instance
   */
  static create(rpcUrl: string): LightClient {
    const connection = new Connection(rpcUrl, "confirmed");
    return new LightClient(connection, { rpcUrl });
  }

  /**
   * Gets compressed SOL balance for an address
   *
   * @param owner - Owner public key
   * @returns Compressed SOL balance in lamports
   */
  async getCompressedSolBalance(owner: PublicKey): Promise<bigint> {
    try {
      // Call Light Protocol RPC method
      const response = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getCompressedAccountsByOwner",
          params: [owner.toBase58()],
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.warn("Light RPC error:", data.error);
        return BigInt(0);
      }

      // Sum up all compressed account balances
      const accounts = data.result?.items || [];
      let total = BigInt(0);
      for (const acc of accounts) {
        total += BigInt(acc.lamports || 0);
      }

      return total;
    } catch (error) {
      console.warn("Failed to get compressed balance:", error);
      return BigInt(0);
    }
  }

  /**
   * Gets compressed token balances for an address
   *
   * @param owner - Owner public key
   * @param mint - Optional token mint to filter
   * @returns Array of compressed token balances
   */
  async getCompressedTokenBalances(
    owner: PublicKey,
    mint?: PublicKey
  ): Promise<CompressedTokenBalance[]> {
    try {
      const response = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getCompressedTokenAccountsByOwner",
          params: [owner.toBase58(), mint?.toBase58()],
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.warn("Light RPC error:", data.error);
        return [];
      }

      // Group by mint
      const balancesByMint = new Map<string, CompressedTokenBalance>();
      const accounts = data.result?.items || [];

      for (const acc of accounts) {
        const mintStr = acc.mint;
        if (!balancesByMint.has(mintStr)) {
          balancesByMint.set(mintStr, {
            mint: new PublicKey(mintStr),
            amount: BigInt(0),
            accounts: [],
          });
        }

        const balance = balancesByMint.get(mintStr)!;
        balance.amount += BigInt(acc.amount || 0);
        balance.accounts.push({
          hash: acc.hash,
          owner: new PublicKey(acc.owner),
          lamports: acc.lamports || 0,
          data: new Uint8Array(acc.data || []),
          tree: new PublicKey(acc.tree),
          leafIndex: acc.leafIndex,
        });
      }

      return Array.from(balancesByMint.values());
    } catch (error) {
      console.warn("Failed to get compressed token balances:", error);
      return [];
    }
  }

  /**
   * Creates a compressed SOL transfer instruction
   *
   * Note: This creates the instruction data structure.
   * Actual ZK proof generation requires Light Protocol SDK.
   *
   * @param from - Sender public key
   * @param to - Recipient public key (can be stealth address)
   * @param amount - Amount in lamports
   * @returns Transaction instruction (placeholder)
   */
  createCompressedTransferInstruction(
    from: PublicKey,
    to: PublicKey,
    amount: bigint
  ): TransactionInstruction {
    // This is a simplified placeholder.
    // Real implementation requires:
    // 1. Fetching compressed account proofs
    // 2. Generating ZK proofs via Light Protocol SDK
    // 3. Building proper instruction with proof data

    const data = Buffer.alloc(72);
    data.write("compressed_transfer", 0);
    data.writeBigUInt64LE(amount, 32);

    return new TransactionInstruction({
      keys: [
        { pubkey: from, isSigner: true, isWritable: true },
        { pubkey: to, isSigner: false, isWritable: true },
        {
          pubkey: LIGHT_PROGRAM_IDS.LIGHT_SYSTEM_PROGRAM,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId: LIGHT_PROGRAM_IDS.LIGHT_SYSTEM_PROGRAM,
      data,
    });
  }

  /**
   * Compresses SOL from regular account to compressed account
   *
   * @param owner - Owner public key
   * @param amount - Amount in lamports to compress
   * @returns Transaction (unsigned)
   */
  async createCompressSolTransaction(
    owner: PublicKey,
    amount: bigint
  ): Promise<Transaction> {
    const instruction = this.createCompressedTransferInstruction(
      owner,
      owner, // Compress to self
      amount
    );

    const transaction = new Transaction().add(instruction);
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;
    transaction.feePayer = owner;

    return transaction;
  }

  /**
   * Decompresses SOL from compressed account to regular account
   *
   * @param owner - Owner public key  
   * @param amount - Amount in lamports to decompress
   * @returns Transaction (unsigned)
   */
  async createDecompressSolTransaction(
    owner: PublicKey,
    amount: bigint
  ): Promise<Transaction> {
    // Similar to compress but in reverse
    const instruction = this.createCompressedTransferInstruction(
      owner,
      owner,
      amount
    );

    const transaction = new Transaction().add(instruction);
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;
    transaction.feePayer = owner;

    return transaction;
  }

  /**
   * Creates a stealth compressed transfer
   * Combines stealth addressing with ZK-compression
   *
   * @param from - Sender public key
   * @param stealthPubkey - Derived stealth address for recipient
   * @param amount - Amount in lamports
   * @param memo - Stealth memo containing ephemeral pubkey
   * @returns Transaction (unsigned)
   */
  async createStealthCompressedTransfer(
    from: PublicKey,
    stealthPubkey: Uint8Array,
    amount: bigint,
    memo: string
  ): Promise<Transaction> {
    const stealthAddress = new PublicKey(stealthPubkey);

    const transferIx = this.createCompressedTransferInstruction(
      from,
      stealthAddress,
      amount
    );

    // Add memo instruction for ephemeral pubkey
    const memoIx = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf-8"),
    });

    const transaction = new Transaction().add(transferIx).add(memoIx);
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;
    transaction.feePayer = from;

    return transaction;
  }
}

/**
 * Creates a Light Protocol client for ZK-compression operations
 *
 * @param rpcUrl - RPC URL with Light Protocol support
 * @returns LightClient instance
 */
export function createLightClient(rpcUrl: string): LightClient {
  return LightClient.create(rpcUrl);
}
