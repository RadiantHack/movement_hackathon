"use client";

/**
 * TransferCard Component
 *
 * Displays transfer information and allows user to execute the transfer.
 * Shows amount, token, from/to addresses, and a transfer button.
 */

import React, { useState } from "react";
import { TransferData } from "../../types";

interface TransferCardProps {
  data: TransferData;
  onTransferInitiate?: () => void;
}

export const TransferCard: React.FC<TransferCardProps> = ({
  data,
  onTransferInitiate,
}) => {
  const { amount, token, tokenSymbol, toAddress, fromAddress, network, error } = data;
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleTransfer = async () => {
    setTransferring(true);
    setTransferError(null);

    try {
      // TODO: Implement actual transfer logic using Movement Network SDK
      // For now, this is a placeholder
      console.log("Transferring:", {
        amount,
        token,
        tokenSymbol,
        fromAddress,
        toAddress,
        network,
      });

      // Simulate transfer (replace with actual implementation)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Mock transaction hash
      const mockTxHash = `0x${Math.random().toString(16).substring(2, 66)}`;
      setTxHash(mockTxHash);
      
      onTransferInitiate?.();
    } catch (err: any) {
      setTransferError(err.message || "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="bg-white/60 backdrop-blur-md rounded-xl p-6 my-3 border-2 border-purple-200 shadow-elevation-md animate-fade-in-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
          <span className="text-2xl">💸</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Transfer Tokens</h3>
          <p className="text-sm text-gray-600">Movement Network</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Amount:</span>
          <span className="text-sm font-semibold text-gray-900">
            {amount} {tokenSymbol || token}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">From:</span>
          <span className="text-sm text-gray-600 font-mono">
            {fromAddress.slice(0, 6)}...{fromAddress.slice(-4)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">To:</span>
          <span className="text-sm text-gray-600 font-mono">
            {toAddress.slice(0, 6)}...{toAddress.slice(-4)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Network:</span>
          <span className="text-sm text-gray-600">{network}</span>
        </div>
      </div>

      {txHash && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs text-green-800 mb-1">Transaction Hash:</p>
          <p className="text-xs font-mono text-green-900 break-all">{txHash}</p>
        </div>
      )}

      {transferError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{transferError}</p>
        </div>
      )}

      <button
        onClick={handleTransfer}
        disabled={transferring || !!txHash}
        className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
          transferring || txHash
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-purple-600 text-white hover:bg-purple-700 active:scale-95"
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

