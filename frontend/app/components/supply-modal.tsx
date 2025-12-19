"use client";

import { useState, useEffect, useMemo } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { type TokenInfo } from "../utils/tokens";
import { getBrokerName } from "../utils/lending-transaction";
import { getCoinDecimals, convertAmountToRaw } from "../utils/token-utils";
import { executeLendV2, executeRedeemV2 } from "../utils/lend-v2-utils";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";

interface SupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: {
    token: TokenInfo | null;
    symbol: string;
    price: number;
    supplyApy: number;
    totalSupplied: number;
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

interface RiskSimulation {
  currentEquity: number;
  currentDebt: number;
  currentRequiredEquity: number;
  currentHealthFactor: number;
  supplyAmountUSD: number;
  newEquity: number;
  newRequiredEquity: number;
  newHealthFactor: number;
  calculationSteps: string[];
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

export function SupplyModal({
  isOpen,
  onClose,
  asset,
  walletAddress,
  healthFactor,
}: SupplyModalProps) {
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const [activeTab, setActiveTab] = useState<"supply" | "withdraw">("supply");
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
  const [brokerData, setBrokerData] = useState<any[]>([]);
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
      setActiveTab("supply");
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

  // Fetch portfolio data for risk simulation
  useEffect(() => {
    if (!walletAddress || !isOpen) {
      setPortfolioData(null);
      return;
    }

    const fetchPortfolioAndBrokers = async () => {
      setLoadingPortfolio(true);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: "https://api.moveposition.xyz",
        });
        const [portfolioRes, brokersRes] = await Promise.all([
          superClient.default.getPortfolio(walletAddress),
          superClient.default.getBrokers(),
        ]);
        setPortfolioData(portfolioRes as unknown as PortfolioResponse);
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
  }, [walletAddress, isOpen]);

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
   * Get user's current supplied amount from portfolio data
   * Formula: scaledAmount × depositNoteExchangeRate
   */
  const userSuppliedAmount = useMemo(() => {
    if (!portfolioData || !asset) return 0;

    const brokerName = getBrokerName(asset.symbol);
    const depositNoteName = `${brokerName}-super-aptos-deposit-note`;

    const collateral = portfolioData.collaterals.find(
      (c) => c.instrument.name === depositNoteName
    );

    if (!collateral) return 0;

    // Get deposit note exchange rate from broker data
    const broker = brokerData.find(
      (b: any) => b.depositNote?.name === depositNoteName
    );
    const exchangeRate = broker?.depositNoteExchangeRate || 1;

    // scaledAmount × depositNoteExchangeRate = actual underlying amount
    return parseFloat(collateral.scaledAmount) * exchangeRate;
  }, [portfolioData, asset, brokerData]);

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
   * This is wallet-agnostic - works with Privy or any wallet provider
   * The API only needs the portfolio state structure, not wallet-specific data
   */
  const buildNextPortfolioState = useMemo(() => {
    if (!portfolioData || !amount || !asset || parseFloat(amount) <= 0) {
      return null;
    }

    const decimals = getCoinDecimals(asset.symbol);
    const amountInSmallestUnit = convertAmountToRaw(amount, decimals);

    // Find the collateral instrument for this asset
    // The instrument name format is like "movement-move-fa-super-aptos-deposit-note"
    // This matches the format from the portfolio API response
    const brokerName = getBrokerName(asset.symbol);
    const depositNoteName = `${brokerName}-super-aptos-deposit-note`;

    // Build collaterals - update the matching collateral
    const collaterals = portfolioData.collaterals
      .map((c) => {
        if (c.instrument.name === depositNoteName) {
          const currentAmount = BigInt(c.amount);
          let newAmount: bigint;

          if (activeTab === "supply") {
            // Add the new amount to existing collateral
            newAmount = currentAmount + BigInt(amountInSmallestUnit);
          } else {
            // Withdraw: subtract the amount (but don't go below 0)
            newAmount =
              currentAmount > BigInt(amountInSmallestUnit)
                ? currentAmount - BigInt(amountInSmallestUnit)
                : BigInt(0);
          }

          return {
            instrumentId: c.instrument.name,
            amount: newAmount.toString(),
          };
        }
        return {
          instrumentId: c.instrument.name,
          amount: c.amount,
        };
      })
      .filter((c) => {
        // Remove collaterals with zero amount
        return BigInt(c.amount) > 0;
      });

    // For supply, check if we need to add a new collateral (if it doesn't exist)
    if (activeTab === "supply") {
      const hasCollateral = collaterals.some(
        (c) => c.instrumentId === depositNoteName
      );
      if (!hasCollateral) {
        collaterals.push({
          instrumentId: depositNoteName,
          amount: amountInSmallestUnit,
        });
      }
    }

    // Liabilities remain the same
    const liabilities = portfolioData.liabilities.map((l) => ({
      instrumentId: l.instrument.name,
      amount: l.amount,
    }));

    return {
      collaterals,
      liabilities,
    };
  }, [portfolioData, amount, asset, activeTab]);

  /**
   * Fetch simulated risk when amount changes
   * This API call is wallet-agnostic - it only needs portfolio state
   * Works with Privy wallets (no injected provider needed)
   */
  useEffect(() => {
    const fetchSimulatedRisk = async () => {
      if (!buildNextPortfolioState || !amount || parseFloat(amount) <= 0) {
        setSimulatedRiskData(null);
        return;
      }

      setLoadingSimulation(true);
      try {
        // Call MovePosition risk simulation API via SuperClient
        const superClient = new superJsonApiClient.SuperClient({
          BASE: "https://api.moveposition.xyz",
        });

        const data = await superClient.default.getRiskSimulated({
          collaterals: buildNextPortfolioState.collaterals,
          liabilities: buildNextPortfolioState.liabilities,
        });
        setSimulatedRiskData(data);
        console.log("Simulated risk data:", data);
      } catch (error) {
        console.error("Error fetching simulated risk:", error);
        setSimulatedRiskData(null);
      } finally {
        setLoadingSimulation(false);
      }
    };

    // Debounce the API call to avoid excessive requests while typing
    const timeoutId = setTimeout(() => {
      fetchSimulatedRisk();
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [buildNextPortfolioState, amount]);

  const handleMax = () => {
    if (balance && parseFloat(balance) > 0) {
      setAmount(balance);
    }
  };

  const usdValue = amount && asset ? parseFloat(amount) * asset.price : 0;

  const canReview = amount && parseFloat(amount) > 0 && !submitting;

  /**
   * Calculate simulated risk/health factor after supply transaction
   * Uses API response if available, otherwise falls back to local calculation
   */
  const getRiskSimulated = useMemo((): RiskSimulation | null => {
    if (!portfolioData || !amount || !asset || parseFloat(amount) <= 0) {
      return null;
    }

    const currentEquity = portfolioData.evaluation.total_collateral;
    const currentDebt = portfolioData.evaluation.total_liability;
    const currentRequiredEquity = portfolioData.risk.requiredEquity;
    const currentHealthFactor = portfolioData.evaluation.health_ratio;

    const supplyAmountUSD = parseFloat(amount) * asset.price;

    // Use API simulated data if available
    let newEquity: number;
    let newRequiredEquity: number;
    let newHealthFactor: number | null;
    let calculationSteps: string[];

    if (simulatedRiskData) {
      // Use API response
      newEquity =
        simulatedRiskData.total_collateral || currentEquity + supplyAmountUSD;
      newRequiredEquity =
        simulatedRiskData.requiredEquity || currentRequiredEquity;
      newHealthFactor = simulatedRiskData.health_ratio || null;

      calculationSteps = [
        `Current Equity: $${currentEquity.toFixed(2)}`,
        `Current Debt: $${currentDebt.toFixed(2)}`,
        `Current Required Equity: $${currentRequiredEquity.toFixed(2)}`,
        `Current Health Factor: ${currentHealthFactor.toFixed(2)}x`,
        ``,
        `Supply Amount: ${parseFloat(amount).toFixed(4)} ${asset.symbol}`,
        `Supply Amount (USD): $${supplyAmountUSD.toFixed(2)}`,
        ``,
        `[API Simulation]`,
        `New Equity: $${newEquity.toFixed(2)}`,
        `New Required Equity: $${newRequiredEquity.toFixed(2)}`,
        `New Health Factor: ${newHealthFactor ? newHealthFactor.toFixed(2) : "N/A"}x`,
        `LTV: ${simulatedRiskData.ltv ? (simulatedRiskData.ltv * 100).toFixed(2) : "N/A"}%`,
      ];
    } else {
      // Fallback to local calculation
      newEquity = currentEquity + supplyAmountUSD;
      const collateralToRequiredRatio =
        currentEquity > 0 ? currentRequiredEquity / currentEquity : 0.35;

      newRequiredEquity = Math.max(
        newEquity * collateralToRequiredRatio,
        currentRequiredEquity
      );

      newHealthFactor =
        newRequiredEquity > 0
          ? newEquity / newRequiredEquity
          : currentDebt > 0
            ? newEquity / currentDebt
            : null;

      calculationSteps = [
        `Current Equity: $${currentEquity.toFixed(2)}`,
        `Current Debt: $${currentDebt.toFixed(2)}`,
        `Current Required Equity: $${currentRequiredEquity.toFixed(2)}`,
        `Current Health Factor: ${currentHealthFactor.toFixed(2)}x`,
        ``,
        `Supply Amount: ${parseFloat(amount).toFixed(4)} ${asset.symbol}`,
        `Supply Amount (USD): $${supplyAmountUSD.toFixed(2)}`,
        ``,
        `[Local Calculation]`,
        `New Equity = Current Equity + Supply Amount`,
        `New Equity = $${currentEquity.toFixed(2)} + $${supplyAmountUSD.toFixed(2)}`,
        `New Equity = $${newEquity.toFixed(2)}`,
        ``,
        `New Required Equity = New Equity × Ratio`,
        `New Required Equity = $${newEquity.toFixed(2)} × ${(collateralToRequiredRatio * 100).toFixed(1)}%`,
        `New Required Equity = $${newRequiredEquity.toFixed(2)}`,
        ``,
        `New Health Factor = New Equity ÷ New Required Equity`,
        `New Health Factor = $${newEquity.toFixed(2)} ÷ $${newRequiredEquity.toFixed(2)}`,
        `New Health Factor = ${newHealthFactor ? newHealthFactor.toFixed(2) : "N/A"}x`,
      ];
    }

    return {
      currentEquity,
      currentDebt,
      currentRequiredEquity,
      currentHealthFactor,
      supplyAmountUSD,
      newEquity,
      newRequiredEquity,
      newHealthFactor: newHealthFactor ?? 0,
      calculationSteps,
    };
  }, [portfolioData, amount, asset, simulatedRiskData]);

  // Use simulated health factor from API if available, otherwise fallback to current
  const displayHealthFactor =
    simulatedRiskData?.health_ratio ??
    getRiskSimulated?.newHealthFactor ??
    currentHealthFactor;

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
      activeTab === "supply" &&
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

      // Privy public key format: "004a4b8e35..." (starts with "00", not "0x")
      // Pass it as-is, the utility will handle the formatting
      const publicKey = senderPubKeyWithScheme;

      // Convert amount to smallest unit using shared utility
      const decimals = getCoinDecimals(asset.symbol);
      const rawAmount = convertAmountToRaw(amount, decimals);

      // Execute transaction using the same approach as scripts
      const txHash = await (
        activeTab === "supply" ? executeLendV2 : executeRedeemV2
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

      console.log(
        `${activeTab === "supply" ? "Supply" : "Withdraw"} transaction successful:`,
        txHash
      );
      setTxHash(txHash);
      // Close modal on success after a short delay
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
            Supply {asset.symbol}
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
              setActiveTab("supply");
              setAmount("");
            }}
            className={`flex-1 py-3 text-sm rounded-md font-medium transition-colors ${
              activeTab === "supply"
                ? "bg-green-600 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Supply
          </button>
          <button
            onClick={() => {
              setActiveTab("withdraw");
              setAmount("");
            }}
            className={`flex-1 py-3 text-sm font-medium rounded-md transition-colors ${
              activeTab === "withdraw"
                ? "bg-green-600 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Withdraw
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
                <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-black font-bold text-sm">
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
              {activeTab === "supply" && balance && parseFloat(balance) > 0 && (
                <button
                  onClick={handleMax}
                  className="px-4 py-1 bg-yellow-500 text-black text-sm font-medium rounded hover:bg-yellow-400 transition-colors"
                >
                  Max
                </button>
              )}
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
                Supplied
              </span>
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {userSuppliedAmount.toFixed(4)} {asset.symbol}
                </span>
                {amount && parseFloat(amount) > 0 && (
                  <>
                    <span className="text-yellow-500">→</span>
                    <span className="text-zinc-900 dark:text-zinc-50">
                      {(activeTab === "supply"
                        ? userSuppliedAmount + parseFloat(amount)
                        : userSuppliedAmount - parseFloat(amount)
                      ).toFixed(4)}{" "}
                      {asset.symbol}
                    </span>
                  </>
                )}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">
                Supply APY
              </span>
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {asset.supplyApy.toFixed(2)}%
                </span>
                {amount && parseFloat(amount) > 0 && simulatedRiskData && (
                  <>
                    <span className="text-yellow-500">→</span>
                    <span className="text-green-600 dark:text-green-400">
                      {asset.supplyApy.toFixed(2)}%
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* More Button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="w-full text-yellow-500 dark:text-yellow-400 text-sm font-medium py-2 hover:text-yellow-600 dark:hover:text-yellow-300 transition-colors"
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
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
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
                ? "bg-yellow-500 text-black hover:bg-yellow-400 cursor-pointer"
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
                  {amount && parseFloat(amount) > 0 && (
                    <>
                      <span className="text-yellow-500">→</span>
                      <span className="text-zinc-900 dark:text-zinc-50">
                        {(activeTab === "supply"
                          ? parseFloat(balance) - parseFloat(amount)
                          : parseFloat(balance) + parseFloat(amount)
                        ).toFixed(4)}{" "}
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
