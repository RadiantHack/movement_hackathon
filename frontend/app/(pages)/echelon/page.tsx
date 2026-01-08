"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState, useMemo } from "react";
import { Sidebar, RightSidebar, AuthGuard } from "../../components/shared/ui";
import { useMovementWallet } from "../../hooks/useMovementWallet";
import { useEchelonMarkets } from "../../hooks/useEchelonMarkets";
import { useEchelonVaultData } from "../../hooks/useEchelonVaultData";
import { useEchelonTotals } from "../../hooks/useEchelonTotals";
import { useEchelonModalHandlers } from "../../hooks/useEchelonModalHandlers";
import { fetchAvailableBalances } from "../../hooks/useEchelonVault";
import { useEchelonMaxBorrow } from "../../hooks/useEchelonMaxBorrow";
import { useEchelonMaxWithdraw } from "../../hooks/useEchelonMaxWithdraw";
import { useEchelonMaxRepay } from "../../hooks/useEchelonMaxRepay";
import { useEchelonSupplyAmounts } from "../../hooks/useEchelonSupplyAmounts";
import { useEchelonWithdrawableAmounts } from "../../hooks/useEchelonWithdrawableAmounts";
import { EchelonHeader } from "../../components/echelon/EchelonHeader";
import { YourSuppliesCard } from "../../components/echelon/YourSuppliesCard";
import { YourBorrowsCard } from "../../components/echelon/YourBorrowsCard";
import { AssetsToSupplyCard } from "../../components/echelon/AssetsToSupplyCard";
import { AssetsToBorrowCard } from "../../components/echelon/AssetsToBorrowCard";
import { EchelonModals } from "../../components/echelon/EchelonModals";
import type { EchelonAsset, UserSupply, UserBorrow } from "../../types/echelon";

export default function EchelonPage() {
  const { ready, authenticated } = usePrivy();
  const movementWallet = useMovementWallet();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [hideZeroBalance, setHideZeroBalance] = useState(false);
  const [availableBalances, setAvailableBalances] = useState<
    Record<string, number>
  >({});
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [repayModalOpen, setRepayModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<EchelonAsset | null>(null);
  const [selectedWithdrawAsset, setSelectedWithdrawAsset] =
    useState<UserSupply | null>(null);
  const [selectedRepayAsset, setSelectedRepayAsset] =
    useState<UserBorrow | null>(null);

  // Fetch markets data
  const { assets, marketStats, loading, error } = useEchelonMarkets();

  // Fetch vault data
  const { userSupplies, userBorrows, loadingVault, fetchVault } =
    useEchelonVaultData(movementWallet?.address, assets);

  // Fetch on-chain supply amounts
  const {
    supplyAmounts,
    loading: loadingSupplyAmounts,
    refresh: refreshSupplyAmounts,
  } = useEchelonSupplyAmounts(userSupplies);

  // Fetch on-chain withdrawable amounts
  const {
    withdrawableAmounts,
    loading: loadingWithdrawableAmounts,
    refresh: refreshWithdrawableAmounts,
  } = useEchelonWithdrawableAmounts(userSupplies);

  // Calculate totals
  const {
    totalSupplyBalance,
    totalSupplyApr,
    totalBorrowBalance,
    totalBorrowApr,
  } = useEchelonTotals({
    userSupplies,
    userBorrows,
    supplyAmounts,
  });

  // Max borrowable for selected asset
  const marketAddress = selectedAsset?.market || null;
  const decimals = selectedAsset?.decimals || 8;
  const {
    maxBorrowable,
    loading: loadingMaxBorrow,
    refresh: refreshMaxBorrow,
  } = useEchelonMaxBorrow(marketAddress, decimals);
  const availableBorrowBalance =
    maxBorrowable !== null ? Math.max(0, maxBorrowable) : 0;

  // Max withdrawable for selected withdraw asset
  const withdrawMarketAddress = selectedWithdrawAsset?.marketAddress || null;
  const withdrawDecimals = selectedWithdrawAsset?.decimals || 8;
  const {
    maxWithdrawable,
    loading: loadingMaxWithdraw,
    refresh: refreshMaxWithdraw,
  } = useEchelonMaxWithdraw(withdrawMarketAddress, withdrawDecimals);

  // Available withdraw balance calculation
  const availableWithdrawBalance = useMemo(() => {
    if (!selectedWithdrawAsset) return 0;
    const withdrawableAmount =
      withdrawableAmounts[selectedWithdrawAsset.marketAddress];
    if (userBorrows.length > 0) {
      if (withdrawableAmount !== undefined) {
        return withdrawableAmount;
      }
      if (maxWithdrawable !== null) {
        return maxWithdrawable;
      }
    }
    const onChainSupplyAmount =
      supplyAmounts[selectedWithdrawAsset.marketAddress];
    if (onChainSupplyAmount !== undefined) {
      return onChainSupplyAmount;
    }
    return availableBalances[selectedWithdrawAsset.symbol.toUpperCase()] || 0;
  }, [
    selectedWithdrawAsset,
    userBorrows.length,
    maxWithdrawable,
    withdrawableAmounts,
    supplyAmounts,
    availableBalances,
  ]);

  // Max repayable for selected repay asset
  const repayMarketAddress = selectedRepayAsset?.marketAddress || null;
  const repayDecimals = selectedRepayAsset?.decimals || 8;
  const {
    maxRepayable,
    loading: loadingMaxRepay,
    refresh: refreshMaxRepay,
  } = useEchelonMaxRepay(repayMarketAddress, repayDecimals);

  // Load available balances
  useEffect(() => {
    const loadBalances = async () => {
      if (movementWallet?.address) {
        const balances = await fetchAvailableBalances(movementWallet.address);
        setAvailableBalances(balances);
      }
    };
    loadBalances();
  }, [movementWallet?.address]);

  // Fetch vault when wallet or assets change
  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  // Modal handlers
  const {
    handleSupplySuccess,
    handleBorrowSuccess,
    handleWithdrawSuccess,
    handleRepaySuccess,
  } = useEchelonModalHandlers({
    walletAddress: movementWallet?.address,
    fetchVault,
    refreshMaxBorrow,
    refreshMaxRepay,
    refreshMaxWithdraw,
    refreshSupplyAmounts,
    refreshWithdrawableAmounts,
    setAvailableBalances,
  });

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-auto">
          <EchelonHeader
            onSidebarToggle={() => setSidebarOpen(true)}
            onRightSidebarToggle={() => setRightSidebarOpen(true)}
          />

          <div className="p-3 sm:p-4 md:p-6 lg:p-8">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="mx-auto max-w-7xl grid gap-4 sm:gap-6 lg:grid-cols-2">
              <YourSuppliesCard
                userSupplies={userSupplies}
                loadingVault={loadingVault}
                supplyAmounts={supplyAmounts}
                loadingSupplyAmounts={loadingSupplyAmounts}
                onWithdraw={(supply) => {
                  setSelectedWithdrawAsset(supply);
                  setWithdrawModalOpen(true);
                }}
                totalSupplyBalance={totalSupplyBalance}
                totalSupplyApr={totalSupplyApr}
              />

              <YourBorrowsCard
                userBorrows={userBorrows}
                loadingVault={loadingVault}
                onRepay={(borrow) => {
                  setSelectedRepayAsset(borrow);
                  setRepayModalOpen(true);
                }}
                totalBorrowBalance={totalBorrowBalance}
                totalBorrowApr={totalBorrowApr}
                totalSupplyBalance={totalSupplyBalance}
              />

              <AssetsToSupplyCard
                assets={assets}
                loading={loading}
                hideZeroBalance={hideZeroBalance}
                availableBalances={availableBalances}
                onToggleHideZeroBalance={() =>
                  setHideZeroBalance(!hideZeroBalance)
                }
                onSupply={(asset) => {
                  setSelectedAsset(asset);
                  setSupplyModalOpen(true);
                }}
              />

              <AssetsToBorrowCard
                assets={assets}
                loading={loading}
                onBorrow={(asset) => {
                  setSelectedAsset(asset);
                  setBorrowModalOpen(true);
                }}
              />
            </div>
          </div>
        </main>

        <RightSidebar
          isOpen={rightSidebarOpen}
          onClose={() => setRightSidebarOpen(false)}
        />

        <EchelonModals
          supplyModalOpen={supplyModalOpen}
          borrowModalOpen={borrowModalOpen}
          withdrawModalOpen={withdrawModalOpen}
          repayModalOpen={repayModalOpen}
          selectedAsset={selectedAsset}
          selectedWithdrawAsset={selectedWithdrawAsset}
          selectedRepayAsset={selectedRepayAsset}
          assets={assets}
          availableBalances={availableBalances}
          availableBorrowBalance={availableBorrowBalance}
          availableWithdrawBalance={availableWithdrawBalance}
          maxRepayable={maxRepayable}
          totalSupplyBalance={totalSupplyBalance}
          totalBorrowBalance={totalBorrowBalance}
          userSupplies={userSupplies}
          userBorrows={userBorrows}
          loadingVault={loadingVault}
          loadingMaxBorrow={loadingMaxBorrow}
          loadingMaxWithdraw={loadingMaxWithdraw}
          supplyAmounts={supplyAmounts}
          withdrawableAmounts={withdrawableAmounts}
          onCloseSupply={() => {
            setSupplyModalOpen(false);
            setSelectedAsset(null);
          }}
          onCloseBorrow={() => {
            setBorrowModalOpen(false);
            setSelectedAsset(null);
          }}
          onCloseWithdraw={() => {
            setWithdrawModalOpen(false);
            setSelectedWithdrawAsset(null);
          }}
          onCloseRepay={() => {
            setRepayModalOpen(false);
            setSelectedRepayAsset(null);
          }}
          onSupplySuccess={handleSupplySuccess}
          onBorrowSuccess={handleBorrowSuccess}
          onWithdrawSuccess={handleWithdrawSuccess}
          onRepaySuccess={handleRepaySuccess}
        />
      </div>
    </AuthGuard>
  );
}
