"use client";

import React from "react";
import { getTokenIconUrl } from "../../utils/token-icons";
import { TokenBalance } from "../../types";

interface AssetsListProps {
  balances: TokenBalance[];
  loadingBalances: boolean;
  balanceError: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  displayLimit: number;
  onDisplayLimitChange: (limit: number) => void;
  tokenPrices: Record<string, number>;
  onTokenTransferClick: (token: TokenBalance) => void;
  filteredBalances: TokenBalance[];
}

export default function AssetsList({
  balances,
  loadingBalances,
  balanceError,
  searchQuery,
  onSearchChange,
  displayLimit,
  onDisplayLimitChange,
  tokenPrices,
  onTokenTransferClick,
  filteredBalances,
}: AssetsListProps) {
  const displayedBalances = filteredBalances.slice(0, displayLimit);
  const hasMore = filteredBalances.length > displayLimit;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Assets {balances.length > 0 && `(${balances.length})`}
        </h3>
        {loadingBalances && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"></div>
        )}
      </div>

      {/* Search Bar */}
      {balances.length > 0 && (
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-4 w-4 sm:h-5 sm:w-5 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              onDisplayLimitChange(10);
            }}
            placeholder="Search assets..."
            className="w-full pl-9 sm:pl-10 pr-8 sm:pr-10 py-2 sm:py-2.5 text-sm sm:text-base rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange("");
                onDisplayLimitChange(10);
              }}
              className="absolute inset-y-0 right-0 pr-2 sm:pr-3 flex items-center"
            >
              <svg
                className="h-4 w-4 sm:h-5 sm:w-5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {balanceError && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          {balanceError}
        </div>
      )}

      {!loadingBalances && balances.length === 0 && !balanceError && (
        <div className="p-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">No assets found</p>
        </div>
      )}

      {!loadingBalances && filteredBalances.length === 0 && searchQuery && (
        <div className="p-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            No assets found matching "{searchQuery}"
          </p>
        </div>
      )}

      <div className="space-y-3">
        {displayedBalances.map((balance) => {
          const amount = parseFloat(balance.formattedAmount);
          const formattedAmount = amount.toLocaleString(undefined, {
            minimumFractionDigits: amount < 1 ? 6 : 2,
            maximumFractionDigits: amount < 1 ? 8 : 6,
          });
          const isNative = balance.isNative;
          const symbol = balance.metadata.symbol.toUpperCase();
          const symbolWithoutE = symbol.replace(/\.E$/, "");
          // Try to find price with original symbol first, then without .E suffix
          const price =
            tokenPrices[symbol] || tokenPrices[symbolWithoutE] || 0;
          const usdValue = amount * price;
          const formattedUsdValue =
            usdValue > 0
              ? usdValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : null;

          return (
            <div key={balance.assetType}>
              {/* Mobile version with liquid styling */}
              <div className="md:hidden group relative rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                {/* Animated liquid gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-100/60 via-blue-100/40 to-green-100/60 dark:from-purple-950/50 dark:via-blue-950/40 dark:to-green-950/50 liquid-flow"></div>

                {/* Continuously animated liquid blobs */}
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-purple-400/30 dark:bg-purple-500/20 rounded-full blur-3xl liquid-blob-1"></div>
                <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-blue-400/30 dark:bg-blue-500/20 rounded-full blur-3xl liquid-blob-2"></div>
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-green-400/20 dark:bg-green-500/15 rounded-full blur-2xl liquid-blob-1"
                  style={{ animationDelay: "2s" }}
                ></div>

                {/* Glassmorphism card with liquid border effect */}
                <div className="relative backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-2 border-purple-200/50 dark:border-purple-800/50 p-4 rounded-2xl shadow-xl group-hover:shadow-2xl group-hover:border-purple-300/70 dark:group-hover:border-purple-600/70 transition-all duration-300 overflow-hidden">
                  {/* Liquid shimmer overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent liquid-shimmer pointer-events-none"></div>
                  {/* Liquid wave at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-400/50 via-blue-400/50 to-green-400/50 dark:from-purple-500/40 dark:via-blue-500/40 dark:to-green-500/40 liquid-flow"></div>
                  <div className="flex items-center justify-between gap-3 relative z-10">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Enhanced token icon with liquid effect */}
                      <div
                        className={`relative flex-shrink-0 w-14 h-14 rounded-2xl overflow-hidden ${
                          isNative
                            ? "bg-gradient-to-br from-purple-400 via-purple-500 to-blue-500 dark:from-purple-600 dark:via-purple-700 dark:to-blue-600 shadow-lg shadow-purple-500/40 dark:shadow-purple-600/30 liquid-flow"
                            : "bg-gradient-to-br from-zinc-200 via-zinc-300 to-zinc-400 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-500 shadow-md"
                        } flex items-center justify-center border-2 ${
                          isNative
                            ? "border-purple-300/70 dark:border-purple-500/70"
                            : "border-zinc-300/50 dark:border-zinc-600/50"
                        } group-hover:scale-110 transition-transform duration-300`}
                      >
                        {/* Continuous liquid shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent liquid-shimmer pointer-events-none"></div>

                        {(() => {
                          const iconUrl = getTokenIconUrl(
                            balance.metadata.symbol,
                            balance.assetType
                          );
                          if (iconUrl) {
                            return (
                              <>
                                <img
                                  src={iconUrl}
                                  alt={balance.metadata.symbol}
                                  className="w-full h-full object-cover relative z-10"
                                  onError={(e) => {
                                    const target =
                                      e.target as HTMLImageElement;
                                    target.style.display = "none";
                                    const fallback =
                                      target.nextElementSibling as HTMLElement;
                                    if (fallback) {
                                      fallback.style.display = "flex";
                                    }
                                  }}
                                />
                                <div
                                  className={`hidden items-center justify-center w-full h-full text-base font-bold relative z-10 ${
                                    isNative
                                      ? "text-white"
                                      : "text-zinc-700 dark:text-zinc-200"
                                  }`}
                                >
                                  {balance.metadata.symbol.length <= 4
                                    ? balance.metadata.symbol
                                    : balance.metadata.symbol.charAt(0)}
                                </div>
                              </>
                            );
                          }
                          return (
                            <span
                              className={`text-base font-bold relative z-10 ${
                                isNative
                                  ? "text-white"
                                  : "text-zinc-700 dark:text-zinc-200"
                              }`}
                            >
                              {balance.metadata.symbol.length <= 4
                                ? balance.metadata.symbol
                                : balance.metadata.symbol.charAt(0)}
                            </span>
                          );
                        })()}

                        {/* Native token indicator with pulse */}
                        {isNative && (
                          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full border-2 border-white dark:border-zinc-900 z-20 shadow-lg shadow-purple-500/50 animate-pulse"></div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-50 truncate mb-0.5">
                          {balance.metadata.symbol}
                        </h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {balance.metadata.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                          {formattedAmount}
                        </p>
                        {formattedUsdValue ? (
                          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mt-0.5">
                            ${formattedUsdValue}
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {balance.metadata.symbol}
                          </p>
                        )}
                      </div>

                      {/* Enhanced transfer button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTokenTransferClick(balance);
                        }}
                        className="flex-shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 text-white shadow-md shadow-purple-500/30 dark:shadow-purple-600/20 hover:shadow-lg hover:shadow-purple-500/40 dark:hover:shadow-purple-600/30 hover:scale-110 active:scale-95 transition-all duration-200"
                        title="Transfer"
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
                            strokeWidth={2.5}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop version */}
              <div className="hidden md:block group relative rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900 transition-all duration-200 hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 hover:-translate-y-0.5">
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div
                      className={`relative flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden ${
                        isNative
                          ? "bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 border-2 border-purple-300 dark:border-purple-700"
                          : "bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 border border-zinc-300 dark:border-zinc-600"
                      } flex items-center justify-center shadow-sm`}
                    >
                      {(() => {
                        const iconUrl = getTokenIconUrl(
                          balance.metadata.symbol,
                          balance.assetType
                        );
                        if (iconUrl) {
                          return (
                            <>
                              <img
                                src={iconUrl}
                                alt={balance.metadata.symbol}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target =
                                    e.target as HTMLImageElement;
                                  target.style.display = "none";
                                  const fallback =
                                    target.nextElementSibling as HTMLElement;
                                  if (fallback) {
                                    fallback.style.display = "flex";
                                  }
                                }}
                              />
                              <div
                                className={`hidden items-center justify-center w-full h-full text-sm sm:text-lg font-bold ${
                                  isNative
                                    ? "text-purple-700 dark:text-purple-300"
                                    : "text-zinc-700 dark:text-zinc-300"
                                }`}
                              >
                                {balance.metadata.symbol.length <= 4
                                  ? balance.metadata.symbol
                                  : balance.metadata.symbol.charAt(0)}
                              </div>
                            </>
                          );
                        }
                        return (
                          <span
                            className={`text-sm sm:text-lg font-bold ${
                              isNative
                                ? "text-purple-700 dark:text-purple-300"
                                : "text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            {balance.metadata.symbol.length <= 4
                              ? balance.metadata.symbol
                              : balance.metadata.symbol.charAt(0)}
                          </span>
                        );
                      })()}
                      {isNative && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-purple-500 rounded-full border-2 border-white dark:border-zinc-900 z-10"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                        {balance.metadata.symbol}
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate hidden sm:block">
                        {balance.metadata.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-50">
                        {formattedAmount}
                      </p>
                      {formattedUsdValue ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          ${formattedUsdValue}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                          {balance.metadata.symbol}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTokenTransferClick(balance);
                      }}
                      className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-all hover:scale-110 active:scale-95"
                      title="Transfer"
                    >
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
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show More Button */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => onDisplayLimitChange(displayLimit + 10)}
            className="px-6 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Show More ({filteredBalances.length - displayLimit} remaining)
          </button>
        </div>
      )}

      {/* Show Less Button */}
      {displayLimit > 10 && !hasMore && filteredBalances.length > 10 && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => onDisplayLimitChange(10)}
            className="px-6 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Show Less
          </button>
        </div>
      )}
    </div>
  );
}
