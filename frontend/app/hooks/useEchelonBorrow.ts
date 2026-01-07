/**
 * Custom hook for handling Echelon borrow transactions
 * Consolidates borrow logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { AssetInfo, executeBorrowTransaction } from "./useEchelonTransactions";
import {
  validateEchelonAmount,
  validateEchelonWallet,
  validateEchelonAsset,
  validateBorrowingPower,
} from "../utils/echelon/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";

interface UseEchelonBorrowOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

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
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<EchelonBorrowState>({
    borrowing: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleBorrow = useCallback(
    async (
      asset: AssetInfo,
      amount: number,
      availableBalance: number,
      hasCollateral: boolean,
      totalSupplyBalance: number,
      totalBorrowBalance: number
    ): Promise<boolean> => {
      // Reset error state
      setState((prev) => ({ ...prev, error: null, step: null }));

      // Validate wallet
      const walletValidation = validateEchelonWallet(movementWallet);
      if (!walletValidation.isValid) {
        const error = walletValidation.error || "Wallet validation failed";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      if (!ready || !authenticated) {
        const error = "Please authenticate first";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Validate asset
      const assetValidation = validateEchelonAsset(asset);
      if (!assetValidation.isValid) {
        const error = assetValidation.error || "Invalid asset";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Validate amount
      const amountValidation = validateEchelonAmount(
        amount,
        undefined,
        "borrow"
      );
      if (!amountValidation.isValid) {
        const error = amountValidation.error || "Invalid amount";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Validate borrowing power
      const borrowingPowerValidation = validateBorrowingPower(
        amountValidation.parsedAmount!,
        availableBalance,
        hasCollateral,
        totalSupplyBalance,
        totalBorrowBalance
      );
      if (!borrowingPowerValidation.isValid) {
        const error =
          borrowingPowerValidation.error || "Insufficient borrowing power";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Use wallet from hook (already validated)
      if (!movementWallet) {
        const error = "Movement wallet not found";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      const publicKey = (movementWallet as any).publicKey;
      if (!publicKey) {
        const error = "Wallet public key not found";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Execute borrow
      setState((prev) => ({
        ...prev,
        borrowing: true,
        error: null,
        step: "Initializing...",
      }));

      try {
        const result = await executeBorrowTransaction({
          asset,
          amount: amountValidation.parsedAmount!,
          availableBalance,
          hasCollateral,
          totalSupplyBalance,
          totalBorrowBalance,
          movementWallet,
          publicKey,
          signRawHash,
          onStepChange: (step: string) => {
            setState((prev) => ({ ...prev, step }));
          },
        });

        if (result.success && result.txHash) {
          setState((prev) => ({
            ...prev,
            borrowing: false,
            txHash: result.txHash ?? null,
            error: null,
            step: null,
          }));

          // Refresh balances after successful borrow
          await refreshBalances();

          onSuccess?.();
          return true;
        } else {
          const error = result.error || "Borrow transaction failed";
          setState((prev) => ({
            ...prev,
            borrowing: false,
            error,
            step: null,
          }));
          onError?.(error);
          return false;
        }
      } catch (err: unknown) {
        console.error("Borrow error:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Borrow failed. Please try again.";
        setState((prev) => ({
          ...prev,
          borrowing: false,
          error: errorMessage,
          step: null,
        }));
        onError?.(errorMessage);
        return false;
      }
    },
    [
      movementWallet,
      ready,
      authenticated,
      signRawHash,
      refreshBalances,
      onSuccess,
      onError,
    ]
  );

  const resetState = useCallback(() => {
    setState({
      borrowing: false,
      error: null,
      txHash: null,
      step: null,
    });
  }, []);

  return {
    ...state,
    handleBorrow,
    resetState,
  };
}
