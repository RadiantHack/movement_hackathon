/**
 * Custom hook for handling token transfers
 * Consolidates transfer logic used across multiple components
 */

import { useState, useCallback } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { Aptos } from "@aptos-labs/ts-sdk";
import { TokenBalance } from "../types";
import {
  executeTransfer,
  getTransferErrorMessage,
  validateMovementAddress,
  validateTransferAmount,
} from "../utils/transfer";
import { useBalance } from "./useBalanceContext";
import { useMovementWallet } from "./useMovementWallet";

interface UseTransferOptions {
  aptos: Aptos | null;
  movementChainId: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface TransferState {
  transferring: boolean;
  error: string | null;
  txHash: string | null;
}

/**
 * Custom hook for handling token transfers
 * @param options - Transfer configuration options
 * @returns Transfer state and handler function
 */
export function useTransfer({
  aptos,
  movementChainId,
  onSuccess,
  onError,
}: UseTransferOptions) {
  const { signRawHash } = useSignRawHash();
  const { ready, authenticated, user } = usePrivy();
  const { refreshBalances } = useBalance();
  const movementWallet = useMovementWallet();

  const [state, setState] = useState<TransferState>({
    transferring: false,
    error: null,
    txHash: null,
  });

  const handleTransfer = useCallback(
    async (
      selectedToken: TokenBalance,
      toAddress: string,
      amount: string
    ): Promise<boolean> => {
      // Reset error state
      setState((prev) => ({ ...prev, error: null }));

      // Validate wallet connection
      if (!movementWallet) {
        const error = "Please connect a Movement wallet";
        setState((prev) => ({ ...prev, error: error || null }));
        onError?.(error);
        return false;
      }

      if (!ready || !authenticated) {
        const error = "Please authenticate first";
        setState((prev) => ({ ...prev, error: error || null }));
        onError?.(error);
        return false;
      }

      // Validate token selection
      if (!selectedToken) {
        const error = "Please select a token";
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

      // Validate recipient address
      const addressValidation = validateMovementAddress(toAddress);
      if (!addressValidation.isValid) {
        setState((prev) => ({
          ...prev,
          error: addressValidation.error || null,
        }));
        onError?.(addressValidation.error || "Invalid address");
        return false;
      }

      // Validate amount
      const amountValidation = validateTransferAmount(
        amount,
        selectedToken.formattedAmount
      );
      if (!amountValidation.isValid) {
        setState((prev) => ({
          ...prev,
          error: amountValidation.error || null,
        }));
        onError?.(amountValidation.error || "Invalid amount");
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

      // Execute transfer
      setState((prev) => ({ ...prev, transferring: true, error: null }));

      try {
        const hash = await executeTransfer({
          aptos,
          movementChainId,
          senderAddress,
          senderPubKeyWithScheme,
          selectedToken,
          toAddress,
          amount,
          signRawHash,
        });

        setState((prev) => ({
          ...prev,
          transferring: false,
          txHash: hash,
          error: null,
        }));

        // Refresh balances after successful transfer
        await refreshBalances();

        onSuccess?.();
        return true;
      } catch (err: unknown) {
        console.error("Transfer error:", err);
        const errorMessage = getTransferErrorMessage(
          err,
          toAddress,
          selectedToken
        );
        setState((prev) => ({
          ...prev,
          transferring: false,
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
      user,
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
      transferring: false,
      error: null,
      txHash: null,
    });
  }, []);

  return {
    ...state,
    handleTransfer,
    resetState,
  };
}
