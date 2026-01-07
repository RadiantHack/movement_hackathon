"use client";

import { useState, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMovementWallet } from "../hooks/useMovementWallet";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { executeRepayTransaction } from "../hooks/useEchelonTransactions";
import { AssetIcon } from "./asset-icon";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");

  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();

  const movementWallet = useMovementWallet();

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
    if (error) {
      setError(null);
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const num = parseFloat(value) || 0;
    const pct = maxRepayable > 0 ? (num / maxRepayable) * 100 : 0;
    setPercentage(Math.min(pct, 100));
    if (error) {
      setError(null);
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
    console.log("[Repay] handleRepay called", {
      asset,
      numericAmount,
      debtAmount,
      availableToRepay,
    });

    if (!asset || numericAmount <= 0) {
      console.log("[Repay] Validation failed", {
        asset: !!asset,
        numericAmount,
      });
      setError("Please enter a valid amount to repay");
      return;
    }

    if (!movementWallet) {
      console.log("[Repay] No wallet connected");
      setError("Please connect a Movement wallet");
      return;
    }

    // Validate amount doesn't exceed debt
    if (numericAmount > debtAmount) {
      setError(
        `Cannot repay more than the debt amount (${debtAmount.toFixed(6)} ${asset.symbol})`
      );
      return;
    }

    // Validate amount doesn't exceed available balance
    if (numericAmount > availableToRepay) {
      setError(
        `Insufficient balance. You have ${availableToRepay.toFixed(6)} ${asset.symbol} available.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setTxHash(null);

    try {
      const result = await executeRepayTransaction({
        asset: {
          symbol: asset.symbol,
          decimals: asset.decimals,
          marketAddress: asset.marketAddress,
          faAddress: asset.faAddress,
        },
        amount: numericAmount,
        maxRepayable: debtAmount,
        movementWallet: movementWallet as any,
        publicKey: (movementWallet as any).publicKey as string,
        signRawHash,
        onStepChange: setStep,
      });

      if (result.success && result.txHash) {
        setTxHash(result.txHash);
        setStep("");

        // Call onSuccess callback to refresh data
        if (onSuccess) {
          onSuccess();
        }

        // Close modal after a delay
        setTimeout(() => {
          onClose();
          setAmount("");
          setTxHash(null);
        }, 2000);
      } else {
        setError(result.error || "Transaction failed");
        setStep("");
      }
    } catch (err: any) {
      console.error("[Repay] Unexpected error:", err);
      setError(err.message || "An unexpected error occurred");
      setStep("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
              Repay
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Repay your {asset.symbol} debt
            </p>
          </div>
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
                </div>
                <div>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.000000"
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
                  Debt:{" "}
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {debtAmount.toFixed(6)}
                  </span>{" "}
                  {asset.symbol}
                </div>
                <div className="text-zinc-400 dark:text-zinc-500 text-xs">
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
          <div className="flex gap-2 mb-4">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => handlePresetPercentage(pct)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
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
          <div className="mb-6">
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
            <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500 mt-2">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/30 p-4 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Current Debt
              </span>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                {debtAmount.toFixed(6)} {asset.symbol}
              </span>
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Repaying
              </span>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                {numericAmount > 0 ? numericAmount.toFixed(6) : "0.000000"}{" "}
                {asset.symbol}
              </span>
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Remaining Debt
              </span>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                {Math.max(0, debtAmount - numericAmount).toFixed(6)}{" "}
                {asset.symbol}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Success Message */}
          {txHash && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-400">
              <div className="flex items-center gap-2 flex-wrap">
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-medium">Transaction successful!</span>
                <a
                  href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 underline font-semibold flex items-center gap-1"
                >
                  View Transaction
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
              <div className="mt-2 text-xs font-mono text-green-600 dark:text-green-400 break-all">
                {txHash}
              </div>
            </div>
          )}

          {/* Step Message */}
          {step && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-400">
              {step}
            </div>
          )}

          {/* Repay Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("[Repay] Button clicked", {
                numericAmount,
                submitting,
                asset: asset?.symbol,
              });
              handleRepay();
            }}
            disabled={
              numericAmount <= 0 || submitting || numericAmount > maxRepayable
            }
            className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 ${
              numericAmount > 0 && !submitting && numericAmount <= maxRepayable
                ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            {submitting
              ? step || "Processing..."
              : numericAmount > 0
                ? `Repay ${asset.symbol}`
                : "Repay"}
          </button>
        </div>
      </div>
    </div>
  );
}
