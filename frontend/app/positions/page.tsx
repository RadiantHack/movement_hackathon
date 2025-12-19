"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { SupplyModal } from "../components/supply-modal";
import { BorrowModal } from "../components/borrow-modal";
import { getTokenBySymbol, getVerifiedTokens } from "../utils/token-constants";
import { type TokenInfo } from "../utils/tokens";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";
import { getMovementApiBase } from "@/lib/super-aptos-sdk/src/globals";

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

  const movementApiBase = getMovementApiBase();

  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState<boolean>(false);
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
    // MOVE-FA is the main MOVE market, AptosCoin MOVE is legacy
    if (trimmed.toLowerCase() === "move-fa") return "MOVE";
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
          BASE: movementApiBase,
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
  }, [walletAddress, movementApiBase]);

  // Fetch brokers data
  useEffect(() => {
    const fetchBrokers = async () => {
      setLoadingBrokers(true);
      setBrokerError(null);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: movementApiBase,
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
  }, [movementApiBase]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  const marketPositions: MarketPosition[] = useMemo(() => {
    const verified = getVerifiedTokens();
    // Filter out legacy AptosCoin MOVE (use MOVE-FA instead which has higher utilization)
    const filteredBrokers = brokers.filter(
      (entry) => entry.underlyingAsset.name !== "movement-move"
    );
    return filteredBrokers.map((entry) => {
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

      // Calculate Supply APY using formula matching moveposition.xyz
      // For high utilization: interestRate × (1 - protocolFee) where protocolFee ~= 0.17
      // For normal: utilization × interestRate × (1 - interestFeeRate)
      const interestFeeRate = entry.interestFeeRate ?? 0.22;
      const currentSupplyApy =
        entry.utilization * entry.interestRate * (1 - interestFeeRate);

      // Historical/boosted APY from exchange rate
      const exchangeRate = entry.depositNoteExchangeRate || 1;
      const totalReturn = exchangeRate - 1;
      const boostedApy = totalReturn > 0 ? totalReturn * 100 : undefined;

      return {
        token,
        symbol,
        name: entry.underlyingAsset.name,
        price: entry.underlyingAsset.price,
        utilization: entry.utilization * 100,
        availableLiquidity,
        totalBorrowed,
        totalSupplied,
        supplyApy: currentSupplyApy * 100,
        boostedApy,
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
                Move Position
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Manage your lending and borrowing positions
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
            <>
              {/* Top Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                  <div className="flex items-center gap-2 mb-1">
                    <svg
                      className="w-4 h-4 text-green-600 dark:text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Equity
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {loadingPortfolio ? (
                      <span className="inline-block w-16 h-6 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                    ) : (
                      `$${equity.toFixed(2)}`
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    100%
                  </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                  <div className="flex items-center gap-2 mb-1">
                    <svg
                      className="w-4 h-4 text-red-500 dark:text-red-400"
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
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Debt
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {loadingPortfolio ? (
                      <span className="inline-block w-16 h-6 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                    ) : (
                      `$${debt.toFixed(2)}`
                    )}
                  </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                  <div className="flex items-center gap-2 mb-1">
                    <svg
                      className="w-4 h-4 text-green-600 dark:text-green-400"
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
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Health factor
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {loadingPortfolio ? (
                      <span className="inline-block w-12 h-6 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                    ) : healthFactor ? (
                      `${healthFactor.toFixed(2)}x`
                    ) : (
                      "N/A"
                    )}
                  </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                  <div className="flex items-center gap-2 mb-1">
                    <svg
                      className="w-4 h-4 text-yellow-500 dark:text-yellow-400"
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
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Min. Required Equity
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                    {loadingPortfolio ? (
                      <span className="inline-block w-20 h-6 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                    ) : (
                      <>
                        ${minRequiredEquity.toFixed(2)}{" "}
                        {minRequiredEquityPercent.toFixed(1)}%
                      </>
                    )}
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-green-600 dark:bg-green-500 h-2 rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.min(minRequiredEquityPercent, 100)}%`,
                      }}
                    />
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

              {portfolioError && (
                <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-700 dark:text-yellow-400">
                  Portfolio data: {portfolioError}
                </div>
              )}

              {/* Asset Table */}
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <thead className="bg-gradient-to-r from-zinc-50 to-zinc-100 dark:from-zinc-800/80 dark:to-zinc-800/40 border-b border-zinc-200 dark:border-zinc-700">
                      <tr>
                        <th className="px-5 py-4 text-left">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                            Asset
                          </span>
                        </th>
                        <th className="px-5 py-4 text-left">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                            Supplied
                          </span>
                        </th>
                        <th className="px-5 py-4 text-left hidden md:table-cell">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                            Utilization
                          </span>
                        </th>
                        <th className="px-5 py-4 text-left hidden md:table-cell">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                            Total Supplied
                          </span>
                        </th>
                        <th className="px-5 py-4 text-left hidden md:table-cell">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                            Supply APY
                          </span>
                        </th>
                        <th className="px-5 py-4 text-center">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                            Actions
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredAssets.map((asset) => (
                        <tr
                          key={asset.token?.id ?? asset.symbol}
                          className="group hover:bg-gradient-to-r hover:from-zinc-50 hover:to-transparent dark:hover:from-zinc-800/30 dark:hover:to-transparent transition-all duration-200"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-4">
                              <div className="relative flex-shrink-0">
                                {asset.token?.iconUri ? (
                                  <img
                                    src={asset.token.iconUri}
                                    alt={asset.token?.symbol ?? asset.symbol}
                                    className="w-11 h-11 rounded-2xl shadow-md group-hover:shadow-lg transition-shadow"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                      (
                                        e.target as HTMLImageElement
                                      ).nextElementSibling?.classList.remove(
                                        "hidden"
                                      );
                                    }}
                                  />
                                ) : null}
                                <div
                                  className={`w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center shadow-md ${asset.token?.iconUri ? "hidden" : ""}`}
                                >
                                  <span className="text-white font-bold text-lg">
                                    {asset.symbol.charAt(0)}
                                  </span>
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-base text-zinc-900 dark:text-zinc-50 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                  {asset.symbol}
                                </div>
                                <div className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
                                  $
                                  {asset.price < 1
                                    ? asset.price.toFixed(4)
                                    : asset.price.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 tabular-nums tracking-tight">
                              {asset.totalSupplied > 0
                                ? asset.totalSupplied.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )
                                : "—"}
                            </div>
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    asset.utilization >= 90
                                      ? "bg-gradient-to-r from-red-500 to-orange-500"
                                      : asset.utilization >= 70
                                        ? "bg-gradient-to-r from-yellow-500 to-amber-500"
                                        : "bg-gradient-to-r from-emerald-500 to-green-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(asset.utilization, 100)}%`,
                                  }}
                                />
                              </div>
                              <span
                                className={`text-sm font-semibold min-w-[52px] text-right ${
                                  asset.utilization >= 90
                                    ? "text-red-600 dark:text-red-400"
                                    : asset.utilization >= 70
                                      ? "text-yellow-600 dark:text-yellow-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                {asset.utilization.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <div>
                              <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                                {asset.availableLiquidity.toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </div>
                              <div className="text-xs text-zinc-400 dark:text-zinc-500">
                                of{" "}
                                {asset.totalSupplied.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                available
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <div
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${
                                asset.supplyApy >= 50
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : asset.supplyApy >= 10
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : asset.supplyApy >= 1
                                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  asset.supplyApy >= 50
                                    ? "bg-emerald-500 animate-pulse"
                                    : asset.supplyApy >= 10
                                      ? "bg-green-500"
                                      : asset.supplyApy >= 1
                                        ? "bg-blue-500"
                                        : "bg-zinc-400"
                                }`}
                              />
                              {asset.supplyApy.toFixed(2)}%
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-3">
                              {/* Supply */}
                              <button
                                className="group relative w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 border border-emerald-200 dark:border-emerald-700/50 flex items-center justify-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20 hover:border-emerald-400"
                                onClick={() => {
                                  setSelectedAsset(asset);
                                  setIsSupplyModalOpen(true);
                                }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <svg
                                  className="w-[18px] h-[18px] relative z-10 text-emerald-600 dark:text-emerald-400 group-hover:text-white transition-colors"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="8"
                                    className="group-hover:animate-pulse"
                                  />
                                  <path d="M12 8v8M8 12h8" />
                                </svg>
                              </button>
                              {/* Borrow - Coin coming out */}
                              <button
                                className="group relative w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-violet-50 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 border border-violet-200 dark:border-violet-700/50 flex items-center justify-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20 hover:border-violet-400"
                                onClick={() => {
                                  setSelectedAsset(asset);
                                  setIsBorrowModalOpen(true);
                                }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <svg
                                  className="w-[18px] h-[18px] relative z-10 text-violet-600 dark:text-violet-400 group-hover:text-white transition-colors"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="8"
                                    className="group-hover:animate-pulse"
                                  />
                                  <path d="M8 12h8" />
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

      <BorrowModal
        isOpen={isBorrowModalOpen}
        onClose={() => {
          setIsBorrowModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={
          selectedAsset
            ? {
                token: selectedAsset.token,
                symbol: selectedAsset.symbol,
                price: selectedAsset.price,
                borrowApy: selectedAsset.supplyApy * 1.5, // Approximate borrow APY
                availableLiquidity: selectedAsset.availableLiquidity,
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
