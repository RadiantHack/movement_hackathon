"use client";

import { useState } from "react";

interface EchelonAsset {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  borrowApr: number;
  borrowCap: number;
}

interface EchelonBorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: EchelonAsset | null;
  availableBalance?: number;
}

export function EchelonBorrowModal({
  isOpen,
  onClose,
  asset,
  availableBalance = 0.255919,
}: EchelonBorrowModalProps) {
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState(0);

  if (!isOpen || !asset) return null;

  const numericAmount = parseFloat(amount) || 0;
  const usdValue = numericAmount * asset.price;
  const rateLimit = 184608.6;
  const rateLimitMax = 500000;

  const handlePercentageChange = (pct: number) => {
    setPercentage(pct);
    const newAmount = (availableBalance * pct) / 100;
    setAmount(newAmount.toFixed(6));
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const num = parseFloat(value) || 0;
    const pct = availableBalance > 0 ? (num / availableBalance) * 100 : 0;
    setPercentage(Math.min(pct, 100));
  };

  const handleMax = () => {
    setAmount(availableBalance.toFixed(6));
    setPercentage(100);
  };

  const handlePresetPercentage = (pct: number) => {
    handlePercentageChange(pct);
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
              Borrow
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Select the amount you&apos;d like to borrow
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
                  {asset.icon ? (
                    <img
                      src={
                        asset.icon.startsWith("/")
                          ? `https://app.echelon.market${asset.icon}`
                          : asset.icon
                      }
                      alt={asset.symbol}
                      className="w-12 h-12 rounded-full ring-2 ring-white dark:ring-zinc-800 shadow-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center ring-2 ring-white dark:ring-zinc-800 shadow-lg">
                      <span className="text-white font-bold text-lg">
                        {asset.symbol.charAt(0)}
                      </span>
                    </div>
                  )}
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
                  Available:{" "}
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {availableBalance.toFixed(6)}
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
                    d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                  />
                </svg>
                <span className="text-sm">Borrow APR</span>
                <svg
                  className="w-3.5 h-3.5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                  <path
                    strokeLinecap="round"
                    strokeWidth={1.5}
                    d="M12 16v-4m0-4h.01"
                  />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {asset.borrowApr.toFixed(2)}%
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
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span className="text-sm">Origination Fee</span>
                <svg
                  className="w-3.5 h-3.5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                  <path
                    strokeLinecap="round"
                    strokeWidth={1.5}
                    d="M12 16v-4m0-4h.01"
                  />
                </svg>
              </div>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                0 {asset.symbol}
              </span>
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
                <svg
                  className="w-3.5 h-3.5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                  <path
                    strokeLinecap="round"
                    strokeWidth={1.5}
                    d="M12 16v-4m0-4h.01"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold text-green-500">∞%</span>
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span className="text-sm">Rate limit</span>
                <svg
                  className="w-3.5 h-3.5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                  <path
                    strokeLinecap="round"
                    strokeWidth={1.5}
                    d="M12 16v-4m0-4h.01"
                  />
                </svg>
              </div>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                {rateLimit.toLocaleString()} / {rateLimitMax.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Borrow Button */}
          <button
            disabled={numericAmount <= 0}
            className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 ${
              numericAmount > 0
                ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            {numericAmount > 0 ? `Borrow ${asset.symbol}` : "Borrow"}
          </button>
        </div>
      </div>
    </div>
  );
}


