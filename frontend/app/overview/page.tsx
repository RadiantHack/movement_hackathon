"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { TransferForm } from "../components/transfer-form";
import { SwapCard } from "../components/features/swap/SwapCard";
import { QRCodeSVG } from "qrcode.react";
import { getTokenIconUrl } from "../utils/token-icons";

interface TokenBalance {
  assetType: string;
  amount: string;
  formattedAmount: string;
  metadata: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isNative: boolean;
}

export default function OverviewPage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState(10);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});

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

  useEffect(() => {
    const fetchBalances = async () => {
      if (!walletAddress) {
        setLoadingBalances(false);
        return;
      }
      setLoadingBalances(true);
      setBalanceError(null);
      try {
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch balances (${response.status})`);
        }
        const data = await response.json();
        if (data.success && data.balances) {
          setBalances(data.balances);
        } else {
          setBalanceError(data.error || "Failed to load balances");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load balances.";
        setBalanceError(message);
      } finally {
        setLoadingBalances(false);
      }
    };
    fetchBalances();
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Fetch token prices
  useEffect(() => {
    const fetchPrices = async () => {
      if (balances.length === 0) {
        setTokenPrices({});
        return;
      }

      try {
        // Get unique token symbols (keep original format for mapping)
        const symbolSet = new Set<string>();
        balances.forEach((b) => {
          const symbol = b.metadata.symbol.toUpperCase();
          symbolSet.add(symbol);
          // Also add without .E suffix for better matching
          if (symbol.endsWith(".E")) {
            symbolSet.add(symbol.replace(/\.E$/, ""));
          }
        });

        const symbols = Array.from(symbolSet);

        if (symbols.length === 0) {
          setTokenPrices({});
          return;
        }

        const response = await fetch(
          `/api/prices?symbols=${symbols.join(",")}`
        );

        if (response.ok) {
          const data = await response.json();
          const prices = data.prices || {};

          // Map prices back to all symbol variations
          const normalizedPrices: Record<string, number> = {};
          balances.forEach((b) => {
            const symbol = b.metadata.symbol.toUpperCase();
            const symbolWithoutE = symbol.replace(/\.E$/, "");
            // Try exact match, then without .E suffix
            const price = prices[symbol] || prices[symbolWithoutE];
            if (price) {
              normalizedPrices[symbol] = price;
              normalizedPrices[symbolWithoutE] = price;
            } else {
              // Log tokens without prices for debugging
              console.log(
                `No price found for token: ${symbol} (tried: ${symbol}, ${symbolWithoutE})`
              );
            }
          });

          console.log(
            `Fetched prices for ${Object.keys(normalizedPrices).length} token variations from ${balances.length} balances`
          );
          setTokenPrices(normalizedPrices);
        } else {
          console.error("Failed to fetch prices");
          setTokenPrices({});
        }
      } catch (error) {
        console.error("Error fetching prices:", error);
        setTokenPrices({});
      }
    };

    fetchPrices();
  }, [balances]);

  const totalBalanceUsd = useMemo(() => {
    if (balances.length === 0) return 0;

    let total = 0;
    const breakdown: Array<{
      symbol: string;
      amount: number;
      price: number;
      usdValue: number;
    }> = [];

    balances.forEach((balance) => {
      const amount = parseFloat(balance.formattedAmount) || 0;
      if (amount === 0) return;

      const symbol = balance.metadata.symbol.toUpperCase();
      const symbolWithoutE = symbol.replace(/\.E$/, "");

      // Try to find price with original symbol first, then without .E suffix
      const price = tokenPrices[symbol] || tokenPrices[symbolWithoutE] || 0;
      const usdValue = amount * price;

      total += usdValue;

      // Store breakdown for debugging
      breakdown.push({
        symbol: balance.metadata.symbol,
        amount,
        price,
        usdValue,
      });
    });

    // Log breakdown for debugging (can be removed in production)
    if (breakdown.length > 0) {
      console.log("Total Balance Breakdown:", {
        total,
        breakdown,
        tokenCount: balances.length,
        assetsWithPrice: breakdown.filter((b) => b.price > 0).length,
      });
    }

    return total;
  }, [balances, tokenPrices]);

  const filteredBalances = useMemo(() => {
    if (!searchQuery.trim()) return balances;
    const query = searchQuery.toLowerCase().trim();
    return balances.filter(
      (balance) =>
        balance.metadata.symbol.toLowerCase().includes(query) ||
        balance.metadata.name.toLowerCase().includes(query)
    );
  }, [balances, searchQuery]);

  const displayedBalances = useMemo(() => {
    return filteredBalances.slice(0, displayLimit);
  }, [filteredBalances, displayLimit]);

  const hasMore = filteredBalances.length > displayLimit;

  const [selectedTokenForTransfer, setSelectedTokenForTransfer] =
    useState<TokenBalance | null>(null);

  const handleTransferClick = () => {
    if (!walletAddress) return;
    setSelectedTokenForTransfer(null);
    setShowTransferModal(true);
  };

  const handleTokenTransferClick = (token: TokenBalance) => {
    if (!walletAddress) return;
    setSelectedTokenForTransfer(token);
    setShowTransferModal(true);
  };

  const handleBridgeClick = () => {
    router.push("/bridge");
  };

  const handleSwapClick = () => {
    setShowSwapModal(true);
  };

  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-black font-sans">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100 mx-auto"></div>
          <div className="text-lg text-zinc-600 dark:text-zinc-400">
            Loading...
          </div>
        </div>
      </div>
    );
  }

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
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
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
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">
            Wallet
          </span>
          <button
            onClick={() => setIsRightSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
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
        <div className="hidden shrink-0 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:flex">
          <div className="flex flex-row items-center justify-between w-full">
            <div>
              <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Wallet Overview
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Manage your assets on Movement Network
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Balance Card - Desktop */}
            <div className="hidden md:block mb-6">
              <div className="relative rounded-lg border border-zinc-200 bg-white p-6 lg:p-8 dark:border-zinc-800 dark:bg-zinc-900 shadow-lg overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
                    <div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-sm font-medium mb-2">
                        Total Balance
                      </p>
                      <h2 className="text-3xl lg:text-5xl font-bold text-zinc-950 dark:text-zinc-50">
                        $
                        {totalBalanceUsd.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </h2>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <button
                        onClick={handleTransferClick}
                        className="flex-1 px-4 sm:px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 text-sm sm:text-base"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <svg
                            className="w-4 h-4 sm:w-5 sm:h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                            />
                          </svg>
                          <span>Transfer</span>
                        </div>
                      </button>
                      <button
                        onClick={handleSwapClick}
                        className="flex-1 px-4 sm:px-6 py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 text-sm sm:text-base"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <svg
                            className="w-4 h-4 sm:w-5 sm:h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                            />
                          </svg>
                          <span>Swap</span>
                        </div>
                      </button>
                      <button
                        onClick={handleBridgeClick}
                        className="flex-1 px-4 sm:px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 text-sm sm:text-base"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <svg
                            className="w-4 h-4 sm:w-5 sm:h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          <span>Bridge</span>
                        </div>
                      </button>
                    </div>
                  </div>
                  {walletAddress && (
                    <div className="mt-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-zinc-600 dark:text-zinc-400 text-xs flex items-center gap-2">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                          Wallet Address
                        </p>
                        <button
                          onClick={() => setShowQRCode(true)}
                          className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                          title="Show QR Code"
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
                              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                            />
                          </svg>
                        </button>
                      </div>
                      <p className="text-zinc-900 dark:text-zinc-100 font-mono text-xs sm:text-sm break-all">
                        {walletAddress}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Balance Card - Mobile */}
            <div className="md:hidden mb-4">
              <div className="relative rounded-lg border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-lg overflow-hidden">
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/5 rounded-full blur-2xl"></div>
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/5 rounded-full blur-2xl"></div>
                <div className="relative z-10">
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs font-medium mb-2">
                    Total Balance
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 mb-4">
                    $
                    {totalBalanceUsd.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h2>
                  {walletAddress && (
                    <div className="mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-zinc-600 dark:text-zinc-400 text-xs">
                          Wallet
                        </p>
                        <button
                          onClick={() => setShowQRCode(true)}
                          className="p-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                          title="Show QR Code"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                            />
                          </svg>
                        </button>
                      </div>
                      <p className="text-zinc-900 dark:text-zinc-100 font-mono text-xs break-all">
                        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handleTransferClick}
                      className="px-3 py-3 rounded-lg bg-purple-600 text-white font-semibold text-xs hover:bg-purple-700 transition-all duration-300 shadow-md active:scale-95"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
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
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                        <span>Transfer</span>
                      </div>
                    </button>
                    <button
                      onClick={handleSwapClick}
                      className="px-3 py-3 rounded-lg bg-green-600 text-white font-semibold text-xs hover:bg-green-700 transition-all duration-300 shadow-md active:scale-95"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
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
                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                          />
                        </svg>
                        <span>Swap</span>
                      </div>
                    </button>
                    <button
                      onClick={handleBridgeClick}
                      className="px-3 py-3 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-all duration-300 shadow-md active:scale-95"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
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
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        <span>Bridge</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tokens List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Assets {balances.length > 0 && `(${balances.length})`}
                </h3>
                {loadingBalances && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"></div>
                )}
              </div>

              {/* Search Bar */}
              {balances.length > 0 && (
                <div className="relative mb-4">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                      className="h-4 w-4 sm:h-5 sm:w-5 text-zinc-400"
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
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setDisplayLimit(10);
                    }}
                    placeholder="Search assets..."
                    className="w-full pl-9 sm:pl-10 pr-8 sm:pr-10 py-2 sm:py-2.5 text-sm sm:text-base rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setDisplayLimit(10);
                      }}
                      className="absolute inset-y-0 right-0 pr-2 sm:pr-3 flex items-center"
                    >
                      <svg
                        className="h-4 w-4 sm:h-5 sm:w-5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {balanceError && (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  {balanceError}
                </div>
              )}

              {!loadingBalances && balances.length === 0 && !balanceError && (
                <div className="p-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    No assets found
                  </p>
                </div>
              )}

              {!loadingBalances &&
                filteredBalances.length === 0 &&
                searchQuery && (
                  <div className="p-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center">
                    <p className="text-zinc-600 dark:text-zinc-400">
                      No assets found matching "{searchQuery}"
                    </p>
                  </div>
                )}

              <div className="space-y-3">
                {displayedBalances.map((balance, index) => {
                  const amount = parseFloat(balance.formattedAmount);
                  const formattedAmount = amount.toLocaleString(undefined, {
                    minimumFractionDigits: amount < 1 ? 6 : 2,
                    maximumFractionDigits: amount < 1 ? 8 : 6,
                  });
                  const isNative = balance.isNative;
                  const symbol = balance.metadata.symbol.toUpperCase();
                  const symbolWithoutE = symbol.replace(/\.E$/, "");
                  // Try to find price with original symbol first, then without .E suffix
                  const price =
                    tokenPrices[symbol] || tokenPrices[symbolWithoutE] || 0;
                  const usdValue = amount * price;
                  const formattedUsdValue =
                    usdValue > 0
                      ? usdValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : null;

                  return (
                    <div
                      key={balance.assetType}
                      className="group relative rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900 transition-all duration-200 hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 hover:-translate-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2 sm:gap-3">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div
                            className={`relative flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden ${
                              isNative
                                ? "bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 border-2 border-purple-300 dark:border-purple-700"
                                : "bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 border border-zinc-300 dark:border-zinc-600"
                            } flex items-center justify-center shadow-sm`}
                          >
                            {(() => {
                              const iconUrl = getTokenIconUrl(
                                balance.metadata.symbol,
                                balance.assetType
                              );
                              if (iconUrl) {
                                return (
                                  <>
                                    <img
                                      src={iconUrl}
                                      alt={balance.metadata.symbol}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        const target =
                                          e.target as HTMLImageElement;
                                        target.style.display = "none";
                                        const fallback =
                                          target.nextElementSibling as HTMLElement;
                                        if (fallback) {
                                          fallback.style.display = "flex";
                                        }
                                      }}
                                    />
                                    <div
                                      className={`hidden items-center justify-center w-full h-full text-sm sm:text-lg font-bold ${
                                        isNative
                                          ? "text-purple-700 dark:text-purple-300"
                                          : "text-zinc-700 dark:text-zinc-300"
                                      }`}
                                    >
                                      {balance.metadata.symbol.length <= 4
                                        ? balance.metadata.symbol
                                        : balance.metadata.symbol.charAt(0)}
                                    </div>
                                  </>
                                );
                              }
                              return (
                                <span
                                  className={`text-sm sm:text-lg font-bold ${
                                    isNative
                                      ? "text-purple-700 dark:text-purple-300"
                                      : "text-zinc-700 dark:text-zinc-300"
                                  }`}
                                >
                                  {balance.metadata.symbol.length <= 4
                                    ? balance.metadata.symbol
                                    : balance.metadata.symbol.charAt(0)}
                                </span>
                              );
                            })()}
                            {isNative && (
                              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-purple-500 rounded-full border-2 border-white dark:border-zinc-900 z-10"></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                              {balance.metadata.symbol}
                            </h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate hidden sm:block">
                              {balance.metadata.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-50">
                              {formattedAmount}
                            </p>
                            {formattedUsdValue ? (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                ${formattedUsdValue}
                              </p>
                            ) : (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                                {balance.metadata.symbol}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTokenTransferClick(balance);
                            }}
                            className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-all hover:scale-110 active:scale-95"
                            title="Transfer"
                          >
                            <svg
                              className="w-4 h-4 sm:w-5 sm:h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show More Button */}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setDisplayLimit((prev) => prev + 10)}
                    className="px-6 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Show More ({filteredBalances.length - displayLimit}{" "}
                    remaining)
                  </button>
                </div>
              )}

              {/* Show Less Button */}
              {displayLimit > 10 &&
                !hasMore &&
                filteredBalances.length > 10 && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setDisplayLimit(10)}
                      className="px-6 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Show Less
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>

      <RightSidebar
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
      />

      {/* Transfer Modal */}
      {showTransferModal && walletAddress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTransferModal(false);
              setSelectedTokenForTransfer(null);
            }
          }}
        >
          <div className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowTransferModal(false);
                setSelectedTokenForTransfer(null);
              }}
              className="absolute top-4 right-4 z-10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="p-6">
              <TransferForm
                walletAddress={walletAddress}
                balances={balances}
                initialToken={selectedTokenForTransfer}
                onTransferComplete={() => {
                  setShowTransferModal(false);
                  setSelectedTokenForTransfer(null);
                  setTimeout(() => {
                    if (walletAddress) {
                      fetch(
                        `/api/balance?address=${encodeURIComponent(walletAddress)}`
                      )
                        .then((res) => res.json())
                        .then((data) => {
                          if (data.success && data.balances) {
                            setBalances(data.balances);
                          }
                        });
                    }
                  }, 2000);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Swap Modal */}
      {showSwapModal && walletAddress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSwapModal(false);
            }
          }}
        >
          <div className="relative w-full max-w-lg rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowSwapModal(false)}
              className="absolute top-4 right-4 z-10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="p-6">
              <SwapCard walletAddress={walletAddress} />
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRCode && walletAddress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQRCode(false);
            }
          }}
        >
          <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-2xl animate-scale-in p-6">
            <button
              onClick={() => setShowQRCode(false)}
              className="absolute top-4 right-4 z-10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="text-center">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
                Wallet Address QR Code
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                Scan to receive funds
              </p>
              <div className="flex justify-center mb-6 p-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <div className="w-full max-w-[200px] sm:max-w-[250px]">
                  <QRCodeSVG
                    value={walletAddress}
                    size={256}
                    level="H"
                    includeMargin={true}
                    fgColor="#000000"
                    bgColor="#ffffff"
                    className="w-full h-auto dark:invert"
                  />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  Address
                </p>
                <p className="text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 font-mono break-all">
                  {walletAddress}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(walletAddress);
                }}
                className="mt-4 w-full px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors text-sm"
              >
                Copy Address
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
