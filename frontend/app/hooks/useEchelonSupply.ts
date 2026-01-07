/**
 * Custom hook for handling Echelon supply (lend) transactions
 * Consolidates supply logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { AssetInfo, executeSupplyTransaction } from "./useEchelonTransactions";
import {
  validateEchelonAmount,
  validateEchelonWallet,
  validateEchelonAsset,
} from "../utils/echelon/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";

interface UseEchelonSupplyOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

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
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<EchelonSupplyState>({
    supplying: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleSupply = useCallback(
    async (
      asset: AssetInfo,
      amount: number,
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
        "supply"
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

      // Execute supply
      setState((prev) => ({
        ...prev,
        supplying: true,
        error: null,
        step: "Initializing...",
      }));

      try {
        const result = await executeSupplyTransaction({
          asset,
          amount: amountValidation.parsedAmount!,
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
            supplying: false,
            txHash: result.txHash ?? null,
            error: null,
            step: null,
          }));

          // Refresh balances after successful supply
          await refreshBalances();

          onSuccess?.();
          return true;
        } else {
          const error = result.error || "Supply transaction failed";
          setState((prev) => ({
            ...prev,
            supplying: false,
            error,
            step: null,
          }));
          onError?.(error);
          return false;
        }
      } catch (err: unknown) {
        console.error("Supply error:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Supply failed. Please try again.";
        setState((prev) => ({
          ...prev,
          supplying: false,
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
      supplying: false,
      error: null,
      txHash: null,
      step: null,
    });
  }, []);

  return {
    ...state,
    handleSupply,
    resetState,
  };
}
