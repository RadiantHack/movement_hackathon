"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, useMemo, useEffect } from "react";
import {
  Sidebar,
  RightSidebar,
  ThemeToggle,
  AuthGuard,
} from "../../components/shared/ui";
import { SwapCard } from "../../components/swap";
import { useBalance } from "../../hooks/useBalanceContext";
import { useMovementWallet } from "../../hooks/useMovementWallet";

export default function SwapPage() {
  const { authenticated } = usePrivy();
  const movementWallet = useMovementWallet();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const { setWalletAddress } = useBalance();

  const walletAddress = useMemo(() => {
    if (!movementWallet?.address) return null;
    const addr = movementWallet.address;
    if (addr && addr.startsWith("0x") && addr.length >= 42) {
      return addr;
    }
    return null;
  }, [movementWallet]);

  // Update balance context wallet address
  useEffect(() => {
    if (walletAddress) {
      setWalletAddress(walletAddress);
    }
  }, [walletAddress, setWalletAddress]);

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:hidden">
            <button
              onClick={() => setIsSidebarOpen(true)}
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
              Swap
            </h1>
            <button
              onClick={() => setIsRightSidebarOpen(true)}
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

          <div className="hidden border-b border-zinc-200 dark:border-zinc-800 md:block">
            <div className="flex items-center justify-between px-8 py-4">
              <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Token Swap
              </h1>
              <ThemeToggle />
            </div>
          </div>

          <div className="p-4 md:p-8">
            <div className="mx-auto max-w-lg">
              <div className="relative rounded-3xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 p-8 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden">
                {/* Background decoration */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />

                {/* Swap Card Content */}
                <div className="relative">
                  <SwapCard walletAddress={walletAddress} />
                </div>
              </div>
            </div>
          </div>
        </main>

        <RightSidebar
          isOpen={isRightSidebarOpen}
          onClose={() => setIsRightSidebarOpen(false)}
        />
      </div>
    </AuthGuard>
  );
}
