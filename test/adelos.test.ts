import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { AdelosSDK } from "../src/index";
import { AdelosIndexer } from "../src/indexer";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex } from "../src/utils";

// Polyfill sha512 for noble
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

describe("AdelosSDK", () => {
    let sdk: AdelosSDK;

    beforeEach(() => {
        sdk = new AdelosSDK({ debug: false });
    });

    it("should initialize with default RPC", () => {
        expect(sdk).toBeDefined();
        expect(sdk.connection).toBeDefined();
    });

    it("should unlock privacy and generate meta keypair", async () => {
        const mockWallet = Keypair.generate();

        // Mock signMessage function
        const mockSignMessage = async (message: Uint8Array): Promise<Uint8Array> => {
            return ed.sign(message, mockWallet.secretKey.slice(0, 32));
        };

        const metaSk = await sdk.unlockPrivacy(mockSignMessage);

        expect(metaSk).toBeInstanceOf(Uint8Array);
        expect(metaSk.length).toBe(32);
    });

    it("should derive public key from secret key", async () => {
        const mockWallet = Keypair.generate();

        const mockSignMessage = async (message: Uint8Array): Promise<Uint8Array> => {
            return ed.sign(message, mockWallet.secretKey.slice(0, 32));
        };

        const metaSk = await sdk.unlockPrivacy(mockSignMessage);

        // Derive public key
        const scalar = ed.etc.mod(
            BigInt("0x" + bytesToHex(Uint8Array.from(metaSk).reverse())),
            ed.CURVE.n
        );
        const metaPk = ed.ExtendedPoint.BASE.multiply(scalar).toRawBytes();

        expect(metaPk).toBeInstanceOf(Uint8Array);
        expect(metaPk.length).toBe(32);
    });
});

describe("AdelosIndexer", () => {
    it("should initialize with connection", () => {
        const sdk = new AdelosSDK({ debug: false });
        const indexer = new AdelosIndexer(sdk.connection);

        expect(indexer).toBeDefined();
    });

    it("should prepare withdraw data correctly", async () => {
        const sdk = new AdelosSDK({ debug: false });
        const indexer = new AdelosIndexer(sdk.connection);
        const mockWallet = Keypair.generate();

        // Mock signMessage
        const mockSignMessage = async (message: Uint8Array): Promise<Uint8Array> => {
            return ed.sign(message, mockWallet.secretKey.slice(0, 32));
        };

        const metaSk = await sdk.unlockPrivacy(mockSignMessage);
        const scalar = ed.etc.mod(
            BigInt("0x" + bytesToHex(Uint8Array.from(metaSk).reverse())),
            ed.CURVE.n
        );
        const metaPk = ed.ExtendedPoint.BASE.multiply(scalar).toRawBytes();

        // Generate proper ephemeral keypair (private -> public)
        const ephemeralSk = ed.utils.randomPrivateKey();
        const ephemeralScalar = ed.etc.mod(
            BigInt("0x" + bytesToHex(Uint8Array.from(ephemeralSk).reverse())),
            ed.CURVE.n
        );
        const ephemeralPk = ed.ExtendedPoint.BASE.multiply(ephemeralScalar).toRawBytes();

        // Create a mock stealth transaction with proper ephemeral pubkey
        const mockStealthTx = {
            signature: "mock_signature",
            stealthAddress: Keypair.generate().publicKey,
            ephemeralPk: ephemeralPk,
            amount: BigInt(100000000),
            blockTime: Math.floor(Date.now() / 1000),
        };

        // prepareWithdraw should return stealth secret key
        const result = indexer.prepareWithdraw(mockStealthTx as any, metaSk, metaPk);

        expect(result).toHaveProperty("stealthSecretKey");
        expect(result.stealthSecretKey).toBeInstanceOf(Uint8Array);
        expect(result.stealthSecretKey.length).toBe(32);
    });
});

describe("Stealth Address Generation", () => {
    it("should generate unique stealth addresses for same recipient", async () => {
        const sdk = new AdelosSDK({ debug: false });
        const mockWallet = Keypair.generate();
        const recipientWallet = Keypair.generate();

        // Mock signMessage for recipient
        const mockSignMessage = async (message: Uint8Array): Promise<Uint8Array> => {
            return ed.sign(message, mockWallet.secretKey.slice(0, 32));
        };

        const metaSk = await sdk.unlockPrivacy(mockSignMessage);
        const scalar = ed.etc.mod(
            BigInt("0x" + bytesToHex(Uint8Array.from(metaSk).reverse())),
            ed.CURVE.n
        );
        const metaPk = ed.ExtendedPoint.BASE.multiply(scalar).toRawBytes();

        // Mock registry
        sdk.getRegistry = async () => ({
            address: PublicKey.default,
            exists: true,
            account: {
                owner: recipientWallet.publicKey,
                metaPubkey: metaPk,
                bump: 255,
            },
        });

        // Generate two stealth transfers
        const result1 = await sdk.createStealthTransfer(
            Keypair.generate().publicKey,
            recipientWallet.publicKey,
            0.1,
            "v0"
        );

        const result2 = await sdk.createStealthTransfer(
            Keypair.generate().publicKey,
            recipientWallet.publicKey,
            0.1,
            "v0"
        );

        // Stealth addresses should be different (unique per transfer)
        expect(result1.stealthAddress).not.toBe(result2.stealthAddress);
        expect(result1.memo).not.toBe(result2.memo);
    });
});