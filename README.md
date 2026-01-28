# @adelos/sdk

TypeScript SDK for Adelos Protocol - Privacy Stealth Transfers on Solana.

[![npm version](https://img.shields.io/npm/v/@adelos/sdk.svg)](https://www.npmjs.com/package/@adelos/sdk)

## 📦 Installation

```bash
npm install @adelos/sdk
```

## 🚀 Quick Start

```typescript
import { AdelosSDK, AdelosIndexer, derivePublicKey, bytesToHex } from "@adelos/sdk";

// Initialize with RPC URL
const sdk = new AdelosSDK({ 
  rpcUrl: "https://api.devnet.solana.com",
  debug: true // Enable debug logging
});
```

## 📖 API Reference

### AdelosSDK

Main SDK class for interacting with the Adelos Protocol.

#### Constructor Options

```typescript
interface AdelosOptions {
  rpcUrl?: string;   // RPC URL (default: devnet)
  debug?: boolean;   // Enable debug logging
}
```

#### Identity Methods

| Method | Description |
|--------|-------------|
| `unlockPrivacy(signMessage)` | Derive meta secret key from wallet signature |
| `getRegistry(owner)` | Fetch registry account for a wallet |
| `isRegistered(owner)` | Check if wallet has registered identity |

#### Transaction Builders

| Method | Description |
|--------|-------------|
| `createRegisterTransaction(owner, metaPk)` | Create register transaction |
| `createUpdateTransaction(owner, newMetaPk)` | Create update transaction |
| `createStealthTransfer(sender, receiver, amount, txVersion)` | Create stealth transfer |
| `createWithdrawTransaction(stealthSk, stealthAddr, dest, amount?)` | Create withdraw transaction |
| `sendAndConfirm(signedTx)` | Send and confirm transaction |

### Stealth Transfer Flow

```typescript
// 1. Sender creates stealth transfer
const { transaction, stealthAddress, memo } = await sdk.createStealthTransfer(
  senderPubkey,
  receiverPubkey,
  0.1, // SOL
  "v0"
);

// 2. Sign and send
const signedTx = await signTransaction(transaction);
const signature = await sdk.sendAndConfirm(signedTx);
```

### Withdraw Flow

```typescript
// Withdraw full balance (auto-calculates fee)
const { signature } = await sdk.createWithdrawTransaction(
  stealthSecretKey,
  stealthAddress,
  destinationPubkey
  // amount is optional - if omitted, withdraws full balance
);

// Or specify exact amount
const { signature } = await sdk.createWithdrawTransaction(
  stealthSecretKey,
  stealthAddress,
  destinationPubkey,
  BigInt(50000000) // 0.05 SOL in lamports
);
```

### AdelosIndexer

Scan the blockchain for incoming stealth transfers.

```typescript
import { AdelosIndexer } from "@adelos/sdk";

const indexer = new AdelosIndexer(connection);

// Scan for stealth transfers
const transfers = await indexer.scanForStealthTransfers(
  metaSecretKey,
  metaPublicKey,
  50 // limit
);

// Prepare withdrawal
const withdrawable = indexer.prepareWithdraw(transfer, metaSk, metaPk);
// Returns: { stealthSecretKey, stealthPublicKey }
```

### Crypto Functions

```typescript
import { 
  derivePublicKey,
  generateStealthAddress,
  recoverStealthSecretKey,
  computeSharedSecret,
  bytesToHex,
  hexToBytes
} from "@adelos/sdk";

// Derive public key from secret key
const metaPk = derivePublicKey(metaSk);

// Generate stealth address for recipient
const { stealthPubkey, ephemeralPubkey, memo } = generateStealthAddress(
  recipientMetaPubkey
);

// Recover stealth secret key (for withdrawal)
const stealthSk = recoverStealthSecretKey(metaSk, sharedSecret);
```

### Utility Functions

```typescript
import { bytesToHex, hexToBytes, validatePublicKey } from "@adelos/sdk";

// Convert bytes to hex string
const hex = bytesToHex(bytes); // "a1b2c3..."

// Convert hex string to bytes
const bytes = hexToBytes(hex); // Uint8Array

// Validate public key bytes
const isValid = validatePublicKey(pubkeyBytes);
```

## 🔗 Constants

```typescript
import { 
  PROGRAM_ID,       // Adelos Registry Program ID
  MEMO_PROGRAM_ID,  // Solana Memo Program
  MEMO_PREFIX       // "ADLSv1:" - Protocol prefix
} from "@adelos/sdk";
```

## 🔒 Security Notes

- Meta secret keys are derived deterministically from wallet signatures
- Stealth secret keys are computed using Ed25519 scalar addition
- All cryptographic operations use `@noble/ed25519` and `@noble/hashes`

## 📄 License

MIT
