/**
 * Custom hook for handling Echelon borrow transactions
 * Consolidates borrow logic used across multiple components
 */

import { useCallback } from "react";
import { AssetInfo, executeBorrowTransaction } from "./useEchelonTransactions";
import { validateBorrowingPower } from "../utils/echelon/validation";
import {
  useEchelonTransaction,
  type UseEchelonTransactionOptions,
} from "./useEchelonTransaction";

interface UseEchelonBorrowOptions extends UseEchelonTransactionOptions {}

interface EchelonBorrowState {
  borrowing: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling Echelon borrow transactions
 * @param options - Borrow configuration options
 * @returns Borrow state and handler function
 */
export function useEchelonBorrow({
  onSuccess,
  onError,
}: UseEchelonBorrowOptions = {}) {
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

  const handleBorrow = useCallback(
    async (
      asset: AssetInfo,
      amount: number,
      availableBalance: number,
      hasCollateral: boolean,
      totalSupplyBalance: number,
      totalBorrowBalance: number
    ): Promise<boolean> => {
      // Validate transaction prerequisites
      const validation = validateTransaction(
        asset,
        amount,
        undefined,
        "borrow"
      );

      if (
        !validation.isValid ||
        !validation.publicKey ||
        !validation.parsedAmount
      ) {
        setError(validation.error || "Validation failed");
        return false;
      }

      // Validate borrowing power
      const borrowingPowerValidation = validateBorrowingPower(
        validation.parsedAmount,
        availableBalance,
        hasCollateral,
        totalSupplyBalance,
        totalBorrowBalance
      );
      if (!borrowingPowerValidation.isValid) {
        setError(
          borrowingPowerValidation.error || "Insufficient borrowing power"
        );
        return false;
      }

      if (!movementWallet) {
        setError("Movement wallet not found");
        return false;
      }

      // Execute borrow
      setLoading(true, "Initializing...");

      try {
        const result = await executeBorrowTransaction({
          asset,
          amount: validation.parsedAmount,
          availableBalance,
          hasCollateral,
          totalSupplyBalance,
          totalBorrowBalance,
          movementWallet,
          publicKey: validation.publicKey,
          signRawHash,
          onStepChange: updateStep,
        });

        if (result.success && result.txHash) {
          await handleSuccess(result.txHash);
          return true;
        } else {
          handleError(result.error || "Borrow transaction failed");
          return false;
        }
      } catch (err: unknown) {
        console.error("Borrow error:", err);
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
    borrowing: state.loading,
    error: state.error,
    txHash: state.txHash,
    step: state.step,
    handleBorrow,
    resetState,
  };
}
