"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import MovementChat from "../components/chat/MovementChat";
import { ThemeToggle } from "../components/themeToggle";
import { AuthGuard } from "../components/auth-guard";

export default function ChatPage() {
  const { user, authenticated } = usePrivy();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // Get Movement wallet address (chainType is "aptos" for Movement wallets)
  const movementWallet = useMemo(() => {
    // Only check for wallet when user is authenticated
    if (!authenticated || !user?.linkedAccounts) {
      return null;
    }

    // Find Aptos wallet (Movement Network uses Aptos-compatible addresses)
    // The chainType field is camelCase: "aptos" (confirmed from Privy data structure)
    const aptosWallet = user.linkedAccounts.find(
      (account): account is WalletWithMetadata => {
        if (account.type !== "wallet") return false;
        // Type assertion needed because Privy types don't expose chainType directly
        const walletAccount = account as WalletWithMetadata & {
          chainType?: string;
        };
        return walletAccount.chainType === "aptos";
      }
    ) as (WalletWithMetadata & { chainType?: string }) | undefined;

    // Debug logging - only when ready and authenticated
    if (aptosWallet) {
      console.log("✅ Found Movement/Aptos wallet:", aptosWallet.address);
      console.log(
        "   Address length:",
        aptosWallet.address.length,
        "(should be 66 for Movement Network)"
      );
      console.log("   Chain type:", (aptosWallet as any).chainType);
    } else if (authenticated) {
      // Only log warning if authenticated but still no wallet found
      console.log(
        "⚠️ No Movement/Aptos wallet found. Available accounts:",
        user.linkedAccounts.map((acc) => ({
          type: acc.type,
          chainType: (acc as any).chainType,
          address:
            acc.type === "wallet"
              ? `${acc.address?.substring(0, 30)}...`
              : "N/A",
          addressLength: acc.type === "wallet" ? acc.address?.length : 0,
        }))
      );
    }

    return aptosWallet || null;
  }, [user, authenticated]);

  // Get the wallet address - ensure it's the full 66-character Movement/Aptos address
  const walletAddress = useMemo(() => {
    if (!movementWallet?.address) return null;

    const addr = movementWallet.address;
    // Ensure address is properly formatted (should be 66 chars for Movement/Aptos)
    if (addr && addr.startsWith("0x") && addr.length >= 42) {
      return addr;
    }
    return null;
  }, [movementWallet]);

  return (
    <AuthGuard>
    <div className="flex h-screen w-full overflow-hidden sm:overflow-hidden bg-zinc-50 dark:bg-black">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-h-0 border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
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
            Movement Nexus
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

        <div className="hidden shrink-0 border-b flex-row border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:block">
          <div className="flex flex-row items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Agent Workspace
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Orchestrate agents and execute strategies
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 flex-col min-h-0 overflow-y-auto overflow-x-hidden rounded-b-lg border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full max-w-full">
            <MovementChat walletAddress={walletAddress} />
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
