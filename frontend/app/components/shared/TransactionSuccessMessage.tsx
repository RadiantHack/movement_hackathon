"use client";

import React from "react";

/**
 * TransactionSuccessMessage Component
 *
 * A reusable component for displaying transaction success messages with transaction hash.
 * Follows DRY principle to avoid code duplication across transaction components.
 *
 * @param txHash - The transaction hash to display
 * @param explorerUrl - Optional custom explorer URL (defaults to Movement Network explorer)
 */
interface TransactionSuccessMessageProps {
  txHash: string;
  explorerUrl?: string;
}

export function TransactionSuccessMessage({
  txHash,
  explorerUrl,
}: TransactionSuccessMessageProps): React.JSX.Element {
  const defaultExplorerUrl = `https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`;
  const finalExplorerUrl = explorerUrl || defaultExplorerUrl;

  return (
    <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-400">
      <div className="flex items-center gap-2 flex-wrap">
        <svg
          className="w-5 h-5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="font-medium">Transaction successful!</span>
        <a
          href={finalExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 underline font-semibold flex items-center gap-1"
        >
          View Transaction
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
      <div className="mt-2 text-xs font-mono text-green-600 dark:text-green-400 break-all">
        {txHash}
      </div>
    </div>
  );
}
