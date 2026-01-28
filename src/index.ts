import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { ADELOS_CONFIG } from "./constants";
import { AdelosOptions, RegistryAccount, RegistryInfo } from "./types";
import { deriveRegistryPda, getDiscriminator, isValidMetaPubkey } from "./utils";
import { sha256 } from "@noble/hashes/sha256";
import { generateStealthAddress, signWithScalar } from "./crypto";
import { setDebugMode } from "./logger";

export class AdelosSDK {
  readonly connection: Connection;
  readonly programId: PublicKey;

  constructor(options: AdelosOptions = {}) {
    this.connection = new Connection(options.rpcUrl ?? ADELOS_CONFIG.RPC_URL, "confirmed");
    this.programId = ADELOS_CONFIG.PROGRAM_ID;

    // Set debug mode for logger
    if (options.debug !== undefined) {
      setDebugMode(options.debug);
    }
  }

  // --- 1. Identity & Registry ---

  async getRegistry(owner: PublicKey): Promise<RegistryInfo> {
    const [address] = deriveRegistryPda(owner, this.programId);
    const accountInfo = await this.connection.getAccountInfo(address);

    if (!accountInfo) return { address, exists: false, account: null as any };

    const data = accountInfo.data.slice(8);
    return {
      address,
      exists: true,
      account: {
        owner: new PublicKey(data.slice(0, 32)),
        metaPubkey: new Uint8Array(data.slice(32, 64)),
        bump: data[64],
      }
    };
  }

  /** Menghasilkan metaSk tanpa simpan di LocalStorage (Deterministic) */
  async unlockPrivacy(signMessage: (msg: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
    const message = new TextEncoder().encode(ADELOS_CONFIG.UNLOCK_MESSAGE);
    const signature = await signMessage(message);
    return sha256(signature);
  }

  // --- 2. High-Level Transaction Builders ---

  /** API Satu Pintu untuk kirim SOL secara privat */
  async createStealthTransfer(
    sender: PublicKey,
    receiver: PublicKey,
    amountSOL: number,
    version: "legacy" | "v0" = "v0"
  ) {
    const registry = await this.getRegistry(receiver);
    if (!registry.exists) throw new Error("Penerima belum terdaftar.");

    const { stealthPubkey, memo } = await generateStealthAddress(registry.account.metaPubkey);

    const instructions = [
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: new PublicKey(stealthPubkey),
        lamports: BigInt(Math.round(amountSOL * 1e9)),
      }),
      new TransactionInstruction({
        keys: [{ pubkey: sender, isSigner: true, isWritable: false }],
        programId: ADELOS_CONFIG.MEMO_PROGRAM_ID,
        data: Buffer.from(memo, "utf-8"),
      }),
    ];

    const transaction = await this.buildTransaction(sender, instructions, version);

    // Return transaction along with stealth details for display
    return {
      transaction,
      stealthAddress: new PublicKey(stealthPubkey).toBase58(),
      memo
    };
  }

  /** Membuat transaksi pendaftaran identitas */
  async createRegisterTransaction(owner: PublicKey, metaPubkey: Uint8Array, version: "legacy" | "v0" = "v0") {
    const [registryPda] = deriveRegistryPda(owner, this.programId);
    const data = Buffer.concat([Buffer.from(getDiscriminator("register_identity")), Buffer.from(metaPubkey)]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: registryPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    return this.buildTransaction(owner, [ix], version);
  }

  /** Membuat transaksi pembaruan identitas (jika sudah terdaftar) */
  async createUpdateTransaction(owner: PublicKey, metaPubkey: Uint8Array, version: "legacy" | "v0" = "v0") {
    const [registryPda] = deriveRegistryPda(owner, this.programId);
    const data = Buffer.concat([Buffer.from(getDiscriminator("update_identity")), Buffer.from(metaPubkey)]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: registryPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    return this.buildTransaction(owner, [ix], version);
  }

  /**
   * Create a withdraw transaction from stealth address to any destination.
   * This enables both:
   * - Withdraw to self (destination = user's main wallet)
   * - Withdraw to any address (for enhanced privacy - no link to main wallet!)
   * 
   * @param stealthSecretKey - The recovered stealth private key (from prepareWithdraw)
   * @param stealthAddress - The stealth address holding the funds
   * @param destination - Where to send the funds (can be ANY address)
   * @param amountLamports - Amount to withdraw in lamports (use BigInt)
   */
  async createWithdrawTransaction(
    stealthSecretKey: Uint8Array,
    stealthAddress: PublicKey,
    destination: PublicKey,
    amountLamports?: bigint
  ): Promise<{ transaction: VersionedTransaction; signature: string }> {
    let finalAmount = amountLamports;

    // If amount is not specified, withdraw FULL balance (minus fee) to close account
    if (finalAmount === undefined) {
      const balance = await this.connection.getBalance(stealthAddress);

      // Standard fee for a simple transfer is 5000 lamports
      const FEE_BUFFER = 5000;

      if (balance <= FEE_BUFFER) {
        throw new Error(`Insufficient funds (Balance: ${balance}, Fee: ${FEE_BUFFER})`);
      }

      finalAmount = BigInt(balance - FEE_BUFFER);
    }

    // 1. Create transfer instruction
    const ix = SystemProgram.transfer({
      fromPubkey: stealthAddress,
      toPubkey: destination,
      lamports: finalAmount!,
    });

    // 2. Build transaction message
    const { blockhash } = await this.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: stealthAddress, // Stealth pays the fee
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);

    // 3. Manually sign with the scalar (because Keypair.fromSeed hashes it!)
    const serializedMessage = message.serialize();
    const signature = await signWithScalar(serializedMessage, stealthSecretKey);

    // 4. Attach signature to transaction
    tx.addSignature(stealthAddress, Buffer.from(signature));

    // 5. Send and confirm
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");

    return { transaction: tx, signature: sig };
  }

  // --- 3. Core Engine (Internal Helpers) ---

  async buildTransaction(payer: PublicKey, instructions: TransactionInstruction[], version: "legacy" | "v0" = "v0") {
    const { blockhash } = await this.connection.getLatestBlockhash();

    if (version === "legacy") {
      const tx = new Transaction().add(...instructions);
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer;
      return tx;
    }

    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    return new VersionedTransaction(message);
  }

  /** Satu fungsi kirim untuk semua jenis transaksi (Legacy/V0) */
  async sendAndConfirm(signedTx: Transaction | VersionedTransaction): Promise<string> {
    const rawTx = signedTx instanceof Transaction ? signedTx.serialize() : signedTx.serialize();
    const sig = await this.connection.sendRawTransaction(rawTx);
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}

export * from "./types";
export * from "./constants";
export * from "./utils";
export * from "./crypto";
export * from "./indexer";
