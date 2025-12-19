"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { getTokenBySymbol, getVerifiedTokens } from "../utils/token-constants";
import { type TokenInfo } from "../utils/tokens";
import { getMovementPositionBrokerUrl } from "@/lib/super-aptos-sdk/src/globals";

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

export default function OverviewPage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerEntry[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState<boolean>(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);

  const movementPositionBrokerUrl = getMovementPositionBrokerUrl();

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

  // Fetch brokers data
  useEffect(() => {
    const fetchBrokers = async () => {
      setLoadingBrokers(true);
      setBrokerError(null);
      try {
        const response = await fetch(movementPositionBrokerUrl);
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

  const totalSuppliedValue = useMemo(() => {
    return marketPositions.reduce((sum, asset) => sum + asset.tvlUsd, 0);
  }, [marketPositions]);

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
            Overview
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
                Overview
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Portfolio composition and supply distribution
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
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

            {/* Supply Composition Content */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
                Supply Composition
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
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-purple-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
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
                      className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 outline"
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
