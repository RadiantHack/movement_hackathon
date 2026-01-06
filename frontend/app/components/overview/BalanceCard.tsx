"use client";

import React from "react";

interface BalanceCardProps {
  totalBalanceUsd: number;
  walletAddress: string | null;
  onTransferClick: () => void;
  onSwapClick: () => void;
  onBridgeClick: () => void;
  onShowQRCode: () => void;
}

export default function BalanceCard({
  totalBalanceUsd,
  walletAddress,
  onTransferClick,
  onSwapClick,
  onBridgeClick,
  onShowQRCode,
}: BalanceCardProps) {
  return (
    <>
      {/* Desktop Balance Card */}
      <div className="hidden md:block mb-6">
        <div className="relative rounded-lg border border-zinc-200 bg-white p-6 lg:p-8 dark:border-zinc-800 dark:bg-zinc-900 shadow-lg overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
              <div>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm font-medium mb-2">
                  Total Balance
                </p>
                <h2 className="text-3xl lg:text-5xl font-bold text-zinc-950 dark:text-zinc-50">
                  $
                  {totalBalanceUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </h2>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={onTransferClick}
                  className="flex-1 px-4 sm:px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 text-sm sm:text-base"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                    <span>Transfer</span>
                  </div>
                </button>
                <button
                  onClick={onSwapClick}
                  className="flex-1 px-4 sm:px-6 py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 text-sm sm:text-base"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                    <span>Swap</span>
                  </div>
                </button>
                <button
                  onClick={onBridgeClick}
                  className="flex-1 px-4 sm:px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 text-sm sm:text-base"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>Bridge</span>
                  </div>
                </button>
              </div>
            </div>
            {walletAddress && (
              <div className="mt-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs flex items-center gap-2">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    Wallet Address
                  </p>
                  <button
                    onClick={onShowQRCode}
                    className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                    title="Show QR Code"
                  >
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
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-zinc-900 dark:text-zinc-100 font-mono text-xs sm:text-sm break-all">
                  {walletAddress}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Balance Card */}
      <div className="md:hidden mb-4">
        <div className="relative rounded-lg border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-lg overflow-hidden">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/5 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/5 rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <p className="text-zinc-600 dark:text-zinc-400 text-xs font-medium mb-2">
              Total Balance
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 mb-4">
              $
              {totalBalanceUsd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h2>
            {walletAddress && (
              <div className="mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs">
                    Wallet
                  </p>
                  <button
                    onClick={onShowQRCode}
                    className="p-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                    title="Show QR Code"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-zinc-900 dark:text-zinc-100 font-mono text-xs break-all">
                  {walletAddress.slice(0, 6)}...
                  {walletAddress.slice(-4)}
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={onTransferClick}
                className="px-3 py-3 rounded-lg bg-purple-600 text-white font-semibold text-xs hover:bg-purple-700 transition-all duration-300 shadow-md active:scale-95"
              >
                <div className="flex flex-col items-center justify-center gap-1">
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
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  <span>Transfer</span>
                </div>
              </button>
              <button
                onClick={onSwapClick}
                className="px-3 py-3 rounded-lg bg-green-600 text-white font-semibold text-xs hover:bg-green-700 transition-all duration-300 shadow-md active:scale-95"
              >
                <div className="flex flex-col items-center justify-center gap-1">
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
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  <span>Swap</span>
                </div>
              </button>
              <button
                onClick={onBridgeClick}
                className="px-3 py-3 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-all duration-300 shadow-md active:scale-95"
              >
                <div className="flex flex-col items-center justify-center gap-1">
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span>Bridge</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
