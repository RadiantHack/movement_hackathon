"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { EchelonSupplyModal } from "../components/echelon-supply-modal";
import { EchelonBorrowModal } from "../components/echelon-borrow-modal";
import { EchelonWithdrawModal } from "../components/echelon-withdraw-modal";

interface EchelonAsset {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  supplyApr: number;
  borrowApr: number;
  supplyCap: number;
  borrowCap: number;
  ltv: number;
  decimals: number;
  faAddress: string;
  market?: string;
  totalCash?: number;
}

interface MarketStats {
  totalShares: number;
  totalLiability: number;
  totalReserve: number;
  totalCash: number;
}

interface UserSupply {
  marketAddress: string;
  amount: string;
  symbol: string;
  icon: string;
  price: number;
  apr: number;
  decimals: number;
}

interface UserBorrow {
  marketAddress: string;
  amount: string;
  symbol: string;
  icon: string;
  price: number;
  apr: number;
  decimals: number;
}

// Market address to symbol mapping
const MARKET_TO_SYMBOL: Record<string, string> = {
  "0x568f96c4ed010869d810abcf348f4ff6b66d14ff09672fb7b5872e4881a25db7": "MOVE",
  "0x789d7711b7979d47a1622692559ccd221ef7c35bb04f8762dadb5cc70222a0a0": "USDC",
  "0x8191d4b8c0fc0af511b3c56c555528a3e74b7f3cfab3047df9ebda803f3bc3d2": "USDT",
  "0xa24e2eaacf9603538af362f44dfcf9d411363923b9206260474abfaa8abebee4": "WBTC",
  "0x6889932d2ff09c9d299e72b23a62a7f07af807789c98141d08475701e7b21b7c": "WETH",
  "0x62cb5f64b5a9891c57ff12d38fbab141e18c3d63e859a595ff6525b4221eaf23": "LBTC",
  "0x185f42070ab2ca5910ebfdea83c9f26f4015ad2c0f5c8e6ca1566d07c6c60aca":
    "SolvBTC",
  "0x8dd513b2bb41f0180f807ecaa1e0d2ddfacd57bf739534201247deca13f3542": "ezETH",
  "0x481fe68db505bc15973d0014c35217726efd6ee353d91a2a9faaac201f3423d": "sUSDe",
  "0x4cbeca747528f340ef9065c93dea0cc1ac8a46b759e31fc8b8d04bc52a86614b": "rsETH",
};

export default function EchelonPage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [hideZeroBalance, setHideZeroBalance] = useState(false);
  const [assets, setAssets] = useState<EchelonAsset[]>([]);
  const [marketStats, setMarketStats] = useState<Map<string, MarketStats>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<EchelonAsset | null>(null);
  const [selectedWithdrawAsset, setSelectedWithdrawAsset] =
    useState<UserSupply | null>(null);
  const [userSupplies, setUserSupplies] = useState<UserSupply[]>([]);
  const [userBorrows, setUserBorrows] = useState<UserBorrow[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);

  const movementWallet = useMemo(() => {
    if (!ready || !authenticated || !user?.linkedAccounts) {
      return null;
    }
    return (
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          account.type === "wallet" && account.chainType === "aptos"
      ) || null
    );
  }, [user, ready, authenticated]);

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/echelon");
        const json = await response.json();
        const data = json.data;

        const assetList: EchelonAsset[] = data.assets.map(
          (asset: {
            symbol: string;
            name: string;
            icon: string;
            price: number;
            supplyApr: number;
            borrowApr: number;
            supplyCap: number;
            borrowCap: number;
            ltv: number;
            decimals: number;
            faAddress: string;
            market: string;
          }) => ({
            symbol: asset.symbol,
            name: asset.name,
            icon: asset.icon,
            price: asset.price,
            supplyApr: asset.supplyApr * 100,
            borrowApr: asset.borrowApr * 100,
            supplyCap: asset.supplyCap,
            borrowCap: asset.borrowCap,
            ltv: asset.ltv,
            decimals: asset.decimals,
            faAddress: asset.faAddress,
            market: asset.market,
          })
        );

        const statsMap = new Map<string, MarketStats>();
        data.marketStats.forEach(([address, stats]: [string, MarketStats]) => {
          statsMap.set(address, stats);
        });

        setAssets(assetList);
        setMarketStats(statsMap);
        setError(null);
      } catch (err) {
        setError("Failed to fetch market data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMarkets();
  }, []);

  // Fetch user vault data
  useEffect(() => {
    const fetchVault = async () => {
      if (!movementWallet?.address || assets.length === 0) return;

      setLoadingVault(true);
      try {
        const response = await fetch(
          `/api/echelon/vault?address=${movementWallet.address}`
        );
        const data = await response.json();

        if (data.data?.collaterals?.data) {
          const supplies: UserSupply[] = data.data.collaterals.data.map(
            (item: { key: { inner: string }; value: string }) => {
              const marketAddress = item.key.inner;
              const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
              const asset = assets.find((a) => a.symbol === symbol);
              return {
                marketAddress,
                amount: item.value,
                symbol,
                icon: asset?.icon || "",
                price: asset?.price || 0,
                apr: asset?.supplyApr || 0,
                decimals: asset?.decimals || 8,
              };
            }
          );
          setUserSupplies(supplies);
        }

        if (data.data?.liabilities?.data) {
          const borrows: UserBorrow[] = data.data.liabilities.data.map(
            (item: { key: { inner: string }; value: string }) => {
              const marketAddress = item.key.inner;
              const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
              const asset = assets.find((a) => a.symbol === symbol);
              return {
                marketAddress,
                amount: item.value,
                symbol,
                icon: asset?.icon || "",
                price: asset?.price || 0,
                apr: asset?.borrowApr || 0,
                decimals: asset?.decimals || 8,
              };
            }
          );
          setUserBorrows(borrows);
        }
      } catch (err) {
        console.error("Failed to fetch vault:", err);
      } finally {
        setLoadingVault(false);
      }
    };

    fetchVault();
  }, [movementWallet?.address, assets]);

  // Calculate totals
  const totalSupplyBalance = useMemo(() => {
    return userSupplies.reduce((sum, supply) => {
      const amount = parseFloat(supply.amount) / Math.pow(10, supply.decimals);
      return sum + amount * supply.price;
    }, 0);
  }, [userSupplies]);

  const totalSupplyApr = useMemo(() => {
    if (totalSupplyBalance === 0) return 0;
    const weightedApr = userSupplies.reduce((sum, supply) => {
      const amount = parseFloat(supply.amount) / Math.pow(10, supply.decimals);
      const value = amount * supply.price;
      return sum + (value / totalSupplyBalance) * supply.apr;
    }, 0);
    return weightedApr;
  }, [userSupplies, totalSupplyBalance]);

  const totalBorrowBalance = useMemo(() => {
    return userBorrows.reduce((sum, borrow) => {
      const amount = parseFloat(borrow.amount) / Math.pow(10, borrow.decimals);
      return sum + amount * borrow.price;
    }, 0);
  }, [userBorrows]);

  const totalBorrowApr = useMemo(() => {
    if (totalBorrowBalance === 0) return 0;
    const weightedApr = userBorrows.reduce((sum, borrow) => {
      const amount = parseFloat(borrow.amount) / Math.pow(10, borrow.decimals);
      const value = amount * borrow.price;
      return sum + (value / totalBorrowBalance) * borrow.apr;
    }, 0);
    return weightedApr;
  }, [userBorrows, totalBorrowBalance]);

  const filteredSupplyAssets = useMemo(() => {
    if (!hideZeroBalance) return assets;
    return assets.filter((a) => a.supplyCap > 0);
  }, [assets, hideZeroBalance]);

  const borrowableAssets = useMemo(() => {
    return assets.filter((a) => a.borrowCap > 0);
  }, [assets]);

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-auto">
        {/* Mobile Header */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Echelon
          </h1>
          <button
            onClick={() => setRightSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>
        </div>

        {/* Desktop Header */}
        <div className="hidden border-b border-zinc-200 dark:border-zinc-800 md:block">
          <div className="flex items-center justify-between px-8 py-4">
            <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Echelon
            </h1>
            <ThemeToggle />
          </div>
        </div>

        {/* Main Content */}
        <div className="p-4 md:p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="mx-auto max-w-7xl grid gap-6 lg:grid-cols-2">
            {/* Your Supplies */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Your Supplies
                </h2>
                <div className="flex items-center gap-4 text-sm">
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
                  <div className="grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
                    <div>Asset</div>
                    <div>Balance</div>
                    <div>APR</div>
                    <div></div>
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {userSupplies.map((supply) => {
                      const amount =
                        parseFloat(supply.amount) /
                        Math.pow(10, supply.decimals);
                      const usdValue = amount * supply.price;
                      return (
                        <div
                          key={supply.marketAddress}
                          className="grid grid-cols-4 gap-4 py-3 items-center"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {supply.icon ? (
                                <img
                                  src={
                                    supply.icon.startsWith("/")
                                      ? `https://app.echelon.market${supply.icon}`
                                      : supply.icon
                                  }
                                  alt={supply.symbol}
                                  className="w-8 h-8 rounded-full"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">
                                    {supply.symbol.charAt(0)}
                                  </span>
                                </div>
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-purple-500 border-2 border-white dark:border-zinc-900" />
                            </div>
                            <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                              {supply.symbol}
                            </span>
                          </div>
                          <div>
                            <div className="text-zinc-950 dark:text-zinc-50">
                              {amount.toFixed(2)}
                            </div>
                            <div className="text-zinc-500 dark:text-zinc-400 text-sm">
                              ${usdValue.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-purple-600 dark:text-purple-400">
                            {supply.apr.toFixed(2)}%
                          </div>
                          <div>
                            <button
                              onClick={() => {
                                setSelectedWithdrawAsset(supply);
                                setWithdrawModalOpen(true);
                              }}
                              className="px-4 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
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

            {/* Your Borrows */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Your Borrows
                </h2>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Liability{" "}
                    <span className="text-zinc-950 dark:text-zinc-50">
                      ${totalBorrowBalance.toFixed(2)}
                    </span>
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    APR{" "}
                    <span className="text-purple-600 dark:text-purple-400">
                      {totalBorrowApr.toFixed(2)}%
                    </span>
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Borrowing power{" "}
                    <span className="text-zinc-950 dark:text-zinc-50">
                      ${(totalSupplyBalance * 0.7).toFixed(2)} (
                      {totalSupplyBalance > 0
                        ? (
                            (totalBorrowBalance / (totalSupplyBalance * 0.7)) *
                            100
                          ).toFixed(0)
                        : 0}
                      % used)
                    </span>
                  </span>
                </div>
              </div>
              {loadingVault ? (
                <div className="text-zinc-500 dark:text-zinc-400 text-sm">
                  Loading...
                </div>
              ) : userBorrows.length === 0 ? (
                <div className="text-zinc-500 dark:text-zinc-400 text-sm">
                  Nothing borrowed yet
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
                    <div>Asset</div>
                    <div>Debt</div>
                    <div>APR</div>
                    <div></div>
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {userBorrows.map((borrow) => {
                      const amount =
                        parseFloat(borrow.amount) /
                        Math.pow(10, borrow.decimals);
                      const usdValue = amount * borrow.price;
                      return (
                        <div
                          key={borrow.marketAddress}
                          className="grid grid-cols-4 gap-4 py-3 items-center"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {borrow.icon ? (
                                <img
                                  src={
                                    borrow.icon.startsWith("/")
                                      ? `https://app.echelon.market${borrow.icon}`
                                      : borrow.icon
                                  }
                                  alt={borrow.symbol}
                                  className="w-8 h-8 rounded-full"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">
                                    {borrow.symbol.charAt(0)}
                                  </span>
                                </div>
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-purple-500 border-2 border-white dark:border-zinc-900" />
                            </div>
                            <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                              {borrow.symbol}
                            </span>
                          </div>
                          <div>
                            <div className="text-zinc-950 dark:text-zinc-50">
                              {amount.toFixed(2)}
                            </div>
                            <div className="text-zinc-500 dark:text-zinc-400 text-sm">
                              ${usdValue.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-purple-600 dark:text-purple-400">
                            {borrow.apr.toFixed(2)}%
                          </div>
                          <div>
                            <button className="px-4 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer">
                              Repay
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Assets to Supply */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Assets to Supply
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Hide 0 balance assets ({filteredSupplyAssets.length})
                  </span>
                  <button
                    onClick={() => setHideZeroBalance(!hideZeroBalance)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${hideZeroBalance ? "bg-purple-500" : "bg-zinc-200 dark:bg-zinc-700"}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${hideZeroBalance ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-1">
                  Asset{" "}
                  <span className="text-zinc-400 dark:text-zinc-600">↕</span>
                </div>
                <div className="flex items-center gap-1">
                  Price{" "}
                  <span className="text-zinc-400 dark:text-zinc-600">↕</span>
                </div>
                <div className="flex items-center gap-1">
                  Supply APR{" "}
                  <span className="text-zinc-400 dark:text-zinc-600">↕</span>
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
                      className="grid grid-cols-4 gap-4 py-3 items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {asset.icon ? (
                            <img
                              src={
                                asset.icon.startsWith("/")
                                  ? `https://app.echelon.market${asset.icon}`
                                  : asset.icon
                              }
                              alt={asset.symbol}
                              className="w-8 h-8 rounded-full"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                                (
                                  e.target as HTMLImageElement
                                ).nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center ${asset.icon ? "hidden" : ""}`}
                          >
                            <span className="text-white text-xs font-bold">
                              {asset.symbol.charAt(0)}
                            </span>
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-purple-500 border-2 border-white dark:border-zinc-900" />
                        </div>
                        <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                          {asset.symbol}
                        </span>
                      </div>
                      <div>
                        <div className="text-zinc-950 dark:text-zinc-50">
                          $
                          {asset.price < 1
                            ? asset.price.toFixed(4)
                            : asset.price.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                        </div>
                      </div>
                      <div
                        className={
                          asset.supplyApr > 0
                            ? "text-purple-600 dark:text-purple-400"
                            : "text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        {asset.supplyApr > 0
                          ? `${asset.supplyApr.toFixed(2)}%`
                          : "0.00%"}
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            setSelectedAsset(asset);
                            setSupplyModalOpen(true);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                        >
                          Supply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assets to Borrow */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 mb-4">
                Assets to Borrow
              </h2>

              {/* Table Header */}
              <div className="grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-1">
                  Asset{" "}
                  <span className="text-zinc-400 dark:text-zinc-600">↕</span>
                </div>
                <div className="flex items-center gap-1">
                  Available{" "}
                  <span className="text-zinc-400 dark:text-zinc-600">↕</span>
                </div>
                <div className="flex items-center gap-1">
                  Borrow APR{" "}
                  <span className="text-zinc-400 dark:text-zinc-600">↕</span>
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
                      className="grid grid-cols-4 gap-4 py-3 items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {asset.icon ? (
                            <img
                              src={
                                asset.icon.startsWith("/")
                                  ? `https://app.echelon.market${asset.icon}`
                                  : asset.icon
                              }
                              alt={asset.symbol}
                              className="w-8 h-8 rounded-full"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                                (
                                  e.target as HTMLImageElement
                                ).nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center ${asset.icon ? "hidden" : ""}`}
                          >
                            <span className="text-white text-xs font-bold">
                              {asset.symbol.charAt(0)}
                            </span>
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-purple-500 border-2 border-white dark:border-zinc-900" />
                        </div>
                        <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                          {asset.symbol}
                        </span>
                      </div>
                      <div>
                        <div className="text-zinc-950 dark:text-zinc-50">
                          {asset.borrowCap >= 1000
                            ? asset.borrowCap.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })
                            : asset.borrowCap.toFixed(2)}
                        </div>
                        <div className="text-zinc-500 dark:text-zinc-400 text-sm">
                          $
                          {(asset.borrowCap * asset.price).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </div>
                      </div>
                      <div
                        className={
                          asset.borrowApr > 0
                            ? "text-purple-600 dark:text-purple-400"
                            : "text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        {asset.borrowApr > 0
                          ? `${asset.borrowApr.toFixed(2)}%`
                          : "0.00%"}
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            setSelectedAsset(asset);
                            setBorrowModalOpen(true);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                        >
                          Borrow
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <RightSidebar
        isOpen={rightSidebarOpen}
        onClose={() => setRightSidebarOpen(false)}
      />

      <EchelonSupplyModal
        isOpen={supplyModalOpen}
        onClose={() => {
          setSupplyModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={selectedAsset}
      />

      <EchelonBorrowModal
        isOpen={borrowModalOpen}
        onClose={() => {
          setBorrowModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={selectedAsset}
      />

      <EchelonWithdrawModal
        isOpen={withdrawModalOpen}
        onClose={() => {
          setWithdrawModalOpen(false);
          setSelectedWithdrawAsset(null);
        }}
        asset={
          selectedWithdrawAsset
            ? {
                symbol: selectedWithdrawAsset.symbol,
                icon: selectedWithdrawAsset.icon,
                price: selectedWithdrawAsset.price,
                decimals: selectedWithdrawAsset.decimals,
                amount: selectedWithdrawAsset.amount,
                marketAddress: selectedWithdrawAsset.marketAddress,
              }
            : null
        }
      />
    </div>
  );
}
