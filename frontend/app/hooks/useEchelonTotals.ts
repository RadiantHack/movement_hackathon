/**
 * Custom hook for calculating Echelon totals
 * Extracted from echelon/page.tsx for better separation of concerns
 */

import { useMemo } from "react";
import type { UserSupply, UserBorrow } from "../types/echelon";

interface UseEchelonTotalsParams {
  userSupplies: UserSupply[];
  userBorrows: UserBorrow[];
  supplyAmounts: Record<string, number>;
}

interface UseEchelonTotalsResult {
  totalSupplyBalance: number;
  totalSupplyApr: number;
  totalBorrowBalance: number;
  totalBorrowApr: number;
}

export function useEchelonTotals({
  userSupplies,
  userBorrows,
  supplyAmounts,
}: UseEchelonTotalsParams): UseEchelonTotalsResult {
  const totalSupplyBalance = useMemo(() => {
    return userSupplies.reduce((sum, supply) => {
      const onChainAmount = supplyAmounts[supply.marketAddress];
      const amount =
        onChainAmount !== undefined
          ? onChainAmount
          : parseFloat(supply.amount) / Math.pow(10, supply.decimals);
      return sum + amount * supply.price;
    }, 0);
  }, [userSupplies, supplyAmounts]);

  const totalSupplyApr = useMemo(() => {
    if (totalSupplyBalance === 0) return 0;
    const weightedApr = userSupplies.reduce((sum, supply) => {
      const onChainAmount = supplyAmounts[supply.marketAddress];
      const amount =
        onChainAmount !== undefined
          ? onChainAmount
          : parseFloat(supply.amount) / Math.pow(10, supply.decimals);
      const value = amount * supply.price;
      return sum + (value / totalSupplyBalance) * supply.apr;
    }, 0);
    return weightedApr;
  }, [userSupplies, totalSupplyBalance, supplyAmounts]);

  const totalBorrowBalance = useMemo(() => {
    return userBorrows.reduce((sum, borrow) => {
      const amount = parseFloat(borrow.amount) / Math.pow(10, borrow.decimals);
      return sum + amount * borrow.price;
    }, 0);
  }, [userBorrows]);

  const totalBorrowApr = useMemo(() => {
    if (totalBorrowBalance === 0) return 0;
    const weightedApr = userBorrows.reduce((sum, borrow) => {
      const amount = parseFloat(borrow.amount) / Math.pow(10, borrow.decimals);
      const value = amount * borrow.price;
      return sum + (value / totalBorrowBalance) * borrow.apr;
    }, 0);
    return weightedApr;
  }, [userBorrows, totalBorrowBalance]);

  return {
    totalSupplyBalance,
    totalSupplyApr,
    totalBorrowBalance,
    totalBorrowApr,
  };
}
