/**
 * Your Supplies card component
 * Extracted from echelon/page.tsx for better component organization
 */

import { AssetIcon } from "../shared/ui";
import type { UserSupply } from "../../types/echelon";

interface YourSuppliesCardProps {
  userSupplies: UserSupply[];
  loadingVault: boolean;
  supplyAmounts: Record<string, number>;
  loadingSupplyAmounts: boolean;
  onWithdraw: (supply: UserSupply) => void;
  totalSupplyBalance: number;
  totalSupplyApr: number;
}

export function YourSuppliesCard({
  userSupplies,
  loadingVault,
  supplyAmounts,
  loadingSupplyAmounts,
  onWithdraw,
  totalSupplyBalance,
  totalSupplyApr,
}: YourSuppliesCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Your Supplies
        </h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">
            Balance{" "}
            <span className="text-zinc-950 dark:text-zinc-50">
              ${totalSupplyBalance.toFixed(2)}
            </span>
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            APR{" "}
            <span className="text-purple-600 dark:text-purple-400">
              {totalSupplyApr.toFixed(2)}%
            </span>
          </span>
        </div>
      </div>
      {loadingVault ? (
        <div className="text-zinc-500 dark:text-zinc-400 text-sm">
          Loading...
        </div>
      ) : userSupplies.length === 0 ? (
        <div className="text-zinc-500 dark:text-zinc-400 text-sm">
          Nothing supplied yet
        </div>
      ) : (
        <>
          {/* Desktop Table Header */}
          <div className="hidden sm:grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div>Asset</div>
            <div>Balance</div>
            <div>APR</div>
            <div></div>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {userSupplies.map((supply) => {
              const onChainSupplyAmount = supplyAmounts[supply.marketAddress];
              const vaultAmount =
                parseFloat(supply.amount) / Math.pow(10, supply.decimals);
              let amount: number;
              const isItemLoading =
                onChainSupplyAmount === undefined && loadingSupplyAmounts;

              if (isItemLoading) {
                amount = vaultAmount;
              } else if (onChainSupplyAmount !== undefined) {
                amount = onChainSupplyAmount;
              } else {
                amount = vaultAmount;
              }

              const usdValue = amount * supply.price;
              return (
                <div
                  key={supply.marketAddress}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 py-3 sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    <AssetIcon
                      symbol={supply.symbol}
                      echelonIcon={supply.icon}
                      size="md"
                      showBadge={true}
                    />
                    <span className="text-zinc-950 dark:text-zinc-50 font-medium text-sm sm:text-base">
                      {supply.symbol}
                    </span>
                  </div>
                  <div className="sm:block">
                    <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                      Balance
                    </div>
                    {isItemLoading ? (
                      <div className="text-zinc-500 dark:text-zinc-400 text-sm sm:text-base">
                        Loading...
                      </div>
                    ) : (
                      <>
                        <div className="text-zinc-950 dark:text-zinc-50 text-sm sm:text-base">
                          {amount.toFixed(2)}
                        </div>
                        <div className="text-zinc-500 dark:text-zinc-400 text-xs">
                          ${usdValue.toFixed(2)}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="sm:block">
                    <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                      APR
                    </div>
                    <div className="text-purple-600 dark:text-purple-400 text-sm sm:text-base">
                      {supply.apr.toFixed(2)}%
                    </div>
                  </div>
                  <div className="sm:block">
                    <button
                      onClick={() => onWithdraw(supply)}
                      className="w-full sm:w-auto px-4 py-2 sm:py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                    >
                      Withdraw
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
