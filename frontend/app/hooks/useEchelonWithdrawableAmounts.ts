/**
 * Hook to get withdrawable amounts (max withdrawable) for multiple assets from Echelon on-chain contract
 * Uses the official SDK's getAccountWithdrawable method which queries account_withdrawable_coins directly
 */

import { useCallback, useEffect, useState, useMemo } from "react";
import { useMovementWallet } from "./useMovementWallet";
import { useMovementConfig } from "./useMovementConfig";
import { createAptosClient } from "../utils/shared/clients/aptos-client";
import {
  EchelonClient,
  ECHELON_CONTRACT_ADDRESS,
} from "../utils/echelon/sdk/echelon-client";
import { usePrivy } from "@privy-io/react-auth";
import { UserSupply } from "../types/echelon";

interface UseEchelonWithdrawableAmountsResult {
  withdrawableAmounts: Record<string, number>; // marketAddress -> withdrawable amount in underlying tokens
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch withdrawable amounts (max withdrawable) for multiple assets from Echelon contract
 * @param supplies - Array of UserSupply objects to fetch amounts for
 * @returns Map of marketAddress to withdrawable amount, loading state, error, and refresh function
 */
export function useEchelonWithdrawableAmounts(
  supplies: UserSupply[]
): UseEchelonWithdrawableAmountsResult {
  const { ready, authenticated } = usePrivy();
  const movementWallet = useMovementWallet();
  const { movementRpc } = useMovementConfig();
  const [withdrawableAmounts, setWithdrawableAmounts] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create a stable key from market addresses to avoid unnecessary re-fetches
  // when the array reference changes but contents are the same
  const suppliesKey = useMemo(
    () =>
      supplies
        .map((s) => s.marketAddress)
        .sort()
        .join(","),
    [supplies]
  );

  const fetchWithdrawableAmounts = useCallback(async () => {
    if (
      !movementWallet?.address ||
      !ready ||
      !authenticated ||
      supplies.length === 0
    ) {
      setWithdrawableAmounts({});
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

      // Fetch all withdrawable amounts in parallel
      const promises = supplies.map(async (supply) => {
        try {
          // Get the raw withdrawable amount from the contract (in raw units, u64)
          // account_withdrawable_coins returns the max withdrawable amount (accounts for health factor if user has borrows)
          const rawWithdrawable = await echelonClient.getAccountWithdrawable(
            movementWallet.address,
            supply.marketAddress
          );

          // Convert from raw units to human-readable format
          const withdrawableAmountValue =
            rawWithdrawable / Math.pow(10, supply.decimals);

          return {
            marketAddress: supply.marketAddress,
            amount: withdrawableAmountValue,
            symbol: supply.symbol,
          };
        } catch (err) {
          console.error(
            `[useEchelonWithdrawableAmounts] Error fetching withdrawable for ${supply.marketAddress}:`,
            err
          );
          return {
            marketAddress: supply.marketAddress,
            amount: null,
            symbol: supply.symbol,
          };
        }
      });

      // Use Promise.allSettled to handle partial failures gracefully
      const results = await Promise.allSettled(promises);

      // Build map of marketAddress -> withdrawable amount and collect errors
      const amountsMap: Record<string, number> = {};
      const errors: string[] = [];

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          // Promise was rejected
          const symbol = supplies[index]?.symbol || "Unknown";
          errors.push(`Failed to fetch ${symbol}`);
          console.error(
            `[useEchelonWithdrawableAmounts] Promise rejected for ${supplies[index]?.marketAddress}:`,
            result.reason
          );
        } else if (result.value.amount === null) {
          // Promise resolved but amount is null (error was caught)
          errors.push(`Failed to fetch ${result.value.symbol}`);
        } else {
          // Success - add to amounts map
          amountsMap[result.value.marketAddress] = result.value.amount;
        }
      });

      setWithdrawableAmounts(amountsMap);

      // Set error if any fetches failed, but don't override if we have partial success
      if (errors.length > 0) {
        const errorMessage =
          errors.length === results.length
            ? `Failed to fetch withdrawable amounts: ${errors.join(", ")}`
            : `Some balances failed to load: ${errors.join(", ")}`;
        setError(errorMessage);
      } else {
        setError(null);
      }
    } catch (err) {
      console.error(
        "[useEchelonWithdrawableAmounts] Error fetching withdrawable amounts:",
        err
      );
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch withdrawable amounts"
      );
      setWithdrawableAmounts({});
    } finally {
      setLoading(false);
    }
  }, [
    supplies,
    suppliesKey,
    movementWallet?.address,
    ready,
    authenticated,
    movementRpc,
  ]);

  useEffect(() => {
    fetchWithdrawableAmounts();
  }, [fetchWithdrawableAmounts]);

  return {
    withdrawableAmounts,
    loading,
    error,
    refresh: fetchWithdrawableAmounts,
  };
}
