/**
 * Custom hook for handling Echelon withdraw transactions
 * Consolidates withdraw logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import {
  AssetInfo,
  executeWithdrawTransaction,
} from "./useEchelonTransactions";
import {
  validateEchelonAmount,
  validateEchelonWallet,
  validateEchelonAsset,
} from "../utils/echelon/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";

interface UseEchelonWithdrawOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

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
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<EchelonWithdrawState>({
    withdrawing: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleWithdraw = useCallback(
    async (
      asset: AssetInfo,
      amount: number,
      percentage: number,
      availableBalance?: number
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
        availableBalance,
        "withdraw"
      );
      if (!amountValidation.isValid) {
        const error = amountValidation.error || "Invalid amount";
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

      // Execute withdraw
      setState((prev) => ({
        ...prev,
        withdrawing: true,
        error: null,
        step: "Initializing...",
      }));

      try {
        const result = await executeWithdrawTransaction({
          asset,
          amount: amountValidation.parsedAmount!,
          percentage,
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
            withdrawing: false,
            txHash: result.txHash ?? null,
            error: null,
            step: null,
          }));

          // Refresh balances after successful withdraw
          await refreshBalances();

          onSuccess?.();
          return true;
        } else {
          const error = result.error || "Withdraw transaction failed";
          setState((prev) => ({
            ...prev,
            withdrawing: false,
            error,
            step: null,
          }));
          onError?.(error);
          return false;
        }
      } catch (err: unknown) {
        console.error("Withdraw error:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Withdraw failed. Please try again.";
        setState((prev) => ({
          ...prev,
          withdrawing: false,
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
      withdrawing: false,
      error: null,
      txHash: null,
      step: null,
    });
  }, []);

  return {
    ...state,
    handleWithdraw,
    resetState,
  };
}
