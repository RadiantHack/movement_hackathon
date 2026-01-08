/**
 * Custom hook for fetching and managing Echelon vault data
 * Extracted from echelon/page.tsx for better separation of concerns
 */

import { useState, useCallback } from "react";
import type { EchelonAsset, UserSupply, UserBorrow } from "../types/echelon";
import {
  processVaultCollaterals,
  processVaultLiabilities,
} from "./useEchelonVault";

interface UseEchelonVaultDataResult {
  userSupplies: UserSupply[];
  userBorrows: UserBorrow[];
  loadingVault: boolean;
  fetchVault: () => Promise<void>;
}

export function useEchelonVaultData(
  walletAddress: string | null | undefined,
  assets: EchelonAsset[]
): UseEchelonVaultDataResult {
  const [userSupplies, setUserSupplies] = useState<UserSupply[]>([]);
  const [userBorrows, setUserBorrows] = useState<UserBorrow[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);

  const fetchVault = useCallback(
    async (retryCount = 0, maxRetries = 2) => {
      if (!walletAddress) {
        console.log("[UI] fetchVault: Skipping - no address");
        return;
      }

      setLoadingVault(true);
      try {
        const response = await fetch(
          `/api/echelon/vault?address=${walletAddress}&t=${Date.now()}`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch vault: ${response.status}`);
        }

        const data = await response.json();

        console.log("[UI] Vault API Response:", data);
        console.log(
          "[UI] Available assets:",
          assets.map((a) => a.symbol)
        );

        const collaterals = data.data?.collaterals || data.collaterals || [];
        const supplies = processVaultCollaterals(collaterals, assets);
        console.log("[UI] Processed supplies (after filtering):", supplies);
        console.log(
          "[UI] Setting userSupplies with",
          supplies.length,
          "item(s)"
        );
        setUserSupplies(supplies);

        const liabilities = data.data?.liabilities || data.liabilities || [];
        const borrows = processVaultLiabilities(liabilities, assets);
        console.log("[UI] Processed borrows (after filtering):", borrows);
        setUserBorrows(borrows);
      } catch (err) {
        console.error("[UI] Failed to fetch vault:", err);

        if (retryCount < maxRetries) {
          console.log(
            `[UI] Retrying vault fetch (attempt ${retryCount + 1}/${maxRetries})...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (retryCount + 1))
          );
          return fetchVault(retryCount + 1, maxRetries);
        }

        setUserSupplies([]);
        setUserBorrows([]);
      } finally {
        setLoadingVault(false);
      }
    },
    [walletAddress, assets]
  );

  return { userSupplies, userBorrows, loadingVault, fetchVault };
}
