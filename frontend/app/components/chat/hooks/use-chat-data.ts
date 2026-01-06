/**
 * Custom hook for fetching chat-related data
 * Handles Echelon assets and wallet balances
 */

import { useState, useEffect } from "react";
import { fetchAvailableBalances } from "../../../hooks/useEchelonVault";

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

export interface UseChatDataReturn {
  echelonAssets: Record<string, EchelonAssetData>;
  availableBalances: Record<string, number>;
  isLoading: boolean;
  refreshBalances: () => Promise<void>;
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
 * Hook to manage chat data (Echelon assets and balances)
 */
export function useChatData(walletAddress: string | null): UseChatDataReturn {
  const [echelonAssets, setEchelonAssets] = useState<
    Record<string, EchelonAssetData>
  >({});
  const [availableBalances, setAvailableBalances] = useState<
    Record<string, number>
  >({});
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

  useEffect(() => {
    const loadEchelonAssets = async () => {
      setIsLoading(true);
      const assets = await fetchEchelonAssets();
      setEchelonAssets(assets);
      setIsLoading(false);
    };

    loadEchelonAssets();
  }, []);

  useEffect(() => {
    refreshBalances();
  }, [walletAddress]);

  return {
    echelonAssets,
    availableBalances,
    isLoading,
    refreshBalances,
  };
}
