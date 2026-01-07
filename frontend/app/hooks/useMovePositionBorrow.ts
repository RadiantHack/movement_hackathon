/**
 * Custom hook for handling MovePosition borrow/repay transactions
 * Uses unified TransactionService to mirror MovePosition architecture
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import {
  validateMovePositionAmount,
  validateMovePositionWallet,
  validateMovePositionAsset,
  validateMovePositionBorrowingPower,
} from "../utils/moveposition/validation";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";
import { getCoinDecimals, convertAmountToRaw } from "../utils/shared/tokens";
import {
  getBrokerByAssetName,
  validateBroker,
} from "../services/broker-service";
import {
  fetchPortfolioWithRisk,
  buildCurrentPortfolioBasicState,
} from "../services/portfolio-service";
import { executeTransaction } from "../services/transaction-service";

interface UseMovePositionBorrowOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface MovePositionBorrowState {
  borrowing: boolean;
  repaying: boolean;
  error: string | null;
  txHash: string | null;
  step: string | null;
}

/**
 * Hook to handle borrow/repay transactions
 */
export function useMovePositionBorrow({
  onSuccess,
  onError,
}: UseMovePositionBorrowOptions = {}) {
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

  const [state, setState] = useState<MovePositionBorrowState>({
    borrowing: false,
    repaying: false,
    error: null,
    txHash: null,
    step: null,
  });

  const handleBorrow = useCallback(
    async (
      asset: { symbol: string; token: any },
      amount: string,
      borrowPower?: number | null,
      availableLiquidity?: number | null
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
      if (
        borrowPower != null &&
        availableLiquidity != null &&
        !isNaN(numericAmount)
      ) {
        const bpValidation = validateMovePositionBorrowingPower(
          numericAmount,
          borrowPower,
          availableLiquidity
        );
        if (!bpValidation.isValid) {
          const error = bpValidation.error || "Invalid amount";
          setState((prev) => ({ ...prev, error }));
          onErrorRef.current?.(error);
          return false;
        }
      } else {
        const amountValidation = validateMovePositionAmount(
          numericAmount,
          borrowPower,
          "borrow"
        );
        if (!amountValidation.isValid) {
          const error = amountValidation.error || "Invalid amount";
          setState((prev) => ({ ...prev, error }));
          onErrorRef.current?.(error);
          return false;
        }
      }

      // Use wallet from hook (already validated)
      if (!movementWallet) {
        const error = "Movement wallet not found";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }
      const walletAddress = movementWallet.address as string;
      const publicKey = (movementWallet as any).publicKey as string;
      if (!publicKey || publicKey.length < 2) {
        const error = "Invalid public key format";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      setState((prev) => ({
        ...prev,
        borrowing: true,
        error: null,
        step: "Loading broker data...",
      }));

      try {
        // Fetch broker
        const broker = await getBrokerByAssetName(asset.symbol);
        if (!broker) {
          throw new Error(`Broker not found for asset: ${asset.symbol}`);
        }

        // Validate broker for borrow
        const brokerValidation = validateBroker(broker, "borrow");
        if (!brokerValidation.isValid) {
          throw new Error(brokerValidation.error || "Invalid broker");
        }

        setState((prev) => ({ ...prev, step: "Fetching portfolio..." }));

        // Fetch portfolio and build state
        const freshPortfolio = await fetchPortfolioWithRisk(walletAddress);
        const currentPortfolioState =
          buildCurrentPortfolioBasicState(freshPortfolio);

        // Convert amount to raw
        const decimals = getCoinDecimals(asset.symbol);
        const rawAmount = convertAmountToRaw(amount, decimals);

        setState((prev) => ({ ...prev, step: "Building transaction..." }));

        // Execute borrow
        const hash = await executeTransaction({
          txType: "borrow",
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
          onProgress: (step: string) => setState((prev) => ({ ...prev, step })),
        });

        setState((prev) => ({
          ...prev,
          borrowing: false,
          txHash: hash,
          step: null,
        }));

        await refreshBalancesRef.current();
        onSuccessRef.current?.();
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
        onErrorRef.current?.(errorMessage);
        return false;
      }
    },
    [movementWallet, ready, authenticated, signRawHash]
  );

  const handleRepay = useCallback(
    async (
      asset: { symbol: string; token: any },
      amount: string,
      repayCap?: number | null
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
        repayCap,
        "repay"
      );
      if (!amountValidation.isValid) {
        const error = amountValidation.error || "Invalid amount";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      // Use wallet
      if (!movementWallet) {
        const error = "Movement wallet not found";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }
      const walletAddress = movementWallet.address as string;
      const publicKey = (movementWallet as any).publicKey as string;
      if (!publicKey || publicKey.length < 2) {
        const error = "Invalid public key format";
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
        return false;
      }

      setState((prev) => ({
        ...prev,
        repaying: true,
        error: null,
        step: "Loading broker data...",
      }));

      try {
        const broker = await getBrokerByAssetName(asset.symbol);
        if (!broker) {
          throw new Error(`Broker not found for asset: ${asset.symbol}`);
        }
        const brokerValidation = validateBroker(broker, "repay");
        if (!brokerValidation.isValid) {
          throw new Error(brokerValidation.error || "Invalid broker");
        }

        setState((prev) => ({ ...prev, step: "Fetching portfolio..." }));

        const freshPortfolio = await fetchPortfolioWithRisk(walletAddress);
        const currentPortfolioState =
          buildCurrentPortfolioBasicState(freshPortfolio);

        const decimals = getCoinDecimals(asset.symbol);
        const rawAmountUnderlying = convertAmountToRaw(amount, decimals);

        // CRITICAL: For REPAY, the API expects amount in NOTE TOKENS (raw), not underlying tokens (raw)
        // Following MovePosition's approach: loanNoteAmount = scaleUp(amount, loanNoteDecimals) / loanNoteExchangeRate
        // Convert underlying token amount (raw) to note token amount (raw)
        const loanNoteDecimals = broker.loanNote?.decimals ?? decimals;
        const loanNoteExchangeRate = broker.loanNoteExchangeRate || 1;
        const decimalDiff = loanNoteDecimals - decimals;
        const scaleFactor = Math.pow(10, decimalDiff);

        // Calculate note tokens: (rawUnderlying * scaleFactor) / exchangeRate
        const rawAmountNoteTokens = Math.floor(
          (Number(rawAmountUnderlying) * scaleFactor) / loanNoteExchangeRate
        ).toString();

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
        const hash = await executeTransaction({
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
          onProgress: (step: string) => setState((prev) => ({ ...prev, step })),
        });

        setState((prev) => ({
          ...prev,
          repaying: false,
          txHash: hash,
          step: null,
        }));

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
    handleBorrow,
    handleRepay,
  };
}
