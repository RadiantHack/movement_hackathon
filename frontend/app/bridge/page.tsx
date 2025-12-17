"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";

const CHAINS = [
  { id: "ethereum", name: "Ethereum", symbol: "ETH", color: "from-blue-500 to-indigo-600" },
  { id: "arbitrum", name: "Arbitrum", symbol: "ARB", color: "from-sky-400 to-blue-500" },
  { id: "base", name: "Base", symbol: "BASE", color: "from-blue-600 to-blue-700" },
  { id: "optimism", name: "Optimism", symbol: "OP", color: "from-red-500 to-rose-600" },
  { id: "movement", name: "Movement", symbol: "MOVE", color: "from-yellow-400 to-amber-500" },
];

const TOKENS = ["ETH", "USDC", "USDT", "WBTC"];

export default function BridgePage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  const [fromChain, setFromChain] = useState("ethereum");
  const [toChain, setToChain] = useState("movement");
  const [token, setToken] = useState("ETH");
  const [amount, setAmount] = useState("");
  const [bridging, setBridging] = useState(false);

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

  const handleSwapChains = () => {
    const temp = fromChain;
    setFromChain(toChain);
    setToChain(temp);
  };

  const handleBridge = async () => {
    setBridging(true);
    // TODO: Integrate bridge contract here
    console.log("Bridge:", { fromChain, toChain, token, amount });
    setTimeout(() => setBridging(false), 2000);
  };

  const canBridge = amount && parseFloat(amount) > 0 && fromChain !== toChain && !bridging;

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
                Bridge assets to Movement Network
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Bridge Content */}
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-8">
          <div className="w-full max-w-[440px] mx-auto">
            <div className="relative rounded-2xl p-5 sm:p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700/50 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden">
              {/* Background decoration */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-gradient-to-tr from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl" />

              {/* Header */}
              <div className="relative flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/30">
                  <svg
                    className="w-5 h-5 text-white"
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
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                    Bridge Assets
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Cross-chain transfers
                  </p>
                </div>
              </div>

              {/* Chain Selection */}
              <div className="relative mb-4 p-4 rounded-2xl bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800/50 dark:to-zinc-800/30 border border-zinc-200/50 dark:border-zinc-700/30">
                {/* From Chain */}
                <div className="mb-3">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                    From
                  </label>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${CHAINS.find(c => c.id === fromChain)?.color} flex items-center justify-center shadow-md`}>
                      <span className="text-white text-xs font-bold">{CHAINS.find(c => c.id === fromChain)?.symbol.charAt(0)}</span>
                    </div>
                    <select
                      value={fromChain}
                      onChange={(e) => setFromChain(e.target.value)}
                      className="flex-1 bg-transparent text-zinc-900 dark:text-zinc-50 font-semibold focus:outline-none cursor-pointer text-sm appearance-none"
                      disabled={bridging}
                    >
                      {CHAINS.map((chain) => (
                        <option key={chain.id} value={chain.id}>
                          {chain.name}
                        </option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Swap Chains Button */}
                <div className="flex justify-center -my-1 relative z-10">
                  <button
                    onClick={handleSwapChains}
                    disabled={bridging}
                    className="p-2.5 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 border-4 border-white dark:border-zinc-900 shadow-lg text-white hover:scale-110 transition-all duration-200 disabled:opacity-50"
                    aria-label="Swap chains"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>
                </div>

                {/* To Chain */}
                <div className="mt-3">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                    To
                  </label>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${CHAINS.find(c => c.id === toChain)?.color} flex items-center justify-center shadow-md`}>
                      <span className="text-white text-xs font-bold">{CHAINS.find(c => c.id === toChain)?.symbol.charAt(0)}</span>
                    </div>
                    <select
                      value={toChain}
                      onChange={(e) => setToChain(e.target.value)}
                      className="flex-1 bg-transparent text-zinc-900 dark:text-zinc-50 font-semibold focus:outline-none cursor-pointer text-sm appearance-none"
                      disabled={bridging}
                    >
                      {CHAINS.map((chain) => (
                        <option key={chain.id} value={chain.id}>
                          {chain.name}
                        </option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Token & Amount */}
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
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                      <select
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="bg-transparent text-zinc-900 dark:text-zinc-50 font-bold focus:outline-none cursor-pointer text-sm appearance-none pr-4"
                        disabled={bridging}
                      >
                        {TOKENS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <svg className="w-3 h-3 text-zinc-400 -ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Balance: 0.00 {token}</span>
                    <button className="text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors">MAX</button>
                  </div>
                </div>
              </div>

              {/* Estimated Info */}
              {amount && parseFloat(amount) > 0 && (
                <div className="relative mb-4 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100 dark:border-blue-800/30">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300">Route Found</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">You receive</span>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        ~{amount} {token}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Est. time</span>
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        ~15 min
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Fee</span>
                      <span className="text-xs font-semibold text-green-600 dark:text-green-400">~0.1%</span>
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
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Bridging...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Bridge {token}
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
  );
}
