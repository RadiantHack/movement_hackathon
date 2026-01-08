/**
 * Type definitions for Echelon transaction utilities
 * Replaces all `any` types with proper TypeScript types
 */

import type { RawTransaction } from "@aptos-labs/ts-sdk";
import type { MovementWallet } from "./moveposition";

/**
 * Redux store state structure
 */
export interface ConfigState {
  config?: {
    loaded?: boolean;
    movementRpc?: string;
  };
}

/**
 * Sign raw hash function parameters
 */
export interface SignRawHashParams {
  address: string;
  chainType: "aptos";
  hash: `0x${string}`;
}

/**
 * Sign raw hash function return type
 */
export interface SignRawHashResponse {
  signature: string;
}

/**
 * Sign raw hash function type
 */
export type SignRawHashFunction = (
  params: SignRawHashParams
) => Promise<SignRawHashResponse>;

// MovementWallet is imported from ./moveposition.ts

/**
 * Transaction function arguments
 * Can be string or number, depending on the transaction type
 */
export type TransactionFunctionArgument = string | number;

/**
 * Transaction data structure for Aptos SDK
 */
export interface TransactionData {
  function: `${string}::${string}::${string}`;
  functionArguments: TransactionFunctionArgument[];
  typeArguments?: string[];
}

/**
 * Raw transaction object with chain ID override
 */
export interface RawTransactionWithChainId {
  rawTransaction?: {
    chain_id?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Balance metadata from API
 */
export interface BalanceMetadata {
  name?: string;
  symbol?: string;
  decimals?: number | string;
}

/**
 * Token balance from balance API
 */
export interface TokenBalance {
  assetType?: string;
  amount: string;
  metadata?: BalanceMetadata;
}

/**
 * Balance API response
 */
export interface BalanceApiResponse {
  success: boolean;
  balances: TokenBalance[];
  address?: string;
  total?: number;
  error?: string;
}

/**
 * Coin store data structure
 */
export interface CoinStoreData {
  coin?: {
    value?: string | number;
  };
  [key: string]: unknown;
}

/**
 * Account resource with coin store data
 */
export interface AccountResource {
  type: string;
  data: CoinStoreData;
}

/**
 * Fungible asset resource data
 */
export interface FungibleAssetResourceData {
  balance?: string | number;
  value?: string | number;
  [key: string]: unknown;
}

/**
 * Fungible asset resource response
 */
export interface FungibleAssetResource {
  data?: FungibleAssetResourceData;
  [key: string]: unknown;
}

/**
 * Error with message property
 */
export interface ErrorWithMessage {
  message?: string;
  stack?: string;
  name?: string;
  cause?: {
    code?: string;
  };
}

/**
 * Type guard to check if error has message
 */
export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === "object" &&
    error !== null &&
    ("message" in error || "stack" in error || "name" in error)
  );
}

/**
 * Type guard to check if error is Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message || "Transaction failed";
  }
  if (isErrorWithMessage(error)) {
    return error.message || "Transaction failed";
  }
  if (typeof error === "string") {
    return error;
  }
  return "Transaction failed";
}
