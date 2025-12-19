"use client";

import { Button } from "@/components/ui/button";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useCreateWallet as useCreateExtendedWallet } from "@privy-io/react-auth/extended-chains";
import { useState, useEffect } from "react";

export function RightSidebar({
  isOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const { user, logout, ready, authenticated } = usePrivy();
  const { createWallet: createExtendedWallet } = useCreateExtendedWallet();
  const [copiedMovement, setCopiedMovement] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [isCreatingMovementWallet, setIsCreatingMovementWallet] =
    useState(false);

  const handleLogout = () => {
    logout();
  };

  /**
   * Handle pending wallet creation actions after user/guest account is ready
   * Pattern from whitelabel-starter: handles wallet creation once user/guest account is ready
   */
  useEffect(() => {
    if (pendingAction === "Movement" && user) {
      createExtendedWallet({ chainType: "movement" });
      setIsCreatingMovementWallet(false);
      setPendingAction("");
    }
  }, [user, createExtendedWallet, pendingAction]);

  /**
   * Create Movement wallet
   * Only allowed when user is authenticated
   */
  const createMovementWallet = async () => {
    if (!ready || !authenticated) {
      console.warn("User must be authenticated to create a wallet");
      return;
    }

    setIsCreatingMovementWallet(true);
    setPendingAction("Movement");
  };

  /**
   * Get Movement wallet from user's linked accounts
   * Backend returns chainType as "aptos" for Movement wallets
   */
  const movementWallet = user?.linkedAccounts.find(
    (account): account is WalletWithMetadata =>
      account.type === "wallet" && account.chainType === "aptos"
  );

  // Mock recent transactions - replace with actual data
  const recentTransactions = [
    {
      id: "1",
      type: "Bridge",
      description: "Bridged 100 USDC to Movement",
      time: "2 mins ago",
      status: "completed",
      icon: "🌉",
      color: "purple",
    },
    {
      id: "2",
      type: "Trade",
      description: "Bought 500 MOVE at $1.50",
      time: "15 mins ago",
      status: "completed",
      icon: "💱",
      color: "blue",
    },
    {
      id: "3",
      type: "Liquidity",
      description: "Added to MOVE/USDC pool",
      time: "1 hour ago",
      status: "completed",
      icon: "💧",
      color: "green",
    },
    {
      id: "4",
      type: "Balance",
      description: "Checked ETH balance",
      time: "2 hours ago",
      status: "completed",
      icon: "💰",
      color: "yellow",
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      purple:
        "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
      blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      green:
        "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
      yellow:
        "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
    return colors[color] || colors.blue;
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 xl:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-zinc-200 bg-zinc-50 transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900 xl:static xl:flex xl:translate-x-0 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Logout Button - Top */}
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
          <Button
            onClick={handleLogout}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Logout
          </Button>

          {/* Close button for mobile */}
          <button
            onClick={onClose}
            className="ml-2 rounded-md p-1 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 xl:hidden"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Movement Wallet Section */}
        <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Movement Wallet
          </h2>
          {movementWallet ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Movement Wallet Connected
                </p>
                <div className="flex h-2 w-2 items-center justify-center">
                  <span className="absolute h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative h-2 w-2 rounded-full bg-green-500"></span>
                </div>
              </div>
              <div className="mb-3">
                <p className="font-mono text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  {movementWallet.address.slice(0, 6)}...
                  {movementWallet.address.slice(-4)}
                </p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Movement Network
                </p>
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(movementWallet.address);
                  setCopiedMovement(true);
                  setTimeout(() => setCopiedMovement(false), 2000);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                {copiedMovement ? (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy Address
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                No Movement wallet created yet
              </p>
              <button
                onClick={createMovementWallet}
                disabled={isCreatingMovementWallet || !authenticated}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {isCreatingMovementWallet ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
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
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  "Create Movement Wallet"
                )}
              </button>
            </div>
          )}
        </div>

        {/* Deposit/Withdraw Section */}
        <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowDepositModal(true)}
              className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 bg-white p-4 transition-all hover:border-green-300 hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-green-700 dark:hover:bg-green-900/20"
            >
              <svg
                className="h-6 w-6 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Deposit
              </span>
            </button>
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 bg-white p-4 transition-all hover:border-orange-300 hover:bg-orange-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-orange-700 dark:hover:bg-orange-900/20"
            >
              <svg
                className="h-6 w-6 text-orange-600 dark:text-orange-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Withdraw
              </span>
            </button>
          </div>

          {/* Simple modals - you can enhance these */}
          {showDepositModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-96 rounded-lg bg-white p-6 dark:bg-zinc-800">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Deposit Funds
                </h3>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  Send funds to your wallet address:
                </p>
                <div className="mb-4 rounded-md bg-zinc-100 p-3 dark:bg-zinc-700">
                  <p className="break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">
                    {movementWallet?.address ||
                      "Please create a Movement wallet first"}
                  </p>
                </div>
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {showWithdrawModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-96 rounded-lg bg-white p-6 dark:bg-zinc-800">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Withdraw Funds
                </h3>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  Use the chat to initiate a withdrawal with the Bridge Agent.
                </p>
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Recent Transactions Section */}
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Recent Activity
          </h2>
          <div className="space-y-3">
            {recentTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-zinc-800"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${getColorClasses(tx.color)}`}
                >
                  {tx.icon}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {tx.type}
                    </p>
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {tx.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
                    {tx.description}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                    {tx.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
