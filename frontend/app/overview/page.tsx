"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { AuthGuard } from "../components/auth-guard";
import { useMovementWallet } from "../hooks/useMovementWallet";

import TransferModal from "../components/transfer/TransferModal";
import SwapModal from "../components/swap/SwapModal";
import BridgeModal from "../components/bridge/BridgeModal";
import BalanceCard from "../components/overview/BalanceCard";
import AssetsList from "../components/overview/AssetsList";
import { QRCodeSVG } from "qrcode.react";
import { TokenBalance } from "../types";

export default function OverviewPage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const movementWallet = useMovementWallet();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState(10);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});

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
      // Only show loading on first load
      if (!hasLoadedOnce) {
        setLoadingBalances(true);
      }
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
          setHasLoadedOnce(true);
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
  }, [walletAddress, hasLoadedOnce]);

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
    setShowBridgeModal(true);
  };

  const handleSwapClick = () => {
    setShowSwapModal(true);
  };

  return (
    <AuthGuard>
      <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-black">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

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
              {/* Balance Card */}
              <BalanceCard
                totalBalanceUsd={totalBalanceUsd}
                walletAddress={walletAddress}
                onTransferClick={handleTransferClick}
                onSwapClick={handleSwapClick}
                onBridgeClick={handleBridgeClick}
                onShowQRCode={() => setShowQRCode(true)}
              />

              {/* Assets List */}
              <AssetsList
                balances={balances}
                loadingBalances={loadingBalances}
                balanceError={balanceError}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                displayLimit={displayLimit}
                onDisplayLimitChange={setDisplayLimit}
                tokenPrices={tokenPrices}
                onTokenTransferClick={handleTokenTransferClick}
                filteredBalances={filteredBalances}
              />
            </div>
          </div>
        </div>

        <RightSidebar
          isOpen={isRightSidebarOpen}
          onClose={() => setIsRightSidebarOpen(false)}
        />

        {showTransferModal && walletAddress && (
          <TransferModal
            walletAddress={walletAddress}
            balances={balances}
            initialToken={selectedTokenForTransfer}
            onClose={() => {
              setShowTransferModal(false);
              setSelectedTokenForTransfer(null);
            }}
            onTransferComplete={() => {
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
        )}

        {showSwapModal && walletAddress && (
          <SwapModal
            walletAddress={walletAddress}
            onClose={() => setShowSwapModal(false)}
          />
        )}

        {showBridgeModal && walletAddress && (
          <BridgeModal
            walletAddress={walletAddress}
            onClose={() => setShowBridgeModal(false)}
          />
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
    </AuthGuard>
  );
}
