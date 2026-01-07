"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMovementWallet } from "../../../hooks/useMovementWallet";
import { getTokenBySymbol, getAllTokens } from "../../../utils/token-constants";
import {
  getQuote,
  getMosaicAssetFormat,
  type MosaicQuoteResponse,
} from "../../../utils/mosaic-api";
import { Network } from "@aptos-labs/ts-sdk";
import { useMovementConfig } from "@/app/hooks/useMovementConfig";
import { TokenBalance } from "../../../types";
import { useSwap } from "../../../hooks/useSwap";
import { useBalance } from "@/app/hooks/useBalanceContext";
import { createAptosClient } from "../../../utils/aptos-client";
import { TransactionSuccessMessage } from "../../shared/TransactionSuccessMessage";

// Mosaic API is used for quotes and routing - no hardcoded routes needed

interface SwapCardProps {
  walletAddress?: string | null;
  initialFromToken?: string;
  initialToToken?: string;
}

// Helper to normalize token symbol for display (USDC.e -> USDC, USDT.e -> USDT)
const normalizeTokenForDisplay = (symbol: string): string => {
  const upperSymbol = symbol?.toUpperCase() || "";
  if (upperSymbol === "USDC" || upperSymbol === "USDC.E") {
    return "USDC"; // Display as USDC
  }
  if (upperSymbol === "USDT" || upperSymbol === "USDT.E") {
    return "USDT"; // Display as USDT
  }
  return upperSymbol;
};

export const SwapCard: React.FC<SwapCardProps> = ({
  walletAddress,
  initialFromToken,
  initialToToken,
}) => {
  const { ready, authenticated } = usePrivy();
  const config = useMovementConfig();
  const { setWalletAddress: setBalanceContextWalletAddress } = useBalance();

  // Create Aptos instance using shared utility
  const aptos = useMemo(() => {
    return createAptosClient({
      movementFullNode: config.movementFullNode,
      network: Network.MAINNET,
    });
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

  const [fromToken, setFromToken] = useState<string>(
    normalizeTokenForDisplay(initialFromToken || "MOVE")
  );
  const [toToken, setToToken] = useState<string>(
    normalizeTokenForDisplay(initialToToken || "USDC")
  );
  const [fromAmount, setFromAmount] = useState<string>("");

  // Update tokens when initial props change (normalize for display)
  useEffect(() => {
    if (initialFromToken) {
      setFromToken(normalizeTokenForDisplay(initialFromToken));
    }
  }, [initialFromToken]);

  useEffect(() => {
    if (initialToToken) {
      setToToken(normalizeTokenForDisplay(initialToToken));
    }
  }, [initialToToken]);
  const [toAmount, setToAmount] = useState<string>("");
  const [slippage, setSlippage] = useState<number>(1.0);
  const [fromBalance, setFromBalance] = useState<string | null>(null);
  const [toBalance, setToBalance] = useState<string | null>(null);
  const [loadingFromBalance, setLoadingFromBalance] = useState(false);
  const [loadingToBalance, setLoadingToBalance] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quote, setQuote] = useState<MosaicQuoteResponse | null>(null);

  // Get all available tokens from token-constants
  // Map USDC.e -> USDC and USDT.e -> USDT for display, but use .e versions internally
  const availableTokens = useMemo(() => {
    const allTokens = getAllTokens();
    // Extract unique symbols - map USDC.e -> USDC and USDT.e -> USDT for display
    const symbolMap = new Map<string, string>();
    allTokens.forEach((token) => {
      const upperSymbol = token.symbol.toUpperCase();
      // Map USDC.e -> USDC and USDT.e -> USDT for display
      let displaySymbol = upperSymbol;
      if (upperSymbol === "USDC.E") {
        displaySymbol = "USDC";
      } else if (upperSymbol === "USDT.E") {
        displaySymbol = "USDT";
      }
      // Store original symbol for the display key
      if (!symbolMap.has(displaySymbol)) {
        symbolMap.set(displaySymbol, token.symbol);
      }
    });
    return Array.from(symbolMap.keys()).sort();
  }, []);

  // Helper to normalize token symbol for lookup
  // Maps USDC -> USDC.e and USDT -> USDT.e for internal use
  const normalizeTokenForLookup = (symbol: string): string => {
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol === "USDC") {
      return "USDC.e";
    }
    if (upperSymbol === "USDT") {
      return "USDT.e";
    }
    return symbol;
  };

  // Get full token info from token-constants for Mosaic API
  // Normalize USDC -> USDC.e and USDT -> USDT.e before lookup
  const fromTokenFullInfo = useMemo(() => {
    const normalized = normalizeTokenForLookup(fromToken);
    return getTokenBySymbol(normalized);
  }, [fromToken]);

  const toTokenFullInfo = useMemo(() => {
    const normalized = normalizeTokenForLookup(toToken);
    return getTokenBySymbol(normalized);
  }, [toToken]);

  const movementWallet = useMovementWallet();

  // Use swap hook for centralized swap logic
  const swap = useSwap({
    aptos,
    movementChainId,
    onSuccess: () => {
      setFromAmount("");
      setToAmount("");
      setQuote(null);
    },
  });

  // Fetch balance for fromToken
  useEffect(() => {
    if (!walletAddress || !fromToken) {
      setFromBalance(null);
      return;
    }

    const fetchFromBalance = async () => {
      setLoadingFromBalance(true);
      try {
        // Fetch all balances without token filter for better matching
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();

        if (data.success && data.balances && data.balances.length > 0) {
          // Find the matching token balance - case-insensitive comparison with partial matching
          // Handles cases like "USDC" matching "USDC.e" and vice versa
          const normalizedFromToken = fromToken
            .toUpperCase()
            .replace(/\./g, "")
            .trim();

          const tokenBalance = data.balances.find((b: TokenBalance) => {
            const normalizedSymbol = b.metadata.symbol
              .toUpperCase()
              .replace(/\./g, "")
              .trim();

            // Exact match or partial match (e.g., "USDC" matches "USDC.E")
            return (
              normalizedSymbol === normalizedFromToken ||
              normalizedSymbol.startsWith(normalizedFromToken) ||
              normalizedFromToken.startsWith(normalizedSymbol)
            );
          });

          if (tokenBalance) {
            setFromBalance(tokenBalance.formattedAmount);
          } else {
            // Token not found in user's balances - set to "0" to display it
            console.log(
              "Balance not found for token:",
              fromToken,
              "Available:",
              data.balances.map((b: TokenBalance) => b.metadata.symbol)
            );
            setFromBalance("0.000000");
          }
        } else {
          setFromBalance("0.000000");
        }
      } catch (error) {
        console.error("Error fetching from balance:", error);
        setFromBalance(null);
      } finally {
        setLoadingFromBalance(false);
      }
    };

    fetchFromBalance();
  }, [walletAddress, fromToken]);

  // Fetch balance for toToken
  useEffect(() => {
    if (!walletAddress || !toToken) {
      setToBalance(null);
      return;
    }

    const fetchToBalance = async () => {
      setLoadingToBalance(true);
      try {
        // Fetch all balances without token filter for better matching
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();
        if (data.success && data.balances && data.balances.length > 0) {
          // Find the matching token balance - case-insensitive comparison with partial matching
          // Handles cases like "USDC" matching "USDC.e" and vice versa
          const normalizedToToken = toToken
            .toUpperCase()
            .replace(/\./g, "")
            .trim();

          const tokenBalance = data.balances.find((b: TokenBalance) => {
            const normalizedSymbol = b.metadata.symbol
              .toUpperCase()
              .replace(/\./g, "")
              .trim();

            // Exact match or partial match (e.g., "USDC" matches "USDC.E")
            return (
              normalizedSymbol === normalizedToToken ||
              normalizedSymbol.startsWith(normalizedToToken) ||
              normalizedToToken.startsWith(normalizedSymbol)
            );
          });

          if (tokenBalance) {
            setToBalance(tokenBalance.formattedAmount);
          } else {
            // Token not found in user's balances - set to "0" to display it
            console.log(
              "Balance not found for token:",
              toToken,
              "Available:",
              data.balances.map((b: TokenBalance) => b.metadata.symbol)
            );
            setToBalance("0");
          }
        } else {
          setToBalance("0");
        }
      } catch (error) {
        console.error("Error fetching to balance:", error);
        setToBalance(null);
      } finally {
        setLoadingToBalance(false);
      }
    };

    fetchToBalance();
  }, [walletAddress, toToken]);

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  // Fetch quote from Mosaic API when amount or tokens change
  useEffect(() => {
    const fetchQuote = async () => {
      if (
        !fromAmount ||
        isNaN(parseFloat(fromAmount)) ||
        parseFloat(fromAmount) <= 0 ||
        !fromTokenFullInfo ||
        !toTokenFullInfo ||
        fromToken === toToken ||
        !walletAddress
      ) {
        setToAmount("");
        setQuote(null);
        return;
      }

      setLoadingQuote(true);
      try {
        const amountInSmallestUnit = Math.floor(
          parseFloat(fromAmount) * Math.pow(10, fromTokenFullInfo.decimals)
        );

        const srcAsset = getMosaicAssetFormat(fromTokenFullInfo);
        const dstAsset = getMosaicAssetFormat(toTokenFullInfo);
        const slippageBps = Math.floor(slippage * 100); // Convert percentage to basis points

        const quoteResponse = await getQuote(
          {
            srcAsset,
            dstAsset,
            amount: amountInSmallestUnit.toString(),
            sender: walletAddress,
            slippage: slippageBps,
          },
          config.mosaicApiBaseUrl
        );

        setQuote(quoteResponse);

        // Calculate output amount
        const dstAmount = quoteResponse.data.dstAmount;
        const dstAmountFormatted =
          dstAmount / Math.pow(10, toTokenFullInfo.decimals);
        setToAmount(dstAmountFormatted.toFixed(6));
      } catch (error: unknown) {
        console.error("Error fetching quote:", (error as Error).message);
        setToAmount("");
        setQuote(null);
        // Don't show error to user for quote failures - just clear the output
      } finally {
        setLoadingQuote(false);
      }
    };

    // Debounce quote fetching
    const timeoutId = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [
    fromAmount,
    fromToken,
    toToken,
    fromTokenFullInfo,
    toTokenFullInfo,
    walletAddress,
    slippage,
    config.mosaicApiBaseUrl,
  ]);

  const handleFromAmountChange = (value: string) => {
    // Only allow numbers and decimal point
    const numericValue = value.replace(/[^0-9.]/g, "");
    // Prevent multiple decimal points
    const parts = numericValue.split(".");
    const formattedValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : numericValue;
    setFromAmount(formattedValue);
    // Quote will be fetched automatically via useEffect
  };

  const handleSwap = async () => {
    if (!fromTokenFullInfo || !toTokenFullInfo) {
      return;
    }

    await swap.handleSwap(fromToken, toToken, fromAmount, quote, fromBalance);
  };

  const canSwap = useMemo(() => {
    return (
      ready &&
      authenticated &&
      walletAddress &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      fromToken !== toToken &&
      !swap.swapping &&
      !!quote &&
      !loadingQuote
    );
  }, [
    ready,
    authenticated,
    walletAddress,
    fromAmount,
    fromToken,
    toToken,
    swap.swapping,
    quote,
    loadingQuote,
  ]);

  return (
    <div className="w-full">
      <div className="relative rounded-2xl overflow-hidden">
        {/* Enhanced background decoration */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-gradient-to-br from-purple-500/15 via-violet-500/10 to-purple-500/15 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-tr from-violet-500/15 via-purple-500/10 to-violet-500/15 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "3s" }}
        />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-30" />

        <div className="p-4 sm:p-5 md:p-6">
          {/* Header */}
          <div className="relative flex items-center gap-2 sm:gap-3 mb-3 sm:mb-5">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-white"
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
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Swap Tokens
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                Exchange tokens on Movement
              </p>
            </div>
          </div>

          {/* From Token */}
          <div className="relative mb-1">
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              You Pay
            </label>
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm p-3 sm:p-4 hover:border-purple-300/60 dark:hover:border-purple-600/60 hover:shadow-md hover:shadow-purple-500/10 transition-all duration-200">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <input
                  type="text"
                  inputMode="decimal"
                  value={fromAmount}
                  onChange={(e) => handleFromAmountChange(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 min-w-0 bg-transparent text-base sm:text-lg md:text-xl font-bold text-zinc-900 dark:text-zinc-50 placeholder-zinc-400/60 focus:outline-none overflow-hidden"
                  disabled={swap.swapping}
                />
                <select
                  value={fromToken}
                  onChange={(e) => setFromToken(e.target.value)}
                  className="flex-shrink-0 w-[85px] sm:w-[95px] md:w-[100px] px-1.5 sm:px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer text-[10px] sm:text-xs truncate"
                  disabled={swap.swapping}
                >
                  {availableTokens.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1.5 sm:mt-2 flex items-center justify-between">
                <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  Balance:{" "}
                  {loadingFromBalance ? (
                    <span className="inline-block animate-pulse">...</span>
                  ) : fromBalance !== null ? (
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {parseFloat(fromBalance).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                    </span>
                  ) : (
                    <span>--</span>
                  )}
                </p>
                {fromBalance !== null && parseFloat(fromBalance) > 0 && (
                  <button
                    onClick={() => setFromAmount(fromBalance)}
                    className="px-2.5 sm:px-3 py-1 rounded-lg bg-gradient-to-r from-purple-100 to-violet-100 dark:from-purple-900/40 dark:to-violet-900/40 text-purple-700 dark:text-purple-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:from-purple-200 hover:to-violet-200 dark:hover:from-purple-800/50 dark:hover:to-violet-800/50 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                    disabled={swap.swapping}
                  >
                    Max
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="relative flex justify-center py-2 z-10">
            <button
              onClick={handleSwapTokens}
              disabled={swap.swapping}
              className="p-2.5 rounded-xl bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm border border-zinc-200/80 dark:border-zinc-700/60 shadow-lg hover:shadow-xl text-zinc-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all duration-200 hover:scale-110 hover:border-purple-300/60 dark:hover:border-purple-600/60 disabled:opacity-50"
              aria-label="Swap tokens"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
            </button>
          </div>

          {/* To Token */}
          <div className="relative mb-3 sm:mb-4">
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              You Receive
            </label>
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm p-3 sm:p-4 hover:border-purple-300/60 dark:hover:border-purple-600/60 hover:shadow-md hover:shadow-purple-500/10 transition-all duration-200">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0 relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={loadingQuote ? "" : toAmount}
                    readOnly
                    placeholder={loadingQuote ? "Getting quote..." : "0.0"}
                    className="w-full bg-transparent text-base sm:text-lg md:text-xl font-semibold text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none overflow-hidden"
                  />
                  {loadingQuote && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2">
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                <select
                  value={toToken}
                  onChange={(e) => setToToken(e.target.value)}
                  className="flex-shrink-0 w-[85px] sm:w-[95px] md:w-[100px] px-2 sm:px-2.5 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm text-zinc-900 dark:text-zinc-50 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/40 cursor-pointer text-[10px] sm:text-xs truncate hover:border-purple-300/60 dark:hover:border-purple-600/60 transition-all duration-200"
                  disabled={swap.swapping}
                >
                  {availableTokens.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1.5 sm:mt-2">
                <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  Balance:{" "}
                  {loadingToBalance ? (
                    <span className="inline-block animate-pulse">...</span>
                  ) : toBalance !== null ? (
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {parseFloat(toBalance).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                    </span>
                  ) : (
                    <span>--</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Slippage Tolerance */}
          <div className="relative mb-3 sm:mb-4 p-2 sm:p-3 rounded-lg sm:rounded-xl bg-zinc-50/80 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <label className="text-[10px] sm:text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1 sm:gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
                Slippage
              </label>
              <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[10px] sm:text-xs font-bold">
                {slippage}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={slippage}
              onChange={(e) => setSlippage(parseFloat(e.target.value))}
              className="w-full h-1.5 sm:h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 sm:[&::-webkit-slider-thumb]:w-4 sm:[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-r [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-violet-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-purple-500/30 [&::-webkit-slider-thumb]:cursor-pointer"
              disabled={swap.swapping}
            />
            <div className="flex justify-between text-[10px] sm:text-xs text-zinc-400 mt-1.5 sm:mt-2">
              <span>0.1%</span>
              <span>5%</span>
            </div>
          </div>

          {/* Error Message */}
          {swap.error && (
            <div className="relative mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
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
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {swap.error}
            </div>
          )}

          {/* Success Message */}
          {swap.txHash && <TransactionSuccessMessage txHash={swap.txHash} />}

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={!canSwap}
            className={`relative w-full py-4 rounded-xl text-base font-bold transition-all duration-300 overflow-hidden group ${
              canSwap
                ? "bg-gradient-to-r from-purple-600 via-violet-600 to-purple-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
            }`}
          >
            {canSwap && (
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {swap.swapping ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {swap.step || "Swapping..."}
                </>
              ) : swap.txHash ? (
                <>
                  <svg
                    className="w-5 h-5"
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
                  Swap Complete
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  Swap {fromToken} → {toToken}
                </>
              )}
            </span>
          </button>

          {!walletAddress && (
            <p className="relative mt-4 text-sm text-center text-zinc-500 dark:text-zinc-400">
              Connect your Movement wallet to swap tokens
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
