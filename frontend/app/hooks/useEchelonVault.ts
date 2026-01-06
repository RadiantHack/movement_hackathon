/**
 * Echelon Vault Utilities
 * Centralized logic for fetching Echelon vault data and available balances
 */

"use client";

import { UserSupply, UserBorrow, EchelonAsset } from "../types/echelon";
import { MARKET_TO_SYMBOL } from "../constants/echelon";

/**
 * Fetch available token balances for a wallet address
 */
export async function fetchAvailableBalances(
  address: string
): Promise<Record<string, number>> {
  if (!address) return {};

  try {
    const response = await fetch(
      `/api/balance?address=${encodeURIComponent(address)}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch balance");
    }

    const data = await response.json();

    if (data.success && data.balances && data.balances.length > 0) {
      const balances: Record<string, number> = {};
      data.balances.forEach(
        (b: {
          metadata: { symbol: string; decimals: number };
          amount: string;
        }) => {
          const symbol = b.metadata.symbol.toUpperCase().replace(/\./g, "");
          const amount =
            parseFloat(b.amount) / Math.pow(10, b.metadata.decimals);
          // Store both with and without .e suffix
          balances[symbol] = amount;
          if (symbol.endsWith("E")) {
            balances[symbol.slice(0, -1)] = amount; // USDC.E -> USDC
          }
        }
      );
      return balances;
    }
  } catch (error) {
    console.error("[Utilities] Error fetching available balances:", error);
  }

  return {};
}

/**
 * Helper function to process vault collaterals (supplies)
 */
export function processVaultCollaterals(
  collaterals: any[],
  assets: EchelonAsset[]
): UserSupply[] {
  if (!Array.isArray(collaterals) || collaterals.length === 0) {
    return [];
  }

  return collaterals
    .map((item: { marketAddress: string; coinAmount: string }) => {
      const marketAddress = item.marketAddress;
      const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
      const asset = assets.find((a) => a.symbol === symbol);

      console.log(`[Utilities] Processing collateral:`, {
        marketAddress,
        symbol,
        coinAmount: item.coinAmount,
        foundAsset: !!asset,
      });

      return {
        marketAddress,
        amount: item.coinAmount,
        symbol: symbol || "Unknown",
        icon: asset?.icon || "",
        price: asset?.price || 0,
        apr: asset?.supplyApr || 0,
        decimals: asset?.decimals || 8,
      };
    })
    .filter((supply) => {
      const amountStr = String(supply.amount || "0");
      const amount = parseFloat(amountStr);
      const isValid = !isNaN(amount) && amount > 0;

      if (!isValid) {
        console.warn(`[Utilities] Filtering out supply with invalid amount:`, {
          marketAddress: supply.marketAddress,
          amount: supply.amount,
        });
      }

      return isValid;
    });
}

/**
 * Helper function to process vault liabilities (borrows)
 */
export function processVaultLiabilities(
  liabilities: any[],
  assets: EchelonAsset[]
): UserBorrow[] {
  if (!Array.isArray(liabilities) || liabilities.length === 0) {
    return [];
  }

  return liabilities
    .map((item: { marketAddress: string; totalLiability: string }) => {
      const marketAddress = item.marketAddress;
      const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
      const asset = assets.find((a) => a.symbol === symbol);

      console.log(`[Utilities] Processing liability:`, {
        marketAddress,
        symbol,
        totalLiability: item.totalLiability,
        foundAsset: !!asset,
      });

      return {
        marketAddress,
        amount: item.totalLiability,
        symbol: symbol || "Unknown",
        icon: asset?.icon || "",
        price: asset?.price || 0,
        apr: asset?.borrowApr || 0,
        decimals: asset?.decimals || 8,
      };
    })
    .filter((borrow) => {
      const amount = parseFloat(borrow.amount);
      return !isNaN(amount) && amount > 0;
    });
}
