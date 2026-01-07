/**
 * Custom hook for handling MovePosition repay transactions
 * Consolidates repay logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { executeRepayV2 } from "../utils/borrow-v2-utils";
import {
  validateMovePositionAmount,
  validateMovePositionWallet,
  validateMovePositionAsset,
} from "../utils/moveposition/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";
import { getCoinDecimals, convertAmountToRaw } from "../utils/token-utils";

interface UseMovePositionRepayOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface MovePositionRepayState {
  repaying: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling MovePosition repay transactions
 * @param options - Repay configuration options
 * @returns Repay state and handler function
 */
export function useMovePositionRepay({
  onSuccess,
  onError,
}: UseMovePositionRepayOptions = {}) {
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<MovePositionRepayState>({
    repaying: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleRepay = useCallback(
    async (
      asset: { symbol: string; token: any },
      amount: string,
      availableBalance?: number
    ): Promise<boolean> => {
      // Reset error state
      setState((prev) => ({ ...prev, error: null, step: null }));

      // Validate wallet
      const walletValidation = validateMovePositionWallet(movementWallet);
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
      const assetValidation = validateMovePositionAsset(asset);
      if (!assetValidation.isValid) {
        const error = assetValidation.error || "Invalid asset";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Validate amount
      const numericAmount = parseFloat(amount);
      const amountValidation = validateMovePositionAmount(
        numericAmount,
        availableBalance,
        "repay"
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

      const walletAddress = movementWallet.address as string;
      const publicKey = (movementWallet as any).publicKey as string;

      if (!publicKey || publicKey.length < 2) {
        const error = "Invalid public key format";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Execute repay
      setState((prev) => ({
        ...prev,
        repaying: true,
        error: null,
        step: "Building transaction...",
      }));

      try {
        // Convert amount to raw format
        const decimals = getCoinDecimals(asset.symbol);
        const rawAmount = convertAmountToRaw(amount, decimals);

        const result = await executeRepayV2({
          amount: rawAmount,
          coinSymbol: asset.symbol,
          walletAddress,
          publicKey,
          signHash: async (hash: string) => {
            setState((prev) => ({ ...prev, step: "Waiting for signature..." }));
            try {
              const response = await signRawHash({
                address: walletAddress,
                chainType: "aptos",
                hash: hash as `0x${string}`,
              });
              setState((prev) => ({ ...prev, step: "Signature received" }));
              return { signature: response.signature };
            } catch (error: any) {
              setState((prev) => ({ ...prev, step: null }));
              throw new Error(
                error.message || "Failed to get signature from wallet"
              );
            }
          },
          onProgress: (step: string) => {
            setState((prev) => ({ ...prev, step }));
          },
        });

        setState((prev) => ({
          ...prev,
          repaying: false,
          txHash: result ?? null,
          step: null,
        }));

        // Refresh balances after successful repay
        await refreshBalances();

        onSuccess?.();
        return true;
      } catch (error: any) {
        const errorMessage =
          error.message || "Repay transaction failed. Please try again.";
        setState((prev) => ({
          ...prev,
          repaying: false,
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

  return {
    ...state,
    handleRepay,
  };
}
