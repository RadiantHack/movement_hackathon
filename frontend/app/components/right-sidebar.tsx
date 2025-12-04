"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";

export function RightSidebar() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);

  const walletAddress = wallets[0]?.address || "";

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
      purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
      blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
      yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="hidden w-80 flex-col border-l border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 xl:flex">
      {/* Wallet Section - Top */}
      <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Wallet
        </h2>
        {walletAddress ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Connected
              </p>
              <div className="flex h-2 w-2 items-center justify-center">
                <span className="absolute h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75"></span>
                <span className="relative h-2 w-2 rounded-full bg-green-500"></span>
              </div>
            </div>
            <div className="mb-3">
              <p className="font-mono text-sm font-medium text-zinc-950 dark:text-zinc-50">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Movement Network
              </p>
            </div>
            <button
              onClick={copyAddress}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            >
              {copied ? (
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
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No wallet connected
            </p>
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
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg ${getColorClasses(tx.color)}`}
              >
                {tx.icon}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {tx.type}
                  </p>
                  <span className="flex-shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
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
  );
}
