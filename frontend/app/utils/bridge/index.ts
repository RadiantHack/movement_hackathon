/**
 * Bridge Transaction Utilities
 * Handles bridging tokens from Movement Network to other chains (e.g., Ethereum)
 */

import {
  Aptos,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";

interface ExecuteBridgeParams {
  aptos: Aptos;
  movementChainId: number;
  senderAddress: string;
  senderPubKeyWithScheme: string;
  recipientAddress: string;
  amount: string;
  tokenDecimals: number;
  signRawHash: (input: any) => Promise<{ signature: string }>;
}

/**
 * Converts Ethereum address to bytes32 format (32 bytes, right-padded)
 */
function addressToBytes32(address: string): Uint8Array {
  // Remove 0x prefix
  const addr = address.startsWith("0x") ? address.slice(2) : address;
  // Convert to bytes (Ethereum address is 20 bytes)
  const addressBytes = new Uint8Array(20);
  for (let i = 0; i < addr.length; i += 2) {
    addressBytes[i / 2] = parseInt(addr.substr(i, 2), 16);
  }
  // Create 32-byte array and right-pad with zeros
  const bytes32 = new Uint8Array(32);
  bytes32.set(addressBytes, 12); // Right-align: start at position 12 (32 - 20 = 12)
  return bytes32;
}

/**
 * Executes a bridge transaction on the Movement Network
 * @param params - Bridge parameters
 * @returns Transaction hash of the executed bridge
 * @throws Error if bridge fails
 */
export async function executeBridge({
  aptos,
  movementChainId,
  senderAddress,
  senderPubKeyWithScheme,
  recipientAddress,
  amount,
  tokenDecimals,
  signRawHash,
}: ExecuteBridgeParams): Promise<string> {
  if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
    throw new Error("Invalid public key format");
  }

  const pubKeyNoScheme = senderPubKeyWithScheme.slice(2);

  // Validate recipient address (Ethereum format)
  if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
    throw new Error(
      "Invalid recipient address. Must be a valid Ethereum address (0x followed by 40 hex characters)"
    );
  }

  // Convert amount to smallest unit
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Invalid amount");
  }

  const amountLd = BigInt(
    Math.floor(parsedAmount * Math.pow(10, tokenDecimals))
  );
  const minAmountLd = amountLd; // Use same amount as minimum

  // Ethereum endpoint ID
  const dstEid = 30101;

  // Convert recipient address to bytes32 (vector<u8> format)
  const toBytes32 = addressToBytes32(recipientAddress);
  const toVector = Array.from(toBytes32).map((b) => b.toString());

  // Default options (from example) - convert hex strings to vector<u8>
  const extraOptionsHex = "0x00030100110100000000000000000000000000061a80";
  const extraOptionsBytes = Buffer.from(extraOptionsHex.slice(2), "hex");
  const extraOptionsVector = Array.from(extraOptionsBytes).map((b) =>
    b.toString()
  );

  const composeMessageHex = "0x00";
  const composeMessageBytes = Buffer.from(composeMessageHex.slice(2), "hex");
  const composeMessageVector = Array.from(composeMessageBytes).map((b) =>
    b.toString()
  );

  const oftCmdHex = "0x00";
  const oftCmdBytes = Buffer.from(oftCmdHex.slice(2), "hex");
  const oftCmdVector = Array.from(oftCmdBytes).map((b) => b.toString());

  // Use default fees (can be improved with quote_send later)
  // Default fee from example: 481762913
  const nativeFee = BigInt(481762913);
  const zroFee = BigInt(0);

  // Build transaction
  const rawTxn = await aptos.transaction.build.simple({
    sender: senderAddress,
    data: {
      function:
        "0x4d2969d384e440db9f1a51391cfc261d1ec08ee1bdf7b9711a6c05d485a4110a::oft::send_withdraw_coin",
      typeArguments: [],
      functionArguments: [
        dstEid.toString(),
        toVector,
        amountLd.toString(),
        minAmountLd.toString(),
        extraOptionsVector,
        composeMessageVector,
        oftCmdVector,
        nativeFee.toString(),
        zroFee.toString(),
      ],
    },
  });

  // Override chain ID to match Movement Network
  const txnObj = rawTxn as unknown as Record<string, Record<string, unknown>>;
  if (txnObj.rawTransaction) {
    const chainIdObj = new ChainId(movementChainId);
    (txnObj.rawTransaction as Record<string, unknown>).chain_id = chainIdObj;
  }

  // Generate signing message and hash
  const message = generateSigningMessageForTransaction(rawTxn);
  const hash = toHex(message);

  // Sign the hash using Privy's signRawHash
  const signatureResponse = await signRawHash({
    address: senderAddress,
    chainType: "aptos",
    hash: hash as `0x${string}`,
  });

  // Create authenticator from signature
  const publicKey = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(publicKey, sig);

  // Submit transaction
  const pending = await aptos.transaction.submit.simple({
    transaction: rawTxn,
    senderAuthenticator,
  });

  // Wait for transaction to be executed
  const executed = await aptos.waitForTransaction({
    transactionHash: pending.hash,
  });

  return executed.hash;
}

/**
 * Validates if an address is a valid Ethereum address
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
