"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
import { SwapCard } from "../components/features/swap";
import BorrowForm from "../components/borrowForm";

export default function LendPage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // Get Movement wallet address (chainType is "aptos" for Movement wallets)
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
            Lend/Borrow
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
                Lend/Borrow tokens
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Lend or Borrow coins
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-8">
          <BorrowForm />
        </div>
      </div>

      <RightSidebar
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
      />
    </div>
  );
}
