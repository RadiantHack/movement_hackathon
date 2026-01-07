/**
 * Custom hook for handling MovePosition withdraw (redeem) transactions
 * Consolidates withdraw logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { executeTransaction } from "../services/transaction-service";
import {
  getBrokerByAssetName,
  validateBroker,
} from "../services/broker-service";
import {
  fetchPortfolioWithRisk,
  buildCurrentPortfolioBasicState,
} from "../services/portfolio-service";
import {
  validateMovePositionAmount,
  validateMovePositionWallet,
  validateMovePositionAsset,
} from "../utils/moveposition/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";
import { getCoinDecimals, convertAmountToRaw } from "../utils/shared/tokens";

interface UseMovePositionWithdrawOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface MovePositionWithdrawState {
  withdrawing: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling MovePosition withdraw transactions
 * @param options - Withdraw configuration options
 * @returns Withdraw state and handler function
 */
export function useMovePositionWithdraw({
  onSuccess,
  onError,
}: UseMovePositionWithdrawOptions = {}) {
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<MovePositionWithdrawState>({
    withdrawing: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleWithdraw = useCallback(
    async (
      asset: { symbol: string; token: any },
      amount: string,
      availableBalance?: number,
      exactNoteTokenBalanceRaw?: string
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

      const walletAddress = movementWallet.address as string;
      const publicKey = (movementWallet as any).publicKey as string;

      if (!publicKey || publicKey.length < 2) {
        const error = "Invalid public key format";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Execute withdraw
      setState((prev) => ({
        ...prev,
        withdrawing: true,
        error: null,
        step: "Fetching broker information...",
      }));

      try {
        // Get broker for the asset
        const broker = await getBrokerByAssetName(asset.symbol);
        if (!broker) {
          throw new Error(`Broker not found for asset: ${asset.symbol}`);
        }
        const brokerValidation = validateBroker(broker, "withdraw");
        if (!brokerValidation.isValid) {
          throw new Error(brokerValidation.error || "Invalid broker");
        }

        // Fetch current portfolio state
        setState((prev) => ({ ...prev, step: "Fetching portfolio state..." }));
        const portfolioResponse = await fetchPortfolioWithRisk(walletAddress);
        const currentPortfolioState =
          buildCurrentPortfolioBasicState(portfolioResponse);

        // If exact note token balance is provided (from "Max" button), use it directly
        // This matches MovePosition: maxWithdrawNoteUser is used as txAmount (exact note balance)
        // Otherwise, convert underlying amount to raw format
        let rawAmount: string;
        if (exactNoteTokenBalanceRaw) {
          // Use exact note token balance (already in raw format)
          // This ensures we withdraw exactly what user has, leaving zero balance
          rawAmount = exactNoteTokenBalanceRaw;
        } else {
          // Convert underlying amount to raw format
          const decimals = getCoinDecimals(asset.symbol);
          rawAmount = convertAmountToRaw(amount, decimals);
        }

        setState((prev) => ({ ...prev, step: "Building transaction..." }));

        // Execute transaction using unified service
        const result = await executeTransaction({
          txType: "withdraw",
          txAmount: rawAmount,
          broker,
          address: walletAddress,
          publicKey,
          currentPortfolioState,
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
          withdrawing: false,
          txHash: result ?? null,
          step: null,
        }));

        // Refresh balances after successful withdraw
        await refreshBalances();

        onSuccess?.();
        return true;
      } catch (error: any) {
        const errorMessage =
          error.message || "Withdraw transaction failed. Please try again.";
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

  return {
    ...state,
    handleWithdraw,
  };
}
