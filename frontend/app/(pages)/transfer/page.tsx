"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Sidebar,
  RightSidebar,
  ThemeToggle,
  AuthGuard,
  AssetIcon,
} from "../../components/shared/ui";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { useBalance } from "../../hooks/useBalanceContext";
import { useMovementConfig } from "../../hooks/useMovementConfig";
import { TokenBalance } from "../../types";
import { useTransfer } from "../../hooks/useTransfer";
import { useMovementWallet } from "../../hooks/useMovementWallet";
import { validateTransferAmount } from "../../utils/transfer";

export default function TransferPage() {
  const config = useMovementConfig();
  const { balances, loadingBalances, setWalletAddress } = useBalance();
  const movementWallet = useMovementWallet();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extract wallet address from movement wallet
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

  const aptos = useMemo(() => {
    if (!config.movementFullNode) return null;
    return new Aptos(
      new AptosConfig({
        network: Network.CUSTOM,
        fullnode: config.movementFullNode,
      })
    );
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

  // Use transfer hook for centralized transfer logic
  const transfer = useTransfer({
    aptos,
    movementChainId,
    onSuccess: () => {
      setAmount("");
      setRecipient("");
    },
  });

  // Validate amount using centralized utility
  const amountValidation = amount
    ? validateTransferAmount(amount, selectedToken?.formattedAmount)
    : { isValid: false };

  // Track if balances have been loaded at least once
  useEffect(() => {
    if (!loadingBalances && balances.length > 0) {
      setHasLoadedOnce(true);
    }
  }, [loadingBalances, balances]);

  // Update selected token when balances change and no token is selected
  useEffect(() => {
    if (balances.length > 0 && !selectedToken) {
      const nativeToken = balances.find((b) => b.isNative);
      setSelectedToken(nativeToken || balances[0]);
    }
  }, [balances, selectedToken]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setTokenDropdownOpen(false);
      }
    };

    if (tokenDropdownOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [tokenDropdownOpen]);

  const handleTransfer = async () => {
    if (!selectedToken || !recipient || !amount) {
      return;
    }

    await transfer.handleTransfer(selectedToken, recipient, amount);
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
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
              Transfer
            </h1>
            <button
              onClick={() => setRightSidebarOpen(true)}
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
                Transfer Tokens
              </h1>
              <ThemeToggle />
            </div>
          </div>

          <div className="p-4 md:p-8">
            <div className="mx-auto max-w-lg">
              {loadingBalances && !hasLoadedOnce ? (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex items-center justify-center min-h-[300px]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-purple-600 dark:border-zinc-700 dark:border-t-purple-400" />
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Loading balances...
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-3xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 p-8 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden">
                  {/* Background decoration */}
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />
                  <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />

                  {/* Header */}
                  <div className="relative mb-8 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30">
                      <svg
                        className="h-6 w-6 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                        Send Tokens
                      </h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Transfer to any address
                      </p>
                    </div>
                  </div>

                  {/* Token Selection */}
                  <div className="relative mb-6">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                      Select Token
                    </label>
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTokenDropdownOpen(!tokenDropdownOpen);
                        }}
                        className="w-full px-5 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-950 dark:text-zinc-50 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all cursor-pointer font-medium text-left flex items-center gap-4"
                        disabled={balances.length === 0 || loadingBalances}
                      >
                        {selectedToken ? (
                          <>
                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden p-1">
                              <AssetIcon
                                symbol={selectedToken.metadata.symbol}
                                size="w-8 h-8"
                                className="rounded-lg"
                              />
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold">
                                {selectedToken.metadata.symbol}
                              </div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {selectedToken.metadata.name}
                              </div>
                            </div>
                          </>
                        ) : (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            Select a token
                          </span>
                        )}
                        <svg
                          className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${tokenDropdownOpen ? "rotate-180" : ""}`}
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

                      {tokenDropdownOpen && balances.length > 0 && (
                        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl shadow-2xl shadow-zinc-900/10 dark:shadow-zinc-950/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-80 overflow-y-auto">
                          {balances.map((balance) => {
                            const isSelected =
                              selectedToken?.assetType === balance.assetType;
                            return (
                              <button
                                key={balance.assetType}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedToken(balance);
                                  setTokenDropdownOpen(false);
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                className={`group w-full px-4 py-3.5 flex items-center gap-3 transition-all duration-200 relative cursor-pointer ${
                                  isSelected
                                    ? "bg-gradient-to-r from-purple-100/80 via-violet-100/70 to-purple-100/80 dark:from-purple-950/60 dark:via-violet-950/50 dark:to-purple-950/60"
                                    : "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30"
                                }`}
                              >
                                {/* Modern selection indicator - subtle left accent */}
                                {isSelected && (
                                  <>
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 via-violet-500 to-purple-500 rounded-r-full"></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-purple-400/5 to-transparent pointer-events-none"></div>
                                    {/* Additional shade layer for more depth */}
                                    <div className="absolute inset-0 bg-purple-500/5 dark:bg-purple-400/5 pointer-events-none"></div>
                                  </>
                                )}

                                {/* Token icon with modern styling */}
                                <div
                                  className={`relative flex-shrink-0 transition-all duration-300 ${
                                    isSelected
                                      ? "scale-110"
                                      : "group-hover:scale-105"
                                  }`}
                                >
                                  <div
                                    className={`w-11 h-11 rounded-2xl bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center overflow-hidden transition-all duration-300 ${
                                      isSelected
                                        ? "shadow-lg shadow-purple-500/25 dark:shadow-purple-500/15 ring-2 ring-purple-400/40 dark:ring-purple-500/30"
                                        : "shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50 group-hover:ring-zinc-300 dark:group-hover:ring-zinc-600"
                                    }`}
                                  >
                                    <AssetIcon
                                      symbol={balance.metadata.symbol}
                                      size="w-9 h-9"
                                      className="rounded-xl"
                                    />
                                  </div>
                                  {/* Modern selection indicator - subtle corner accent */}
                                  {isSelected && (
                                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 border border-white dark:border-zinc-900 shadow-md"></div>
                                  )}
                                </div>

                                {/* Token info with modern typography */}
                                <div className="flex-1 text-left min-w-0 relative z-10">
                                  <div
                                    className={`font-semibold text-sm transition-colors duration-200 ${
                                      isSelected
                                        ? "text-purple-700 dark:text-purple-300"
                                        : "text-zinc-900 dark:text-zinc-50"
                                    }`}
                                  >
                                    {balance.metadata.symbol}
                                  </div>
                                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                                    {balance.metadata.name}
                                  </div>
                                </div>

                                {/* Balance with modern styling */}
                                <div className="text-right flex-shrink-0 relative z-10">
                                  <div
                                    className={`font-semibold text-sm transition-colors duration-200 ${
                                      isSelected
                                        ? "text-purple-700 dark:text-purple-300"
                                        : "text-zinc-900 dark:text-zinc-50"
                                    }`}
                                  >
                                    {parseFloat(
                                      balance.formattedAmount
                                    ).toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 6,
                                    })}
                                  </div>
                                  <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                                    Balance
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {selectedToken && (
                      <div className="mt-3 flex items-center justify-between px-1">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          Available Balance
                        </span>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {parseFloat(
                            selectedToken.formattedAmount
                          ).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          })}{" "}
                          {selectedToken.metadata.symbol}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Recipient */}
                  <div className="relative mb-6">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                      Recipient Address
                    </label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2">
                        <svg
                          className="w-5 h-5 text-zinc-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="0x..."
                        className="w-full pl-12 pr-5 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="relative mb-8">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                      Amount
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-5 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-lg font-semibold"
                      />
                      {selectedToken && (
                        <button
                          onClick={() =>
                            setAmount(selectedToken.formattedAmount)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                        >
                          Max
                        </button>
                      )}
                    </div>
                  </div>

                  {transfer.error && (
                    <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-400 flex items-center gap-3">
                      <svg
                        className="w-5 h-5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {transfer.error}
                    </div>
                  )}

                  {transfer.txHash && (
                    <div className="mb-6 p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-sm text-green-700 dark:text-green-400">
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-5 h-5 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="font-medium">
                          Transfer successful!
                        </span>
                        <a
                          href={`https://explorer.movementnetwork.xyz/txn/${transfer.txHash}?network=mainnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto text-green-600 dark:text-green-400 hover:underline font-semibold"
                        >
                          View →
                        </a>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleTransfer}
                    disabled={
                      !selectedToken ||
                      !recipient ||
                      !amount ||
                      !amountValidation.isValid ||
                      transfer.transferring ||
                      !!transfer.txHash
                    }
                    className={`relative w-full py-4 rounded-2xl font-bold text-lg transition-all duration-300 overflow-hidden ${
                      selectedToken &&
                      recipient &&
                      amount &&
                      amountValidation.isValid &&
                      !transfer.transferring &&
                      !transfer.txHash
                        ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    {selectedToken &&
                      recipient &&
                      amount &&
                      amountValidation.isValid &&
                      !transfer.transferring &&
                      !transfer.txHash && (
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
                      )}
                    <span className="relative flex items-center justify-center gap-2">
                      {transfer.transferring ? (
                        "Transferring..."
                      ) : transfer.txHash ? (
                        "Transfer Complete"
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
                              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                            />
                          </svg>
                          Send {selectedToken?.metadata.symbol || "Tokens"}
                        </>
                      )}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>

        <RightSidebar
          isOpen={rightSidebarOpen}
          onClose={() => setRightSidebarOpen(false)}
        />
      </div>
    </AuthGuard>
  );
}
