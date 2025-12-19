"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import {
  MOVEMENT_TOKENS,
  getTokenInfo,
  type TokenInfo,
} from "../../../utils/tokens";
import { getTokenBySymbol, getAllTokens } from "../../../utils/token-constants";
import {
  getQuote,
  getMosaicAssetFormat,
  type MosaicQuoteResponse,
} from "../../../utils/mosaic-api";
import {
  Aptos,
  AptosConfig,
  Network,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";

interface SwapCardProps {
  walletAddress: string | null;
  initialFromToken?: string;
  initialToToken?: string;
}

interface TokenBalance {
  assetType: string;
  amount: string;
  formattedAmount: string;
  metadata: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isNative: boolean;
}

// Movement Network configuration - Mainnet
const MOVEMENT_NETWORK = Network.MAINNET;
const MOVEMENT_FULLNODE = "https://full.mainnet.movementinfra.xyz/v1";
const MOVEMENT_CHAIN_ID = 126; // Mainnet chain ID

// Mosaic API is used for quotes and routing - no hardcoded routes needed

const aptos = new Aptos(
  new AptosConfig({
    network: MOVEMENT_NETWORK,
    fullnode: MOVEMENT_FULLNODE,
  })
);

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
  const { ready, authenticated, user } = usePrivy();
  const { signRawHash } = useSignRawHash();

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
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
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

  // Helper to get original symbol case from token-constants
  const getOriginalSymbol = (upperSymbol: string): string => {
    // Normalize first (USDC -> USDC.e)
    const normalized = normalizeTokenForLookup(upperSymbol);
    const token = getTokenBySymbol(normalized);
    return token?.symbol || normalized;
  };

  const fromTokenInfo = useMemo(() => {
    return getTokenInfo(fromToken);
  }, [fromToken]);

  const toTokenInfo = useMemo(() => {
    return getTokenInfo(toToken);
  }, [toToken]);

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

        const quoteResponse = await getQuote({
          srcAsset,
          dstAsset,
          amount: amountInSmallestUnit.toString(),
          sender: walletAddress,
          slippage: slippageBps,
        });

        setQuote(quoteResponse);

        // Calculate output amount
        const dstAmount = quoteResponse.data.dstAmount;
        const dstAmountFormatted =
          dstAmount / Math.pow(10, toTokenFullInfo.decimals);
        setToAmount(dstAmountFormatted.toFixed(6));
      } catch (error: any) {
        console.error("Error fetching quote:", error);
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
    if (!movementWallet) {
      setSwapError(
        "Movement wallet not found. Please create a Movement wallet first."
      );
      return;
    }

    if (!ready || !authenticated) {
      setSwapError("Please authenticate first.");
      return;
    }

    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setSwapError("Please enter a valid amount.");
      return;
    }

    if (fromToken === toToken) {
      setSwapError("Please select different tokens.");
      return;
    }

    if (!fromTokenFullInfo || !toTokenFullInfo) {
      setSwapError("Invalid token selection.");
      return;
    }

    if (!quote) {
      setSwapError("Please wait for quote to load.");
      return;
    }

    setSwapping(true);
    setSwapError(null);
    setTxHash(null);

    try {
      // Get Aptos wallet from user's linked accounts
      const aptosWallet = user?.linkedAccounts?.find(
        (a) => a.type === "wallet" && a.chainType === "aptos"
      ) as any;

      if (!aptosWallet) {
        throw new Error("Aptos wallet not found");
      }

      const senderAddress = aptosWallet.address as string;
      const senderPubKeyWithScheme = aptosWallet.publicKey as string;

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }

      const pubKeyNoScheme = senderPubKeyWithScheme.slice(2); // drop leading "00"

      // Validate token info (use full info from token-constants)
      if (!fromTokenFullInfo || !toTokenFullInfo) {
        throw new Error(
          `Invalid token selection. From: ${fromToken}, To: ${toToken}`
        );
      }

      // Use Mosaic quote transaction data
      if (!quote || !quote.data || !quote.data.tx) {
        throw new Error("Invalid quote. Please try again.");
      }

      const mosaicTx = quote.data.tx;

      // Build the swap transaction using Mosaic's transaction data
      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: {
          function: mosaicTx.function as `${string}::${string}::${string}`,
          typeArguments: mosaicTx.typeArguments,
          functionArguments: mosaicTx.functionArguments,
        },
      });

      // Override chain ID to match Movement Network mainnet
      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        const movementChainId = new ChainId(MOVEMENT_CHAIN_ID);
        txnObj.rawTransaction.chain_id = movementChainId;
      }

      // Generate signing message and hash
      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      // Sign the hash using Privy's signRawHash
      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash,
      });

      // Create authenticator from signature
      const publicKey = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
      const sig = new Ed25519Signature(signatureResponse.signature.slice(2)); // drop 0x from sig
      const senderAuthenticator = new AccountAuthenticatorEd25519(
        publicKey,
        sig
      );

      // Submit transaction
      const pending = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator,
      });

      // Wait for transaction to be executed
      const executed = await aptos.waitForTransaction({
        transactionHash: pending.hash,
      });

      console.log("Swap transaction executed:", executed.hash);
      setTxHash(executed.hash);

      // Refresh balances after successful swap
      const balanceResponse = await fetch(
        `/api/balance?address=${encodeURIComponent(walletAddress || senderAddress)}`
      );
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        if (
          balanceData.success &&
          balanceData.balances &&
          balanceData.balances.length > 0
        ) {
          // Update fromToken balance
          if (fromTokenFullInfo) {
            const normalizedFromToken = fromToken
              .toUpperCase()
              .replace(/\./g, "");
            const fromTokenBalance = balanceData.balances.find(
              (b: TokenBalance) => {
                const normalizedSymbol = b.metadata.symbol
                  .toUpperCase()
                  .replace(/\./g, "");
                return (
                  normalizedSymbol === normalizedFromToken ||
                  normalizedSymbol.startsWith(normalizedFromToken) ||
                  normalizedFromToken.startsWith(normalizedSymbol)
                );
              }
            );
            if (fromTokenBalance) {
              setFromBalance(fromTokenBalance.formattedAmount);
            }
          }

          // Update toToken balance
          if (toTokenFullInfo) {
            const normalizedToToken = toToken.toUpperCase().replace(/\./g, "");
            const toTokenBalance = balanceData.balances.find(
              (b: TokenBalance) => {
                const normalizedSymbol = b.metadata.symbol
                  .toUpperCase()
                  .replace(/\./g, "");
                return (
                  normalizedSymbol === normalizedToToken ||
                  normalizedSymbol.startsWith(normalizedToToken) ||
                  normalizedToToken.startsWith(normalizedSymbol)
                );
              }
            );
            if (toTokenBalance) {
              setToBalance(toTokenBalance.formattedAmount);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Swap error:", err);
      setSwapError(
        err.message ||
          "Swap failed. Please check your connection and try again."
      );
    } finally {
      setSwapping(false);
    }
  };

  const canSwap = useMemo(() => {
    return (
      ready &&
      authenticated &&
      walletAddress &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      fromToken !== toToken &&
      !swapping &&
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
    swapping,
    quote,
    loadingQuote,
  ]);

  return (
    <div className="w-full max-w-[440px] mx-auto">
      <div className="relative rounded-2xl p-5 sm:p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700/50 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />

        {/* Header */}
        <div className="relative flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30">
            <svg
              className="w-5 h-5 text-white"
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
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Swap Tokens
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Exchange tokens on Movement
            </p>
          </div>
        </div>

        {/* From Token */}
        <div className="relative mb-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            You Pay
          </label>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                placeholder="0.0"
                className="flex-1 min-w-0 bg-transparent text-xl font-semibold text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none"
                disabled={swapping}
              />
              <select
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
                className="flex-shrink-0 w-[100px] px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer text-xs"
                disabled={swapping}
              >
                {availableTokens.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                  className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                  disabled={swapping}
                >
                  Max
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="relative flex justify-center py-1 z-10">
          <button
            onClick={handleSwapTokens}
            disabled={swapping}
            className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-md hover:shadow-lg text-zinc-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all duration-200 hover:scale-110 disabled:opacity-50"
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
        <div className="relative mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            You Receive
          </label>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={loadingQuote ? "" : toAmount}
                  readOnly
                  placeholder={loadingQuote ? "Getting quote..." : "0.0"}
                  className="w-full bg-transparent text-xl font-semibold text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none"
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
                className="flex-shrink-0 w-[100px] px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer text-xs"
                disabled={swapping}
              >
                {availableTokens.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
        <div className="relative mb-4 p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Slippage
            </label>
            <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold">
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
            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-r [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-violet-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-purple-500/30 [&::-webkit-slider-thumb]:cursor-pointer"
            disabled={swapping}
          />
          <div className="flex justify-between text-xs text-zinc-400 mt-2">
            <span>0.1%</span>
            <span>5%</span>
          </div>
        </div>

        {/* Error Message */}
        {swapError && (
          <div className="relative mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {swapError}
          </div>
        )}

        {/* Transaction Hash */}
        {txHash && (
          <div className="relative mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50">
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-semibold text-green-800 dark:text-green-300">Swap Successful!</span>
            </div>
            <p className="text-[10px] font-mono text-green-700 dark:text-green-400 break-all mb-2 bg-green-100 dark:bg-green-900/30 p-1.5 rounded-md">
              {txHash}
            </p>
            <a
              href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-green-700 dark:text-green-400 hover:underline flex items-center gap-1"
            >
              View on Explorer
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={!canSwap}
          className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-md cursor-pointer ${
            canSwap
              ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
          }`}
        >
          {canSwap && (
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
          )}
          <span className="relative flex items-center justify-center gap-2">
            {swapping ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Swapping...
              </>
            ) : txHash ? (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Swap Complete
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
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
  );
};
