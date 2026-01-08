/**
 * Custom hook for managing Echelon modal handlers and refresh coordination
 * Extracted from echelon/page.tsx for better separation of concerns
 */

import { useRef, useCallback } from "react";
import { fetchAvailableBalances } from "./useEchelonVault";

interface UseEchelonModalHandlersParams {
  walletAddress: string | null | undefined;
  fetchVault: () => Promise<void>;
  refreshMaxBorrow?: () => Promise<void>;
  refreshMaxRepay?: () => Promise<void>;
  refreshMaxWithdraw?: () => Promise<void>;
  refreshSupplyAmounts?: () => Promise<void>;
  refreshWithdrawableAmounts?: () => Promise<void>;
  setAvailableBalances: (balances: Record<string, number>) => void;
}

const REFRESH_COOLDOWN_MS = 100;

export function useEchelonModalHandlers({
  walletAddress,
  fetchVault,
  refreshMaxBorrow,
  refreshMaxRepay,
  refreshMaxWithdraw,
  refreshSupplyAmounts,
  refreshWithdrawableAmounts,
  setAvailableBalances,
}: UseEchelonModalHandlersParams) {
  const lastRefreshTimeRef = useRef<number>(0);

  const refreshBalances = useCallback(async () => {
    if (walletAddress) {
      const balances = await fetchAvailableBalances(walletAddress);
      setAvailableBalances(balances);
    }
  }, [walletAddress, setAvailableBalances]);

  const coordinateRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshTimeRef.current > REFRESH_COOLDOWN_MS) {
      lastRefreshTimeRef.current = now;
      if (refreshSupplyAmounts) {
        await refreshSupplyAmounts();
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (refreshWithdrawableAmounts) {
        await refreshWithdrawableAmounts();
      }
    }
  }, [refreshSupplyAmounts, refreshWithdrawableAmounts]);

  const handleSupplySuccess = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await fetchVault();
    await refreshBalances();
  }, [fetchVault, refreshBalances]);

  const handleBorrowSuccess = useCallback(async () => {
    await fetchVault();
    await refreshBalances();
    if (refreshMaxBorrow) {
      await refreshMaxBorrow();
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await coordinateRefresh();
    await fetchVault();
    await refreshBalances();
  }, [fetchVault, refreshBalances, refreshMaxBorrow, coordinateRefresh]);

  const handleWithdrawSuccess = useCallback(async () => {
    if (refreshMaxWithdraw) {
      await refreshMaxWithdraw();
    }
    await coordinateRefresh();
    await fetchVault();
    await refreshBalances();
  }, [fetchVault, refreshBalances, refreshMaxWithdraw, coordinateRefresh]);

  const handleRepaySuccess = useCallback(async () => {
    await fetchVault();
    await refreshBalances();
    if (refreshMaxRepay) {
      await refreshMaxRepay();
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await coordinateRefresh();
    await fetchVault();
    await refreshBalances();
  }, [fetchVault, refreshBalances, refreshMaxRepay, coordinateRefresh]);

  return {
    handleSupplySuccess,
    handleBorrowSuccess,
    handleWithdrawSuccess,
    handleRepaySuccess,
  };
}
