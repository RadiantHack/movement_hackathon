/**
 * Assets to Supply card component
 * Extracted from echelon/page.tsx for better component organization
 */

import { AssetIcon } from "../shared/ui";
import type { EchelonAsset } from "../../types/echelon";

interface AssetsToSupplyCardProps {
  assets: EchelonAsset[];
  loading: boolean;
  hideZeroBalance: boolean;
  availableBalances: Record<string, number>;
  onToggleHideZeroBalance: () => void;
  onSupply: (asset: EchelonAsset) => void;
}

export function AssetsToSupplyCard({
  assets,
  loading,
  hideZeroBalance,
  availableBalances,
  onToggleHideZeroBalance,
  onSupply,
}: AssetsToSupplyCardProps) {
  const filteredSupplyAssets = hideZeroBalance
    ? assets.filter((a) => {
        const balance = availableBalances[a.symbol.toUpperCase()] || 0;
        return balance > 0;
      })
    : assets;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Assets to Supply
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Hide 0 balance ({filteredSupplyAssets.length})
          </span>
          <button
            onClick={onToggleHideZeroBalance}
            className={`relative w-11 h-6 rounded-full transition-all duration-300 ease-in-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 ${
              hideZeroBalance
                ? "bg-gradient-to-r from-purple-500 to-violet-500 shadow-lg shadow-purple-500/30"
                : "bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
            }`}
            aria-label={
              hideZeroBalance ? "Show all assets" : "Hide zero balance assets"
            }
            type="button"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ease-in-out pointer-events-none ${
                hideZeroBalance
                  ? "translate-x-5 shadow-purple-500/20"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Desktop Table Header */}
      <div className="hidden sm:grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-1">
          Asset <span className="text-zinc-400 dark:text-zinc-600">↕</span>
        </div>
        <div className="flex items-center gap-1">
          Price <span className="text-zinc-400 dark:text-zinc-600">↕</span>
        </div>
        <div className="flex items-center gap-1">
          Supply APR <span className="text-zinc-400 dark:text-zinc-600">↕</span>
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
          {filteredSupplyAssets.map((asset) => (
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
                  Price
                </div>
                <div className="text-zinc-950 dark:text-zinc-50 text-sm sm:text-base">
                  $
                  {asset.price < 1
                    ? asset.price.toFixed(4)
                    : asset.price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                </div>
              </div>
              <div className="sm:block">
                <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                  Supply APR
                </div>
                <div
                  className={
                    asset.supplyApr > 0
                      ? "text-purple-600 dark:text-purple-400 text-sm sm:text-base"
                      : "text-zinc-500 dark:text-zinc-400 text-sm sm:text-base"
                  }
                >
                  {asset.supplyApr > 0
                    ? `${asset.supplyApr.toFixed(2)}%`
                    : "0.00%"}
                </div>
              </div>
              <div className="sm:block">
                <button
                  onClick={() => onSupply(asset)}
                  className="w-full sm:w-auto px-4 py-2 sm:py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                >
                  Supply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
