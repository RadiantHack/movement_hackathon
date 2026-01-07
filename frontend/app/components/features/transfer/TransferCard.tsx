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

import React, { useMemo, useState } from "react";
import { TransferData } from "../../types";
import { TokenBalance } from "../../../types";
import { useMovementConfig } from "../../../hooks/useMovementConfig";
import { createAptosClient } from "../../../utils/shared/clients";
import { useTransfer } from "../../../hooks/useTransfer";
import { useMovementWallet } from "../../../hooks/useMovementWallet";
import { getTokenBySymbol } from "../../../utils/shared/tokens";

interface TransferCardProps {
  data: TransferData;
  onTransferInitiate?: () => void;
}

export const TransferCard: React.FC<TransferCardProps> = ({
  data,
  onTransferInitiate,
}) => {
  const { amount, token, tokenSymbol, toAddress, fromAddress, network, error } =
    data;
  const config = useMovementConfig();
  const movementWallet = useMovementWallet();

  // Create Aptos instance using shared utility
  const aptos = useMemo(() => {
    return createAptosClient({
      movementFullNode: config.movementFullNode,
    });
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

  // Use transfer hook for centralized transfer logic
  const transfer = useTransfer({
    aptos,
    movementChainId,
    onSuccess: () => {
      onTransferInitiate?.();
    },
  });

  // Local state for TransferCard-specific validation errors
  const [cardError, setCardError] = useState<string | null>(null);

  // Look up token information from token constants
  const tokenInfo = useMemo(() => {
    const symbol = (tokenSymbol || token || "").toUpperCase();
    if (!symbol) return null;
    return getTokenBySymbol(symbol);
  }, [tokenSymbol, token]);

  const handleTransfer = async () => {
    // Reset card-specific error
    setCardError(null);

    const symbol = (tokenSymbol || token || "").toUpperCase();

    // If token info not found, try to create TokenBalance for native MOVE
    let selectedToken: TokenBalance;

    if (symbol === "MOVE" || symbol === "APT") {
      // Native MOVE token
      selectedToken = {
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
    } else if (tokenInfo) {
      // Token found in token constants
      // Determine assetType based on token type
      let assetType: string;
      if (tokenInfo.type === "coin" && tokenInfo.coinType) {
        // For coin type tokens, use coinType
        assetType = tokenInfo.coinType;
      } else if (tokenInfo.faAddress) {
        // For fungible assets, use faAddress
        assetType = tokenInfo.faAddress;
      } else if (tokenInfo.id) {
        // Fallback to id
        assetType = tokenInfo.id;
      } else {
        setCardError(
          `Cannot determine asset type for token ${symbol}. Please check token configuration.`
        );
        return;
      }

      selectedToken = {
        assetType: assetType,
        amount: amount,
        formattedAmount: amount,
        metadata: {
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
        },
        isNative: false,
      };
    } else {
      // Token not found in constants
      setCardError(
        `Token ${symbol} not found. Please ensure the token is supported or use the transfer page for custom tokens.`
      );
      return;
    }

    // Execute transfer using hook
    await transfer.handleTransfer(selectedToken, toAddress, amount);
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

      {transfer.txHash && (
        <div className="mb-5 p-4 bg-green-100/60 border border-green-200 rounded-lg shadow-sm">
          <p className="text-xs text-green-800 font-medium">Transaction Hash</p>
          <p className="text-xs text-green-900 font-mono break-all mt-1 mb-2">
            {transfer.txHash}
          </p>
          <a
            href={`${config.movementExplorerUrl || "https://explorer.movementlabs.xyz"}/txn/${transfer.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-green-700 hover:text-green-900 underline"
          >
            View on Movement Explorer →
          </a>
        </div>
      )}

      {(transfer.error || cardError) && (
        <div className="mb-5 p-4 bg-red-100/60 border border-red-200 rounded-lg shadow-sm text-sm text-red-700">
          {transfer.error || cardError}
        </div>
      )}

      <button
        onClick={handleTransfer}
        disabled={transfer.transferring || !!transfer.txHash}
        className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-300 shadow-md
            ${
              transfer.transferring || transfer.txHash
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg active:scale-95"
            }`}
      >
        {transfer.transferring
          ? "Transferring..."
          : transfer.txHash
            ? "Transfer Complete"
            : "Transfer"}
      </button>
    </div>
  );
};
