/**
 * Custom hook for fetching Echelon markets data
 * Extracted from echelon/page.tsx for better separation of concerns
 */

import { useEffect, useState } from "react";
import type {
  EchelonAsset,
  MarketStats,
  RawEchelonAsset,
  EchelonMarketsApiResponse,
} from "../types/echelon";

interface UseEchelonMarketsResult {
  assets: EchelonAsset[];
  marketStats: Map<string, MarketStats>;
  loading: boolean;
  error: string | null;
}

export function useEchelonMarkets(): UseEchelonMarketsResult {
  const [assets, setAssets] = useState<EchelonAsset[]>([]);
  const [marketStats, setMarketStats] = useState<Map<string, MarketStats>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/echelon");

        if (!response.ok) {
          let errorDetails = `Failed to fetch markets: ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.error) {
              errorDetails = errorData.error;
              if (errorData.details) {
                errorDetails += ` - ${errorData.details}`;
              }
            }
          } catch {
            errorDetails = `Failed to fetch markets: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorDetails);
        }

        const json = (await response.json()) as EchelonMarketsApiResponse;

        if (!json.data || !Array.isArray(json.data.assets)) {
          throw new Error(
            "Invalid API response structure: missing assets array"
          );
        }

        if (!Array.isArray(json.data.marketStats)) {
          throw new Error(
            "Invalid API response structure: missing marketStats array"
          );
        }

        const data = json.data;

        const assetList: EchelonAsset[] = data.assets.map(
          (asset: RawEchelonAsset): EchelonAsset => ({
            symbol: asset.symbol,
            name: asset.name,
            icon: asset.icon,
            price: asset.price,
            supplyApr: asset.supplyApr * 100,
            borrowApr: asset.borrowApr * 100,
            supplyCap: asset.supplyCap,
            borrowCap: asset.borrowCap,
            ltv: asset.ltv,
            decimals: asset.decimals,
            faAddress: asset.faAddress,
            market: asset.market,
          })
        );

        const statsMap = new Map<string, MarketStats>();
        data.marketStats.forEach(([address, stats]: [string, MarketStats]) => {
          if (
            typeof address === "string" &&
            stats &&
            typeof stats === "object"
          ) {
            statsMap.set(address, stats);
          }
        });

        setAssets(assetList);
        setMarketStats(statsMap);
        setError(null);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch market data";
        setError(errorMessage);
        console.error("[Echelon] Error fetching markets:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMarkets();
  }, []);

  return { assets, marketStats, loading, error };
}
