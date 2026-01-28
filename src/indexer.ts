/**
 * Adelos Indexer - Privacy-Preserving Transaction Scanner
 */

import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";
import { computeSharedSecretAsRecipient, deriveStealthPubkey, parseStealthMemo, recoverStealthSecretKey } from "./crypto";
import { ADELOS_CONFIG } from "./constants";
import { bytesToHex } from "./utils";
import * as logger from "./logger";
import { StealthTransaction, WithdrawableTransaction } from "./types";

// Re-export types for external use
export { StealthTransaction, WithdrawableTransaction } from "./types";

export class AdelosIndexer {
  // Directly accepts Connection object
  constructor(private connection: Connection) { }

  /** Scan for stealth transfers to this recipient */
  async scanForStealthTransfers(
    metaSk: Uint8Array,
    metaPk: Uint8Array,
    limit = 100
  ): Promise<StealthTransaction[]> {
    logger.log(`[Indexer] Starting scan for stealth transfers (limit: ${limit})`);
    const startTime = Date.now();

    const sigs = await this.connection.getSignaturesForAddress(
      ADELOS_CONFIG.MEMO_PROGRAM_ID,
      { limit }
    );
    logger.log(`[Indexer] Found ${sigs.length} memo program transactions to check`);

    const results: StealthTransaction[] = [];
    let processed = 0;
    let adelosMemos = 0;

    for (const s of sigs) {
      processed++;
      logger.log(`[Indexer] Processing tx ${processed}/${sigs.length}: ${s.signature.substring(0, 10)}...`);

      const tx = await this.connection.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) {
        logger.log(`  ↳ Skipped (tx not found)`);
        continue;
      }

      // Filter memos with our protocol prefix
      const memo = this.extractMemo(tx);
      if (!memo?.startsWith(ADELOS_CONFIG.MEMO_PREFIX)) {
        logger.log(`  ↳ Skipped (not Adelos memo)`);
        continue;
      }

      adelosMemos++;
      logger.log(`  ↳ Found Adelos memo! Attempting trial decryption...`);

      // Perform Trial Decryption
      const detected = this.attemptDecryption(tx, metaSk, metaPk);
      if (detected) {
        logger.log(`  ↳ ✅ MATCH! Stealth transfer detected: ${Number(detected.amount) / 1e9} SOL`);
        results.push({
          signature: s.signature,
          blockTime: tx.blockTime ?? null,
          stealthAddress: detected.stealthAddress,
          amount: detected.amount,
          ephemeralPk: detected.ephemeralPk,
        });
      } else {
        logger.log(`  ↳ Not for this recipient`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.log(`[Indexer] Scan complete in ${elapsed}s`);
    logger.log(`[Indexer] Summary: ${processed} total, ${adelosMemos} Adelos memos, ${results.length} matches`);

    return results;
  }

  /**
   * Trial Decryption: Check if this transaction belongs to the user.
   * Made 'public' for testing purposes.
   */
  public attemptDecryption(
    tx: ParsedTransactionWithMeta,
    metaSk: Uint8Array,
    metaPk: Uint8Array
  ): { stealthAddress: PublicKey; amount: bigint; ephemeralPk: Uint8Array } | null {
    const memo = this.extractMemo(tx);
    const ephemeralPk = parseStealthMemo(memo || "");
    if (!ephemeralPk) return null;

    // 1. Calculate shared secret & expected stealth address
    const secret = computeSharedSecretAsRecipient(metaSk, ephemeralPk);
    const expectedStealthHex = bytesToHex(deriveStealthPubkey(metaPk, secret));

    // 2. Check if this address exists in transaction accounts
    const accounts = tx.transaction.message.accountKeys;
    const idx = accounts.findIndex(
      (a) => bytesToHex(a.pubkey.toBytes()) === expectedStealthHex
    );

    if (idx === -1) return null;

    // 3. Calculate balance difference (received SOL)
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];

    const change = BigInt(postBalances[idx] || 0) - BigInt(preBalances[idx] || 0);

    return {
      stealthAddress: accounts[idx].pubkey,
      amount: change > 0n ? change : 0n,
      ephemeralPk,
    };
  }

  /**
   * Prepare a stealth transaction for withdrawal by recovering the secret key.
   */
  public prepareWithdraw(
    stealthTx: StealthTransaction,
    metaSk: Uint8Array,
    metaPk: Uint8Array
  ): WithdrawableTransaction {
    // Recompute shared secret from ephemeralPk
    const sharedSecret = computeSharedSecretAsRecipient(metaSk, stealthTx.ephemeralPk);

    // Recover the stealth secret key
    const stealthSecretKey = recoverStealthSecretKey(metaSk, sharedSecret);

    return {
      ...stealthTx,
      stealthSecretKey,
    };
  }

  private extractMemo(tx: ParsedTransactionWithMeta): string | null {
    const ix = tx.transaction.message.instructions.find((i) =>
      i.programId.equals(ADELOS_CONFIG.MEMO_PROGRAM_ID)
    );
    return (ix as any)?.parsed || null;
  }
}

/** Helper for quick initialization */
export function createIndexer(connection: Connection) {
  return new AdelosIndexer(connection);
}