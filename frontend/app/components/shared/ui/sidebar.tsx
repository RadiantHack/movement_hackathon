"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./themeToggle";
import { useState } from "react";
import { FiSidebar } from "react-icons/fi";
import {
  ArrowRightLeft,
  ChartColumn,
  LayoutDashboard,
  MessageSquare,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isPremiumMode?: boolean;
  selectedAgent?: string;
  onAgentChange?: (agent: string) => void;
}

export function Sidebar({
  isOpen,
  onClose,
  isPremiumMode = false,
  selectedAgent = "lending",
  onAgentChange,
}: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { href: "/overview", label: "Overview" },
    { href: "/chat", label: "New Chat" },
    {
      href: "/premiumchat",
      label: "Premium Chat",
      icon: Crown,
      isPremium: true,
    },
    { href: "/transfer", label: "Transfer" },
    { href: "/swap", label: "Swap" },
    { href: "/bridge", label: "Bridge" },
    { href: "/positions", label: "Move Position" },
    { href: "/echelon", label: "Echelon" },
  ];

  const agents = [
    // Free Agents
    {
      name: "Balance Agent",
      description: "Check cryptocurrency balances",
      isPremium: false,
    },
    {
      name: "Bridge Agent",
      description: "Cross-chain asset bridging",
      isPremium: false,
    },
    {
      name: "Lending Agent",
      description: "Lending & borrowing operations",
      isPremium: false,
    },
    {
      name: "Swap Agent",
      description: "Execute token swaps",
      isPremium: false,
    },
    {
      name: "Transfer Agent",
      description: "Transfer tokens between addresses",
      isPremium: false,
    },
    {
      name: "Orchestrator Agent",
      description: "Coordinates multiple agents",
      isPremium: false,
    },
    // Premium Agents
    {
      name: "Premium Lending Agent",
      description: "Advanced lending with premium features",
      isPremium: true,
    },
    {
      name: "Sentiment & Trading Agent",
      description: "Sentiment analysis & trading recommendations",
      isPremium: true,
    },
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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-200 bg-zinc-50 transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900 md:static md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "md:w-16" : "w-64"}`}
      >
        {/* Logo */}
        <div>
          <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  Movement Nexus
                </h1>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  AI-Powered DeFi Gateway
                </p>
              </div>
            )}

            {/* Desktop Collapse Button */}
            <Button
              variant="ghost"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:block rounded-md p-1 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <FiSidebar size={40} />
            </Button>

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

          {!isCollapsed && (
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
          )}
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto p-4">
          <nav className="space-y-2">
            {navItems.map((item, index) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              const isPremium = item.isPremium;
              return (
                <Link
                  key={`${item.href}-${index}`}
                  href={item.href}
                  onClick={() => onClose?.()}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? isPremium
                        ? "bg-gradient-to-r from-amber-100 to-yellow-100 font-medium text-amber-900 dark:from-amber-900/30 dark:to-yellow-900/30 dark:text-amber-300"
                        : "bg-purple-100 font-medium text-purple-900 dark:bg-purple-900/30 dark:text-purple-300"
                      : isPremium
                        ? "text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  } ${isCollapsed ? "justify-center" : ""}`}
                  title={isCollapsed ? item.label : undefined}
                >
                  {Icon && (
                    <Icon
                      className={`h-4 w-4 ${
                        isPremium ? "text-amber-600 dark:text-amber-400" : ""
                      }`}
                    />
                  )}
                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1">
                      <span>{item.label}</span>
                      {isPremium && (
                        <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-800/50 dark:text-amber-200">
                          x402
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Available Agents */}
          {!isCollapsed && (
            <div className="mt-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                AVAILABLE AGENTS
              </h2>

              {/* Free Agents */}
              <div className="space-y-2 mb-6">
                {agents
                  .filter((agent) => !agent.isPremium)
                  .map((agent) => (
                    <div
                      key={agent.name}
                      className="rounded-lg shadow-sm transition-all hover:shadow-md cursor-pointer duration-150 border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {agent.name}
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                            {agent.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Premium Agents Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    PREMIUM AGENTS
                  </h3>
                </div>
                {agents
                  .filter((agent) => agent.isPremium)
                  .map((agent) => (
                    <div
                      key={agent.name}
                      className="rounded-lg shadow-sm transition-all hover:shadow-md cursor-pointer duration-150 border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 p-3 relative overflow-hidden"
                    >
                      {/* Premium Badge */}
                      <div className="absolute top-2 right-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-800/70 dark:text-amber-200">
                          <Crown className="h-2.5 w-2.5" />
                          x402
                        </span>
                      </div>
                      <div className="flex items-start justify-between pr-12">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Crown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                              {agent.name}
                            </p>
                          </div>
                          <p className="text-xs text-amber-700 dark:text-amber-300/80">
                            {agent.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
