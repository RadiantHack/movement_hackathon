/**
 * Custom hook for handling Echelon supply (lend) transactions
 * Consolidates supply logic used across multiple components
 */

import { useCallback } from "react";
import { AssetInfo, executeSupplyTransaction } from "./useEchelonTransactions";
import {
  useEchelonTransaction,
  type UseEchelonTransactionOptions,
} from "./useEchelonTransaction";

interface UseEchelonSupplyOptions extends UseEchelonTransactionOptions {}

interface EchelonSupplyState {
  supplying: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling Echelon supply transactions
 * @param options - Supply configuration options
 * @returns Supply state and handler function
 */
export function useEchelonSupply({
  onSuccess,
  onError,
}: UseEchelonSupplyOptions = {}) {
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

  const handleSupply = useCallback(
    async (
      asset: AssetInfo,
      amount: number,
      availableBalance?: number
    ): Promise<boolean> => {
      // Validate transaction prerequisites
      const validation = validateTransaction(
        asset,
        amount,
        availableBalance,
        "supply"
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

      // Execute supply
      setLoading(true, "Initializing...");

      try {
        const result = await executeSupplyTransaction({
          asset,
          amount: validation.parsedAmount,
          movementWallet,
          publicKey: validation.publicKey,
          signRawHash,
          onStepChange: updateStep,
        });

        if (result.success && result.txHash) {
          await handleSuccess(result.txHash);
          return true;
        } else {
          handleError(result.error || "Supply transaction failed");
          return false;
        }
      } catch (err: unknown) {
        console.error("Supply error:", err);
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
    supplying: state.loading,
    error: state.error,
    txHash: state.txHash,
    step: state.step,
    handleSupply,
    resetState,
  };
}
