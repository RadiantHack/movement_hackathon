/**
 * Echelon modals component
 * Groups all modals for better organization
 * Extracted from echelon/page.tsx
 */

import {
  EchelonSupplyModal,
  EchelonBorrowModal,
  EchelonWithdrawModal,
  EchelonRepayModal,
} from "../lending/echelon";
import type { EchelonAsset, UserSupply, UserBorrow } from "../../types/echelon";
import type { MarketStats } from "../../types/echelon";

interface EchelonModalsProps {
  supplyModalOpen: boolean;
  borrowModalOpen: boolean;
  withdrawModalOpen: boolean;
  repayModalOpen: boolean;
  selectedAsset: EchelonAsset | null;
  selectedWithdrawAsset: UserSupply | null;
  selectedRepayAsset: UserBorrow | null;
  assets: EchelonAsset[];
  availableBalances: Record<string, number>;
  availableBorrowBalance: number;
  availableWithdrawBalance: number;
  maxRepayable: number | null;
  totalSupplyBalance: number;
  totalBorrowBalance: number;
  userSupplies: UserSupply[];
  userBorrows: UserBorrow[];
  loadingVault: boolean;
  loadingMaxBorrow: boolean;
  loadingMaxWithdraw: boolean;
  supplyAmounts: Record<string, number>;
  withdrawableAmounts: Record<string, number>;
  onCloseSupply: () => void;
  onCloseBorrow: () => void;
  onCloseWithdraw: () => void;
  onCloseRepay: () => void;
  onSupplySuccess: () => Promise<void>;
  onBorrowSuccess: () => Promise<void>;
  onWithdrawSuccess: () => Promise<void>;
  onRepaySuccess: () => Promise<void>;
}

export function EchelonModals({
  supplyModalOpen,
  borrowModalOpen,
  withdrawModalOpen,
  repayModalOpen,
  selectedAsset,
  selectedWithdrawAsset,
  selectedRepayAsset,
  assets,
  availableBalances,
  availableBorrowBalance,
  availableWithdrawBalance,
  maxRepayable,
  totalSupplyBalance,
  totalBorrowBalance,
  userSupplies,
  userBorrows,
  loadingVault,
  loadingMaxBorrow,
  loadingMaxWithdraw,
  supplyAmounts,
  withdrawableAmounts,
  onCloseSupply,
  onCloseBorrow,
  onCloseWithdraw,
  onCloseRepay,
  onSupplySuccess,
  onBorrowSuccess,
  onWithdrawSuccess,
  onRepaySuccess,
}: EchelonModalsProps) {
  return (
    <>
      <EchelonSupplyModal
        isOpen={supplyModalOpen}
        onClose={onCloseSupply}
        asset={selectedAsset}
        availableBalance={
          selectedAsset
            ? availableBalances[selectedAsset.symbol.toUpperCase()] || 0
            : 0
        }
        onSuccess={onSupplySuccess}
      />

      <EchelonBorrowModal
        isOpen={borrowModalOpen}
        onClose={onCloseBorrow}
        asset={selectedAsset}
        availableBalance={availableBorrowBalance}
        totalSupplyBalance={totalSupplyBalance}
        totalBorrowBalance={totalBorrowBalance}
        hasCollateral={userSupplies.length > 0 || totalSupplyBalance > 0}
        loadingVault={loadingVault || loadingMaxBorrow}
        onSuccess={onBorrowSuccess}
      />

      <EchelonWithdrawModal
        isOpen={withdrawModalOpen}
        onClose={onCloseWithdraw}
        asset={
          selectedWithdrawAsset
            ? {
                symbol: selectedWithdrawAsset.symbol,
                icon: selectedWithdrawAsset.icon,
                price: selectedWithdrawAsset.price,
                decimals: selectedWithdrawAsset.decimals,
                amount: (() => {
                  const withdrawableAmount =
                    withdrawableAmounts[selectedWithdrawAsset.marketAddress];
                  const onChainSupplyAmount =
                    supplyAmounts[selectedWithdrawAsset.marketAddress];

                  let displayAmount: number;

                  if (userBorrows.length > 0) {
                    if (withdrawableAmount !== undefined) {
                      displayAmount = withdrawableAmount;
                    } else if (onChainSupplyAmount !== undefined) {
                      displayAmount = onChainSupplyAmount;
                    } else {
                      displayAmount =
                        parseFloat(selectedWithdrawAsset.amount) /
                        Math.pow(10, selectedWithdrawAsset.decimals);
                    }
                  } else {
                    if (onChainSupplyAmount !== undefined) {
                      displayAmount = onChainSupplyAmount;
                    } else {
                      displayAmount =
                        parseFloat(selectedWithdrawAsset.amount) /
                        Math.pow(10, selectedWithdrawAsset.decimals);
                    }
                  }

                  return (
                    displayAmount * Math.pow(10, selectedWithdrawAsset.decimals)
                  ).toString();
                })(),
                marketAddress: selectedWithdrawAsset.marketAddress,
                faAddress: assets.find(
                  (a) => a.symbol === selectedWithdrawAsset.symbol
                )?.faAddress,
              }
            : null
        }
        availableBalance={availableWithdrawBalance}
        loadingAvailableBalance={loadingMaxWithdraw}
        totalSupplyBalance={totalSupplyBalance}
        totalBorrowBalance={totalBorrowBalance}
        onSuccess={onWithdrawSuccess}
      />

      <EchelonRepayModal
        isOpen={repayModalOpen}
        onClose={onCloseRepay}
        asset={
          selectedRepayAsset
            ? {
                symbol: selectedRepayAsset.symbol,
                icon: selectedRepayAsset.icon,
                price: selectedRepayAsset.price,
                decimals: selectedRepayAsset.decimals,
                amount: selectedRepayAsset.amount,
                marketAddress: selectedRepayAsset.marketAddress,
                faAddress: assets.find(
                  (a) => a.symbol === selectedRepayAsset.symbol
                )?.faAddress,
              }
            : null
        }
        availableBalance={
          selectedRepayAsset
            ? Math.min(
                availableBalances[selectedRepayAsset.symbol.toUpperCase()] || 0,
                maxRepayable !== null ? maxRepayable : Infinity
              )
            : 0
        }
        onChainLiability={maxRepayable}
        totalSupplyBalance={totalSupplyBalance}
        totalBorrowBalance={totalBorrowBalance}
        onSuccess={onRepaySuccess}
      />
    </>
  );
}
