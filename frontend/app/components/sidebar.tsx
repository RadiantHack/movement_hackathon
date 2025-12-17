"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./themeToggle";

export function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const pathname = usePathname();

  const walletAddress = wallets[0]?.address || "";

  const navItems = [
    { href: "/overview", label: "Overview" },
    { href: "/chat", label: "New Chat" },
    { href: "/swap", label: "Swap" },
    { href: "/positions", label: "Move Position" },
    { href: "/echelon", label: "Echelon" },
  ];

  const agents = [
    { name: "Balance Agent", description: "Check cryptocurrency balances" },
    { name: "Bridge Agent", description: "Cross-chain asset bridging" },
    { name: "OrderBook Agent", description: "Trade on ClobX DEX" },
    { name: "Prediction Agent", description: "BRKT prediction markets" },
    { name: "Liquidity Agent", description: "Manage liquidity pools" },
    { name: "Yield Optimizer", description: "Optimize yield strategies" },
    { name: "Lending Agent", description: "Lending & borrowing" },
    { name: "Bitcoin DeFi", description: "Bitcoin DeFi operations" },
    { name: "Stablecoin Agent", description: "Stablecoin management" },
    { name: "Analytics Agent", description: "Protocol analytics" },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-zinc-50 transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900 md:static md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div>
          <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Movement Nexus
              </h1>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                AI-Powered DeFi Gateway
              </p>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              className="md:hidden rounded-md p-1 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
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

          <div className="p-2 space-y-2 md:hidden">
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-2 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <div>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Theme
                </span>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto p-4">
          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onClose?.()}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-purple-100 font-medium text-purple-900 dark:bg-purple-900/30 dark:text-purple-300"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Available Agents */}
          <div className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              AVAILABLE AGENTS
            </h2>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="rounded-lg cursor-pointer hover:scale-105 duration-150 border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {agent.name}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {agent.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
