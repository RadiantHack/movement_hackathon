/**
 * Custom hook for handling MovePosition repay transactions
 * Consolidates repay logic used across multiple components
 */

import { useState, useCallback, useRef, useEffect } from "react";
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
import { hasPublicKey } from "../types/moveposition";

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
        "repay"
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

      // Execute repay
      setState((prev) => ({
        ...prev,
        repaying: true,
        error: null,
        step: "Loading broker data...",
      }));

      try {
        // Get broker for the asset
        const broker = await getBrokerByAssetName(asset.symbol);
        if (!broker) {
          throw new Error(`Broker not found for asset: ${asset.symbol}`);
        }
        const brokerValidation = validateBroker(broker, "repay");
        if (!brokerValidation.isValid) {
          throw new Error(brokerValidation.error || "Invalid broker");
        }

        // Fetch current portfolio state
        setState((prev) => ({ ...prev, step: "Fetching portfolio state..." }));
        const portfolioResponse = await fetchPortfolioWithRisk(walletAddress);
        const currentPortfolioState =
          buildCurrentPortfolioBasicState(portfolioResponse);

        // Convert amount to raw format (underlying tokens)
        const decimals = getCoinDecimals(asset.symbol);

        // Validate decimals is a positive integer
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
          throw new Error(
            `Invalid coin decimals: ${decimals}. Expected integer between 0 and 18.`
          );
        }

        const rawAmountUnderlying = convertAmountToRaw(amount, decimals);

        // CRITICAL: For REPAY, the API expects amount in NOTE TOKENS (raw), not underlying tokens (raw)
        // Following MovePosition's approach: loanNoteAmount = scaleUp(amount, loanNoteDecimals) / loanNoteExchangeRate
        // Convert underlying token amount (raw) to note token amount (raw)
        const loanNoteDecimals = broker.loanNote?.decimals ?? decimals;

        // Validate loanNoteDecimals is a positive integer
        if (
          !Number.isInteger(loanNoteDecimals) ||
          loanNoteDecimals < 0 ||
          loanNoteDecimals > 18
        ) {
          throw new Error(
            `Invalid loan note decimals: ${loanNoteDecimals}. Expected integer between 0 and 18. Broker configuration error.`
          );
        }

        const loanNoteExchangeRate = broker.loanNoteExchangeRate || 1;

        // Validate loan note exchange rate is positive and finite
        if (
          loanNoteExchangeRate <= 0 ||
          !Number.isFinite(loanNoteExchangeRate)
        ) {
          throw new Error(
            `Invalid loan note exchange rate: ${loanNoteExchangeRate}. Must be a positive finite number. Broker configuration error.`
          );
        }

        const decimalDiff = loanNoteDecimals - decimals;

        // Validate decimal difference is reasonable (prevent extreme scale factors)
        if (Math.abs(decimalDiff) > 18) {
          throw new Error(
            `Invalid decimal difference: ${decimalDiff}. Difference between loan note decimals (${loanNoteDecimals}) and coin decimals (${decimals}) is too large. Broker configuration error.`
          );
        }

        const scaleFactor = Math.pow(10, decimalDiff);

        // Validate scale factor is finite
        if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
          throw new Error(
            `Invalid scale factor: ${scaleFactor}. Calculated from decimal difference: ${decimalDiff}.`
          );
        }

        // Calculate note tokens: (rawUnderlying * scaleFactor) / exchangeRate
        const rawAmountNoteTokens = Math.floor(
          (Number(rawAmountUnderlying) * scaleFactor) / loanNoteExchangeRate
        ).toString();

        // Validate calculated note token amount is valid
        if (
          rawAmountNoteTokens === "NaN" ||
          rawAmountNoteTokens === "Infinity" ||
          rawAmountNoteTokens === "-Infinity"
        ) {
          throw new Error(
            `Invalid note token amount calculation. Raw underlying: ${rawAmountUnderlying}, scale factor: ${scaleFactor}, exchange rate: ${loanNoteExchangeRate}.`
          );
        }

        // Validate repay amount against user's loan note balance
        const loanNoteName = broker.loanNote?.name;
        if (!loanNoteName) {
          throw new Error(
            `Loan note not found for broker ${broker.underlyingAsset.name}`
          );
        }

        const userLoanNotePosition = currentPortfolioState.liabilities.find(
          (l) => l.instrumentId === loanNoteName
        );

        if (!userLoanNotePosition) {
          throw new Error(
            `You don't have any ${asset.symbol} borrowed. Cannot repay.`
          );
        }

        const userLoanNoteBalanceRaw = BigInt(userLoanNotePosition.amount);
        const repayAmountNoteTokensRawBigInt = BigInt(rawAmountNoteTokens);

        // Validate repay amount doesn't exceed user's loan note balance
        if (repayAmountNoteTokensRawBigInt > userLoanNoteBalanceRaw) {
          const userBalanceFormatted =
            (Number(userLoanNoteBalanceRaw) / Math.pow(10, loanNoteDecimals)) *
            loanNoteExchangeRate;
          const repayAmountFormatted =
            Number(rawAmountUnderlying) / Math.pow(10, decimals);

          throw new Error(
            `Insufficient balance. You have ${userBalanceFormatted.toFixed(6)} ${asset.symbol} borrowed, but trying to repay ${repayAmountFormatted.toFixed(6)} ${asset.symbol}.`
          );
        }

        console.log(`[Repay] Amount conversion (underlying → note tokens):`, {
          originalAmountUnderlyingRaw: rawAmountUnderlying,
          coinDecimals: decimals,
          loanNoteDecimals,
          loanNoteExchangeRate,
          decimalDiff,
          scaleFactor,
          repayAmountNoteTokensRaw: rawAmountNoteTokens,
          originalAmountFormatted: (
            Number(rawAmountUnderlying) / Math.pow(10, decimals)
          ).toFixed(6),
          noteTokensFormatted: (
            Number(rawAmountNoteTokens) / Math.pow(10, loanNoteDecimals)
          ).toFixed(6),
        });

        setState((prev) => ({ ...prev, step: "Building transaction..." }));

        // CRITICAL: Pass note tokens amount, not underlying tokens amount
        // Execute transaction using unified service
        const result = await executeTransaction({
          txType: "repay",
          txAmount: rawAmountNoteTokens, // Note tokens, not underlying tokens!
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

        // Clear error state on success to prevent stale error messages
        setState((prev) => ({
          ...prev,
          repaying: false,
          txHash: result ?? null,
          error: null, // Explicitly clear error on success
          step: null,
        }));

        // Refresh balances after successful repay
        await refreshBalancesRef.current();

        onSuccessRef.current?.();
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
        onErrorRef.current?.(errorMessage);
        return false;
      }
    },
    [movementWallet, ready, authenticated, signRawHash]
  );

  return {
    ...state,
    handleRepay,
  };
}
