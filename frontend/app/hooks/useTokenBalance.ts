"use client";

import { useState, useEffect, useCallback } from "react";

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

interface UseTokenBalanceOptions {
  walletAddress: string | null;
  tokenSymbol: string | null;
  enabled?: boolean; // Whether to fetch balance (default: true)
  autoRefresh?: boolean; // Whether to auto-refresh when dependencies change (default: true)
}

interface UseTokenBalanceReturn {
  balance: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Custom hook for fetching token balance for a specific wallet and token
 * @param options - Configuration options
 * @returns Balance state and refresh function
 */
export function useTokenBalance({
  walletAddress,
  tokenSymbol,
  enabled = true,
  autoRefresh = true,
}: UseTokenBalanceOptions): UseTokenBalanceReturn {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress || !tokenSymbol || !enabled) {
      setBalance(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/balance?address=${encodeURIComponent(walletAddress)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch balance");
      }

      const data = await response.json();

      if (data.success && data.balances && data.balances.length > 0) {
        const normalizedToken = tokenSymbol
          .toUpperCase()
          .replace(/\./g, "")
          .trim();

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
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      console.error("Error fetching balance:", error);
      setError(error);
      setBalance("0.000000");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, tokenSymbol, enabled]);

  // Auto-refresh when dependencies change
  useEffect(() => {
    if (autoRefresh) {
      fetchBalance();
    }
  }, [fetchBalance, autoRefresh]);

  return {
    balance,
    loading,
    error,
    refresh: fetchBalance,
  };
}
