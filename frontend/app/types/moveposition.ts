/**
 * Type definitions for MovePosition functionality
 */

import { WalletWithMetadata } from "@privy-io/react-auth";

/**
 * Extended Movement wallet type that includes publicKey
 * Privy's WalletWithMetadata may not include publicKey in its type definition,
 * but it's available at runtime for Aptos wallets
 */
export interface MovementWallet extends WalletWithMetadata {
  /**
   * Public key for the wallet (available for Aptos/Movement wallets)
   * Format: hex string with or without 0x prefix
   */
  publicKey?: string;
}

/**
 * Transaction instruction data structure
 * Matches the structure returned by SDK methods (superLendV2Ix, etc.)
 */
export interface TransactionInstructionData {
  /**
   * Transaction sender address
   */
  sender?: string;
  /**
   * Transaction data payload
   */
  data: {
    /**
     * Function identifier in format: address::module::function
     */
    function: `${string}::${string}::${string}`;
    /**
     * Type arguments for the function
     */
    typeArguments: string[];
    /**
     * Function arguments
     */
    functionArguments: unknown[];
  };
}

/**
 * Type guard to check if wallet has publicKey
 */
export function hasPublicKey(
  wallet: WalletWithMetadata | null
): wallet is MovementWallet {
  return (
    wallet !== null &&
    "publicKey" in wallet &&
    typeof (wallet as MovementWallet).publicKey === "string"
  );
}

/**
 * Type guard to check if value is a transaction instruction
 */
export function isTransactionInstruction(
  value: unknown
): value is TransactionInstructionData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tx = value as Record<string, unknown>;

  // Check if it has the expected structure
  if (!tx.data || typeof tx.data !== "object") {
    return false;
  }

  const data = tx.data as Record<string, unknown>;

  return (
    typeof data.function === "string" &&
    Array.isArray(data.typeArguments) &&
    Array.isArray(data.functionArguments)
  );
}
