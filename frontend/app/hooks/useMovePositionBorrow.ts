/**
 * Custom hook for handling MovePosition borrow transactions
 * Consolidates borrow logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { executeBorrowV2 } from "../utils/borrow-v2-utils";
import {
  validateMovePositionAmount,
  validateMovePositionWallet,
  validateMovePositionAsset,
  validateMovePositionBorrowingPower,
} from "../utils/moveposition/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";
import { getCoinDecimals, convertAmountToRaw } from "../utils/token-utils";

interface UseMovePositionBorrowOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface MovePositionBorrowState {
  borrowing: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling MovePosition borrow transactions
 * @param options - Borrow configuration options
 * @returns Borrow state and handler function
 */
export function useMovePositionBorrow({
  onSuccess,
  onError,
}: UseMovePositionBorrowOptions = {}) {
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<MovePositionBorrowState>({
    borrowing: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleBorrow = useCallback(
    async (
      asset: { symbol: string; token: any },
      amount: string,
      availableBalance?: number,
      availableLiquidity?: number
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
        undefined,
        "borrow"
      );
      if (!amountValidation.isValid) {
        const error = amountValidation.error || "Invalid amount";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Validate borrowing power if provided
      if (availableBalance !== undefined && availableLiquidity !== undefined) {
        const borrowingPowerValidation = validateMovePositionBorrowingPower(
          numericAmount,
          availableBalance,
          availableLiquidity
        );
        if (!borrowingPowerValidation.isValid) {
          const error =
            borrowingPowerValidation.error || "Insufficient borrowing power";
          setState((prev) => ({ ...prev, error }));
          onError?.(error);
          return false;
        }
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

      // Execute borrow
      setState((prev) => ({
        ...prev,
        borrowing: true,
        error: null,
        step: "Building transaction...",
      }));

      try {
        // Convert amount to raw format
        const decimals = getCoinDecimals(asset.symbol);
        const rawAmount = convertAmountToRaw(amount, decimals);

        const result = await executeBorrowV2({
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
          borrowing: false,
          txHash: result ?? null,
          step: null,
        }));

        // Refresh balances after successful borrow
        await refreshBalances();

        onSuccess?.();
        return true;
      } catch (error: any) {
        const errorMessage =
          error.message || "Borrow transaction failed. Please try again.";
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

  return {
    ...state,
    handleBorrow,
  };
}
