"use client";

import React, { useState, useEffect, useMemo } from "react";
import { BorrowCard } from "../borrow/BorrowCard";
import { LendCard } from "../lend/LendCard";
import { EchelonBorrowModal } from "../../echelon-borrow-modal";
import { EchelonSupplyModal } from "../../echelon-supply-modal";
import { MARKET_TO_SYMBOL } from "../../../constants/echelon";

interface PlatformSelectionCardProps {
  action: "borrow" | "lend";
  asset: string;
  recommendedProtocol?: string;
  echelonRate: string;
  movepositionRate: string;
  reason: string;
  walletAddress: string | null;
  onClose?: () => void;
}

interface UserSupply {
  marketAddress: string;
  amount: string;
  symbol: string;
  price: number;
  decimals: number;
}

interface UserBorrow {
  marketAddress: string;
  amount: string;
  symbol: string;
  price: number;
  decimals: number;
}

export const PlatformSelectionCard: React.FC<PlatformSelectionCardProps> = ({
  action,
  asset,
  recommendedProtocol,
  echelonRate,
  movepositionRate,
  reason,
  walletAddress,
  onClose,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [availableBalances, setAvailableBalances] = useState<
    Record<string, number>
  >({});
  const [userSupplies, setUserSupplies] = useState<UserSupply[]>([]);
  const [userBorrows, setUserBorrows] = useState<UserBorrow[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);
  const [echelonAssets, setEchelonAssets] = useState<
    Record<
      string,
      {
        symbol: string;
        price: number;
        ltv?: number;
        decimals?: number;
      }
    >
  >({});

  // Fetch available balances for tokens
  const fetchAvailableBalances = async () => {
    if (!walletAddress) return;

    try {
      const response = await fetch(
        `/api/balance?address=${encodeURIComponent(walletAddress)}`
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
        setAvailableBalances(balances);
      }
    } catch (error) {
      console.error("Error fetching available balances:", error);
    }
  };

  // Fetch Echelon assets for prices and LTV
  const fetchEchelonAssets = async () => {
    try {
      const response = await fetch("/api/echelon");
      if (!response.ok) {
        throw new Error("Failed to fetch Echelon assets");
      }
      const json = await response.json();
      const data = json.data;

      if (data?.assets) {
        const assetsMap: Record<
          string,
          {
            symbol: string;
            price: number;
            ltv?: number;
            decimals?: number;
          }
        > = {};

        data.assets.forEach(
          (asset: {
            symbol: string;
            price: number;
            ltv: number;
            decimals: number;
          }) => {
            assetsMap[asset.symbol.toUpperCase()] = {
              symbol: asset.symbol,
              price: asset.price,
              ltv: asset.ltv,
              decimals: asset.decimals,
            };
          }
        );

        setEchelonAssets(assetsMap);
      }
    } catch (error) {
      console.error("Error fetching Echelon assets:", error);
    }
  };

  // Fetch vault data for borrow calculations
  const fetchVault = async () => {
    if (!walletAddress || action !== "borrow") return;

    setLoadingVault(true);
    try {
      const response = await fetch(
        `/api/echelon/vault?address=${encodeURIComponent(walletAddress)}&t=${Date.now()}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // No vault found
          setUserSupplies([]);
          setUserBorrows([]);
          return;
        }
        throw new Error(`Failed to fetch vault: ${response.status}`);
      }

      const data = await response.json();
      const collaterals = data.data?.collaterals || data.collaterals || [];
      const liabilities = data.data?.liabilities || data.liabilities || [];

      // Process collaterals
      if (Array.isArray(collaterals) && collaterals.length > 0) {
        const supplies: UserSupply[] = collaterals
          .map((item: { marketAddress: string; coinAmount: string }) => {
            const marketAddress = item.marketAddress;
            const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
            const assetData = echelonAssets[symbol.toUpperCase()];

            return {
              marketAddress,
              amount: item.coinAmount,
              symbol: symbol || "Unknown",
              price: assetData?.price || 0,
              decimals: assetData?.decimals || 8,
            };
          })
          .filter((supply) => {
            const amountStr = String(supply.amount || "0");
            const amount = parseFloat(amountStr);
            return !isNaN(amount) && amount > 0;
          });

        setUserSupplies(supplies);
      } else {
        setUserSupplies([]);
      }

      // Process liabilities
      if (Array.isArray(liabilities) && liabilities.length > 0) {
        const borrows: UserBorrow[] = liabilities
          .map((item: { marketAddress: string; totalLiability: string }) => {
            const marketAddress = item.marketAddress;
            const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
            const assetData = echelonAssets[symbol.toUpperCase()];

            return {
              marketAddress,
              amount: item.totalLiability,
              symbol: symbol || "Unknown",
              price: assetData?.price || 0,
              decimals: assetData?.decimals || 8,
            };
          })
          .filter((borrow) => {
            const amount = parseFloat(borrow.amount);
            return !isNaN(amount) && amount > 0;
          });

        setUserBorrows(borrows);
      } else {
        setUserBorrows([]);
      }
    } catch (err) {
      console.error("[PlatformSelectionCard] Failed to fetch vault:", err);
      setUserSupplies([]);
      setUserBorrows([]);
    } finally {
      setLoadingVault(false);
    }
  };

  // Calculate totals
  const totalSupplyBalance = useMemo(() => {
    return userSupplies.reduce((sum, supply) => {
      const amount = parseFloat(supply.amount) / Math.pow(10, supply.decimals);
      return sum + amount * supply.price;
    }, 0);
  }, [userSupplies]);

  const totalBorrowBalance = useMemo(() => {
    return userBorrows.reduce((sum, borrow) => {
      const amount = parseFloat(borrow.amount) / Math.pow(10, borrow.decimals);
      return sum + amount * borrow.price;
    }, 0);
  }, [userBorrows]);

  // Calculate available balance for the selected asset
  const availableBalance = useMemo(() => {
    if (
      action !== "borrow" ||
      !selectedPlatform ||
      selectedPlatform !== "echelon"
    ) {
      return 0;
    }

    const assetSymbol = asset.toUpperCase();
    const assetData = echelonAssets[assetSymbol];

    if (!assetData || userSupplies.length === 0) {
      return 0;
    }

    const ltv = assetData.ltv || 0.7;
    const availableBorrowPowerUSD = Math.max(
      0,
      totalSupplyBalance * ltv - totalBorrowBalance
    );

    return assetData.price > 0 ? availableBorrowPowerUSD / assetData.price : 0;
  }, [
    action,
    selectedPlatform,
    asset,
    echelonAssets,
    totalSupplyBalance,
    totalBorrowBalance,
    userSupplies.length,
  ]);

  useEffect(() => {
    fetchAvailableBalances();
  }, [walletAddress]);

  useEffect(() => {
    fetchEchelonAssets();
  }, []);

  useEffect(() => {
    if (echelonAssets && Object.keys(echelonAssets).length > 0) {
      fetchVault();
    }
  }, [walletAddress, echelonAssets, action]);

  const handlePlatformSelect = (platform: "echelon" | "moveposition") => {
    setSelectedPlatform(platform);
  };

  const handleCloseModals = () => {
    setSelectedPlatform(null);
    if (onClose) {
      onClose();
    }
  };

  // If platform is selected, show the appropriate card inline
  if (selectedPlatform === "moveposition") {
    if (action === "borrow") {
      return (
        <div className="my-3">
          <BorrowCard walletAddress={walletAddress} asset={asset} />
        </div>
      );
    } else {
      return (
        <div className="my-3">
          <LendCard walletAddress={walletAddress} asset={asset} />
        </div>
      );
    }
  }

  // Show Echelon cards inline (same as MovePosition)
  if (selectedPlatform === "echelon") {
    if (action === "borrow") {
      const assetSymbol = asset.toUpperCase();
      const assetData = echelonAssets[assetSymbol];

      return (
        <div className="my-3">
          <EchelonBorrowModal
            isOpen={true}
            onClose={handleCloseModals}
            inline={true}
            asset={{
              symbol: asset,
              name: asset,
              icon: "",
              price: assetData?.price || 1,
              borrowApr: parseFloat(echelonRate.replace("%", "")),
              borrowCap: 0,
              ltv: assetData?.ltv || 0.7,
              decimals: assetData?.decimals || 8,
            }}
            availableBalance={availableBalance}
            totalSupplyBalance={totalSupplyBalance}
            totalBorrowBalance={totalBorrowBalance}
            hasCollateral={userSupplies.length > 0}
            loadingVault={loadingVault}
            onSuccess={async () => {
              // Refresh vault data after successful borrow
              await fetchVault();
            }}
          />
        </div>
      );
    } else {
      return (
        <div className="my-3">
          <EchelonSupplyModal
            isOpen={true}
            onClose={handleCloseModals}
            inline={true}
            asset={{
              symbol: asset,
              name: asset,
              icon: "",
              price: 1, // Default price, will be fetched if needed
              supplyApr: parseFloat(echelonRate.replace("%", "")), // Already in percentage format
            }}
            availableBalance={availableBalances[asset.toUpperCase()] || 0}
            onSuccess={async () => {
              // Refresh balances after successful supply
              await fetchAvailableBalances();
            }}
          />
        </div>
      );
    }
  }

  // Show platform selection UI
  return (
    <div className="my-3 mx-2 sm:mx-0">
      <div className="rounded-2xl p-4 sm:p-5 md:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg max-w-full overflow-hidden">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 mb-2">
            Choose a Platform to {action === "borrow" ? "Borrow" : "Lend"}{" "}
            {asset}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{reason}</p>
        </div>

        <div className="space-y-3 mb-4">
          {/* Echelon Option */}
          <button
            onClick={() => handlePlatformSelect("echelon")}
            className={`w-full p-4 rounded-xl border-2 transition-all ${
              recommendedProtocol?.toLowerCase() === "echelon"
                ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                : "border-zinc-200 dark:border-zinc-700 hover:border-purple-300 dark:hover:border-purple-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">E</span>
                </div>
                <div className="text-left">
                  <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                    Echelon
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {action === "borrow" ? "Borrow APR" : "Supply APR"}:{" "}
                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      {echelonRate}
                    </span>
                  </div>
                </div>
              </div>
              {recommendedProtocol?.toLowerCase() === "echelon" && (
                <div className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-medium">
                  Recommended
                </div>
              )}
            </div>
          </button>

          {/* MovePosition Option */}
          <button
            onClick={() => handlePlatformSelect("moveposition")}
            className={`w-full p-4 rounded-xl border-2 transition-all ${
              recommendedProtocol?.toLowerCase() === "moveposition"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                : "border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">M</span>
                </div>
                <div className="text-left">
                  <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                    MovePosition
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {action === "borrow" ? "Borrow APR" : "Supply APR"}:{" "}
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {movepositionRate}
                    </span>
                  </div>
                </div>
              </div>
              {recommendedProtocol?.toLowerCase() === "moveposition" && (
                <div className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium">
                  Recommended
                </div>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
