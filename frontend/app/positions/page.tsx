"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { SupplyModal } from "../components/supply-modal";
import { getTokenBySymbol, getVerifiedTokens } from "../utils/token-constants";
import { type TokenInfo } from "../utils/tokens";
import { LendCard } from "../components/features/lend";
import { BorrowCard } from "../components/features/borrow";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";

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
}

interface AssetPosition {
  token: TokenInfo;
  inWallet: number;
  supplied: number;
  utilization: number;
  totalSupplied: number;
  totalSuppliedMax: number;
  totalSuppliedUSD: number;
  supplyApy: number;
  boostedAPY?: number;
  borrowAPY?: number;
}

interface PortfolioResponse {
  id: string;
  collaterals: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: string;
  }>;
  liabilities: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: string;
  }>;
  risk: {
    requiredEquity: number;
  };
  evaluation: {
    mm: number;
    health_ratio: number;
    total_collateral: number;
    total_liability: number;
    ltv: number;
  };
}

function PositionsPageContent() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"supply" | "borrow">("supply");
  const [viewMode, setViewMode] = useState<"positions" | "lend">("positions");
  const [lendMode, setLendMode] = useState<"lend" | "borrow">("lend");
  const [searchQuery, setSearchQuery] = useState("");

  // Check for view query parameter on mount
  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "lend") {
      setViewMode("lend");
    }
  }, [searchParams]);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerEntry[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState<boolean>(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioResponse | null>(
    null
  );
  const [loadingPortfolio, setLoadingPortfolio] = useState<boolean>(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isSupplyModalOpen, setIsSupplyModalOpen] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<MarketPosition | null>(
    null
  );

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

  // Get Movement wallet address
  const movementWallet = useMemo(() => {
    if (!ready || !authenticated || !user?.linkedAccounts) {
      return null;
    }

    const aptosWallet = user.linkedAccounts.find(
      (account): account is WalletWithMetadata => {
        if (account.type !== "wallet") return false;
        const walletAccount = account as WalletWithMetadata & {
          chainType?: string;
        };
        return walletAccount.chainType === "aptos";
      }
    ) as (WalletWithMetadata & { chainType?: string }) | undefined;

    return aptosWallet || null;
  }, [user, ready, authenticated]);

  useEffect(() => {
    if (movementWallet?.address) {
      const addr = movementWallet.address;
      if (addr && addr.startsWith("0x") && addr.length >= 42) {
        setWalletAddress(addr);
      }
    }
  }, [movementWallet]);

  // Fetch portfolio data
  useEffect(() => {
    const fetchPortfolio = async () => {
      if (!walletAddress) {
        setPortfolioData(null);
        return;
      }

      setLoadingPortfolio(true);
      setPortfolioError(null);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: "https://api.moveposition.xyz",
        });
        const data = await superClient.default.getPortfolio(walletAddress);
        setPortfolioData(data as unknown as PortfolioResponse);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load portfolio data.";
        setPortfolioError(message);
        setPortfolioData(null);
      } finally {
        setLoadingPortfolio(false);
      }
    };

    fetchPortfolio();
  }, [walletAddress]);

  // Fetch brokers data
  useEffect(() => {
    const fetchBrokers = async () => {
      setLoadingBrokers(true);
      setBrokerError(null);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: "https://api.moveposition.xyz",
        });
        const data = await superClient.default.getBrokers();
        setBrokers(data as unknown as BrokerEntry[]);
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
    return brokers.map((entry) => {
      const symbol = getSymbolFromName(entry.underlyingAsset.name);
      const token =
        resolveToken(symbol) ||
        verified.find((t) => t.symbol === symbol) ||
        null;
      const availableLiquidity = formatAmount(
        entry.availableLiquidityUnderlying,
        entry.underlyingAsset.decimals
      );
      const totalBorrowed = formatAmount(
        entry.totalBorrowedUnderlying,
        entry.underlyingAsset.decimals
      );
      const totalSupplied = availableLiquidity + totalBorrowed;
      const tvlUsd = totalSupplied * entry.underlyingAsset.price;

      return {
        token,
        symbol,
        name: entry.underlyingAsset.name,
        price: entry.underlyingAsset.price,
        utilization: entry.utilization * 100,
        availableLiquidity,
        totalBorrowed,
        totalSupplied,
        supplyApy: entry.interestRate * 100,
        boostedApy:
          entry.depositNoteExchangeRate > 1
            ? (entry.depositNoteExchangeRate - 1) * 100
            : undefined,
        tvlUsd,
      };
    });
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

  const totalSuppliedValue = useMemo(() => {
    return marketPositions.reduce((sum, asset) => sum + asset.tvlUsd, 0);
  }, [marketPositions]);

  // Use portfolio data if available, otherwise fallback to calculated values
  const equity =
    portfolioData?.evaluation?.total_collateral ?? totalSuppliedValue;
  const debt =
    portfolioData?.evaluation?.total_liability ??
    marketPositions.reduce(
      (sum, asset) => sum + asset.totalBorrowed * asset.price,
      0
    );
  const healthFactor =
    portfolioData?.evaluation?.health_ratio ??
    (equity > 0 && debt > 0 ? equity / debt : null);
  const minRequiredEquity =
    portfolioData?.risk?.requiredEquity ?? equity * 0.35;
  const minRequiredEquityPercent =
    equity > 0 ? (minRequiredEquity / equity) * 100 : 0;

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
                {viewMode === "positions" ? "Live Positions" : "Lend & Borrow"}
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {viewMode === "positions"
                  ? "Manage your lending and borrowing positions"
                  : "Supply, withdraw, borrow, or repay tokens on Movement Network"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {viewMode === "lend" ? (
              /* Lend/Borrow View */
              <div className="flex flex-1 items-center justify-center">
                <div className="w-full max-w-md">
                  {/* Mode Tabs */}
                  <div className="flex gap-2 mb-6 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 max-w-md mx-auto">
                    <button
                      onClick={() => setLendMode("lend")}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                        lendMode === "lend"
                          ? "bg-white dark:bg-zinc-700 text-green-600 dark:text-green-400 shadow-sm"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      }`}
                    >
                      Lend
                    </button>
                    <button
                      onClick={() => setLendMode("borrow")}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                        lendMode === "borrow"
                          ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      }`}
                    >
                      Borrow
                    </button>
                  </div>

                  {/* Card Component */}
                  {lendMode === "lend" ? (
                    <LendCard walletAddress={walletAddress} />
                  ) : (
                    <BorrowCard walletAddress={walletAddress} />
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Top Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                      Equity
                    </div>
                    <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {loadingPortfolio ? (
                        <span className="text-zinc-400">Loading...</span>
                      ) : (
                        `$${equity.toFixed(2)}`
                      )}
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
                      {loadingPortfolio ? (
                        <span className="text-zinc-400">Loading...</span>
                      ) : (
                        `$${debt.toFixed(2)}`
                      )}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                      Health factor
                    </div>
                    <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {loadingPortfolio ? (
                        <span className="text-zinc-400">Loading...</span>
                      ) : healthFactor ? (
                        `${healthFactor.toFixed(2)}x`
                      ) : (
                        "N/A"
                      )}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                      Minimum Required Equity
                    </div>
                    <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                      {loadingPortfolio ? (
                        <span className="text-zinc-400">Loading...</span>
                      ) : (
                        <>
                          ${minRequiredEquity.toFixed(2)}{" "}
                          {minRequiredEquityPercent.toFixed(1)}%
                        </>
                      )}
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                      <div
                        className="bg-green-600 dark:bg-green-500 h-2 rounded-full"
                        style={{
                          width: `${Math.min(minRequiredEquityPercent, 100)}%`,
                        }}
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

                {portfolioError && (
                  <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-700 dark:text-yellow-400">
                    Portfolio data: {portfolioError}
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
                                        encodeURIComponent(
                                          asset.symbol.charAt(0)
                                        ) +
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
                                {asset.totalSupplied > 0 ? (
                                  <>
                                    {asset.totalSupplied.toFixed(4)}
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                      $
                                      {asset.tvlUsd.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  "0"
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-zinc-900 dark:text-zinc-50">
                                {asset.utilization.toFixed(2)}%
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-zinc-900 dark:text-zinc-50">
                                {asset.availableLiquidity.toFixed(4)} /{" "}
                                {asset.totalSupplied.toFixed(4)}
                                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Liquidity / Total
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
                                    setSelectedAsset(asset);
                                    setIsSupplyModalOpen(true);
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
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {viewMode === "positions" && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              © 2025 Move Position
            </p>
          </div>
        )}
      </div>

      <RightSidebar
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
      />

      <SupplyModal
        isOpen={isSupplyModalOpen}
        onClose={() => {
          setIsSupplyModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={
          selectedAsset
            ? {
                token: selectedAsset.token,
                symbol: selectedAsset.symbol,
                price: selectedAsset.price,
                supplyApy: selectedAsset.supplyApy,
                totalSupplied: selectedAsset.totalSupplied,
              }
            : null
        }
        walletAddress={walletAddress}
        healthFactor={healthFactor}
      />
    </div>
  );
}

export default function PositionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          Loading...
        </div>
      }
    >
      <PositionsPageContent />
    </Suspense>
  );
}
