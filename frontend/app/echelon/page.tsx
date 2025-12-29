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
import { EchelonRepayModal } from "../components/echelon-repay-modal";

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
  const [repayModalOpen, setRepayModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<EchelonAsset | null>(null);
  const [selectedWithdrawAsset, setSelectedWithdrawAsset] =
    useState<UserSupply | null>(null);
  const [selectedRepayAsset, setSelectedRepayAsset] =
    useState<UserBorrow | null>(null);
  const [userSupplies, setUserSupplies] = useState<UserSupply[]>([]);
  const [userBorrows, setUserBorrows] = useState<UserBorrow[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);
  const [availableBalances, setAvailableBalances] = useState<
    Record<string, number>
  >({});

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

  // Fetch user vault data with optional retry mechanism
  const fetchVault = async (retryCount = 0, maxRetries = 2) => {
    if (!movementWallet?.address) {
      console.log("[UI] fetchVault: Skipping - no address");
      return;
    }

    // Don't require assets to be loaded - we can still process vault data
    // Assets will be matched later if available

    setLoadingVault(true);
    try {
      // Add timestamp to prevent stale data and force fresh fetch
      const response = await fetch(
        `/api/echelon/vault?address=${movementWallet.address}&t=${Date.now()}`,
        {
          cache: "no-store", // Always fetch fresh data for user's own vault
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch vault: ${response.status}`);
      }

      const data = await response.json();

      console.log("[UI] Vault API Response:", data);
      console.log(
        "[UI] Available assets:",
        assets.map((a) => a.symbol)
      );

      // Process collaterals - use coinAmount (converted from shares)
      // Handle both possible response structures
      const collaterals = data.data?.collaterals || data.collaterals || [];

      if (Array.isArray(collaterals) && collaterals.length > 0) {
        console.log(`[UI] Processing ${collaterals.length} collateral(s)`);

        const supplies: UserSupply[] = collaterals
          .map(
            (item: {
              marketAddress: string;
              shares: string;
              coinAmount: string;
            }) => {
              const marketAddress = item.marketAddress;
              const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
              const asset = assets.find((a) => a.symbol === symbol);

              console.log(`[UI] Processing collateral:`, {
                marketAddress,
                symbol,
                coinAmount: item.coinAmount,
                foundAsset: !!asset,
                assetSymbol: asset?.symbol,
              });

              // Always include the supply, even if asset metadata isn't found
              return {
                marketAddress,
                amount: item.coinAmount, // Use coinAmount (actual coin amount, not shares)
                symbol: symbol || "Unknown",
                icon: asset?.icon || "",
                price: asset?.price || 0,
                apr: asset?.supplyApr || 0,
                decimals: asset?.decimals || 8,
              };
            }
          )
          .filter((supply) => {
            // Only filter out if amount is 0 or invalid
            // Handle both string and number amounts
            const amountStr = String(supply.amount || "0");
            const amount = parseFloat(amountStr);
            const isValid = !isNaN(amount) && amount > 0;

            if (!isValid) {
              console.warn(`[UI] Filtering out supply with invalid amount:`, {
                marketAddress: supply.marketAddress,
                amount: supply.amount,
                parsed: amount,
              });
            }

            return isValid;
          });

        console.log("[UI] Processed supplies (after filtering):", supplies);
        console.log(
          "[UI] Setting userSupplies with",
          supplies.length,
          "item(s)"
        );
        setUserSupplies(supplies);
      } else {
        console.log("[UI] No collaterals found or invalid structure:", {
          hasData: !!data.data,
          hasCollaterals: !!data.data?.collaterals,
          hasCollateralsDirect: !!data.collaterals,
          isArray: Array.isArray(data.data?.collaterals),
          collateralsLength: collaterals.length,
          collaterals: collaterals,
          fullData: data,
        });
        setUserSupplies([]);
      }

      // Process liabilities - use totalLiability (principal + interest_accumulated)
      // Handle both possible response structures
      const liabilities = data.data?.liabilities || data.liabilities || [];

      if (Array.isArray(liabilities) && liabilities.length > 0) {
        console.log(
          `[UI] Processing ${liabilities.length} liability/borrow(s)`
        );

        const borrows: UserBorrow[] = liabilities
          .map(
            (item: {
              marketAddress: string;
              principal: string;
              interestAccumulated: string;
              totalLiability: string;
            }) => {
              const marketAddress = item.marketAddress;
              const symbol = MARKET_TO_SYMBOL[marketAddress] || "Unknown";
              const asset = assets.find((a) => a.symbol === symbol);

              console.log(`[UI] Processing liability:`, {
                marketAddress,
                symbol,
                totalLiability: item.totalLiability,
                foundAsset: !!asset,
              });

              return {
                marketAddress,
                amount: item.totalLiability, // Use totalLiability (principal + interest)
                symbol: symbol || "Unknown",
                icon: asset?.icon || "",
                price: asset?.price || 0,
                apr: asset?.borrowApr || 0,
                decimals: asset?.decimals || 8,
              };
            }
          )
          .filter((borrow) => {
            // Only filter out if amount is 0 or invalid
            const amount = parseFloat(borrow.amount);
            return !isNaN(amount) && amount > 0;
          });

        console.log("[UI] Processed borrows (after filtering):", borrows);
        setUserBorrows(borrows);
      } else {
        console.log("[UI] No liabilities found or invalid structure:", {
          hasData: !!data.data,
          hasLiabilities: !!data.data?.liabilities,
          hasLiabilitiesDirect: !!data.liabilities,
          isArray: Array.isArray(data.data?.liabilities),
          liabilitiesLength: liabilities.length,
        });
        setUserBorrows([]);
      }
    } catch (err) {
      console.error("[UI] Failed to fetch vault:", err);

      // Retry logic: if this is a retry attempt and we haven't exceeded max retries
      if (retryCount < maxRetries) {
        console.log(
          `[UI] Retrying vault fetch (attempt ${retryCount + 1}/${maxRetries})...`
        );
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (retryCount + 1))
        );
        return fetchVault(retryCount + 1, maxRetries);
      }

      setUserSupplies([]);
      setUserBorrows([]);
    } finally {
      setLoadingVault(false);
    }
  };

  useEffect(() => {
    fetchVault();
  }, [movementWallet?.address, assets]);

  // Fetch available balances for tokens
  const fetchAvailableBalances = async () => {
    if (!movementWallet?.address) return;

    try {
      const response = await fetch(
        `/api/balance?address=${encodeURIComponent(movementWallet.address)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch balance");
      }

      const data = await response.json();

      if (data.success && data.balances && data.balances.length > 0) {
        const balances: Record<string, number> = {};
        data.balances.forEach(
          (b: {
            metadata: { symbol: string; decimals: number };
            amount: string;
          }) => {
            const symbol = b.metadata.symbol.toUpperCase().replace(/\./g, "");
            const amount =
              parseFloat(b.amount) / Math.pow(10, b.metadata.decimals);
            // Store both with and without .e suffix
            balances[symbol] = amount;
            if (symbol.endsWith("E")) {
              balances[symbol.slice(0, -1)] = amount; // USDC.E -> USDC
            }
          }
        );
        setAvailableBalances(balances);
      }
    } catch (error) {
      console.error("Error fetching available balances:", error);
    }
  };

  useEffect(() => {
    fetchAvailableBalances();
  }, [movementWallet?.address]);

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
        <div className="p-3 sm:p-4 md:p-6 lg:p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="mx-auto max-w-7xl grid gap-4 sm:gap-6 lg:grid-cols-2">
            {/* Your Supplies */}
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
                      const amount =
                        parseFloat(supply.amount) /
                        Math.pow(10, supply.decimals);
                      const usdValue = amount * supply.price;
                      return (
                        <div
                          key={supply.marketAddress}
                          className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 py-3 sm:items-center"
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
                            <span className="text-zinc-950 dark:text-zinc-50 font-medium text-sm sm:text-base">
                              {supply.symbol}
                            </span>
                          </div>
                          <div className="sm:block">
                            <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                              Balance
                            </div>
                            <div className="text-zinc-950 dark:text-zinc-50 text-sm sm:text-base">
                              {amount.toFixed(2)}
                            </div>
                            <div className="text-zinc-500 dark:text-zinc-400 text-xs">
                              ${usdValue.toFixed(2)}
                            </div>
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
                              onClick={() => {
                                setSelectedWithdrawAsset(supply);
                                setWithdrawModalOpen(true);
                              }}
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

            {/* Your Borrows */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Your Borrows
                </h2>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
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
                    <span className="hidden sm:inline">Borrowing power </span>
                    <span className="sm:hidden">Power </span>
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
                  {/* Desktop Table Header */}
                  <div className="hidden sm:grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
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
                          className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 py-3 sm:items-center"
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
                            <span className="text-zinc-950 dark:text-zinc-50 font-medium text-sm sm:text-base">
                              {borrow.symbol}
                            </span>
                          </div>
                          <div className="sm:block">
                            <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                              Debt
                            </div>
                            <div className="text-zinc-950 dark:text-zinc-50 text-sm sm:text-base">
                              {amount.toFixed(2)}
                            </div>
                            <div className="text-zinc-500 dark:text-zinc-400 text-xs">
                              ${usdValue.toFixed(2)}
                            </div>
                          </div>
                          <div className="sm:block">
                            <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 sm:hidden">
                              APR
                            </div>
                            <div className="text-purple-600 dark:text-purple-400 text-sm sm:text-base">
                              {borrow.apr.toFixed(2)}%
                            </div>
                          </div>
                          <div className="sm:block">
                            <button
                              onClick={() => {
                                setSelectedRepayAsset(borrow);
                                setRepayModalOpen(true);
                              }}
                              className="w-full sm:w-auto px-4 py-2 sm:py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                            >
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
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Assets to Supply
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                    Hide 0 balance ({filteredSupplyAssets.length})
                  </span>
                  <button
                    onClick={() => setHideZeroBalance(!hideZeroBalance)}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${hideZeroBalance ? "bg-purple-500" : "bg-zinc-200 dark:bg-zinc-700"}`}
                    aria-label={
                      hideZeroBalance
                        ? "Show all assets"
                        : "Hide zero balance assets"
                    }
                    type="button"
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform pointer-events-none ${hideZeroBalance ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
              </div>

              {/* Desktop Table Header */}
              <div className="hidden sm:grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
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
                      className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 py-3 sm:items-center"
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
                          onClick={() => {
                            setSelectedAsset(asset);
                            setSupplyModalOpen(true);
                          }}
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

            {/* Assets to Borrow */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 mb-4">
                Assets to Borrow
              </h2>

              {/* Desktop Table Header */}
              <div className="hidden sm:grid grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-200 dark:border-zinc-800">
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
                      className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 py-3 sm:items-center"
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
                          {(asset.borrowCap * asset.price).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
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
                          onClick={() => {
                            setSelectedAsset(asset);
                            setBorrowModalOpen(true);
                          }}
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
        availableBalance={
          selectedAsset
            ? availableBalances[selectedAsset.symbol.toUpperCase()] || 0
            : 0
        }
        onSuccess={async () => {
          // Wait a bit for blockchain state to update after transaction confirmation
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // Refresh vault data and balances after successful supply
          await fetchVault();
          await fetchAvailableBalances();
        }}
      />

      <EchelonBorrowModal
        isOpen={borrowModalOpen}
        onClose={() => {
          setBorrowModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={selectedAsset}
        availableBalance={
          selectedAsset
            ? (totalSupplyBalance * 0.7 - totalBorrowBalance) /
              (selectedAsset.price || 1)
            : 0
        }
        onSuccess={async () => {
          // Wait a bit for blockchain state to update after transaction confirmation
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // Refresh vault data after successful borrow
          await fetchVault();
        }}
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
                faAddress: assets.find(
                  (a) => a.symbol === selectedWithdrawAsset.symbol
                )?.faAddress,
              }
            : null
        }
        onSuccess={async () => {
          // Wait a bit for blockchain state to update after transaction confirmation
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // Refresh vault data and balances after successful withdraw
          await fetchVault();
          await fetchAvailableBalances();
        }}
      />

      <EchelonRepayModal
        isOpen={repayModalOpen}
        onClose={() => {
          setRepayModalOpen(false);
          setSelectedRepayAsset(null);
        }}
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
            ? availableBalances[selectedRepayAsset.symbol.toUpperCase()] || 0
            : 0
        }
        onSuccess={async () => {
          // Wait a bit for blockchain state to update after transaction confirmation
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // Refresh vault data and balances after successful repay
          await fetchVault();
          await fetchAvailableBalances();
        }}
      />
    </div>
  );
}
