"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { AuthGuard } from "../components/auth-guard";
import { AssetIcon } from "../components/asset-icon";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useMovementConfig } from "../hooks/useMovementConfig";
import { executeBridge, isValidEthereumAddress } from "../utils/bridge";
import { createAptosClient } from "../utils/shared/clients";
import { useMovementWallet } from "../hooks/useMovementWallet";

const MOVEMENT_CHAIN = {
  id: "movement",
  name: "Movement",
  symbol: "MOVE",
  color: "from-yellow-400 to-amber-500",
};

const ETHEREUM_CHAIN = {
  id: "ethereum",
  name: "Ethereum",
  symbol: "ETH",
  color: "from-blue-500 to-indigo-600",
};

const TOKENS = [
  { symbol: "MOVE", name: "Move Coin" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "USDT", name: "Tether USD" },
  { symbol: "WETH", name: "Wrapped ETH" },
  { symbol: "WBTC", name: "Wrapped BTC" },
];

export default function BridgePage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const movementWallet = useMovementWallet();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  const [token, setToken] = useState("MOVE");
  const [amount, setAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [bridging, setBridging] = useState(false);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number>(8);
  const [tokenBalanceData, setTokenBalanceData] = useState<any>(null);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  const { signRawHash } = useSignRawHash();
  const config = useMovementConfig();

  // Initialize Aptos client
  const aptos = useMemo(() => {
    return createAptosClient({
      movementFullNode: config.movementFullNode,
    });
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

  const walletAddress = useMemo(() => {
    if (!movementWallet?.address) return null;
    const addr = movementWallet.address;
    if (addr && addr.startsWith("0x") && addr.length >= 42) {
      return addr;
    }
    return null;
  }, [movementWallet]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tokenDropdownRef.current &&
        !tokenDropdownRef.current.contains(event.target as Node)
      ) {
        setShowTokenDropdown(false);
      }
    };

    if (showTokenDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTokenDropdown]);

  // Fetch balance for selected token
  useEffect(() => {
    if (!walletAddress || !token) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      setLoadingBalance(true);
      try {
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();

        if (data.success && data.balances && data.balances.length > 0) {
          const normalizedToken = token.toUpperCase().replace(/\./g, "").trim();

          const tokenBalance = data.balances.find((b: any) => {
            const normalizedSymbol = b.metadata.symbol
              .toUpperCase()
              .replace(/\./g, "")
              .trim();

            return (
              normalizedSymbol === normalizedToken ||
              normalizedSymbol.startsWith(normalizedToken) ||
              normalizedToken.startsWith(normalizedSymbol)
            );
          });

          if (tokenBalance) {
            setBalance(tokenBalance.formattedAmount);
            setTokenDecimals(tokenBalance.metadata.decimals || 8);
            setTokenBalanceData(tokenBalance);
          } else {
            setBalance("0.000000");
            setTokenDecimals(8);
            setTokenBalanceData(null);
          }
        } else {
          setBalance("0.000000");
        }
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [walletAddress, token]);

  const handleBridge = async () => {
    if (!recipientAddress || !isValidEthereumAddress(recipientAddress)) {
      return;
    }
    if (!walletAddress || !movementWallet || !aptos) {
      return;
    }

    setBridging(true);
    try {
      const senderAddress = walletAddress;
      const senderPubKeyWithScheme = movementWallet.publicKey as string;

      // Execute bridge using utility function
      const txHash = await executeBridge({
        aptos: aptos!,
        movementChainId,
        senderAddress,
        senderPubKeyWithScheme,
        recipientAddress,
        amount,
        tokenDecimals,
        signRawHash,
      });

      console.log("Bridge transaction executed:", txHash);
      alert(`Bridge transaction successful! Hash: ${txHash}`);

      // Reset form
      setAmount("");
      setRecipientAddress("");
    } catch (error) {
      console.error("Bridge error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Bridge failed. Please try again.";
      alert(`Bridge failed: ${errorMessage}`);
    } finally {
      setBridging(false);
    }
  };

  const selectedToken = TOKENS.find((t) => t.symbol === token) || TOKENS[0];

  const balanceNum = balance ? parseFloat(balance) : 0;
  const amountNum = amount ? parseFloat(amount) : 0;
  const hasInsufficientBalance = amountNum > balanceNum;

  const canBridge =
    amount &&
    amountNum > 0 &&
    !hasInsufficientBalance &&
    recipientAddress &&
    isValidEthereumAddress(recipientAddress) &&
    !bridging;

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
              Bridge
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
                  Bridge Assets
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Bridge from Movement to Ethereum
                </p>
              </div>
              <ThemeToggle />
            </div>
          </div>

          {/* Bridge Content */}
          <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-8">
            <div className="w-full max-w-[480px] mx-auto">
              <div className="relative rounded-2xl p-6 sm:p-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700/50 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden">
                {/* Background decoration */}
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-gradient-to-br from-yellow-400/10 via-amber-500/10 to-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-tr from-blue-500/10 via-cyan-500/10 to-yellow-400/10 rounded-full blur-3xl" />

                {/* Header */}
                <div className="relative flex items-center gap-3 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400 via-amber-500 to-blue-500 shadow-lg shadow-yellow-500/30">
                    <svg
                      className="w-6 h-6 text-white"
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
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                      Bridge to Ethereum
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Transfer assets from Movement Network
                    </p>
                  </div>
                </div>

                {/* Chain Display */}
                <div className="relative mb-6 p-5 rounded-2xl bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800/50 dark:to-zinc-800/30 border border-zinc-200/50 dark:border-zinc-700/30">
                  {/* From Chain */}
                  <div className="mb-4">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                      From
                    </label>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-md">
                        <span className="text-white text-sm font-bold">
                          {MOVEMENT_CHAIN.symbol.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                          {MOVEMENT_CHAIN.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          Movement Network
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center -my-2 relative z-10">
                    <div className="p-2 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 border-4 border-white dark:border-zinc-900 shadow-lg">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* To Chain */}
                  <div className="mt-4">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                      To
                    </label>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                        <span className="text-white text-sm font-bold">
                          {ETHEREUM_CHAIN.symbol.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                          {ETHEREUM_CHAIN.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          Ethereum Mainnet
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Token Selection */}
                <div className="relative mb-4" ref={tokenDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                    Select Token
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                      disabled={bridging}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden p-1">
                          <AssetIcon
                            symbol={selectedToken.symbol}
                            size="w-10 h-10"
                            className="rounded-lg"
                          />
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                            {selectedToken.symbol}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {selectedToken.name}
                          </div>
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-zinc-400 transition-transform ${
                          showTokenDropdown ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    {/* Token Dropdown */}
                    {showTokenDropdown && (
                      <div className="absolute z-20 w-full mt-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
                        {TOKENS.map((t) => {
                          return (
                            <button
                              key={t.symbol}
                              onClick={() => {
                                setToken(t.symbol);
                                setShowTokenDropdown(false);
                              }}
                              className={`w-full flex items-center gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                                token === t.symbol
                                  ? "bg-blue-50 dark:bg-blue-900/20"
                                  : ""
                              }`}
                            >
                              <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden p-1">
                                <AssetIcon
                                  symbol={t.symbol}
                                  size="w-10 h-10"
                                  className="rounded-lg"
                                />
                              </div>
                              <div className="text-left flex-1">
                                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                                  {t.symbol}
                                </div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {t.name}
                                </div>
                              </div>
                              {token === t.symbol && (
                                <svg
                                  className="w-5 h-5 text-blue-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount Input */}
                <div className="relative mb-4">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                    Amount
                  </label>
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, "");
                          setAmount(val);
                        }}
                        placeholder="0.0"
                        className="flex-1 min-w-0 bg-transparent text-2xl font-bold text-zinc-900 dark:text-zinc-50 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none"
                        disabled={bridging}
                      />
                      <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-2">
                        {selectedToken.symbol}
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-xs text-zinc-400">
                        {loadingBalance ? (
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3 h-3 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            Loading...
                          </span>
                        ) : (
                          `Balance: ${
                            balance
                              ? parseFloat(balance).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 6,
                                })
                              : "0.00"
                          } ${selectedToken.symbol}`
                        )}
                      </span>
                      <button
                        onClick={() => {
                          if (balance) {
                            setAmount(balance);
                          }
                        }}
                        className="text-xs font-bold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={
                          bridging ||
                          !balance ||
                          parseFloat(balance || "0") === 0
                        }
                      >
                        MAX
                      </button>
                    </div>
                    {hasInsufficientBalance && (
                      <p className="mt-2 text-xs text-red-500">
                        Insufficient balance. Available:{" "}
                        {balance
                          ? parseFloat(balance).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 6,
                            })
                          : "0.00"}{" "}
                        {selectedToken.symbol}
                      </p>
                    )}
                  </div>
                </div>

                {/* Recipient Address */}
                <div className="relative mb-4">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                    Recipient Address (Ethereum)
                  </label>
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 p-4 shadow-sm">
                    <input
                      type="text"
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full bg-transparent text-sm font-mono text-zinc-900 dark:text-zinc-50 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none"
                      disabled={bridging}
                    />
                    {recipientAddress &&
                      !isValidEthereumAddress(recipientAddress) && (
                        <p className="mt-2 text-xs text-red-500">
                          Invalid Ethereum address
                        </p>
                      )}
                  </div>
                </div>

                {/* Estimated Info */}
                {amount &&
                  parseFloat(amount) > 0 &&
                  recipientAddress &&
                  isValidEthereumAddress(recipientAddress) && (
                    <div className="relative mb-4 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100 dark:border-blue-800/30">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                          Bridge Ready
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            You will receive
                          </span>
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            ~{amount} {selectedToken.symbol}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            Est. time
                          </span>
                          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            ~15-30 min
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            Bridge fee
                          </span>
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                            ~0.1%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Bridge Button */}
                <button
                  onClick={handleBridge}
                  disabled={!canBridge}
                  className={`relative w-full py-3 rounded-xl font-bold text-sm transition-all duration-300 overflow-hidden ${
                    canBridge
                      ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  <span className="relative flex items-center justify-center gap-2">
                    {bridging ? (
                      <>
                        <svg
                          className="w-5 h-5 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Bridging...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        Bridge {selectedToken.symbol}
                      </>
                    )}
                  </span>
                </button>

                {!walletAddress && (
                  <p className="relative mt-4 text-sm text-center text-zinc-500 dark:text-zinc-400">
                    Connect your wallet to bridge assets
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <RightSidebar
          isOpen={isRightSidebarOpen}
          onClose={() => setIsRightSidebarOpen(false)}
        />
      </div>
    </AuthGuard>
  );
}
