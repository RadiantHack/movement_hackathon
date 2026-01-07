/**
 * Custom hook for fetching chat-related data
 * Handles Echelon assets, MovePosition assets, and wallet balances
 */

import { useState, useEffect } from "react";
import { fetchAvailableBalances } from "../../../hooks/useEchelonVault";
import {
  getTokenBySymbol,
  getVerifiedTokens,
} from "../../../utils/shared/tokens";
import * as superJsonApiClient from "../../../../lib/super-json-api-client/src";
import { getMovementApiBase } from "@/lib/super-aptos-sdk/src/globals";

export interface EchelonAssetData {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  supplyApr: number;
  faAddress?: string;
  decimals?: number;
  marketAddress?: string;
}

export interface MovePositionAssetData {
  token: any | null;
  symbol: string;
  price: number;
  supplyApy: number;
  totalSupplied: number;
}

export interface UseChatDataReturn {
  echelonAssets: Record<string, EchelonAssetData>;
  movePositionAssets: Record<string, MovePositionAssetData>;
  availableBalances: Record<string, number>;
  isLoading: boolean;
  healthFactor: number | null;
  refreshBalances: () => Promise<void>;
  refreshMovePositionData: () => Promise<void>;
}

/**
 * Fetch Echelon asset data from API
 */
async function fetchEchelonAssets(): Promise<Record<string, EchelonAssetData>> {
  try {
    const response = await fetch("/api/echelon");
    if (!response.ok) {
      throw new Error("Failed to fetch Echelon assets");
    }
    const json = await response.json();
    const data = json.data;

    if (data?.assets) {
      const assetsMap: Record<string, EchelonAssetData> = {};

      data.assets.forEach(
        (asset: {
          symbol: string;
          name: string;
          icon: string;
          price: number;
          supplyApr: number;
          faAddress: string;
          decimals: number;
          market?: string;
        }) => {
          assetsMap[asset.symbol.toUpperCase()] = {
            symbol: asset.symbol,
            name: asset.name,
            icon: asset.icon,
            price: asset.price,
            supplyApr: asset.supplyApr * 100,
            faAddress: asset.faAddress,
            decimals: asset.decimals,
            marketAddress: asset.market,
          };
        }
      );

      return assetsMap;
    }
  } catch (error) {
    console.error("Error fetching Echelon assets:", error);
  }

  return {};
}

/**
 * Fetch MovePosition broker data and convert to asset format
 */
async function fetchMovePositionAssets(): Promise<
  Record<string, MovePositionAssetData>
> {
  try {
    const movementApiBase = getMovementApiBase();
    const superClient = new superJsonApiClient.SuperClient({
      BASE: movementApiBase,
    });
    const brokers = await superClient.default.getBrokers();
    const verified = getVerifiedTokens();

    const formatAmount = (value: string, decimals: number): number => {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return 0;
      return parsed / Math.pow(10, decimals);
    };

    const getSymbolFromName = (name: string): string => {
      if (!name) return "UNKNOWN";
      const trimmed = name.replace(/^movement[- ]/i, "");
      if (trimmed.toLowerCase() === "move-fa") return "MOVE";
      return trimmed.replace(/-/g, "").toUpperCase();
    };

    const resolveToken = (symbol: string): any | null => {
      const token = getTokenBySymbol(symbol);
      if (token) return token;
      const withoutE = symbol.replace(".E", "");
      return getTokenBySymbol(withoutE) || null;
    };

    const assetsMap: Record<string, MovePositionAssetData> = {};
    const filteredBrokers = (brokers as any[]).filter(
      (entry: any) => entry.underlyingAsset?.name !== "movement-move"
    );

    filteredBrokers.forEach((entry: any) => {
      const symbol = getSymbolFromName(entry.underlyingAsset?.name || "");
      const token =
        resolveToken(symbol) ||
        verified.find((t) => t.symbol === symbol) ||
        null;

      const availableLiquidity = formatAmount(
        entry.availableLiquidityUnderlying || "0",
        entry.underlyingAsset?.decimals || 8
      );
      const totalBorrowed = formatAmount(
        entry.totalBorrowedUnderlying || "0",
        entry.underlyingAsset?.decimals || 8
      );
      const totalSupplied = availableLiquidity + totalBorrowed;

      const interestFeeRate = entry.interestFeeRate ?? 0.22;
      const currentSupplyApy =
        (entry.utilization || 0) *
        (entry.interestRate || 0) *
        (1 - interestFeeRate);

      assetsMap[symbol] = {
        token,
        symbol,
        price: entry.underlyingAsset?.price || 0,
        supplyApy: currentSupplyApy * 100,
        totalSupplied,
      };
    });

    return assetsMap;
  } catch (error) {
    console.error("Error fetching MovePosition assets:", error);
    return {};
  }
}

/**
 * Fetch portfolio data to get health factor
 */
async function fetchPortfolioData(
  walletAddress: string
): Promise<number | null> {
  try {
    const movementApiBase = getMovementApiBase();
    const superClient = new superJsonApiClient.SuperClient({
      BASE: movementApiBase,
    });
    const portfolio = await superClient.default.getPortfolio(walletAddress);
    return (portfolio as any)?.evaluation?.health_ratio || null;
  } catch (error) {
    console.error("Error fetching portfolio data:", error);
    return null;
  }
}

/**
 * Hook to manage chat data (Echelon assets, MovePosition assets, and balances)
 */
export function useChatData(walletAddress: string | null): UseChatDataReturn {
  const [echelonAssets, setEchelonAssets] = useState<
    Record<string, EchelonAssetData>
  >({});
  const [movePositionAssets, setMovePositionAssets] = useState<
    Record<string, MovePositionAssetData>
  >({});
  const [availableBalances, setAvailableBalances] = useState<
    Record<string, number>
  >({});
  const [healthFactor, setHealthFactor] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshBalances = async () => {
    if (!walletAddress) {
      setAvailableBalances({});
      return;
    }

    try {
      const balances = await fetchAvailableBalances(walletAddress);
      setAvailableBalances(balances);
    } catch (error) {
      console.error("Error fetching available balances:", error);
      setAvailableBalances({});
    }
  };

  const refreshMovePositionData = async () => {
    setIsLoading(true);
    try {
      const assets = await fetchMovePositionAssets();
      setMovePositionAssets(assets);

      if (walletAddress) {
        const hf = await fetchPortfolioData(walletAddress);
        setHealthFactor(hf);
      }
    } catch (error) {
      console.error("Error refreshing MovePosition data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [echelonAssetsData, movePositionAssetsData] = await Promise.all([
        fetchEchelonAssets(),
        fetchMovePositionAssets(),
      ]);
      setEchelonAssets(echelonAssetsData);
      setMovePositionAssets(movePositionAssetsData);
      setIsLoading(false);
    };

    loadData();
  }, []);

  useEffect(() => {
    refreshBalances();
    if (walletAddress) {
      fetchPortfolioData(walletAddress).then(setHealthFactor);
    }
  }, [walletAddress]);

  return {
    echelonAssets,
    movePositionAssets,
    availableBalances,
    healthFactor,
    isLoading,
    refreshBalances,
    refreshMovePositionData,
  };
}
