/**
 * Custom hook for handling Echelon repay transactions
 * Consolidates repay logic used across multiple components
 */

import { useCallback } from "react";
import { AssetInfo, executeRepayTransaction } from "./useEchelonTransactions";
import {
  useEchelonTransaction,
  type UseEchelonTransactionOptions,
} from "./useEchelonTransaction";

interface UseEchelonRepayOptions extends UseEchelonTransactionOptions {}

interface EchelonRepayState {
  repaying: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling Echelon repay transactions
 * @param options - Repay configuration options
 * @returns Repay state and handler function
 */
export function useEchelonRepay({
  onSuccess,
  onError,
}: UseEchelonRepayOptions = {}) {
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

  const handleRepay = useCallback(
    async (
      asset: AssetInfo,
      amount: number,
      maxRepayable: number
    ): Promise<boolean> => {
      // Validate transaction prerequisites
      const validation = validateTransaction(
        asset,
        amount,
        maxRepayable,
        "repay"
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

      // Execute repay
      setLoading(true, "Initializing...");

      try {
        const result = await executeRepayTransaction({
          asset,
          amount: validation.parsedAmount,
          maxRepayable,
          movementWallet,
          publicKey: validation.publicKey,
          signRawHash,
          onStepChange: updateStep,
        });

        if (result.success && result.txHash) {
          await handleSuccess(result.txHash);
          return true;
        } else {
          handleError(result.error || "Repay transaction failed");
          return false;
        }
      } catch (err: unknown) {
        console.error("Repay error:", err);
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
    repaying: state.loading,
    error: state.error,
    txHash: state.txHash,
    step: state.step,
    handleRepay,
    resetState,
  };
}
