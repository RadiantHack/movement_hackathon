/**
 * Assets to Borrow card component
 * Extracted from echelon/page.tsx for better component organization
 */

import { AssetIcon } from "../shared/ui";
import type { EchelonAsset } from "../../types/echelon";

interface AssetsToBorrowCardProps {
  assets: EchelonAsset[];
  loading: boolean;
  onBorrow: (asset: EchelonAsset) => void;
}

export function AssetsToBorrowCard({
  assets,
  loading,
  onBorrow,
}: AssetsToBorrowCardProps) {
  const borrowableAssets = assets.filter((a) => a.borrowCap > 0);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6">
      <h2 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 mb-4">
        Assets to Borrow
      </h2>

      {/* Desktop Table Header */}
      <div className="hidden sm:grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-1">
          Asset <span className="text-zinc-400 dark:text-zinc-600">↕</span>
        </div>
        <div className="flex items-center gap-1">
          Available <span className="text-zinc-400 dark:text-zinc-600">↕</span>
        </div>
        <div className="flex items-center gap-1">
          Borrow APR <span className="text-zinc-400 dark:text-zinc-600">↕</span>
        </div>
        <div></div>
      </div>

      {/* Asset Rows */}
      {loading ? (
        <div className="py-8 text-center text-zinc-500 dark:text-zinc-400">
          Loading markets...
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {borrowableAssets.map((asset) => (
            <div
              key={asset.symbol}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 py-3 sm:items-center"
            >
              <div className="flex items-center gap-3">
                <AssetIcon
                  symbol={asset.symbol}
                  echelonIcon={asset.icon}
                  size="md"
                  showBadge={true}
                />
                <span className="text-zinc-950 dark:text-zinc-50 font-medium text-sm sm:text-base">
                  {asset.symbol}
                </span>
              </div>
              <div className="sm:block">
                <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                  Available
                </div>
                <div className="text-zinc-950 dark:text-zinc-50 text-sm sm:text-base">
                  {asset.borrowCap >= 1000
                    ? asset.borrowCap.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })
                    : asset.borrowCap.toFixed(2)}
                </div>
                <div className="text-zinc-500 dark:text-zinc-400 text-xs">
                  $
                  {(asset.borrowCap * asset.price).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div className="sm:block">
                <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                  Borrow APR
                </div>
                <div
                  className={
                    asset.borrowApr > 0
                      ? "text-purple-600 dark:text-purple-400 text-sm sm:text-base"
                      : "text-zinc-500 dark:text-zinc-400 text-sm sm:text-base"
                  }
                >
                  {asset.borrowApr > 0
                    ? `${asset.borrowApr.toFixed(2)}%`
                    : "0.00%"}
                </div>
              </div>
              <div className="sm:block">
                <button
                  onClick={() => onBorrow(asset)}
                  className="w-full sm:w-auto px-4 py-2 sm:py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                >
                  Borrow
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
