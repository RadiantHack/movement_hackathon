"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useEchelonSupply } from "../../../hooks/useEchelonSupply";
import { AssetIcon } from "../../shared/ui";
import { AssetInfo } from "../../../hooks/useEchelonTransactions";
import { TransactionSuccessMessage } from "../../shared/modals";

interface EchelonAsset {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  supplyApr: number;
  faAddress?: string;
  decimals?: number;
  marketAddress?: string;
}

interface EchelonSupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: EchelonAsset | null;
  availableBalance?: number;
  inline?: boolean; // If true, renders inline without backdrop (for chat)
  onSuccess?: () => void; // Callback after successful transaction
}

// Market addresses for each asset
const MARKET_ADDRESSES: Record<string, string> = {
  MOVE: "0x568f96c4ed010869d810abcf348f4ff6b66d14ff09672fb7b5872e4881a25db7",
  USDC: "0x789d7711b7979d47a1622692559ccd221ef7c35bb04f8762dadb5cc70222a0a0",
  USDT: "0x8191d4b8c0fc0af511b3c56c555528a3e74b7f3cfab3047df9ebda803f3bc3d2",
  WBTC: "0xa24e2eaacf9603538af362f44dfcf9d411363923b9206260474abfaa8abebee4",
  WETH: "0x6889932d2ff09c9d299e72b23a62a7f07af807789c98141d08475701e7b21b7c",
  LBTC: "0x62cb5f64b5a9891c57ff12d38fbab141e18c3d63e859a595ff6525b4221eaf23",
  SolvBTC: "0x185f42070ab2ca5910ebfdea83c9f26f4015ad2c0f5c8e6ca1566d07c6c60aca",
  ezETH: "0x8dd513b2bb41f0180f807ecaa1e0d2ddfacd57bf739534201247deca13f3542",
  sUSDe: "0x481fe68db505bc15973d0014c35217726efd6ee353d91a2a9faaac201f3423d",
  rsETH: "0x4cbeca747528f340ef9065c93dea0cc1ac8a46b759e31fc8b8d04bc52a86614b",
};

// Type arguments for each asset
const TYPE_ARGUMENTS: Record<string, string> = {
  MOVE: "0x1::aptos_coin::AptosCoin",
  USDC: "0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39",
  USDT: "0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d",
  WBTC: "0xb06f29f24dde9c6daeec1f930f14a441a8d6c0fbea590725e88b340af3e1939c",
  WETH: "0x908828f4fb0213d4034c3ded1630bbd904e8a3a6bf3c63270887f0b06653a376",
  LBTC: "0x658f4ef6f76c8eeffdc06a30946f3f06723a7f9532e2413312b2a612183759c",
  SolvBTC: "0x527c43638a6c389a9ad702e7085f31c48223624d5102a5207dfab861f482c46d",
  ezETH: "0x2f6af255328fe11b88d840d1e367e946ccd16bd7ebddd6ee7e2ef9f7ae0c53ef",
  sUSDe: "0x74f0c7504507f7357f8a218cc70ce3fc0f4b4e9eb8474e53ca778cb1e0c6dcc5",
  rsETH: "0x51ffc9885233adf3dd411078cad57535ed1982013dc82d9d6c433a55f2e0035d",
};

export function EchelonSupplyModal({
  isOpen,
  onClose,
  asset,
  availableBalance = 0,
  inline = false,
  onSuccess,
}: EchelonSupplyModalProps) {
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [displayTxHash, setDisplayTxHash] = useState<string | null>(null);
  // Track last shown txHash to prevent re-showing
  const lastShownTxHashRef = useRef<string | null>(null);

  // Use centralized supply hook
  const supply = useEchelonSupply({
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
    if (supply.txHash && supply.txHash !== lastShownTxHashRef.current) {
      // Only show if this is a new txHash we haven't shown before
      setDisplayTxHash(supply.txHash);
      lastShownTxHashRef.current = supply.txHash;
      // Reset amount input when transaction completes
      setAmount("");
    } else if (!supply.txHash) {
      setDisplayTxHash(null);
    }
  }, [supply.txHash]);

  // Clear displayTxHash when modal closes, reset tracking
  useEffect(() => {
    if (!isOpen) {
      setDisplayTxHash(null);
      lastShownTxHashRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen || !asset) return null;

  const numericAmount = parseFloat(amount) || 0;
  const usdValue = numericAmount * asset.price;

  const handlePercentageChange = (pct: number) => {
    setPercentage(pct);
    const newAmount = (availableBalance * pct) / 100;
    setAmount(newAmount.toFixed(8));
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const num = parseFloat(value) || 0;
    const pct = availableBalance > 0 ? (num / availableBalance) * 100 : 0;
    setPercentage(Math.min(pct, 100));
  };

  const handleMax = () => {
    setAmount(availableBalance.toFixed(8));
    setPercentage(100);
  };

  const handlePresetPercentage = (pct: number) => {
    handlePercentageChange(pct);
  };

  const handleSupply = async () => {
    if (!asset || numericAmount <= 0) return;

    const marketAddress =
      MARKET_ADDRESSES[asset.symbol] || asset.marketAddress || "";

    if (!marketAddress) {
      return;
    }

    await supply.handleSupply(
      {
        symbol: asset.symbol,
        decimals: asset.decimals || 8,
        marketAddress,
        faAddress: asset.faAddress,
      } as AssetInfo,
      numericAmount,
      availableBalance
    );
  };

  if (!isOpen || !asset) {
    return null;
  }

  const content = (
    <div
      className={`${inline ? "w-full max-w-md mx-auto" : "relative w-full max-w-md"} rounded-3xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 ${inline ? "shadow-lg" : "shadow-2xl"} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
            Supply
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Select the amount you&apos;d like to supply
          </p>
        </div>
        {!inline && (
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all duration-200"
          >
            <svg
              className="w-5 h-5"
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
        )}
      </div>

      <div className="px-6 pb-6">
        {/* Input Section */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/50 p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <AssetIcon
                  symbol={asset.symbol}
                  echelonIcon={asset.icon}
                  size="lg"
                  ring={true}
                />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white dark:border-zinc-800 flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-zinc-950 dark:text-zinc-50 text-2xl font-bold outline-none w-full placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                />
                <div className="text-zinc-500 dark:text-zinc-400 text-sm mt-0.5">
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
                className="px-4 py-2 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-sm font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
              >
                MAX
              </button>
              <div className="text-zinc-400 dark:text-zinc-500 text-xs mt-2">
                Available:{" "}
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                  {availableBalance.toFixed(4)}
                </span>{" "}
                {asset.symbol}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/30 p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="text-sm">Supply APR</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {asset.supplyApr.toFixed(2)}%
              </span>
              <span className="text-purple-400">✨</span>
            </div>
          </div>
          <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm">Health factor</span>
            </div>
            <span className="text-lg font-bold text-green-500">∞</span>
          </div>
        </div>

        {/* Error Message */}
        {supply.error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {supply.error}
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

        {/* Supply Button */}
        <button
          onClick={handleSupply}
          disabled={
            (!numericAmount || numericAmount <= 0 || supply.supplying) &&
            !supply.txHash
          }
          className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 ${
            supply.txHash
              ? "bg-green-600 text-white cursor-pointer"
              : numericAmount > 0 && !supply.supplying
                ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
          }`}
        >
          {displayTxHash ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Transaction Complete
            </span>
          ) : supply.supplying ? (
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
              {supply.step || "Processing..."}
            </span>
          ) : numericAmount > 0 ? (
            `Supply ${asset.symbol}`
          ) : (
            "Enter an amount"
          )}
        </button>
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      {/* Modal */}
      {content}
    </div>
  );
}
