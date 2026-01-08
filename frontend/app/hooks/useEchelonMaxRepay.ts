/**
 * Hook to get the maximum repayable amount (liability) from Echelon on-chain contract
 * Uses the official SDK's getAccountLiability method which queries the contract directly
 */

import { useCallback, useEffect, useState } from "react";
import { useMovementWallet } from "./useMovementWallet";
import { useMovementConfig } from "./useMovementConfig";
import { createAptosClient } from "../utils/shared/clients/aptos-client";
import {
  EchelonClient,
  ECHELON_CONTRACT_ADDRESS,
} from "../utils/echelon/sdk/echelon-client";
import { usePrivy } from "@privy-io/react-auth";

interface UseEchelonMaxRepayResult {
  maxRepayable: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch the maximum repayable amount (liability) for a specific asset from Echelon contract
 * @param marketAddress - The market address for the asset
 * @param decimals - The decimals of the asset (to convert from raw units)
 * @returns Max repayable amount, loading state, error, and refresh function
 */
export function useEchelonMaxRepay(
  marketAddress: string | null | undefined,
  decimals: number = 8
): UseEchelonMaxRepayResult {
  const { ready, authenticated } = usePrivy();
  const movementWallet = useMovementWallet();
  const { movementRpc } = useMovementConfig();
  const [maxRepayable, setMaxRepayable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMaxRepayable = useCallback(async () => {
    if (
      !marketAddress ||
      !movementWallet?.address ||
      !ready ||
      !authenticated
    ) {
      setMaxRepayable(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use Movement Network RPC endpoint from config
      if (!movementRpc) {
        throw new Error("Movement RPC URL not configured");
      }

      const aptosClient = createAptosClient({
        movementFullNode: movementRpc,
      });

      if (!aptosClient) {
        throw new Error("Failed to create Aptos client");
      }

      const echelonClient = new EchelonClient(
        aptosClient,
        ECHELON_CONTRACT_ADDRESS
      );

      // Get the raw liability amount from the contract (in raw units, u64)
      const rawLiability = await echelonClient.getAccountLiability(
        movementWallet.address,
        marketAddress
      );

      // Convert from raw units to human-readable format
      const maxRepayableAmount = rawLiability / Math.pow(10, decimals);

      setMaxRepayable(maxRepayableAmount);
    } catch (err) {
      console.error("[useEchelonMaxRepay] Error fetching max repayable:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch max repayable"
      );
      setMaxRepayable(null);
    } finally {
      setLoading(false);
    }
  }, [
    marketAddress,
    movementWallet?.address,
    ready,
    authenticated,
    decimals,
    movementRpc,
  ]);

  useEffect(() => {
    fetchMaxRepayable();
  }, [fetchMaxRepayable]);

  return {
    maxRepayable,
    loading,
    error,
    refresh: fetchMaxRepayable,
  };
}
