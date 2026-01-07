import {
  Aptos,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import type { MosaicQuoteResponse } from "./mosaic-api";

// Re-export validation functions
export {
  validateSwapAmount,
  validateTokenPair,
  type SwapValidationResult,
} from "./validation";

// Re-export mosaic API
export * from "./mosaic-api";

interface ExecuteSwapParams {
  aptos: Aptos;
  movementChainId: number;
  senderAddress: string;
  senderPubKeyWithScheme: string;
  fromToken: string;
  toToken: string;
  quote: MosaicQuoteResponse;
  signRawHash: (input: any) => Promise<{ signature: string }>;
}

/**
 * Executes a token swap transaction on the Movement Network
 * @param params - Swap parameters
 * @returns Transaction hash of the executed swap
 * @throws Error if swap fails
 */
export async function executeSwap({
  aptos,
  movementChainId,
  senderAddress,
  senderPubKeyWithScheme,
  fromToken,
  toToken,
  quote,
  signRawHash,
}: ExecuteSwapParams): Promise<string> {
  if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
    throw new Error("Invalid public key format");
  }

  const pubKeyNoScheme = senderPubKeyWithScheme.slice(2);

  // Validate quote
  if (!quote || !quote.data || !quote.data.tx) {
    throw new Error("Invalid quote. Please try again.");
  }

  const mosaicTx = quote.data.tx;

  // Build the swap transaction using Mosaic's transaction data
  const rawTxn = await aptos.transaction.build.simple({
    sender: senderAddress,
    data: {
      function: mosaicTx.function as `${string}::${string}::${string}`,
      typeArguments: mosaicTx.typeArguments,
      functionArguments: mosaicTx.functionArguments,
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
    hash: hash,
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
 * Generates a user-friendly error message for swap failures
 * @param error - The error that occurred
 * @param fromToken - The token being swapped from
 * @param toToken - The token being swapped to
 * @returns User-friendly error message
 */
export function getSwapErrorMessage(
  error: unknown,
  fromToken: string,
  toToken: string
): string {
  let errorMessage = "Swap failed. Please try again.";

  if (error instanceof Error) {
    errorMessage = error.message;

    // Check for common swap errors
    if (
      error.message.includes("quote") ||
      error.message.includes("Quote") ||
      error.message.includes("invalid quote")
    ) {
      errorMessage =
        "Failed to get swap quote. Please try again or select different tokens.";
    } else if (
      error.message.includes("insufficient") ||
      error.message.includes("balance")
    ) {
      errorMessage = "Insufficient balance for this swap.";
    } else if (
      error.message.includes("slippage") ||
      error.message.includes("Slippage")
    ) {
      errorMessage =
        "Swap failed due to price movement. Please try again with a higher slippage tolerance.";
    } else if (
      error.message.includes("timeout") ||
      error.message.includes("Timeout")
    ) {
      errorMessage =
        "Swap request timed out. Please check your connection and try again.";
    }
  }

  return errorMessage;
}
