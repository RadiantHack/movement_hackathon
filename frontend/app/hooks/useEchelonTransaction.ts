/**
 * Base hook for Echelon transactions
 * Extracts common logic shared across supply, borrow, repay, and withdraw hooks
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";
import {
  validateEchelonWallet,
  validateEchelonAsset,
  validateEchelonAmount,
} from "../utils/echelon/validation";
import type { AssetInfo } from "./useEchelonTransactions";
import type { MovementWallet } from "../types/moveposition";

export interface EchelonTransactionState {
  loading: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

export interface UseEchelonTransactionOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export interface TransactionValidationResult {
  isValid: boolean;
  error?: string;
  publicKey?: string;
  parsedAmount?: number;
}

/**
 * Base hook for Echelon transactions
 * Provides common validation, state management, and wallet handling
 */
export function useEchelonTransaction(
  options: UseEchelonTransactionOptions = {}
) {
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<EchelonTransactionState>({
    loading: false,
    error: null,
    txHash: null,
    step: null,
  });

  /**
   * Validate common transaction prerequisites
   */
  const validateTransaction = useCallback(
    (
      asset: AssetInfo,
      amount: number,
      maxAmount?: number,
      transactionType: "supply" | "borrow" | "repay" | "withdraw" = "supply"
    ): TransactionValidationResult => {
      // Validate wallet
      const walletValidation = validateEchelonWallet(movementWallet);
      if (!walletValidation.isValid) {
        return {
          isValid: false,
          error: walletValidation.error || "Wallet validation failed",
        };
      }

      if (!ready || !authenticated) {
        return {
          isValid: false,
          error: "Please authenticate first",
        };
      }

      // Validate asset
      const assetValidation = validateEchelonAsset(asset);
      if (!assetValidation.isValid) {
        return {
          isValid: false,
          error: assetValidation.error || "Invalid asset",
        };
      }

      // Validate amount
      const amountValidation = validateEchelonAmount(
        amount,
        maxAmount,
        transactionType
      );
      if (!amountValidation.isValid) {
        return {
          isValid: false,
          error: amountValidation.error || "Invalid amount",
        };
      }

      // Validate wallet exists
      if (!movementWallet) {
        return {
          isValid: false,
          error: "Movement wallet not found",
        };
      }

      // Extract public key
      const publicKey = (movementWallet as unknown as MovementWallet).publicKey;
      if (!publicKey) {
        return {
          isValid: false,
          error: "Wallet public key not found",
        };
      }

      return {
        isValid: true,
        publicKey,
        parsedAmount: amountValidation.parsedAmount,
      };
    },
    [movementWallet, ready, authenticated]
  );

  /**
   * Set transaction loading state
   */
  const setLoading = useCallback(
    (loading: boolean, step: string | null = null) => {
      setState((prev) => ({
        ...prev,
        loading,
        error: loading ? null : prev.error,
        step,
      }));
    },
    []
  );

  /**
   * Set transaction error
   */
  const setError = useCallback(
    (error: string | null) => {
      setState((prev) => ({
        ...prev,
        error,
        loading: false,
        step: null,
      }));
      if (error) {
        options.onError?.(error);
      }
    },
    [options]
  );

  /**
   * Handle successful transaction
   */
  const handleSuccess = useCallback(
    async (txHash: string | null) => {
      setState((prev) => ({
        ...prev,
        loading: false,
        txHash,
        error: null,
        step: null,
      }));

      await refreshBalances();
      options.onSuccess?.();
    },
    [refreshBalances, options]
  );

  /**
   * Handle transaction error
   */
  const handleError = useCallback(
    (error: string | Error | unknown) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Transaction failed. Please try again.";

      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMessage,
        step: null,
      }));

      options.onError?.(errorMessage);
    },
    [options]
  );

  /**
   * Reset transaction state
   */
  const resetState = useCallback(() => {
    setState({
      loading: false,
      error: null,
      txHash: null,
      step: null,
    });
  }, []);

  /**
   * Update step during transaction
   */
  const updateStep = useCallback((step: string) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  return {
    state,
    signRawHash,
    movementWallet,
    validateTransaction,
    setLoading,
    setError,
    handleSuccess,
    handleError,
    resetState,
    updateStep,
  };
}
