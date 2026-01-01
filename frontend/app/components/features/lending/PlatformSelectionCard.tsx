"use client";

import React, { useState } from "react";
import { BorrowCard } from "../borrow/BorrowCard";
import { LendCard } from "../lend/LendCard";
import { EchelonBorrowModal } from "../../echelon-borrow-modal";
import { EchelonSupplyModal } from "../../echelon-supply-modal";

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
          <BorrowCard walletAddress={walletAddress} />
        </div>
      );
    } else {
      return (
        <div className="my-3">
          <LendCard walletAddress={walletAddress} />
        </div>
      );
    }
  }

  // Show Echelon cards inline (same as MovePosition)
  if (selectedPlatform === "echelon") {
    if (action === "borrow") {
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
              price: 1, // Default price, will be fetched if needed
              borrowApr: parseFloat(echelonRate.replace("%", "")), // Already in percentage format
              borrowCap: 0,
              ltv: 0.7, // Default LTV, should be fetched from asset data if available
            }}
            availableBalance={0} // Will be calculated by parent component
            totalSupplyBalance={0} // Will be calculated by parent component
            totalBorrowBalance={0} // Will be calculated by parent component
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
