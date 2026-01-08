"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useEchelonRepay } from "../../../hooks/useEchelonRepay";
import { AssetIcon } from "../../shared/ui";
import { AssetInfo } from "../../../hooks/useEchelonTransactions";
import { TransactionSuccessMessage } from "../../shared/modals";

interface RepayAsset {
  symbol: string;
  icon: string;
  price: number;
  decimals: number;
  amount: string;
  marketAddress: string;
  faAddress?: string; // Fungible asset address
}

interface EchelonRepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: RepayAsset | null;
  availableBalance?: number; // Available balance of the asset to repay with
  onSuccess?: () => void; // Callback after successful transaction
}

const ECHELON_CONTRACT =
  "0x6a01d5761d43a5b5a0ccbfc42edf2d02c0611464aae99a2ea0e0d4819f0550b5";

export function EchelonRepayModal({
  isOpen,
  onClose,
  asset,
  availableBalance = 0,
  onSuccess,
}: EchelonRepayModalProps) {
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [displayTxHash, setDisplayTxHash] = useState<string | null>(null);
  // Track last shown txHash to prevent re-showing
  const lastShownTxHashRef = useRef<string | null>(null);

  // Use centralized repay hook
  const repay = useEchelonRepay({
    onSuccess: () => {
      // Reset form state after successful transaction
      setAmount("");
      setPercentage(0);
      if (onSuccess) {
        onSuccess();
      }
    },
  });

  // Show notification when txHash appears - only if it's a new txHash
  useEffect(() => {
    if (repay.txHash && repay.txHash !== lastShownTxHashRef.current) {
      // Only show if this is a new txHash we haven't shown before
      setDisplayTxHash(repay.txHash);
      lastShownTxHashRef.current = repay.txHash;
      // Reset amount input when transaction completes
      setAmount("");
    } else if (!repay.txHash) {
      setDisplayTxHash(null);
    }
  }, [repay.txHash]);

  // Clear displayTxHash when modal closes, reset tracking
  useEffect(() => {
    if (!isOpen) {
      setDisplayTxHash(null);
      lastShownTxHashRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen || !asset) return null;

  // Debt amount (what the user owes)
  const debtAmount = parseFloat(asset.amount) / Math.pow(10, asset.decimals);
  // Available balance to repay with (what the user has)
  const availableToRepay = availableBalance || 0;
  // Maximum amount that can be repaid (min of debt and available balance)
  const maxRepayable = Math.min(debtAmount, availableToRepay);

  const numericAmount = parseFloat(amount) || 0;
  const usdValue = numericAmount * asset.price;

  const handlePercentageChange = (pct: number) => {
    setPercentage(pct);
    const newAmount = (maxRepayable * pct) / 100;
    setAmount(newAmount.toFixed(8));
    if (repay.error) {
      repay.resetState();
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const num = parseFloat(value) || 0;
    const pct = maxRepayable > 0 ? (num / maxRepayable) * 100 : 0;
    setPercentage(Math.min(pct, 100));
    if (repay.error) {
      repay.resetState();
    }
  };

  const handleMax = () => {
    setAmount(maxRepayable.toFixed(8));
    setPercentage(100);
  };

  const handlePresetPercentage = (pct: number) => {
    handlePercentageChange(pct);
  };

  const handleRepay = async () => {
    if (!asset || numericAmount <= 0) {
      return;
    }

    await repay.handleRepay(
      {
        symbol: asset.symbol,
        decimals: asset.decimals,
        marketAddress: asset.marketAddress,
        faAddress: asset.faAddress,
      } as AssetInfo,
      numericAmount,
      maxRepayable
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-[calc(100%-2rem)] sm:w-[calc(100%-4rem)] max-w-sm sm:max-w-md rounded-xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 pb-3 sm:pb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-zinc-950 dark:text-zinc-50">
              Repay
            </h2>
            <p className="text-[10px] sm:text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 sm:mt-1">
              Repay your {asset.symbol} debt
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all duration-200"
          >
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          {/* Input Section */}
          <div className="rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/50 p-3 sm:p-5 mb-4 sm:mb-5">
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                  <AssetIcon
                    symbol={asset.symbol}
                    echelonIcon={asset.icon}
                    size="lg"
                    ring={true}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.000000"
                    className="bg-transparent text-zinc-950 dark:text-zinc-50 text-xl sm:text-2xl font-bold outline-none w-full placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                  />
                  <div className="text-zinc-500 dark:text-zinc-400 text-[10px] sm:text-xs md:text-sm mt-0.5">
                    ≈ $
                    {usdValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <button
                  onClick={handleMax}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs sm:text-sm font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                >
                  MAX
                </button>
                <div className="text-zinc-400 dark:text-zinc-500 text-[9px] sm:text-[10px] md:text-xs mt-1.5 sm:mt-2">
                  Debt:{" "}
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {debtAmount.toFixed(6)}
                  </span>{" "}
                  {asset.symbol}
                </div>
                <div className="text-zinc-400 dark:text-zinc-500 text-[9px] sm:text-[10px] md:text-xs">
                  Available:{" "}
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {availableToRepay.toFixed(6)}
                  </span>{" "}
                  {asset.symbol}
                </div>
              </div>
            </div>
          </div>

          {/* Percentage Presets */}
          <div className="flex gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => handlePresetPercentage(pct)}
                className={`flex-1 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  percentage === pct
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/25"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* Slider */}
          <div className="mb-4 sm:mb-6">
            <div className="relative h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full transition-all duration-200"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={percentage}
              onChange={(e) => handlePercentageChange(Number(e.target.value))}
              className="absolute w-full h-2 opacity-0 cursor-pointer"
              style={{ marginTop: "-8px" }}
            />
            <div className="flex justify-between text-[9px] sm:text-[10px] md:text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 sm:mt-2">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/30 p-3 sm:p-4 mb-4 sm:mb-6 space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs md:text-sm text-zinc-600 dark:text-zinc-400">
                Current Debt
              </span>
              <span className="text-[10px] sm:text-xs md:text-sm text-zinc-950 dark:text-zinc-50 font-medium">
                {debtAmount.toFixed(6)} {asset.symbol}
              </span>
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs md:text-sm text-zinc-600 dark:text-zinc-400">
                Repaying
              </span>
              <span className="text-[10px] sm:text-xs md:text-sm text-zinc-950 dark:text-zinc-50 font-medium">
                {numericAmount > 0 ? numericAmount.toFixed(6) : "0.000000"}{" "}
                {asset.symbol}
              </span>
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs md:text-sm text-zinc-600 dark:text-zinc-400">
                Remaining Debt
              </span>
              <span className="text-[10px] sm:text-xs md:text-sm text-zinc-950 dark:text-zinc-50 font-medium">
                {Math.max(0, debtAmount - numericAmount).toFixed(6)}{" "}
                {asset.symbol}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {repay.error && (
            <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[10px] sm:text-xs md:text-sm text-red-700 dark:text-red-400">
              {repay.error}
            </div>
          )}

          {/* Success Message */}
          {/* Success Message - Self-managing, shows for 5 seconds then auto-dismisses */}
          {displayTxHash && (
            <TransactionSuccessMessage
              key={displayTxHash}
              txHash={displayTxHash}
              onClose={() => {
                // Clear displayTxHash immediately when notification closes
                // This prevents it from showing again - notification is non-persistent
                setDisplayTxHash(null);
              }}
            />
          )}

          {/* Repay Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("[Repay] Button clicked", {
                numericAmount,
                repaying: repay.repaying,
                asset: asset?.symbol,
              });
              handleRepay();
            }}
            disabled={
              numericAmount <= 0 ||
              repay.repaying ||
              numericAmount > maxRepayable
            }
            className={`w-full py-2.5 sm:py-3 md:py-4 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm md:text-base lg:text-lg transition-all duration-200 ${
              numericAmount > 0 &&
              !repay.repaying &&
              numericAmount <= maxRepayable
                ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            {repay.repaying ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {repay.step || "Processing..."}
              </span>
            ) : numericAmount > 0 ? (
              `Repay ${asset.symbol}`
            ) : (
              "Repay"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
