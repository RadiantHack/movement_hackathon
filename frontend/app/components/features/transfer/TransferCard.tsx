"use client";

/**
 * TransferCard Component
 *
 * Displays transfer information and allows user to execute the transfer.
 * Uses server-side API route to handle Movement Network token transfers.
 *
 * Based on Privy Movement Network documentation:
 * https://docs.privy.io/recipes/use-tier-2#movement
 */

import React, { useState, useMemo } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { TransferData } from "../../types";
import { TokenBalance } from "../../../types";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useMovementConfig } from "../../../hooks/useMovementConfig";
import {
  executeTransfer,
  getTransferErrorMessage,
} from "../../../utils/transfer";
import { createAptosClient } from "../../../utils/aptos-client";

interface TransferCardProps {
  data: TransferData;
  onTransferInitiate?: () => void;
}

export const TransferCard: React.FC<TransferCardProps> = ({
  data,
  onTransferInitiate,
}) => {
  const { signRawHash } = useSignRawHash();
  const { amount, token, tokenSymbol, toAddress, fromAddress, network, error } =
    data;
  const { user, ready, authenticated } = usePrivy();
  const config = useMovementConfig();

  // Create Aptos instance using shared utility
  const aptos = useMemo(() => {
    return createAptosClient({
      movementFullNode: config.movementFullNode,
    });
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Get Movement wallet from user's linked accounts
  const movementWallet = useMemo(() => {
    if (!ready || !authenticated || !user?.linkedAccounts) {
      return null;
    }
    return (
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          account.type === "wallet" && account.chainType === "aptos"
      ) || null
    );
  }, [user, ready, authenticated]);

  const handleTransfer = async () => {
    if (!movementWallet) {
      setTransferError(
        "Movement wallet not found. Please create a Movement wallet first."
      );
      return;
    }

    if (!ready || !authenticated) {
      setTransferError("Please authenticate first.");
      return;
    }

    setTransferring(true);
    setTransferError(null);
    setTxHash(null);

    try {
      if (!aptos) {
        throw new Error("Aptos client not initialized");
      }

      // Get Aptos wallet from user's linked accounts
      const aptosWallet = user?.linkedAccounts?.find((a: unknown) => {
        const account = a as Record<string, unknown>;
        return account.type === "wallet" && account.chainType === "aptos";
      }) as WalletWithMetadata | undefined;

      if (!aptosWallet) {
        throw new Error("Aptos wallet not found");
      }

      const senderAddress = aptosWallet.address as string;
      const publicKey = aptosWallet.publicKey as string;

      if (!publicKey) {
        throw new Error("Public key not found");
      }

      // Validate recipient address
      if (
        !toAddress ||
        !toAddress.startsWith("0x") ||
        toAddress.length !== 66
      ) {
        throw new Error(
          "Invalid recipient address. Must be 66 characters and start with 0x."
        );
      }

      // Determine if this is native MOVE token
      const isNativeMove =
        (tokenSymbol || token || "").toUpperCase() === "MOVE";

      if (!isNativeMove) {
        throw new Error(
          `Transfer of ${tokenSymbol || token} requires assetType information. ` +
            `Please use the transfer page for non-native tokens or provide assetType in TransferData.`
        );
      }

      // Create minimal TokenBalance object for MOVE token
      // TransferCard only supports MOVE transfers currently
      const selectedToken: TokenBalance = {
        assetType: "0x1::aptos_coin::AptosCoin",
        amount: amount,
        formattedAmount: amount,
        metadata: {
          name: "Move Coin",
          symbol: "MOVE",
          decimals: 8,
        },
        isNative: true,
      };

      // Execute transfer using utility function
      const txHash = await executeTransfer({
        aptos: aptos!,
        movementChainId,
        senderAddress,
        senderPubKeyWithScheme: publicKey,
        selectedToken,
        toAddress,
        amount,
        signRawHash,
      });

      setTxHash(txHash);
      onTransferInitiate?.();
    } catch (err: unknown) {
      console.error("Transfer error:", err);

      // Create a minimal TokenBalance for error message (only used if we have token info)
      const isNativeMove =
        (tokenSymbol || token || "").toUpperCase() === "MOVE";
      const selectedToken: TokenBalance = {
        assetType: isNativeMove ? "0x1::aptos_coin::AptosCoin" : "",
        amount: amount,
        formattedAmount: amount,
        metadata: {
          name: tokenSymbol || token || "Unknown",
          symbol: tokenSymbol || token || "UNKNOWN",
          decimals: 8,
        },
        isNative: isNativeMove,
      };

      const errorMessage = getTransferErrorMessage(
        err,
        toAddress,
        selectedToken
      );
      setTransferError(errorMessage);
    } finally {
      setTransferring(false);
    }
  };

  const DetailRow = ({
    label,
    value,
    mono,
  }: {
    label: string;
    value: string;
    mono?: boolean;
  }) => (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-gray-700">{label}:</span>
      <span
        className={`text-sm font-semibold text-gray-900 ${
          mono ? "font-mono text-gray-700" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="rounded-2xl p-4 sm:p-5 md:p-6 my-4 backdrop-blur-xl bg-white/40 border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.08)] animate-fade-in-up max-w-full overflow-hidden mx-2 sm:mx-0">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-200 to-purple-300 flex items-center justify-center shadow-inner">
          <span className="text-2xl">💸</span>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 tracking-tight">
            Transfer Tokens
          </h3>
          <p className="text-sm text-gray-600">Movement Network</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100/60 border border-red-200 rounded-lg text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Details */}
      <div className="space-y-4 mb-6">
        <DetailRow
          label="Amount"
          value={`${amount} ${tokenSymbol || token}`}
          mono
        />
        <DetailRow
          label="From"
          value={`${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)}`}
          mono
        />
        <DetailRow
          label="To"
          value={`${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`}
          mono
        />
        <DetailRow label="Network" value={network} mono />
      </div>

      {txHash && (
        <div className="mb-5 p-4 bg-green-100/60 border border-green-200 rounded-lg shadow-sm">
          <p className="text-xs text-green-800 font-medium">Transaction Hash</p>
          <p className="text-xs text-green-900 font-mono break-all mt-1 mb-2">
            {txHash}
          </p>
          <a
            href={`${config.movementExplorerUrl || "https://explorer.movementlabs.xyz"}/txn/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-green-700 hover:text-green-900 underline"
          >
            View on Movement Explorer →
          </a>
        </div>
      )}

      {transferError && (
        <div className="mb-5 p-4 bg-red-100/60 border border-red-200 rounded-lg shadow-sm text-sm text-red-700">
          {transferError}
        </div>
      )}

      <button
        onClick={handleTransfer}
        disabled={transferring || !!txHash}
        className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-300 shadow-md
            ${
              transferring || txHash
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg active:scale-95"
            }`}
      >
        {transferring
          ? "Transferring..."
          : txHash
            ? "Transfer Complete"
            : "Transfer"}
      </button>
    </div>
  );
};
