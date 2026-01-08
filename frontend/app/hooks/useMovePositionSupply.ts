/**
 * Custom hook for handling MovePosition supply (lend) transactions
 * Refactored to use unified transaction service matching MovePosition architecture
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import {
  validateMovePositionAmount,
  validateMovePositionWallet,
  validateMovePositionAsset,
} from "../utils/moveposition/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";
import { getCoinDecimals, convertAmountToRaw } from "../utils/shared/tokens";
import { MovementWallet, hasPublicKey } from "../types/moveposition";
import {
  getBrokerByAssetName,
  validateBroker,
  getBrokerNames,
  fetchBrokers,
} from "../services/broker-service";
import {
  fetchPortfolioWithRisk,
  buildCurrentPortfolioBasicState,
} from "../services/portfolio-service";
import { executeTransaction } from "../services/transaction-service";

interface UseMovePositionSupplyOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface MovePositionSupplyState {
  supplying: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Custom hook for handling MovePosition supply transactions
 * @param options - Supply configuration options
 * @returns Supply state and handler function
 */
export function useMovePositionSupply({
  onSuccess,
  onError,
}: UseMovePositionSupplyOptions = {}) {
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  // Use refs to store callbacks to avoid recreating useCallback on every render
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const refreshBalancesRef = useRef(refreshBalances);

  // Update refs when callbacks change (but don't trigger re-renders)
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    refreshBalancesRef.current = refreshBalances;
  }, [onSuccess, onError, refreshBalances]);

  const [state, setState] = useState<MovePositionSupplyState>({
    supplying: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleSupply = useCallback(
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
        onErrorRef.current?.(error);
        return false;
      }

      if (!ready || !authenticated) {
        const error = "Please authenticate first";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      // Validate asset
      const assetValidation = validateMovePositionAsset(asset);
      if (!assetValidation.isValid) {
        const error = assetValidation.error || "Invalid asset";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      // Validate amount
      const numericAmount = parseFloat(amount);
      const amountValidation = validateMovePositionAmount(
        numericAmount,
        availableBalance,
        "supply"
      );
      if (!amountValidation.isValid) {
        const error = amountValidation.error || "Invalid amount";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      // Use wallet from hook (already validated)
      if (!movementWallet) {
        const error = "Movement wallet not found";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      // Type-safe publicKey extraction
      if (!hasPublicKey(movementWallet)) {
        const error =
          "Wallet missing public key. Please reconnect your wallet.";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      const walletAddress = movementWallet.address as string;
      const publicKey = movementWallet.publicKey;

      if (!publicKey || publicKey.length < 2) {
        const error = "Invalid public key format";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      // Execute supply using new architecture
      setState((prev) => ({
        ...prev,
        supplying: true,
        error: null,
        step: "Loading broker data...",
      }));

      try {
        // Fetch broker using standardized service (matches MovePosition)
        const broker = await getBrokerByAssetName(asset.symbol);

        if (!broker) {
          throw new Error(`Broker not found for asset: ${asset.symbol}`);
        }

        // Validate broker
        const brokerValidation = validateBroker(broker, "supply");
        if (!brokerValidation.isValid) {
          throw new Error(brokerValidation.error || "Invalid broker");
        }

        setState((prev) => ({ ...prev, step: "Fetching portfolio..." }));

        // Fetch portfolio with risk (matches MovePosition)
        const freshPortfolio = await fetchPortfolioWithRisk(walletAddress);
        const currentPortfolioState =
          buildCurrentPortfolioBasicState(freshPortfolio);

        // Convert amount to raw format
        const decimals = getCoinDecimals(asset.symbol);
        const rawAmount = convertAmountToRaw(amount, decimals);

        setState((prev) => ({ ...prev, step: "Building transaction..." }));

        // Execute transaction using unified service
        const hash = await executeTransaction({
          txType: "supply",
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

        // Success - transaction hash returned
        // Clear error state on success to prevent stale error messages
        setState((prev) => ({
          ...prev,
          supplying: false,
          txHash: hash,
          error: null, // Explicitly clear error on success
          step: null,
        }));

        // Refresh balances after successful supply (matches MovePosition's postTransactionRefresh)
        await refreshBalancesRef.current();

        onSuccessRef.current?.();
        return true;
      } catch (error: any) {
        const errorMessage =
          error.message || "Supply transaction failed. Please try again.";
        setState((prev) => ({
          ...prev,
          supplying: false,
          error: errorMessage,
          step: null,
        }));
        onErrorRef.current?.(errorMessage);
        return false;
      }
    },
    [movementWallet, ready, authenticated, signRawHash]
  );

  return {
    ...state,
    handleSupply,
  };
}
