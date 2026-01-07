/**
 * Custom hook for handling token swaps
 * Consolidates swap logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { Aptos } from "@aptos-labs/ts-sdk";
import type { MosaicQuoteResponse } from "../utils/mosaic-api";
import {
  executeSwap,
  getSwapErrorMessage,
  validateSwapAmount,
  validateTokenPair,
} from "../utils/swap";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";

interface UseSwapOptions {
  aptos: Aptos | null;
  movementChainId: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface SwapState {
  swapping: boolean;
  error: string | null;
  txHash: string | null;
}

/**
 * Custom hook for handling token swaps
 * @param options - Swap configuration options
 * @returns Swap state and handler function
 */
export function useSwap({
  aptos,
  movementChainId,
  onSuccess,
  onError,
}: UseSwapOptions) {
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<SwapState>({
    swapping: false,
    error: null,
    txHash: null,
  });

  const handleSwap = useCallback(
    async (
      fromToken: string,
      toToken: string,
      fromAmount: string,
      quote: MosaicQuoteResponse | null,
      fromBalance?: string | null
    ): Promise<boolean> => {
      // Reset error state
      setState((prev) => ({ ...prev, error: null }));

      // Validate wallet connection
      if (!movementWallet) {
        const error = "Please connect a Movement wallet";
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

      // Validate Aptos client
      if (!aptos) {
        const error = "Aptos client not initialized";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Validate token pair
      const tokenValidation = validateTokenPair(fromToken, toToken);
      if (!tokenValidation.isValid) {
        setState((prev) => ({
          ...prev,
          error: tokenValidation.error || null,
        }));
        onError?.(tokenValidation.error || "Invalid token selection");
        return false;
      }

      // Validate amount
      const amountValidation = validateSwapAmount(fromAmount, fromBalance);
      if (!amountValidation.isValid) {
        setState((prev) => ({
          ...prev,
          error: amountValidation.error || null,
        }));
        onError?.(amountValidation.error || "Invalid amount");
        return false;
      }

      // Validate quote
      if (!quote || !quote.data || !quote.data.tx) {
        const error = "Please wait for quote to load";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Use wallet from hook (already validated)
      if (!movementWallet) {
        const error = "Aptos wallet not found";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      const senderAddress = movementWallet.address as string;
      const senderPubKeyWithScheme = movementWallet.publicKey as string;

      if (!senderAddress || !senderPubKeyWithScheme) {
        const error = "Wallet address or public key not found";
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return false;
      }

      // Execute swap
      setState((prev) => ({ ...prev, swapping: true, error: null }));

      try {
        const hash = await executeSwap({
          aptos,
          movementChainId,
          senderAddress,
          senderPubKeyWithScheme,
          fromToken,
          toToken,
          quote,
          signRawHash,
        });

        setState((prev) => ({
          ...prev,
          swapping: false,
          txHash: hash,
          error: null,
        }));

        // Refresh balances after successful swap
        await refreshBalances();

        onSuccess?.();
        return true;
      } catch (err: unknown) {
        console.error("Swap error:", err);
        const errorMessage = getSwapErrorMessage(err, fromToken, toToken);
        setState((prev) => ({
          ...prev,
          swapping: false,
          error: errorMessage,
        }));
        onError?.(errorMessage);
        return false;
      }
    },
    [
      movementWallet,
      ready,
      authenticated,
      aptos,
      movementChainId,
      signRawHash,
      refreshBalances,
      onSuccess,
      onError,
    ]
  );

  const resetState = useCallback(() => {
    setState({
      swapping: false,
      error: null,
      txHash: null,
    });
  }, []);

  return {
    ...state,
    handleSwap,
    resetState,
  };
}

