"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

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
 * - Uses React Portal to render at document root for consistent positioning across all routes
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
  const [mounted, setMounted] = useState(false);
  const defaultExplorerUrl = `https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`;
  const finalExplorerUrl = explorerUrl || defaultExplorerUrl;

  // Ensure component only renders on client side (for portal)
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset visibility when txHash changes (e.g., new transaction)
  // This ensures each new transaction gets a fresh notification instance
  useEffect(() => {
    setIsVisible(true);
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

  if (!isVisible || !mounted) return null;

  const notificationContent = (
    <div
      className="fixed top-3 right-3 sm:top-4 sm:right-4 z-[99999] w-auto max-w-sm animate-slide-in-right"
      role="alert"
      aria-live="polite"
    >
      <div className="relative p-3 sm:p-4 rounded-xl bg-gradient-to-br from-green-50 via-green-50/95 to-emerald-50 dark:from-green-900/30 dark:via-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700/50 shadow-xl backdrop-blur-xl">
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
        <div className="flex items-center gap-3 pr-7">
          <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30">
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
            <h3 className="text-sm sm:text-base font-bold text-green-900 dark:text-green-100">
              Transaction Successful! 🎉
            </h3>
            <a
              href={finalExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs sm:text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium transition-colors group"
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
              <span>View on Explorer</span>
            </a>
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

  // Use portal to render at document root for consistent positioning across all routes
  return typeof window !== "undefined" && document.body
    ? createPortal(notificationContent, document.body)
    : null;
}
