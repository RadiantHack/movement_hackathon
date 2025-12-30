"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { executeLendV2, executeRedeemV2 } from "../../../utils/lend-v2-utils";
import {
  getCoinDecimals,
  convertAmountToRaw,
} from "../../../utils/token-utils";
import { getBrokerName } from "../../../utils/lending-transaction";
import { getMovementApiBase } from "@/lib/super-aptos-sdk/src/globals";
import * as superJsonApiClient from "../../../../lib/super-json-api-client/src";

interface LendCardProps {
  walletAddress: string | null;
}

interface TokenBalance {
  assetType: string;
  amount: string;
  formattedAmount: string;
  metadata: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isNative: boolean;
}

export const LendCard: React.FC<LendCardProps> = ({ walletAddress }) => {
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const [activeTab, setActiveTab] = useState<"supply" | "withdraw">("supply");
  const [token, setToken] = useState<string>("MOVE");
  const [amount, setAmount] = useState<string>("");
  const [lending, setLending] = useState(false);
  const [lendError, setLendError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>("");
  const [portfolioData, setPortfolioData] = useState<any | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [brokerData, setBrokerData] = useState<any[]>([]);

  const movementApiBase = getMovementApiBase();

  const movementWallet = useMemo(() => {
    if (!ready || !authenticated || !user?.linkedAccounts) {
      return null;
    }
    return (
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          account.type === "wallet" && account.chainType === "aptos"
      ) || null
    );
  }, [user, ready, authenticated]);

  const walletBalance = balance ? parseFloat(balance) : 0;

  // Get user's current supplied amount from portfolio data
  // Formula matches SupplyModal: scaledAmount × depositNoteExchangeRate
  const supplied = useMemo(() => {
    if (!portfolioData || !token) {
      return 0;
    }

    const brokerName = getBrokerName(token);
    const depositNoteName = `${brokerName}-super-aptos-deposit-note`;

    // Check if collaterals array exists
    if (
      !portfolioData.collaterals ||
      !Array.isArray(portfolioData.collaterals)
    ) {
      return 0;
    }

    const collateral = portfolioData.collaterals.find(
      (c: any) => c.instrument?.name === depositNoteName
    );

    if (!collateral) {
      return 0;
    }

    // Get deposit note exchange rate from broker data
    const broker =
      brokerData.find((b: any) => b.depositNote?.name === depositNoteName) ||
      brokerData.find((b: any) => b.underlyingAsset?.name === brokerName);

    const exchangeRate =
      broker?.depositNoteExchangeRate || broker?.depositNote?.exchangeRate || 1;

    // scaledAmount from API is already in human-readable format (not smallest units)
    // scaledAmount × exchangeRate = actual underlying amount (human-readable)
    // This matches SupplyModal's calculation exactly
    const scaledAmount = parseFloat(collateral.scaledAmount || "0");
    return scaledAmount * exchangeRate;
  }, [portfolioData, token, brokerData]);

  // Get current health factor from portfolio data
  const healthFactor = useMemo(() => {
    if (portfolioData?.evaluation?.health_ratio) {
      return portfolioData.evaluation.health_ratio;
    }
    return null;
  }, [portfolioData]);

  // Get supply APY from broker data
  const supplyAPY = useMemo(() => {
    if (!brokerData.length || !token) return 0;
    const brokerName = getBrokerName(token);
    const broker = brokerData.find(
      (b: any) => b.underlyingAsset.name === brokerName
    );
    if (!broker) return 0;
    // Convert APR to APY (approximate: APY = APR * (1 + utilization))
    const apr = broker.supplyApr || 0;
    const utilization = broker.utilization || 0;
    return apr * (1 + utilization / 100);
  }, [brokerData, token]);

  // Fetch balance for token
  useEffect(() => {
    if (!walletAddress || !token) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      setLoadingBalance(true);
      try {
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();

        if (data.success && data.balances && data.balances.length > 0) {
          const normalizedToken = token.toUpperCase().replace(/\./g, "").trim();

          const tokenBalance = data.balances.find((b: TokenBalance) => {
            const normalizedSymbol = b.metadata.symbol
              .toUpperCase()
              .replace(/\./g, "")
              .trim();

            return (
              normalizedSymbol === normalizedToken ||
              normalizedSymbol.startsWith(normalizedToken) ||
              normalizedToken.startsWith(normalizedSymbol)
            );
          });

          if (tokenBalance) {
            setBalance(tokenBalance.formattedAmount);
          } else {
            setBalance("0.000000");
          }
        } else {
          setBalance("0.000000");
        }
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [walletAddress, token]);

  // Fetch portfolio and broker data
  useEffect(() => {
    if (!walletAddress) {
      setPortfolioData(null);
      setBrokerData([]);
      return;
    }

    const fetchPortfolioAndBrokers = async () => {
      setLoadingPortfolio(true);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: movementApiBase,
        });
        const [portfolioRes, brokersRes] = await Promise.all([
          superClient.default.getPortfolio(walletAddress),
          superClient.default.getBrokers(),
        ]);
        debugger;
        setPortfolioData(portfolioRes as unknown as any);
        setBrokerData(brokersRes as unknown as any[]);
      } catch (error) {
        console.error("Error fetching portfolio/brokers:", error);
        setPortfolioData(null);
        setBrokerData([]);
      } finally {
        setLoadingPortfolio(false);
      }
    };

    fetchPortfolioAndBrokers();
  }, [walletAddress, movementApiBase]);

  const handleAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    const parts = numericValue.split(".");
    const formattedValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : numericValue;
    setAmount(formattedValue);
  };

  const handleMax = () => {
    if (balance && parseFloat(balance) > 0) {
      setAmount(balance);
    }
  };

  const handleSupply = async () => {
    if (!ready || !authenticated) {
      setLendError("Please connect your Privy wallet first");
      return;
    }

    if (!movementWallet || !walletAddress) {
      setLendError(
        "Privy wallet not connected. Please connect your Movement wallet."
      );
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setLendError("Please enter a valid amount.");
      return;
    }

    if (parseFloat(amount) > walletBalance) {
      setLendError("Insufficient balance.");
      return;
    }

    setLending(true);
    setLendError(null);
    setTxHash(null);
    setSubmissionStep("Initializing transaction with Privy...");

    try {
      const senderAddress = movementWallet.address as string;
      const senderPubKeyWithScheme = (movementWallet as any)
        .publicKey as string;

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }

      const publicKey = senderPubKeyWithScheme;

      // Convert amount to smallest unit
      const decimals = getCoinDecimals(token);
      const rawAmount = convertAmountToRaw(amount, decimals);

      // Execute transaction
      const txHashResult = await executeLendV2({
        amount: rawAmount,
        coinSymbol: token,
        walletAddress: senderAddress,
        publicKey,
        signHash: async (hash: string) => {
          setSubmissionStep("Waiting for Privy wallet signature...");
          try {
            const response = await signRawHash({
              address: senderAddress,
              chainType: "aptos",
              hash: hash as `0x${string}`,
            });
            setSubmissionStep("Signature received from Privy");
            return { signature: response.signature };
          } catch (error: any) {
            setSubmissionStep("");
            throw new Error(
              error.message || "Failed to get signature from Privy wallet"
            );
          }
        },
        onProgress: (step: string) => {
          setSubmissionStep(step);
        },
      });

      console.log("Supply transaction successful:", txHashResult);
      setTxHash(txHashResult);
      setSubmissionStep("");

      // Refresh portfolio data to update supplied amounts
      if (walletAddress) {
        try {
          const superClient = new superJsonApiClient.SuperClient({
            BASE: movementApiBase,
          });
          const [portfolioRes, brokersRes] = await Promise.all([
            superClient.default.getPortfolio(walletAddress),
            superClient.default.getBrokers(),
          ]);
          setPortfolioData(portfolioRes as unknown as any);
          setBrokerData(brokersRes as unknown as any[]);
        } catch (error) {
          console.error("Error refreshing portfolio:", error);
        }
      }
    } catch (err: any) {
      console.error("Supply error:", err);
      setLendError(
        err.message ||
          "Supply failed. Please check your connection and try again."
      );
      setSubmissionStep("");
    } finally {
      setLending(false);
    }
  };

  const handleWithdraw = async () => {
    if (!ready || !authenticated) {
      setLendError("Please connect your Privy wallet first");
      return;
    }

    if (!movementWallet || !walletAddress) {
      setLendError(
        "Privy wallet not connected. Please connect your Movement wallet."
      );
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setLendError("Please enter a valid amount.");
      return;
    }

    if (parseFloat(amount) > supplied) {
      setLendError("Insufficient supplied amount.");
      return;
    }

    setLending(true);
    setLendError(null);
    setTxHash(null);
    setSubmissionStep("Initializing transaction with Privy...");

    try {
      const senderAddress = movementWallet.address as string;
      const senderPubKeyWithScheme = (movementWallet as any)
        .publicKey as string;

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }

      const publicKey = senderPubKeyWithScheme;

      // Convert amount to smallest unit
      const decimals = getCoinDecimals(token);
      const rawAmount = convertAmountToRaw(amount, decimals);

      // Execute transaction
      const txHashResult = await executeRedeemV2({
        amount: rawAmount,
        coinSymbol: token,
        walletAddress: senderAddress,
        publicKey,
        signHash: async (hash: string) => {
          setSubmissionStep("Waiting for Privy wallet signature...");
          try {
            const response = await signRawHash({
              address: senderAddress,
              chainType: "aptos",
              hash: hash as `0x${string}`,
            });
            setSubmissionStep("Signature received from Privy");
            return { signature: response.signature };
          } catch (error: any) {
            setSubmissionStep("");
            throw new Error(
              error.message || "Failed to get signature from Privy wallet"
            );
          }
        },
        onProgress: (step: string) => {
          setSubmissionStep(step);
        },
      });

      console.log("Withdraw transaction successful:", txHashResult);
      setTxHash(txHashResult);
      setSubmissionStep("");

      // Refresh portfolio data to update supplied amounts
      if (walletAddress) {
        try {
          const superClient = new superJsonApiClient.SuperClient({
            BASE: movementApiBase,
          });
          const [portfolioRes, brokersRes] = await Promise.all([
            superClient.default.getPortfolio(walletAddress),
            superClient.default.getBrokers(),
          ]);
          setPortfolioData(portfolioRes as unknown as any);
          setBrokerData(brokersRes as unknown as any[]);
        } catch (error) {
          console.error("Error refreshing portfolio:", error);
        }
      }
    } catch (err: any) {
      console.error("Withdraw error:", err);
      setLendError(
        err.message ||
          "Withdraw failed. Please check your connection and try again."
      );
      setSubmissionStep("");
    } finally {
      setLending(false);
    }
  };

  const canSubmit = useMemo(() => {
    return (
      ready &&
      authenticated &&
      walletAddress &&
      amount &&
      parseFloat(amount) > 0 &&
      !lending
    );
  }, [ready, authenticated, walletAddress, amount, lending]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-2xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Lend Tokens
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Supply or withdraw tokens on Movement Network
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <button
            onClick={() => {
              setActiveTab("supply");
              setAmount("");
              setLendError(null);
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "supply"
                ? "bg-white dark:bg-zinc-700 text-green-600 dark:text-green-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
            disabled={lending}
          >
            Supply
          </button>
          <button
            onClick={() => {
              setActiveTab("withdraw");
              setAmount("");
              setLendError(null);
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "withdraw"
                ? "bg-white dark:bg-zinc-700 text-green-600 dark:text-green-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
            disabled={lending}
          >
            Withdraw
          </button>
        </div>

        {/* Token Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Token
          </label>
          <select
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setAmount("");
            }}
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent cursor-pointer"
            disabled={lending}
          >
            <option value="MOVE">MOVE</option>
            <option value="USDC">USDC</option>
            <option value="USDT">USDT</option>
          </select>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Amount
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                disabled={lending}
              />
            </div>
            {activeTab === "supply" &&
              balance !== null &&
              parseFloat(balance) > 0 && (
                <button
                  onClick={handleMax}
                  className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-sm font-medium"
                  disabled={lending}
                >
                  Max
                </button>
              )}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeTab === "supply" ? "Wallet balance" : "Supplied"}:{" "}
              {activeTab === "supply" ? (
                loadingBalance ? (
                  <span className="inline-block animate-pulse">Loading...</span>
                ) : balance !== null ? (
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {parseFloat(balance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{" "}
                    {token}
                  </span>
                ) : (
                  <span>-- {token}</span>
                )
              ) : loadingPortfolio ? (
                <span className="inline-block animate-pulse">Loading...</span>
              ) : (
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {supplied.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })}{" "}
                  {token}
                </span>
              )}
            </p>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                ≈ ${(parseFloat(amount) * 0).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Health factor
            </span>
            <span
              className={`text-sm font-medium ${
                healthFactor
                  ? healthFactor >= 1.2
                    ? "text-green-600 dark:text-green-400"
                    : healthFactor >= 1.0
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-red-600 dark:text-red-400"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {loadingPortfolio ? (
                <span className="inline-block animate-pulse">Loading...</span>
              ) : healthFactor ? (
                `${healthFactor.toFixed(2)}x`
              ) : (
                "N/A"
              )}
            </span>
          </div>
          {activeTab === "supply" && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Supplied
                </span>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {loadingPortfolio ? (
                    <span className="inline-block animate-pulse">
                      Loading...
                    </span>
                  ) : supplied > 0 ? (
                    `${supplied.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })} ${token}`
                  ) : (
                    `0.00 ${token}`
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Supply APY
                </span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  {loadingPortfolio ? (
                    <span className="inline-block animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    `${supplyAPY.toFixed(2)}%`
                  )}
                </span>
              </div>
            </>
          )}
          {activeTab === "withdraw" && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Available to withdraw
              </span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {loadingPortfolio ? (
                  <span className="inline-block animate-pulse">Loading...</span>
                ) : (
                  `${supplied.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })} ${token}`
                )}
              </span>
            </div>
          )}
        </div>

        {/* More/Less Button */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="w-full text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 py-2 transition-colors mb-4"
        >
          {showMore ? "Less" : "More"}
        </button>

        {/* Submission Step */}
        {submissionStep && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-400">
            {submissionStep}
          </div>
        )}

        {/* Error Message */}
        {lendError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {lendError}
          </div>
        )}

        {/* Transaction Hash */}
        {txHash && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
              Transaction Hash
            </p>
            <p className="text-xs font-mono text-green-700 dark:text-green-400 break-all mb-2">
              {txHash}
            </p>
            <a
              href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
            >
              View on Explorer →
            </a>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={activeTab === "supply" ? handleSupply : handleWithdraw}
          disabled={!canSubmit}
          className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-md ${
            canSubmit
              ? "bg-green-600 text-white hover:bg-green-700 hover:shadow-lg active:scale-[0.98]"
              : "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
          }`}
        >
          {lending
            ? activeTab === "supply"
              ? "Supplying..."
              : "Withdrawing..."
            : txHash
              ? activeTab === "supply"
                ? "Supply Complete"
                : "Withdraw Complete"
              : activeTab === "supply"
                ? "Supply"
                : "Withdraw"}
        </button>

        {!walletAddress && (
          <p className="mt-3 text-xs text-center text-zinc-500 dark:text-zinc-400">
            Please connect your Movement wallet to {activeTab} tokens
          </p>
        )}
      </div>
    </div>
  );
};
