/**
 * Custom hook for handling Echelon withdraw transactions
 * Consolidates withdraw logic used across multiple components
 */

import { useCallback } from "react";
import {
  AssetInfo,
  executeWithdrawTransaction,
} from "./useEchelonTransactions";
import {
  useEchelonTransaction,
  type UseEchelonTransactionOptions,
} from "./useEchelonTransaction";

interface UseEchelonWithdrawOptions extends UseEchelonTransactionOptions {}

interface EchelonWithdrawState {
  withdrawing: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling Echelon withdraw transactions
 * @param options - Withdraw configuration options
 * @returns Withdraw state and handler function
 */
export function useEchelonWithdraw({
  onSuccess,
  onError,
}: UseEchelonWithdrawOptions = {}) {
  const {
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
  } = useEchelonTransaction({ onSuccess, onError });

  const handleWithdraw = useCallback(
    async (
      asset: AssetInfo,
      amount: number,
      percentage: number,
      availableBalance?: number
    ): Promise<boolean> => {
      // Validate transaction prerequisites
      const validation = validateTransaction(
        asset,
        amount,
        availableBalance,
        "withdraw"
      );

      if (
        !validation.isValid ||
        !validation.publicKey ||
        !validation.parsedAmount
      ) {
        setError(validation.error || "Validation failed");
        return false;
      }

      if (!movementWallet) {
        setError("Movement wallet not found");
        return false;
      }

      // Execute withdraw
      setLoading(true, "Initializing...");

      try {
        const result = await executeWithdrawTransaction({
          asset,
          amount: validation.parsedAmount,
          percentage,
          movementWallet,
          publicKey: validation.publicKey,
          signRawHash,
          onStepChange: updateStep,
        });

        if (result.success && result.txHash) {
          await handleSuccess(result.txHash);
          return true;
        } else {
          handleError(result.error || "Withdraw transaction failed");
          return false;
        }
      } catch (err: unknown) {
        console.error("Withdraw error:", err);
        handleError(err);
        return false;
      }
    },
    [
      validateTransaction,
      movementWallet,
      signRawHash,
      setLoading,
      setError,
      handleSuccess,
      handleError,
      updateStep,
    ]
  );

  return {
    withdrawing: state.loading,
    error: state.error,
    txHash: state.txHash,
    step: state.step,
    handleWithdraw,
    resetState,
  };
}
