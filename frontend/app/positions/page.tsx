"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { getTokenBySymbol, getVerifiedTokens } from "../utils/token-constants";
import { type TokenInfo } from "../utils/tokens";

interface BrokerAssetInfo {
  network: string;
  networkAddress: string;
  name: string;
  decimals: number;
  price: number;
}

interface BrokerEntry {
  utilization: number;
  network: string;
  networkAddress: string;
  underlyingAsset: BrokerAssetInfo;
  loanNote: BrokerAssetInfo;
  depositNote: BrokerAssetInfo;
  availableLiquidityUnderlying: string;
  totalBorrowedUnderlying: string;
  scaledAvailableLiquidityUnderlying: string;
  scaledTotalBorrowedUnderlying: string;
  interestRate: number;
  interestFeeRate: number;
  loanNoteSupply: string;
  depositNoteSupply: string;
  interestRateCurve: {
    u1: number;
    u2: number;
    r0: number;
    r1: number;
    r2: number;
    r3: number;
  };
  maxDeposit: string;
  maxBorrow: string;
  maxBorrowScaled: string;
  maxDepositScaled: string;
  depositNoteExchangeRate: number;
  loanNoteExchangeRate: number;
}

interface MarketPosition {
  token: TokenInfo | null;
  symbol: string;
  name: string;
  price: number;
  utilization: number;
  availableLiquidity: number;
  totalBorrowed: number;
  totalSupplied: number;
  supplyApy: number;
  boostedApy?: number;
  tvlUsd: number;
  maxCapacity: number;
  borrowApy: number; // %
}

export default function PositionsPage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"supply" | "borrow">("supply");
  const [searchQuery, setSearchQuery] = useState("");
  const [brokers, setBrokers] = useState<BrokerEntry[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState<boolean>(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);

  const formatAmount = (value: string, decimals: number): number => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed / Math.pow(10, decimals);
  };

  const getSymbolFromName = (name: string): string => {
    if (!name) return "UNKNOWN";
    const trimmed = name.replace(/^movement[- ]/i, "");
    return trimmed.replace(/-/g, "").toUpperCase();
  };

  const resolveToken = (symbol: string): TokenInfo | null => {
    const token = getTokenBySymbol(symbol);
    if (token) return token;
    const withoutE = symbol.replace(".E", "");
    return getTokenBySymbol(withoutE) || null;
  };

  // Fetch brokers data
  useEffect(() => {
    const fetchBrokers = async () => {
      setLoadingBrokers(true);
      setBrokerError(null);
      try {
        const response = await fetch("https://api.moveposition.xyz/brokers");
        if (!response.ok) {
          throw new Error(`Failed to fetch brokers (${response.status})`);
        }
        const data: BrokerEntry[] = await response.json();
        setBrokers(data);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load broker markets.";
        setBrokerError(message);
      } finally {
        setLoadingBrokers(false);
      }
    };

    fetchBrokers();
  }, []);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  const marketPositions: MarketPosition[] = useMemo(() => {
    const verified = getVerifiedTokens();

    return brokers
      .map((entry) => {
        const symbol = getSymbolFromName(entry.underlyingAsset.name);
        const token =
          resolveToken(symbol) ||
          verified.find((t) => t.symbol === symbol) ||
          null;

        const price = entry.underlyingAsset.price;

        const decimals = entry.underlyingAsset.decimals;
        const scale = 10 ** decimals;

        const totalSupplied =
          Number(entry.scaledAvailableLiquidityUnderlying) +
          Number(entry.scaledTotalBorrowedUnderlying);

        const available = Number(entry.scaledAvailableLiquidityUnderlying) || 0;
        const borrowed = Number(entry.scaledTotalBorrowedUnderlying) || 0;

        const maxCapacity = Number(entry.maxDeposit) / scale;
        const utilizationPct = entry.utilization * 100;

        // APYs
        const supplyApy = entry.interestRate * 100;

        const borrowApy =
          entry.interestFeeRate < 1
            ? (entry.interestRate / (1 - entry.interestFeeRate)) * 100
            : entry.interestRate * 100; // fallback

        const boostedApy =
          entry.depositNoteExchangeRate > 1
            ? (entry.depositNoteExchangeRate - 1) * 100
            : undefined;

        const tvlUsd = totalSupplied * entry.underlyingAsset.price;

        return {
          token,
          symbol,
          name: entry.underlyingAsset.name,
          price,
          utilization: utilizationPct,
          availableLiquidity: available,
          totalBorrowed: borrowed,
          totalSupplied,
          maxCapacity,
          supplyApy,
          borrowApy,
          boostedApy,
          tvlUsd,
        };
      })
      .sort((a, b) => b.tvlUsd - a.tvlUsd); // optional: sort by TVL
  }, [brokers]);

  const filteredAssets = useMemo(() => {
    if (!searchQuery) return marketPositions;
    const query = searchQuery.toLowerCase();
    return marketPositions.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(query) ||
        asset.name.toLowerCase().includes(query)
    );
  }, [marketPositions, searchQuery]);

  const formatCompact = (v: number): string => {
    if (!Number.isFinite(v)) return "0";
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + "k";
    return v.toFixed(2);
  };

  const totalSuppliedValue = useMemo(() => {
    return marketPositions.reduce((sum, asset) => sum + asset.tvlUsd, 0);
  }, [marketPositions]);

  const totalCollateralUsd = totalSuppliedValue;
  const totalDebtUsd = marketPositions.reduce(
    (sum, asset) => sum + asset.totalBorrowed * asset.price,
    0
  );

  const marketCollateral = totalCollateralUsd;
  const marketDebt = totalDebtUsd;

  const collateralToDebt =
    totalDebtUsd > 0 ? marketCollateral / marketDebt : null;

  const supplyComposition = useMemo(() => {
    const total = marketPositions.reduce(
      (sum, asset) => sum + (asset.totalSupplied > 0 ? asset.tvlUsd : 0),
      0
    );
    return marketPositions
      .filter((asset) => asset.totalSupplied > 0)
      .map((asset) => ({
        token: asset.token,
        amount: asset.totalSupplied,
        value: asset.tvlUsd,
        percentage: total > 0 ? (asset.tvlUsd / total) * 100 : 0,
      }));
  }, [marketPositions]);

  const equity = totalSuppliedValue;
  const debt = marketPositions.reduce(
    (sum, asset) => sum + asset.totalBorrowed * asset.price,
    0
  );
  const healthFactor = equity > 0 && debt > 0 ? equity / debt : null;
  const minRequiredEquityPercent = 35;
  const minRequiredEquity = equity * (minRequiredEquityPercent / 100);

  // Show loading while checking authentication status
  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-center">
          <div className="text-lg text-zinc-600 dark:text-zinc-400">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!authenticated) {
    return null;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-black">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Mobile Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-6 w-6"
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
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Positions
          </span>
          <button
            onClick={() => setIsRightSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-6 w-6"
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
        <div className="hidden shrink-0 border-b flex-row border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:flex">
          <div className="flex flex-row items-center justify-between w-full">
            <div>
              <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Live Positions
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Manage your lending and borrowing positions
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Top Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  Equity
                </div>
                <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                  ${marketCollateral}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  100%
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  Debt
                </div>
                <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {debt}
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  Health factor
                </div>
                <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {healthFactor ? `${healthFactor.toFixed(2)}x` : "N/A"}
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  Minimum Required Equity
                </div>
                <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                  ${minRequiredEquity.toFixed(2)} {minRequiredEquityPercent}%
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div
                    className="bg-green-600 dark:bg-green-500 h-2 rounded-full"
                    style={{ width: `${minRequiredEquityPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab("supply")}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === "supply"
                    ? "bg-yellow-500 text-black"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                Supply
              </button>
              <button
                onClick={() => setActiveTab("borrow")}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === "borrow"
                    ? "bg-yellow-500 text-black"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                Borrow
              </button>
            </div>

            {/* Total Supplied Value */}
            <div className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Total Supplied Value:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                ${totalSuppliedValue.toFixed(2)} USD
              </span>
            </div>

            {/* Information Banners */}
            <div className="space-y-3 mb-6">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Week 33 rewards have been distributed! The MOVE rewards
                    spanning the week of December 4, 2025 through December 10,
                    2025 have been deposited to all eligible portfolios.
                  </p>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    We distribute yield incentives weekly! Earn boosted yield by
                    maintaining open positions in incentivized pools.
                  </p>
                </div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            {loadingBrokers && (
              <div className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Loading markets...
              </div>
            )}

            {brokerError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                {brokerError}
              </div>
            )}

            {/* Asset Table */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        Chain/Asset
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        Supplied
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        Utilization
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        Total Supplied
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        Supply APY
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {filteredAssets.map((asset) => (
                      <tr
                        key={asset.token?.id ?? asset.symbol}
                        className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          asset.totalSupplied > 0
                            ? "bg-yellow-50/50 dark:bg-yellow-900/10"
                            : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {asset.token?.iconUri ? (
                              <img
                                src={asset.token.iconUri}
                                alt={asset.token?.symbol ?? asset.symbol}
                                className="w-8 h-8 rounded-full"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23fbbf24'/%3E%3Ctext x='16' y='22' font-size='16' font-weight='bold' text-anchor='middle' fill='black'%3E" +
                                    encodeURIComponent(asset.symbol.charAt(0)) +
                                    "%3C/text%3E%3C/svg%3E";
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
                                <span className="text-black font-bold text-xs">
                                  {asset.symbol.charAt(0)}
                                </span>
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-zinc-900 dark:text-zinc-50">
                                {asset.symbol}
                              </div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                ${asset.price.toFixed(4)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-zinc-900 dark:text-zinc-50">
                            0
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              $
                              {asset.tvlUsd.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-zinc-900 dark:text-zinc-50">
                            {asset.utilization.toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-zinc-900 dark:text-zinc-50">
                            {formatCompact(asset.totalSupplied)} /{" "}
                            {formatCompact(asset.maxCapacity)}
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              Pool supplied / Max
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="text-sm text-zinc-900 dark:text-zinc-50">
                            {asset.supplyApy.toFixed(2)}%
                            {asset.boostedApy && asset.boostedApy > 0 && (
                              <div className="text-xs text-green-600 dark:text-green-400">
                                +{asset.boostedApy.toFixed(2)}%
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              className="w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors"
                              onClick={() => {
                                // Handle supply action
                                console.log("Supply", asset.symbol);
                              }}
                            >
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
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                            </button>
                            <button
                              className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                              onClick={() => {
                                // Handle withdraw action
                                console.log("Withdraw", asset.symbol);
                              }}
                            >
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
                                  d="M20 12H4"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Supply Composition */}
          <div className="hidden lg:block w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Supply composition
            </h2>

            {/* Donut Chart Placeholder */}
            <div className="mb-6 flex items-center justify-center">
              <div className="relative w-48 h-48">
                <svg
                  className="w-48 h-48 transform -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-purple-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    ${totalSuppliedValue.toFixed(2)}
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    Balance, USD
                  </div>
                </div>
              </div>
            </div>

            {/* Composition List */}
            <div className="space-y-3">
              {supplyComposition.length > 0 ? (
                supplyComposition.map((item) => (
                  <div
                    key={item.token?.id ?? item.token?.symbol ?? item.amount}
                    className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800"
                  >
                    {item.token?.iconUri ? (
                      <img
                        src={item.token.iconUri}
                        alt={item.token?.symbol ?? "asset"}
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23fbbf24'/%3E%3Ctext x='16' y='22' font-size='16' font-weight='bold' text-anchor='middle' fill='black'%3E{item.token?.symbol?.charAt(0) ?? 'A'}%3C/text%3E%3C/svg%3E";
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
                        <span className="text-black font-bold text-xs">
                          {item.token?.symbol?.charAt(0) ?? "A"}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {item.token?.symbol ?? "Asset"}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.amount.toFixed(4)} · ${item.value.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {item.percentage.toFixed(2)}%
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
                  No supplied assets
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            © 2025 Move Position
          </p>
        </div>
      </div>

      <RightSidebar
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
      />
    </div>
  );
}
