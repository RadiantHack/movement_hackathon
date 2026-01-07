"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMovementWallet } from "../../../hooks/useMovementWallet";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import {
  executeBorrowV2,
  executeRepayV2,
} from "../../../utils/borrow-v2-utils";
import {
  getCoinDecimals,
  convertAmountToRaw,
} from "../../../utils/token-utils";
import * as superJsonApiClient from "../../../../lib/super-json-api-client/src";
import { getMovementApiBase } from "@/lib/super-aptos-sdk/src/globals";

interface BorrowCardProps {
  walletAddress: string | null;
  asset?: string; // Optional asset to pre-select (e.g., "USDC", "MOVE")
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
  maxBorrow?: Record<string, string>;
}

export const BorrowCard: React.FC<BorrowCardProps> = ({
  walletAddress,
  asset,
}) => {
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const [activeTab, setActiveTab] = useState<"borrow" | "repay">("borrow");
  // Use asset prop if provided, otherwise default to MOVE
  const [token, setToken] = useState<string>(asset?.toUpperCase() || "MOVE");
  const [amount, setAmount] = useState<string>("");
  const [borrowing, setBorrowing] = useState(false);
  const [borrowError, setBorrowError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>("");
  const [portfolioData, setPortfolioData] = useState<PortfolioResponse | null>(
    null
  );
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [simulatedRiskData, setSimulatedRiskData] = useState<any | null>(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);

  // Risk simulation state (matching BorrowModal)
  const [simHealthFactor, setSimHealthFactor] = useState<number>(0);
  const [simHealthYellow, setSimHealthYellow] = useState<boolean>(false);
  const [simHealthRed, setSimHealthRed] = useState<boolean>(false);
  const [isSimHealthy, setIsSimHealthy] = useState<boolean>(false);
  const [isLTVWarning, setIsLTVWarning] = useState<boolean>(false);
  const [simLTV, setSimLTV] = useState<number>(0);

  const movementApiBase = getMovementApiBase();

  const movementWallet = useMovementWallet();

  const [brokerData, setBrokerData] =
    useState<superJsonApiClient.Broker | null>(null);

  // Get broker name helper
  const getBrokerName = (symbol: string): string => {
    const symbolUpper = symbol.toUpperCase();
    if (symbolUpper === "USDC" || symbolUpper === "USDC.E")
      return "movement-usdc";
    if (symbolUpper === "USDT" || symbolUpper === "USDT.E")
      return "movement-usdt";
    if (symbolUpper === "MOVE") return "movement-move";
    return `movement-${symbol.toLowerCase()}`;
  };

  // Calculate health factor matching MovePosition's implementation
  // Health Factor = equity / minRequiredEquity
  // equity = total_collateral - total_liability
  const healthFactor = useMemo(() => {
    if (!portfolioData?.evaluation) {
      return null;
    }
    const totalCollateral = portfolioData.evaluation.total_collateral ?? 0;
    const totalLiability = portfolioData.evaluation.total_liability ?? 0;
    const equity = totalCollateral - totalLiability;
    const minRequiredEquity =
      portfolioData?.risk?.requiredEquity ?? portfolioData?.evaluation?.mm ?? 0;

    if (minRequiredEquity <= 0) {
      return null;
    }

    // Use health_ratio from API if available, otherwise calculate
    return portfolioData.evaluation.health_ratio ?? equity / minRequiredEquity;
  }, [portfolioData]);

  // Get user's current borrowed amount from portfolio data
  const borrowed = useMemo(() => {
    if (!portfolioData || !brokerData) return 0;

    const brokerName = getBrokerName(token);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;

    const liability = portfolioData.liabilities.find(
      (l) => l.instrument.name === loanNoteName
    );

    if (!liability) return 0;

    // Convert raw note tokens to underlying tokens using exchange rate
    const loanNoteDecimals = brokerData.loanNote?.decimals ?? 8;
    const loanNoteExchangeRate = brokerData.loanNoteExchangeRate || 1;
    const noteBalance =
      parseFloat(liability.amount) / Math.pow(10, loanNoteDecimals);
    const underlyingTokenBalance = noteBalance * loanNoteExchangeRate;

    return underlyingTokenBalance;
  }, [portfolioData, brokerData, token]);

  // Get max borrow amount from portfolio API
  const maxBorrow = useMemo(() => {
    if (!portfolioData?.maxBorrow) return 0;

    const brokerName = getBrokerName(token);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;
    const maxBorrowValue = portfolioData.maxBorrow[loanNoteName];

    if (!maxBorrowValue) return 0;

    const maxBorrowAmount = parseFloat(maxBorrowValue);
    return isNaN(maxBorrowAmount) || maxBorrowAmount <= 0 ? 0 : maxBorrowAmount;
  }, [portfolioData, token]);

  // Get borrow APY from broker data
  const borrowAPY = useMemo(() => {
    if (!brokerData) return 8.5; // Default fallback
    return brokerData.interestRate * 100; // Convert to percentage
  }, [brokerData]);

  const walletBalance = balance ? parseFloat(balance) : 0;

  /**
   * Build next portfolio state for risk simulation API
   */
  const buildNextPortfolioState = useMemo(() => {
    if (!portfolioData || !amount || parseFloat(amount) <= 0) {
      return null;
    }

    const decimals = getCoinDecimals(token);
    const amountInSmallestUnit = convertAmountToRaw(amount, decimals);

    const brokerName = getBrokerName(token);
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
  }, [portfolioData, amount, token, activeTab]);

  /**
   * Helper functions for health factor zones (matching BorrowModal)
   */
  const isYellowZone = (hf: number): boolean => {
    return hf <= 1.5 && hf > 1.2;
  };

  const isRedZone = (hf: number): boolean => {
    return hf <= 1.2;
  };

  /**
   * Calculate health factor from evaluation response (matching BorrowModal)
   * Health factor = (total_collateral - total_liability) / mm
   */
  const calcHealthFactor = (evaluation: any): number => {
    if (!evaluation) {
      return 0;
    }
    const equity = evaluation.total_collateral - evaluation.total_liability;
    const minReq = evaluation.mm || 0;
    if (minReq === 0) {
      return 0;
    }
    return equity / minReq;
  };

  /**
   * Check if we should get risk evaluation
   * Only for borrow tab, and only if there's collateral
   */
  const shouldGetRiskEval = (): boolean => {
    if (activeTab !== "borrow") {
      return false;
    }
    if (!buildNextPortfolioState) {
      return false;
    }
    // Check if there's collateral
    const hasCollateral = buildNextPortfolioState.collaterals.some(
      (c) => BigInt(c.amount) > 0
    );
    return hasCollateral;
  };

  /**
   * Fetch simulated risk when amount changes (matching BorrowModal's implementation)
   */
  useEffect(() => {
    const fetchSimulatedRisk = async () => {
      // Only fetch if we have input and should get risk eval
      if (!buildNextPortfolioState || !amount || parseFloat(amount) <= 0) {
        setSimulatedRiskData(null);
        setSimHealthFactor(0);
        setSimHealthYellow(false);
        setSimHealthRed(false);
        setIsSimHealthy(false);
        setIsLTVWarning(false);
        setSimLTV(0);
        return;
      }

      // Only fetch for borrow tab with collateral
      if (!shouldGetRiskEval()) {
        setSimulatedRiskData(null);
        setSimHealthFactor(0);
        setSimHealthYellow(false);
        setSimHealthRed(false);
        setIsSimHealthy(false);
        setIsLTVWarning(false);
        setSimLTV(0);
        return;
      }

      setLoadingSimulation(true);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: movementApiBase,
        });

        const response = await superClient.default.getRiskSimulated({
          collaterals: buildNextPortfolioState.collaterals,
          liabilities: buildNextPortfolioState.liabilities,
        });

        console.log("[BorrowCard RiskSimulation] Response:", response);

        // Calculate health factor (matching BorrowModal)
        const simFactor = calcHealthFactor(response);
        const ltv = response.ltv || 0;

        console.log(
          "[BorrowCard RiskSimulation] Health factor:",
          simFactor,
          "LTV:",
          ltv
        );

        // Determine zones (matching BorrowModal)
        const simYellow = isYellowZone(simFactor);
        const simRed = isRedZone(simFactor);
        const healthy = simFactor > 1.0;
        const ltvWarn = ltv > 0.95;

        // Update state
        setSimulatedRiskData(response);
        setSimHealthFactor(simFactor);
        setSimHealthYellow(simYellow);
        setSimHealthRed(simRed);
        setIsSimHealthy(healthy);
        setIsLTVWarning(healthy && ltvWarn);
        if (ltvWarn) {
          setSimLTV(ltv);
        } else {
          setSimLTV(0);
        }
      } catch (error) {
        console.error("[BorrowCard RiskSimulation] Error:", error);
        // On error, set unhealthy state (matching BorrowModal)
        setSimulatedRiskData(null);
        setSimHealthFactor(0);
        setIsSimHealthy(false);
        setSimHealthRed(true);
        setIsLTVWarning(false);
        setSimLTV(0);
      } finally {
        setLoadingSimulation(false);
      }
    };

    // Debounce API calls (matching BorrowModal's approach)
    const timeoutId = setTimeout(() => {
      fetchSimulatedRisk();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [buildNextPortfolioState, amount, activeTab, movementApiBase]);

  // Use simulated health factor if available, otherwise use current
  const displayHealthFactor =
    simHealthFactor > 0
      ? simHealthFactor
      : (simulatedRiskData?.health_ratio ?? healthFactor);

  // Update token when asset prop changes
  useEffect(() => {
    if (asset) {
      setToken(asset.toUpperCase());
    }
  }, [asset]);

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
      setBrokerData(null);
      return;
    }

    const fetchPortfolioAndBroker = async () => {
      setLoadingPortfolio(true);
      try {
        const superClient = new superJsonApiClient.SuperClient({
          BASE: movementApiBase,
        });

        // Fetch portfolio and brokers in parallel
        const [portfolioRes, brokersRes] = await Promise.all([
          superClient.default.getPortfolio(walletAddress),
          superClient.default.getBrokers(),
        ]);

        setPortfolioData(portfolioRes as unknown as PortfolioResponse);

        // Find the broker for current token
        const brokerName = getBrokerName(token);
        const broker = brokersRes.find(
          (b) => b.underlyingAsset.name === brokerName
        );

        if (broker) {
          setBrokerData(broker);
        } else {
          setBrokerData(null);
        }
      } catch (error) {
        console.error("Error fetching portfolio/broker:", error);
        setPortfolioData(null);
        setBrokerData(null);
      } finally {
        setLoadingPortfolio(false);
      }
    };

    fetchPortfolioAndBroker();
  }, [walletAddress, movementApiBase, token]);

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
    if (activeTab === "borrow" && maxBorrow > 0) {
      setAmount(maxBorrow.toString());
    } else if (activeTab === "repay" && balance && parseFloat(balance) > 0) {
      setAmount(balance);
    }
  };

  const handleBorrow = async () => {
    if (!ready || !authenticated) {
      setBorrowError("Please connect your Privy wallet first");
      return;
    }

    if (!movementWallet || !walletAddress) {
      setBorrowError(
        "Privy wallet not connected. Please connect your Movement wallet."
      );
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setBorrowError("Please enter a valid amount.");
      return;
    }

    // Validation is handled by validationError useMemo, but check here too for immediate feedback
    if (validationError) {
      setBorrowError(validationError);
      return;
    }

    setBorrowing(true);
    setBorrowError(null);
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
      const txHashResult = await executeBorrowV2({
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

      console.log("Borrow transaction successful:", txHashResult);
      setTxHash(txHashResult);
      setSubmissionStep("");
    } catch (err: any) {
      console.error("Borrow error:", err);
      setBorrowError(
        err.message ||
          "Borrow failed. Please check your connection and try again."
      );
      setSubmissionStep("");
    } finally {
      setBorrowing(false);
    }
  };

  const handleRepay = async () => {
    if (!ready || !authenticated) {
      setBorrowError("Please connect your Privy wallet first");
      return;
    }

    if (!movementWallet || !walletAddress) {
      setBorrowError(
        "Privy wallet not connected. Please connect your Movement wallet."
      );
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setBorrowError("Please enter a valid amount.");
      return;
    }

    if (parseFloat(amount) > walletBalance) {
      setBorrowError("Insufficient balance.");
      return;
    }

    if (parseFloat(amount) > borrowed && borrowed > 0) {
      setBorrowError("Amount exceeds borrowed amount.");
      return;
    }

    setBorrowing(true);
    setBorrowError(null);
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
      const txHashResult = await executeRepayV2({
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

      console.log("Repay transaction successful:", txHashResult);
      setTxHash(txHashResult);
      setSubmissionStep("");
    } catch (err: any) {
      console.error("Repay error:", err);
      setBorrowError(
        err.message ||
          "Repay failed. Please check your connection and try again."
      );
      setSubmissionStep("");
    } finally {
      setBorrowing(false);
    }
  };

  // Validation logic similar to BorrowModal
  const validationError = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) {
      return null;
    }

    const parsedAmount = parseFloat(amount);

    if (activeTab === "borrow") {
      // Check if exceeds max borrow
      if (maxBorrow > 0 && parsedAmount > maxBorrow) {
        return `Exceeds max safe borrow. You can borrow up to ${maxBorrow.toFixed(6)} ${token} based on your collateral and health factor.`;
      }
      // Check if no borrowing power
      if (maxBorrow <= 0 && portfolioData) {
        const hasCollateral = portfolioData.collaterals.some(
          (c) => BigInt(c.amount) > 0
        );
        if (hasCollateral) {
          return "No borrowing power available. Please supply more collateral or check your health factor.";
        } else {
          return "You need to supply collateral before you can borrow. Please supply assets first.";
        }
      }
      // Check health factor zones (matching BorrowModal)
      if (simHealthRed) {
        return "Would make position unhealthy (health factor ≤ 1.2x)";
      }
      if (simHealthYellow) {
        return "Would reduce health factor to warning zone (1.2x - 1.5x)";
      }
      // Check LTV warning (matching BorrowModal: healthy && ltv > 0.95)
      if (isLTVWarning && simLTV > 0) {
        return `LTV would exceed 95% (${(simLTV * 100).toFixed(1)}%)`;
      }
      // Fallback to displayHealthFactor if simulation not available
      if (displayHealthFactor !== null && displayHealthFactor < 1.0) {
        return "Would make position unhealthy";
      }
    } else if (activeTab === "repay") {
      // Check if exceeds wallet balance
      if (balance && parsedAmount > parseFloat(balance)) {
        return "Exceeds wallet balance";
      }
      // Check if exceeds borrowed amount
      if (parsedAmount > borrowed && borrowed > 0) {
        return `Exceeds borrowed amount. You have borrowed ${borrowed.toFixed(6)} ${token}`;
      }
    }

    return null;
  }, [
    amount,
    activeTab,
    maxBorrow,
    token,
    portfolioData,
    balance,
    borrowed,
    displayHealthFactor,
    simulatedRiskData,
    simHealthRed,
    simHealthYellow,
    isLTVWarning,
    simLTV,
  ]);

  const canSubmit = useMemo(() => {
    return (
      ready &&
      authenticated &&
      walletAddress &&
      amount &&
      parseFloat(amount) > 0 &&
      !borrowing &&
      !validationError
    );
  }, [ready, authenticated, walletAddress, amount, borrowing, validationError]);

  return (
    <div className="w-full max-w-full sm:max-w-md mx-auto px-2 sm:px-0">
      <div className="rounded-2xl p-4 sm:p-5 md:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
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
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Borrow Tokens
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Borrow or repay tokens on Movement Network
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <button
            onClick={() => {
              setActiveTab("borrow");
              setAmount("");
              setBorrowError(null);
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "borrow"
                ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
            disabled={borrowing}
          >
            Borrow
          </button>
          <button
            onClick={() => {
              setActiveTab("repay");
              setAmount("");
              setBorrowError(null);
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "repay"
                ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
            disabled={borrowing}
          >
            Repay
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
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            disabled={borrowing}
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
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={borrowing}
              />
            </div>
            <button
              onClick={handleMax}
              className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-sm font-medium"
              disabled={
                borrowing ||
                (activeTab === "borrow" && maxBorrow === 0) ||
                (activeTab === "repay" &&
                  (!balance || parseFloat(balance) === 0))
              }
            >
              Max
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeTab === "borrow" ? "Max borrow" : "Wallet balance"}:{" "}
              {loadingBalance || loadingPortfolio ? (
                <span className="inline-block animate-pulse">Loading...</span>
              ) : activeTab === "borrow" ? (
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {maxBorrow > 0
                    ? maxBorrow.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })
                    : "0.00"}{" "}
                  {token}
                </span>
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
              {loadingPortfolio || loadingSimulation ? (
                <span className="inline-block animate-pulse">
                  {loadingSimulation ? "Simulating..." : "Loading..."}
                </span>
              ) : displayHealthFactor ? (
                `${displayHealthFactor.toFixed(2)}x`
              ) : healthFactor ? (
                `${healthFactor.toFixed(2)}x`
              ) : (
                "N/A"
              )}
            </span>
          </div>
          {activeTab === "borrow" && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Borrowed
                </span>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {loadingPortfolio ? (
                    <span className="inline-block animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    `${borrowed.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })} ${token}`
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Borrow APY
                </span>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {loadingPortfolio ? (
                    <span className="inline-block animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    `${borrowAPY.toFixed(2)}%`
                  )}
                </span>
              </div>
            </>
          )}
          {activeTab === "repay" && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Borrowed
              </span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {loadingPortfolio ? (
                  <span className="inline-block animate-pulse">Loading...</span>
                ) : (
                  `${borrowed.toLocaleString(undefined, {
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

        {/* Warning Messages (matching BorrowModal) */}
        {amount && parseFloat(amount) > 0 && activeTab === "borrow" && (
          <>
            {/* Yellow Zone Warning */}
            {simHealthYellow && !simHealthRed && !isLTVWarning && (
              <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-700 dark:text-yellow-400">
                ⚠️ Warning: This borrow would reduce your health factor to{" "}
                {displayHealthFactor?.toFixed(2)}x (warning zone: 1.2x - 1.5x).
                Consider borrowing less to maintain a safer position.
              </div>
            )}

            {/* Red Zone Warning */}
            {simHealthRed && !isLTVWarning && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                🚨 Danger: This borrow would make your position unhealthy
                (health factor ≤ 1.2x). Your position may be at risk of
                liquidation. Please reduce the amount.
              </div>
            )}

            {/* LTV Warning */}
            {isLTVWarning && isSimHealthy && simLTV > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-sm text-orange-700 dark:text-orange-400">
                ⚠️ LTV Warning: This borrow would result in an LTV of{" "}
                {(simLTV * 100).toFixed(1)}%, which exceeds the recommended 95%
                threshold. Consider borrowing less to maintain a safer position.
              </div>
            )}

            {/* Other Validation Errors */}
            {validationError &&
              !simHealthRed &&
              !simHealthYellow &&
              !isLTVWarning && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                  ⚠️ {validationError}
                </div>
              )}
          </>
        )}

        {/* Validation Error for Repay */}
        {amount &&
          parseFloat(amount) > 0 &&
          activeTab === "repay" &&
          validationError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              ⚠️ {validationError}
            </div>
          )}

        {/* Submission Step */}
        {submissionStep && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-400">
            {submissionStep}
          </div>
        )}

        {/* Error Message */}
        {borrowError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {borrowError}
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
          onClick={activeTab === "borrow" ? handleBorrow : handleRepay}
          disabled={!canSubmit}
          className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-md ${
            canSubmit
              ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg active:scale-[0.98]"
              : "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
          }`}
        >
          {borrowing
            ? activeTab === "borrow"
              ? "Borrowing..."
              : "Repaying..."
            : txHash
              ? activeTab === "borrow"
                ? "Borrow Complete"
                : "Repay Complete"
              : activeTab === "borrow"
                ? "Borrow"
                : "Repay"}
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
