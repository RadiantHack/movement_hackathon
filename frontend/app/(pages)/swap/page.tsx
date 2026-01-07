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
      <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-black">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <div className="flex flex-1 flex-col overflow-hidden border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {/* Mobile Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900! md:hidden">
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
              Swap
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
                  Token Swap
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Swap tokens on Movement Network
                </p>
              </div>
              <ThemeToggle />
            </div>
          </div>

          {/* Swap Content */}
          <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-8">
            <SwapCard walletAddress={walletAddress} />
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
