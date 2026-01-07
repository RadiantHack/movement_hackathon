"use client";

import React, { useState, useEffect } from "react";

/**
 * TransactionSuccessMessage Component
 *
 * A modern, self-managing toast notification for displaying transaction success messages.
 * Features:
 * - Self-manages visibility state (shows for 5 seconds then auto-dismisses)
 * - Prominent display with smooth animations
 * - Dismissible with close button
 * - Action buttons (View Transaction, Copy Hash)
 * - Compact design for mobile and desktop
 * - Modern design with glassmorphism effect
 *
 * @param txHash - The transaction hash to display
 * @param explorerUrl - Optional custom explorer URL (defaults to Movement Network explorer)
 * @param onClose - Optional callback when notification is closed (called after auto-dismiss or manual close)
 * @param autoClose - Whether to auto-close after timeout (default: true)
 * @param duration - Auto-close duration in milliseconds (default: 5000)
 */
interface TransactionSuccessMessageProps {
  txHash: string;
  explorerUrl?: string;
  onClose?: () => void;
  autoClose?: boolean;
  duration?: number;
}

export function TransactionSuccessMessage({
  txHash,
  explorerUrl,
  onClose,
  autoClose = true,
  duration = 5000,
}: TransactionSuccessMessageProps): React.JSX.Element | null {
  const [isVisible, setIsVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const defaultExplorerUrl = `https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`;
  const finalExplorerUrl = explorerUrl || defaultExplorerUrl;

  // Reset visibility when txHash changes (e.g., new transaction)
  // This ensures each new transaction gets a fresh notification instance
  useEffect(() => {
    setIsVisible(true);
    // Reset copied state when txHash changes
    setCopied(false);
  }, [txHash]);

  const handleClose = React.useCallback(() => {
    setIsVisible(false);
    // Small delay for animation before calling onClose
    setTimeout(() => {
      onClose?.();
    }, 300);
  }, [onClose]);

  // Auto-dismiss functionality - self-managing
  useEffect(() => {
    if (autoClose && isVisible) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [autoClose, duration, isVisible, handleClose]);

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed top-3 right-3 sm:top-4 sm:right-4 xl:right-[21rem] z-[99999] w-[calc(100%-1.5rem)] sm:w-auto sm:max-w-sm animate-slide-in-right"
      role="alert"
      aria-live="polite"
    >
      <div className="relative p-3 sm:p-4 rounded-xl bg-gradient-to-br from-green-50 via-green-50/95 to-emerald-50 dark:from-green-900/30 dark:via-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-700/50 shadow-2xl backdrop-blur-xl">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 p-1 rounded-md text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50"
          aria-label="Close notification"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Success Icon & Title */}
        <div className="flex items-start gap-2.5 pr-7">
          <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30">
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-green-900 dark:text-green-100 mb-0.5">
              Transaction Successful! 🎉
            </h3>
            <p className="text-xs sm:text-sm text-green-700 dark:text-green-300 mb-2.5">
              Your transaction has been confirmed.
            </p>

            {/* Transaction Hash - Compact */}
            <div className="mb-3 p-2 rounded-lg bg-white/60 dark:bg-zinc-800/60 border border-green-200/50 dark:border-green-700/30">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] sm:text-xs font-mono text-green-800 dark:text-green-200 break-all flex-1 line-clamp-2">
                  {txHash}
                </p>
                <button
                  onClick={handleCopyHash}
                  className="flex-shrink-0 p-1 rounded-md hover:bg-green-100 dark:hover:bg-green-800/50 transition-colors"
                  title="Copy transaction hash"
                >
                  {copied ? (
                    <svg
                      className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons - Compact */}
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={finalExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold text-xs sm:text-sm transition-all duration-200 shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 flex items-center justify-center gap-1.5 group"
              >
                <svg
                  className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                <span className="hidden sm:inline">View on Explorer</span>
                <span className="sm:hidden">View</span>
              </a>
              <button
                onClick={handleClose}
                className="px-3 py-2 rounded-lg bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-700 text-green-700 dark:text-green-300 font-medium text-xs sm:text-sm border border-green-200 dark:border-green-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar for Auto-Close */}
        {autoClose && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-200/30 dark:bg-green-800/30 rounded-b-xl overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 animate-progress-bar"
              style={{
                animationDuration: `${duration}ms`,
                animationTimingFunction: "linear",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
