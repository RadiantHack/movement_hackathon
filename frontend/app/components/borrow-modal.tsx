"use client";

import { useState, useEffect, useMemo } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { type TokenInfo } from "../utils/tokens";
import { getBrokerName } from "../utils/lending-transaction";
import { getCoinDecimals, convertAmountToRaw } from "../utils/token-utils";
import { executeBorrowV2, executeRepayV2 } from "../utils/borrow-v2-utils";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";
import { getMovementApiBase } from "@/lib/super-aptos-sdk/src/globals";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: {
    token: TokenInfo | null;
    symbol: string;
    price: number;
    borrowApy: number;
    availableLiquidity: number;
  } | null;
  walletAddress: string | null;
  healthFactor: number | null;
}

interface PortfolioResponse {
  id: string;
  collaterals: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: string;
  }>;
  liabilities: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: string;
  }>;
  risk: {
    requiredEquity: number;
  };
  evaluation: {
    mm: number;
    health_ratio: number;
    total_collateral: number;
    total_liability: number;
    ltv: number;
  };
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

export function BorrowModal({
  isOpen,
  onClose,
  asset,
  walletAddress,
  healthFactor,
}: BorrowModalProps) {
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();

  const movementApiBase = getMovementApiBase();

  const [activeTab, setActiveTab] = useState<"borrow" | "repay">("borrow");
  const [amount, setAmount] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioResponse | null>(
    null
  );
  const [simulatedRiskData, setSimulatedRiskData] = useState<any | null>(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>("");

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

  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setShowMore(false);
      setActiveTab("borrow");
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!walletAddress || !asset?.symbol || !isOpen) {
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
          const normalizedToken = asset.symbol
            .toUpperCase()
            .replace(/\./g, "")
            .trim();

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
        setBalance("0.000000");
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [walletAddress, asset?.symbol, isOpen]);

  useEffect(() => {
    if (!walletAddress || !isOpen) {
      setPortfolioData(null);
      return;
    }

    const fetchPortfolio = async () => {
      setLoadingPortfolio(true);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: movementApiBase,
        });
        const data = await superClient.default.getPortfolio(walletAddress);
        setPortfolioData(data as unknown as PortfolioResponse);
      } catch (error) {
        console.error("Error fetching portfolio:", error);
        setPortfolioData(null);
      } finally {
        setLoadingPortfolio(false);
      }
    };

    fetchPortfolio();
  }, [walletAddress, isOpen, movementApiBase]);

  const handleAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    const parts = numericValue.split(".");
    const formattedValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : numericValue;
    setAmount(formattedValue);
  };

  /**
   * Get user's current borrowed amount from portfolio data
   */
  const userBorrowedAmount = useMemo(() => {
    if (!portfolioData || !asset) return 0;

    const brokerName = getBrokerName(asset.symbol);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;

    const liability = portfolioData.liabilities.find(
      (l) => l.instrument.name === loanNoteName
    );

    if (!liability) return 0;

    const decimals = getCoinDecimals(asset.symbol);
    return parseFloat(liability.amount) / Math.pow(10, decimals);
  }, [portfolioData, asset]);

  /**
   * Get current health factor from portfolio data
   */
  const currentHealthFactor = useMemo(() => {
    if (portfolioData?.evaluation?.health_ratio) {
      return portfolioData.evaluation.health_ratio;
    }
    return healthFactor;
  }, [portfolioData, healthFactor]);

  /**
   * Build next portfolio state for risk simulation API
   */
  const buildNextPortfolioState = useMemo(() => {
    if (!portfolioData || !amount || !asset || parseFloat(amount) <= 0) {
      return null;
    }

    const decimals = getCoinDecimals(asset.symbol);
    const amountInSmallestUnit = convertAmountToRaw(amount, decimals);

    const brokerName = getBrokerName(asset.symbol);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;

    // Collaterals remain the same
    const collaterals = portfolioData.collaterals.map((c) => ({
      instrumentId: c.instrument.name,
      amount: c.amount,
    }));

    // Build liabilities - update the matching liability
    const liabilities = portfolioData.liabilities
      .map((l) => {
        if (l.instrument.name === loanNoteName) {
          const currentAmount = BigInt(l.amount);
          let newAmount: bigint;

          if (activeTab === "borrow") {
            newAmount = currentAmount + BigInt(amountInSmallestUnit);
          } else {
            newAmount =
              currentAmount > BigInt(amountInSmallestUnit)
                ? currentAmount - BigInt(amountInSmallestUnit)
                : BigInt(0);
          }

          return {
            instrumentId: l.instrument.name,
            amount: newAmount.toString(),
          };
        }
        return {
          instrumentId: l.instrument.name,
          amount: l.amount,
        };
      })
      .filter((l) => BigInt(l.amount) > 0);

    // For borrow, check if we need to add a new liability
    if (activeTab === "borrow") {
      const hasLiability = liabilities.some(
        (l) => l.instrumentId === loanNoteName
      );
      if (!hasLiability) {
        liabilities.push({
          instrumentId: loanNoteName,
          amount: amountInSmallestUnit,
        });
      }
    }

    return {
      collaterals,
      liabilities,
    };
  }, [portfolioData, amount, asset, activeTab]);

  /**
   * Fetch simulated risk when amount changes
   */
  useEffect(() => {
    const fetchSimulatedRisk = async () => {
      if (!buildNextPortfolioState || !amount || parseFloat(amount) <= 0) {
        setSimulatedRiskData(null);
        return;
      }

      setLoadingSimulation(true);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: movementApiBase,
        });

        const data = await superClient.default.getRiskSimulated({
          collaterals: buildNextPortfolioState.collaterals,
          liabilities: buildNextPortfolioState.liabilities,
        });
        setSimulatedRiskData(data);
      } catch (error) {
        console.error("Error fetching simulated risk:", error);
        setSimulatedRiskData(null);
      } finally {
        setLoadingSimulation(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchSimulatedRisk();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [buildNextPortfolioState, amount]);

  const handleMax = () => {
    if (activeTab === "borrow" && asset) {
      // Max borrow is limited by available liquidity
      setAmount(asset.availableLiquidity.toString());
    } else if (activeTab === "repay" && balance && parseFloat(balance) > 0) {
      // Max repay is min of wallet balance and borrowed amount
      const maxRepay = Math.min(parseFloat(balance), userBorrowedAmount);
      setAmount(maxRepay.toString());
    }
  };

  const usdValue = amount && asset ? parseFloat(amount) * asset.price : 0;

  const canReview = amount && parseFloat(amount) > 0 && !submitting;

  const displayHealthFactor =
    simulatedRiskData?.health_ratio ?? currentHealthFactor;

  const handleSubmit = async () => {
    if (!movementWallet || !walletAddress || !asset) {
      setSubmitError("Wallet not connected");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setSubmitError("Please enter a valid amount");
      return;
    }

    if (
      activeTab === "borrow" &&
      parseFloat(amount) > asset.availableLiquidity
    ) {
      setSubmitError("Amount exceeds available liquidity");
      return;
    }

    if (
      activeTab === "repay" &&
      balance &&
      parseFloat(amount) > parseFloat(balance)
    ) {
      setSubmitError("Insufficient balance");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setTxHash(null);
    setSubmissionStep("");

    try {
      const senderAddress = movementWallet.address as string;
      const senderPubKeyWithScheme = (movementWallet as any)
        .publicKey as string;

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }

      const publicKey = senderPubKeyWithScheme;
      const decimals = getCoinDecimals(asset.symbol);
      const rawAmount = convertAmountToRaw(amount, decimals);

      const txHash = await (
        activeTab === "borrow" ? executeBorrowV2 : executeRepayV2
      )({
        amount: rawAmount,
        coinSymbol: asset.symbol,
        walletAddress: senderAddress,
        publicKey,
        signHash: async (hash: string) => {
          const response = await signRawHash({
            address: senderAddress,
            chainType: "aptos",
            hash: hash as `0x${string}`,
          });
          return { signature: response.signature };
        },
        onProgress: (step: string) => {
          setSubmissionStep(step);
        },
      });

      setTxHash(txHash);
      setTimeout(() => {
        onClose();
        setAmount("");
        setTxHash(null);
      }, 2000);
    } catch (err: any) {
      console.error("Transaction error:", err);
      setSubmitError(
        err.message ||
          "Transaction failed. Please check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !asset) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Borrow {asset.symbol}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <svg
              className="w-6 h-6"
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

        {/* Tabs */}
        <div className="flex p-2 gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => {
              setActiveTab("borrow");
              setAmount("");
            }}
            className={`flex-1 py-3 text-sm rounded-md font-medium transition-colors ${
              activeTab === "borrow"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Borrow
          </button>
          <button
            onClick={() => {
              setActiveTab("repay");
              setAmount("");
            }}
            className={`flex-1 py-3 text-sm font-medium rounded-md transition-colors ${
              activeTab === "repay"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Repay
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6">
          {/* Amount Input */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              {asset.token?.iconUri ? (
                <img
                  src={asset.token.iconUri}
                  alt={asset.symbol}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {asset.symbol.charAt(0)}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-4xl text-zinc-500 dark:text-zinc-400 font-light outline-none"
                />
                <div className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                  ${usdValue.toFixed(2)}
                </div>
              </div>
              <button
                onClick={handleMax}
                className="px-4 py-1 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-400 transition-colors"
              >
                Max
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">
                Health factor
                {loadingSimulation && (
                  <span className="ml-2 text-xs text-zinc-400">
                    (simulating...)
                  </span>
                )}
              </span>
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {currentHealthFactor
                    ? `${currentHealthFactor.toFixed(2)}x`
                    : "N/A"}
                </span>
                {amount && parseFloat(amount) > 0 && (
                  <>
                    <span className="text-yellow-500">→</span>
                    <span
                      className={`${
                        displayHealthFactor && displayHealthFactor >= 1.2
                          ? "text-green-600 dark:text-green-400"
                          : displayHealthFactor && displayHealthFactor >= 1.0
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {loadingSimulation
                        ? "--"
                        : displayHealthFactor
                          ? `${displayHealthFactor.toFixed(2)}x`
                          : "N/A"}
                    </span>
                  </>
                )}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">
                Borrowed
              </span>
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {userBorrowedAmount.toFixed(4)} {asset.symbol}
                </span>
                {amount && parseFloat(amount) > 0 && (
                  <>
                    <span className="text-yellow-500">→</span>
                    <span className="text-zinc-900 dark:text-zinc-50">
                      {(activeTab === "borrow"
                        ? userBorrowedAmount + parseFloat(amount)
                        : userBorrowedAmount - parseFloat(amount)
                      ).toFixed(4)}{" "}
                      {asset.symbol}
                    </span>
                  </>
                )}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">
                Borrow APY
              </span>
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                {asset.borrowApy.toFixed(2)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">
                Available Liquidity
              </span>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {asset.availableLiquidity.toFixed(4)} {asset.symbol}
              </span>
            </div>
          </div>

          {/* More Button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="w-full text-blue-500 dark:text-blue-400 text-sm font-medium py-2 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          >
            {showMore ? "Less" : "More"}
          </button>

          {/* Error Message */}
          {submitError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {submitError}
            </div>
          )}

          {/* Success Message */}
          {txHash && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-400">
              <div className="flex items-center gap-2">
                <span>Transaction submitted!</span>
                <a
                  href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 underline font-medium flex items-center gap-1"
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          )}

          {/* Submission Step Indicator */}
          {submitting && submissionStep && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-400">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 animate-spin"
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
                {submissionStep}
              </div>
            </div>
          )}

          {/* Review Button */}
          <button
            onClick={handleSubmit}
            disabled={!canReview}
            className={`w-full font-medium py-3 rounded-lg transition-colors mt-4 ${
              canReview
                ? "bg-blue-500 text-white hover:bg-blue-400 cursor-pointer"
                : "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5 animate-spin"
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
                {submissionStep || "Submitting..."}
              </span>
            ) : (
              "Review"
            )}
          </button>

          {/* Wallet Balance */}
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400 text-sm">
              Wallet balance
            </span>
            <span className="text-sm font-medium flex items-center gap-2">
              {loadingBalance ? (
                <span className="text-zinc-400">Loading...</span>
              ) : balance ? (
                <>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {parseFloat(balance).toFixed(4)} {asset.symbol}
                  </span>
                  {amount &&
                    parseFloat(amount) > 0 &&
                    activeTab === "repay" && (
                      <>
                        <span className="text-yellow-500">→</span>
                        <span className="text-zinc-900 dark:text-zinc-50">
                          {(parseFloat(balance) - parseFloat(amount)).toFixed(
                            4
                          )}{" "}
                          {asset.symbol}
                        </span>
                      </>
                    )}
                </>
              ) : (
                "0.0000"
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
