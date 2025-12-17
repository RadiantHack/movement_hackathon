"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";

interface BorrowCardProps {
  walletAddress: string | null;
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

export const BorrowCard: React.FC<BorrowCardProps> = ({ walletAddress }) => {
  const { ready, authenticated } = usePrivy();
  const [activeTab, setActiveTab] = useState<"borrow" | "repay">("borrow");
  const [token, setToken] = useState<string>("MOVE");
  const [amount, setAmount] = useState<string>("");
  const [borrowing, setBorrowing] = useState(false);
  const [borrowError, setBorrowError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Mock data - replace with actual API calls
  const borrowed = 0;
  const borrowAPY = 8.5;
  const healthFactor = "N/A";
  const maxBorrow = 0;
  const walletBalance = balance ? parseFloat(balance) : 0;

  // Fetch balance for token
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

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();

        if (data.success && data.balances && data.balances.length > 0) {
          const normalizedToken = token.toUpperCase().replace(/\./g, "").trim();

          const tokenBalance = data.balances.find((b: TokenBalance) => {
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
          } else {
            setBalance("0.000000");
          }
        } else {
          setBalance("0.000000");
        }
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [walletAddress, token]);

  const handleAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    const parts = numericValue.split(".");
    const formattedValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : numericValue;
    setAmount(formattedValue);
  };

  const handleMax = () => {
    if (activeTab === "borrow" && maxBorrow > 0) {
      setAmount(maxBorrow.toString());
    } else if (activeTab === "repay" && balance && parseFloat(balance) > 0) {
      setAmount(balance);
    }
  };

  const handleBorrow = async () => {
    if (!walletAddress) {
      setBorrowError("Please connect your Movement wallet first.");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setBorrowError("Please enter a valid amount.");
      return;
    }

    if (parseFloat(amount) > maxBorrow) {
      setBorrowError("Amount exceeds maximum borrow limit.");
      return;
    }

    setBorrowing(true);
    setBorrowError(null);
    setTxHash(null);

    try {
      // TODO: Implement actual borrow transaction
      // This is a placeholder
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setTxHash("0x1234567890abcdef");
    } catch (err: any) {
      console.error("Borrow error:", err);
      setBorrowError(
        err.message ||
          "Borrow failed. Please check your connection and try again."
      );
    } finally {
      setBorrowing(false);
    }
  };

  const handleRepay = async () => {
    if (!walletAddress) {
      setBorrowError("Please connect your Movement wallet first.");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setBorrowError("Please enter a valid amount.");
      return;
    }

    if (parseFloat(amount) > walletBalance) {
      setBorrowError("Insufficient balance.");
      return;
    }

    if (parseFloat(amount) > borrowed) {
      setBorrowError("Amount exceeds borrowed amount.");
      return;
    }

    setBorrowing(true);
    setBorrowError(null);
    setTxHash(null);

    try {
      // TODO: Implement actual repay transaction
      // This is a placeholder
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setTxHash("0x1234567890abcdef");
    } catch (err: any) {
      console.error("Repay error:", err);
      setBorrowError(
        err.message ||
          "Repay failed. Please check your connection and try again."
      );
    } finally {
      setBorrowing(false);
    }
  };

  const canSubmit = useMemo(() => {
    return (
      ready &&
      authenticated &&
      walletAddress &&
      amount &&
      parseFloat(amount) > 0 &&
      !borrowing
    );
  }, [ready, authenticated, walletAddress, amount, borrowing]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-2xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Borrow Tokens
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Borrow or repay tokens on Movement Network
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <button
            onClick={() => {
              setActiveTab("borrow");
              setAmount("");
              setBorrowError(null);
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "borrow"
                ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
            disabled={borrowing}
          >
            Borrow
          </button>
          <button
            onClick={() => {
              setActiveTab("repay");
              setAmount("");
              setBorrowError(null);
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "repay"
                ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
            disabled={borrowing}
          >
            Repay
          </button>
        </div>

        {/* Token Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Token
          </label>
          <select
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setAmount("");
            }}
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            disabled={borrowing}
          >
            <option value="MOVE">MOVE</option>
            <option value="USDC">USDC</option>
            <option value="USDT">USDT</option>
          </select>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Amount
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={borrowing}
              />
            </div>
            <button
              onClick={handleMax}
              className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-sm font-medium"
              disabled={
                borrowing ||
                (activeTab === "borrow" && maxBorrow === 0) ||
                (activeTab === "repay" &&
                  (!balance || parseFloat(balance) === 0))
              }
            >
              Max
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeTab === "borrow" ? "Max borrow" : "Wallet balance"}:{" "}
              {loadingBalance ? (
                <span className="inline-block animate-pulse">Loading...</span>
              ) : activeTab === "borrow" ? (
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {maxBorrow.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })}{" "}
                  {token}
                </span>
              ) : balance !== null ? (
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {parseFloat(balance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })}{" "}
                  {token}
                </span>
              ) : (
                <span>-- {token}</span>
              )}
            </p>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                ≈ ${(parseFloat(amount) * 0).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Health factor
            </span>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {healthFactor}
            </span>
          </div>
          {activeTab === "borrow" && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Borrowed
                </span>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {borrowed} {token}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Borrow APY
                </span>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {borrowAPY}%
                </span>
              </div>
            </>
          )}
          {activeTab === "repay" && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Borrowed
              </span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {borrowed} {token}
              </span>
            </div>
          )}
        </div>

        {/* More/Less Button */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="w-full text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 py-2 transition-colors mb-4"
        >
          {showMore ? "Less" : "More"}
        </button>

        {/* Error Message */}
        {borrowError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {borrowError}
          </div>
        )}

        {/* Transaction Hash */}
        {txHash && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
              Transaction Hash
            </p>
            <p className="text-xs font-mono text-green-700 dark:text-green-400 break-all mb-2">
              {txHash}
            </p>
            <a
              href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
            >
              View on Explorer →
            </a>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={activeTab === "borrow" ? handleBorrow : handleRepay}
          disabled={!canSubmit}
          className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-md ${
            canSubmit
              ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg active:scale-[0.98]"
              : "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
          }`}
        >
          {borrowing
            ? activeTab === "borrow"
              ? "Borrowing..."
              : "Repaying..."
            : txHash
              ? activeTab === "borrow"
                ? "Borrow Complete"
                : "Repay Complete"
              : activeTab === "borrow"
                ? "Borrow"
                : "Repay"}
        </button>

        {!walletAddress && (
          <p className="mt-3 text-xs text-center text-zinc-500 dark:text-zinc-400">
            Please connect your Movement wallet to {activeTab} tokens
          </p>
        )}
      </div>
    </div>
  );
};

