"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMovementWallet } from "../../hooks/useMovementWallet";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useMovementConfig } from "../../hooks/useMovementConfig";
import { AssetIcon } from "../asset-icon";
import { executeBridge, isValidEthereumAddress } from "../../utils/bridge";
import { createAptosClient } from "../../utils/aptos-client";

const MOVEMENT_CHAIN = {
  id: "movement",
  name: "Movement",
  symbol: "MOVE",
};

const ETHEREUM_CHAIN = {
  id: "ethereum",
  name: "Ethereum",
  symbol: "ETH",
};

const TOKENS = [
  { symbol: "MOVE", name: "Move Coin" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "USDT", name: "Tether USD" },
  { symbol: "WETH", name: "Wrapped ETH" },
  { symbol: "WBTC", name: "Wrapped BTC" },
];

interface BridgeFormProps {
  walletAddress?: string | null;
}

export default function BridgeForm({ walletAddress }: BridgeFormProps) {
  const { ready, authenticated } = usePrivy();
  const movementWallet = useMovementWallet();
  const { signRawHash } = useSignRawHash();
  const config = useMovementConfig();

  const [token, setToken] = useState("MOVE");
  const [amount, setAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [bridging, setBridging] = useState(false);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number>(8);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  const aptos = useMemo(() => {
    return createAptosClient({
      movementFullNode: config.movementFullNode,
    });
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

  useEffect(() => {
    if (!walletAddress || !token) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      setLoadingBalance(true);
      try {
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}`
        );
        if (!response.ok) throw new Error("Failed to fetch balance");
        const data = await response.json();
        if (data.success && data.balances && data.balances.length > 0) {
          const normalizedToken = token.toUpperCase().replace(/\./g, "").trim();
          const tokenBalance = data.balances.find((b: any) => {
            const normalizedSymbol = b.metadata.symbol
              .toUpperCase()
              .replace(/\./g, "")
              .trim();
            return (
              normalizedSymbol === normalizedToken ||
              normalizedSymbol.startsWith(normalizedToken) ||
              normalizedToken.startsWith(normalizedSymbol)
            );
          });
          if (tokenBalance) {
            setBalance(tokenBalance.formattedAmount);
            setTokenDecimals(tokenBalance.metadata.decimals || 8);
          } else {
            setBalance("0.000000");
            setTokenDecimals(8);
          }
        } else {
          setBalance("0.000000");
        }
      } catch (err) {
        console.error("Error fetching balance:", err);
        setBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [walletAddress, token]);

  const handleBridge = async () => {
    if (!recipientAddress || !isValidEthereumAddress(recipientAddress)) return;
    if (!walletAddress || !movementWallet || !aptos) return;

    setBridging(true);
    try {
      const senderAddress = walletAddress;
      const senderPubKeyWithScheme = movementWallet.publicKey as string;

      // Execute bridge using utility function
      const txHash = await executeBridge({
        aptos: aptos!,
        movementChainId,
        senderAddress,
        senderPubKeyWithScheme,
        recipientAddress,
        amount,
        tokenDecimals,
        signRawHash,
      });

      alert(`Bridge transaction successful! Hash: ${txHash}`);
      setAmount("");
      setRecipientAddress("");
    } catch (error) {
      console.error("Bridge error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Bridge failed. Please try again.";
      alert(`Bridge failed: ${errorMessage}`);
    } finally {
      setBridging(false);
    }
  };

  const selectedToken = TOKENS.find((t) => t.symbol === token) || TOKENS[0];

  const tokenItems = TOKENS.map((t) => {
    return (
      <button
        key={t.symbol}
        onClick={() => {
          setToken(t.symbol);
          setShowTokenDropdown(false);
        }}
        className={`w-full flex items-center gap-2.5 sm:gap-3 p-3 sm:p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors active:scale-[0.98] ${
          token === t.symbol ? "bg-blue-50 dark:bg-blue-900/20" : ""
        }`}
      >
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden flex-shrink-0 p-0.5 sm:p-1">
          <AssetIcon
            symbol={t.symbol}
            size="w-8 h-8 sm:w-9 sm:h-9"
            className="rounded-lg"
          />
        </div>
        <div className="text-left flex-1 min-w-0">
          <div className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-50 truncate">
            {t.symbol}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {t.name}
          </div>
        </div>
        {token === t.symbol && (
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0"
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
        )}
      </button>
    );
  });

  const canBridge =
    amount &&
    parseFloat(amount) > 0 &&
    !bridging &&
    recipientAddress &&
    isValidEthereumAddress(recipientAddress);

  return (
    <div className="w-full">
      <div className="relative rounded-2xl overflow-hidden">
        {/* Enhanced background decoration */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-gradient-to-br from-yellow-500/15 via-amber-500/10 to-blue-500/15 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-tr from-blue-500/15 via-amber-500/10 to-yellow-500/15 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "3s" }}
        />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-30" />

        <div className="space-y-5 sm:space-y-6 relative z-10 p-4 sm:p-5 md:p-6">
          {/* Header */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-yellow-400 via-amber-500 to-blue-500 shadow-lg shadow-yellow-500/30 flex-shrink-0">
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 truncate">
                Bridge to Ethereum
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate">
                Transfer assets from Movement Network
              </p>
            </div>
          </div>

          {/* Token Selection */}
          <div className="relative" ref={tokenDropdownRef}>
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              Token
            </label>
            <div className="relative">
              <button
                onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                disabled={bridging}
                className="group w-full flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm hover:border-yellow-300/60 dark:hover:border-yellow-600/60 transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:shadow-yellow-500/10"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden flex-shrink-0 p-0.5 sm:p-1">
                    <AssetIcon
                      symbol={selectedToken.symbol}
                      size="w-8 h-8 sm:w-9 sm:h-9"
                      className="rounded-lg"
                    />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-50 truncate">
                      {selectedToken.symbol}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {selectedToken.name}
                    </div>
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 sm:w-5 sm:h-5 text-zinc-400 transition-transform flex-shrink-0 ${showTokenDropdown ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showTokenDropdown && (
                <div className="absolute z-20 w-full mt-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-zinc-900/10 dark:shadow-zinc-950/50 overflow-hidden max-h-[240px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                  {tokenItems}
                </div>
              )}
            </div>
          </div>

          {/* Amount Input */}
          <div className="relative">
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              Amount
            </label>
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setAmount(val);
                  }}
                  placeholder="0.0"
                  className="flex-1 min-w-0 bg-transparent text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 placeholder-zinc-300/60 dark:placeholder-zinc-600/60 focus:outline-none"
                  disabled={bridging}
                />
                <div className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-400 px-2 sm:px-3 py-1 sm:py-1.5 flex-shrink-0">
                  {selectedToken.symbol}
                </div>
              </div>
              <div className="pt-2 sm:pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {loadingBalance ? (
                    <span className="flex items-center gap-1">
                      <svg
                        className="w-3 h-3 animate-spin"
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
                      Loading...
                    </span>
                  ) : (
                    `Balance: ${balance ? parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "0.00"} ${selectedToken.symbol}`
                  )}
                </span>
                <button
                  onClick={() => {
                    if (balance) setAmount(balance);
                  }}
                  className="text-[10px] sm:text-xs font-bold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed px-2 py-1 rounded active:scale-95 flex-shrink-0"
                  disabled={
                    bridging || !balance || parseFloat(balance || "0") === 0
                  }
                >
                  MAX
                </button>
              </div>
            </div>
          </div>

          {/* Recipient Address */}
          <div>
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              Recipient (Ethereum)
            </label>
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm p-3.5 sm:p-4 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-400/60 dark:focus-within:border-blue-500/60 transition-all duration-200 hover:border-yellow-300/60 dark:hover:border-yellow-600/60 hover:shadow-md hover:shadow-yellow-500/10">
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x..."
                className="w-full bg-transparent text-xs sm:text-sm font-mono text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
                disabled={bridging}
              />
              {recipientAddress &&
                !isValidEthereumAddress(recipientAddress) && (
                  <p className="mt-2 text-[10px] sm:text-xs text-red-500">
                    Invalid Ethereum address
                  </p>
                )}
            </div>
          </div>

          {/* Bridge Button */}
          <button
            onClick={handleBridge}
            disabled={!canBridge}
            className={`relative w-full py-4 rounded-xl font-bold text-base transition-all duration-300 overflow-hidden group ${
              canBridge
                ? "bg-gradient-to-r from-yellow-500 via-amber-500 to-blue-500 text-white shadow-lg shadow-yellow-500/30 hover:shadow-xl hover:shadow-yellow-500/40 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
            }`}
          >
            {canBridge && (
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {bridging ? (
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
                  Bridging...
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Bridge {selectedToken.symbol}
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
