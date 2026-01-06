"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { TokenBalance } from "../types";

interface BalanceContextType {
  balances: TokenBalance[];
  loadingBalances: boolean;
  balanceError: string | null;
  walletAddress: string | null;
  refreshBalances: () => Promise<void>;
  setWalletAddress: (address: string | null) => void;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

interface BalanceProviderProps {
  children: ReactNode;
}

export function BalanceProvider({ children }: BalanceProviderProps) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [walletAddress, setWalletAddressState] = useState<string | null>(null);

  const setWalletAddress = useCallback((address: string | null) => {
    setWalletAddressState(address);
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!walletAddress) {
      setLoadingBalances(false);
      return;
    }

    setLoadingBalances(true);
    setBalanceError(null);

    try {
      const response = await fetch(
        `/api/balance?address=${encodeURIComponent(walletAddress)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch balances (${response.status})`);
      }
      const data = await response.json();
      if (data.success && data.balances) {
        setBalances(data.balances);
      } else {
        setBalanceError(data.error || "Failed to load balances");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load balances.";
      setBalanceError(message);
    } finally {
      setLoadingBalances(false);
    }
  }, [walletAddress]);

  // Initial fetch and polling
  useEffect(() => {
    refreshBalances();
    const interval = setInterval(refreshBalances, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [refreshBalances]);

  const value: BalanceContextType = {
    balances,
    loadingBalances,
    balanceError,
    walletAddress,
    refreshBalances,
    setWalletAddress,
  };

  return (
    <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
  );
}

export function useBalance() {
  const context = useContext(BalanceContext);
  if (context === undefined) {
    throw new Error("useBalance must be used within a BalanceProvider");
  }
  return context;
}
