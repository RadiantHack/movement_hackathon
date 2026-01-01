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
  onSuccess?: () => void; // Callback after successful transaction (for portfolio refresh)
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
  onSuccess,
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
  const [brokerData, setBrokerData] =
    useState<superJsonApiClient.Broker | null>(null);
  const [simulatedRiskData, setSimulatedRiskData] = useState<any | null>(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>("");

  // Risk simulation state (matching MovePosition)
  const [simHealthFactor, setSimHealthFactor] = useState<number>(0);
  const [simHealthYellow, setSimHealthYellow] = useState<boolean>(false);
  const [simHealthRed, setSimHealthRed] = useState<boolean>(false);
  const [isSimHealthy, setIsSimHealthy] = useState<boolean>(false);
  const [isLTVWarning, setIsLTVWarning] = useState<boolean>(false);
  const [simLTV, setSimLTV] = useState<number>(0);

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
    if (!walletAddress || !isOpen || !asset) {
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

        // Find the broker for this asset
        const brokerName = getBrokerName(asset.symbol);
        const broker = brokersRes.find(
          (b) => b.underlyingAsset.name === brokerName
        );

        if (broker) {
          setBrokerData(broker);
        } else {
          console.warn(`[BorrowModal] Broker not found for ${asset.symbol}`);
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
  }, [walletAddress, isOpen, movementApiBase, asset]);

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
   * Matching MovePosition's calcBorrowData: underlyingTokenBalance = noteBalance * loanNoteExchangeRate
   */
  const userBorrowedAmount = useMemo(() => {
    if (!portfolioData || !asset || !brokerData) return 0;

    const brokerName = getBrokerName(asset.symbol);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;

    const liability = portfolioData.liabilities.find(
      (l) => l.instrument.name === loanNoteName
    );

    if (!liability) return 0;

    // liability.amount is in raw note tokens
    // MovePosition: noteBalance = positions.liabilities[loanNoteName] (already scaled down)
    //               underlyingTokenBalance = noteBalance * broker.loanNoteExchangeRate
    const loanNoteDecimals =
      brokerData.loanNote?.decimals ?? getCoinDecimals(asset.symbol);
    const loanNoteExchangeRate = brokerData.loanNoteExchangeRate || 1;

    // Convert raw note tokens to note tokens (scaled down)
    const noteBalance =
      parseFloat(liability.amount) / Math.pow(10, loanNoteDecimals);

    // Convert note tokens to underlying tokens using exchange rate
    const underlyingTokenBalance = noteBalance * loanNoteExchangeRate;

    return underlyingTokenBalance;
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
   * Get max borrow amount for the selected asset from portfolio API
   * This is calculated based on user's collateral and health factor
   *
   * Note: The API returns maxBorrow values already in underlying token units (scaled),
   * not in raw units. For example: "0.30358239388513447" for USDC means 0.303582... USDC.
   */
  const maxBorrowFromPortfolio = useMemo(() => {
    if (!portfolioData?.maxBorrow || !asset) return null;

    const brokerName = getBrokerName(asset.symbol);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;
    const maxBorrowValue = portfolioData.maxBorrow[loanNoteName];

    if (!maxBorrowValue) return null;

    // The API returns maxBorrow already in underlying token units (scaled format)
    // Just parse it as a number - no conversion needed
    const maxBorrowAmount = parseFloat(maxBorrowValue);

    // Return null if invalid or zero
    if (isNaN(maxBorrowAmount) || maxBorrowAmount <= 0) {
      return null;
    }

    return maxBorrowAmount;
  }, [portfolioData, asset]);

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
   * Helper functions for health factor zones (matching MovePosition)
   */
  const isYellowZone = (hf: number): boolean => {
    return hf <= 1.5 && hf > 1.2;
  };

  const isRedZone = (hf: number): boolean => {
    return hf <= 1.2;
  };

  /**
   * Calculate health factor from evaluation response (matching MovePosition)
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
   * Fetch simulated risk when amount changes (matching MovePosition's implementation)
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

        console.log("[RiskSimulation] Response:", response);

        // Calculate health factor (matching MovePosition)
        // Response is Evaluation type directly, not wrapped
        const simFactor = calcHealthFactor(response);
        const ltv = response.ltv || 0;

        console.log("[RiskSimulation] Health factor:", simFactor, "LTV:", ltv);

        // Determine zones (matching MovePosition)
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
        console.error("[RiskSimulation] Error:", error);
        // On error, set unhealthy state (matching MovePosition)
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

    // Debounce API calls (matching MovePosition's approach)
    const timeoutId = setTimeout(() => {
      fetchSimulatedRisk();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [buildNextPortfolioState, amount, activeTab, movementApiBase]);

  /**
   * Calculate max borrow amount - minimum of:
   * 1. Max borrow from portfolio API (based on collateral/health factor)
   * 2. Available liquidity in the broker
   */
  const maxBorrowAmount = useMemo(() => {
    if (!asset) return 0;

    const maxFromPortfolio = maxBorrowFromPortfolio ?? Infinity;
    const maxFromLiquidity = asset.availableLiquidity;

    // Take the minimum of both limits
    return Math.min(maxFromPortfolio, maxFromLiquidity);
  }, [asset, maxBorrowFromPortfolio]);

  /**
   * Calculate max repay amount - minimum of wallet balance and borrowed amount
   */
  const maxRepayAmount = useMemo(() => {
    if (!balance || parseFloat(balance) <= 0) return 0;
    return Math.min(parseFloat(balance), userBorrowedAmount);
  }, [balance, userBorrowedAmount]);

  const handleMax = () => {
    if (activeTab === "borrow" && maxBorrowAmount > 0) {
      // Use the calculated max borrow amount
      setAmount(
        Math.max(0, maxBorrowAmount)
          .toFixed(8)
          .replace(/\.?0+$/, "")
      );
    } else if (activeTab === "repay" && maxRepayAmount > 0) {
      // Max repay is min of wallet balance and borrowed amount
      setAmount(
        Math.max(0, maxRepayAmount)
          .toFixed(8)
          .replace(/\.?0+$/, "")
      );
    }
  };

  const usdValue = amount && asset ? parseFloat(amount) * asset.price : 0;

  const parsedAmount = parseFloat(amount) || 0;

  // Use simulated health factor if available, otherwise use current
  // Matching MovePosition: simHealthFactor is calculated from evaluation
  const displayHealthFactor =
    simHealthFactor > 0
      ? simHealthFactor
      : (simulatedRiskData?.evaluation?.health_ratio ?? currentHealthFactor);

  /**
   * Validation logic similar to MovePosition
   */
  const validationError = useMemo(() => {
    if (!amount || parsedAmount <= 0 || !asset) {
      return null;
    }

    if (activeTab === "borrow") {
      // MovePosition validation: maxBorrowFromPortfolio is the authoritative source
      // It's calculated by the portfolio API based on collateral, health factor, and LTV
      // If null, it means no borrowing power (handled in handleSubmit for early feedback)
      // If zero or negative, also no borrowing power
      if (maxBorrowFromPortfolio !== null && maxBorrowFromPortfolio <= 0) {
        return "No borrowing power available. Please supply more collateral or check your health factor.";
      }
      // Check if exceeds max borrow from portfolio (MovePosition's primary validation)
      if (
        maxBorrowFromPortfolio !== null &&
        parsedAmount > maxBorrowFromPortfolio
      ) {
        return `Exceeds max safe borrow. You can borrow up to ${maxBorrowFromPortfolio.toFixed(6)} ${asset.symbol} based on your collateral and health factor.`;
      }
      // Check if exceeds available liquidity in the broker (MovePosition's secondary check)
      if (parsedAmount > asset.availableLiquidity) {
        return `Exceeds available liquidity. Maximum available: ${asset.availableLiquidity.toFixed(6)} ${asset.symbol}`;
      }
      // Check health factor zones (matching MovePosition)
      if (simHealthRed) {
        return "Would make position unhealthy (health factor ≤ 1.2x)";
      }
      if (simHealthYellow) {
        return "Would reduce health factor to warning zone (1.2x - 1.5x)";
      }
      // Check LTV warning (matching MovePosition: healthy && ltv > 0.95)
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
      if (parsedAmount > userBorrowedAmount) {
        return "Exceeds borrowed amount";
      }
    }

    return null;
  }, [
    amount,
    parsedAmount,
    activeTab,
    maxBorrowFromPortfolio,
    asset,
    balance,
    userBorrowedAmount,
    displayHealthFactor,
    simulatedRiskData,
    simHealthRed,
    simHealthYellow,
    isLTVWarning,
    simLTV,
  ]);

  const canReview =
    amount && parsedAmount > 0 && !submitting && !validationError;

  /**
   * Check if user has collateral
   */
  const hasCollateral = useMemo(() => {
    if (!portfolioData) return false;
    // Check if there are any collaterals with non-zero amount
    return portfolioData.collaterals.some(
      (c) => BigInt(c.amount) > 0
    );
  }, [portfolioData]);

  const handleSubmit = async () => {
    if (!movementWallet || !walletAddress || !asset) {
      setSubmitError("Wallet not connected");
      return;
    }

    // Validate amount is present and valid
    if (!amount || amount.trim() === "") {
      setSubmitError("Please enter an amount");
      return;
    }

    const parsedAmountValue = parseFloat(amount);
    if (isNaN(parsedAmountValue) || parsedAmountValue <= 0) {
      setSubmitError("Please enter a valid amount greater than 0");
      return;
    }

    // MovePosition validation: Check borrowing power from portfolio API
    // The portfolio API's maxBorrow is the source of truth - it's null when:
    // 1. No collateral exists
    // 2. Insufficient collateral (health factor too low)
    // 3. Already at max borrow capacity
    if (activeTab === "borrow") {
      if (maxBorrowFromPortfolio === null) {
        // Check if it's because of no collateral or insufficient borrowing power
        if (!hasCollateral) {
          setSubmitError("You need to supply collateral before you can borrow. Please supply assets first.");
        } else {
          // Has collateral but no borrowing power - likely health factor issue
          setSubmitError("Insufficient borrowing power. Your health factor may be too low or you've reached your borrowing limit. Please supply more assets or repay existing borrows.");
        }
        return;
      }
      
      // Additional check: if maxBorrow is 0 or very small, user can't borrow
      if (maxBorrowFromPortfolio <= 0) {
        setSubmitError("No borrowing power available. Please supply more collateral or check your health factor.");
        return;
      }
    }

    // Use validation error if present
    if (validationError) {
      setSubmitError(validationError);
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

      // Validate amount before conversion
      const parsedAmountValue = parseFloat(amount);
      if (isNaN(parsedAmountValue) || parsedAmountValue <= 0) {
        throw new Error(
          `Invalid amount: ${amount}. Please enter a valid positive number.`
        );
      }

      const rawAmount = convertAmountToRaw(amount, decimals);

      // Validate raw amount is not zero
      if (rawAmount === "0" || BigInt(rawAmount) <= BigInt(0)) {
        throw new Error(
          `Amount conversion resulted in zero. Original amount: ${amount}, Decimals: ${decimals}, Raw: ${rawAmount}`
        );
      }

      console.log(`[BorrowModal] Amount conversion:`, {
        originalAmount: amount,
        parsedAmount: parsedAmountValue,
        decimals,
        rawAmount,
        rawAmountBigInt: BigInt(rawAmount).toString(),
        coinSymbol: asset.symbol,
        activeTab,
        note:
          activeTab === "repay"
            ? "Note: For repay, amount will be converted to note tokens in executeRepayV2"
            : "Note: For borrow, amount is in underlying tokens",
      });

      const txHash = await (
        activeTab === "borrow" ? executeBorrowV2 : executeRepayV2
      )({
        amount: rawAmount, // Raw underlying tokens (will be converted to note tokens for repay)
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

      // Refresh portfolio data after successful transaction (matching MovePosition)
      // MovePosition calls: postTransactionRefresh(address, brokerNames)
      // which refreshes: portfolio, wallet balances, and broker data
      // We wait a bit for transaction to be processed before refreshing
      setTimeout(async () => {
        if (walletAddress) {
          try {
            // Refresh portfolio data
            const superClient = new superJsonApiClient.SuperClient({
              BASE: movementApiBase,
            });
            const refreshedPortfolio =
              await superClient.default.getPortfolio(walletAddress);
            setPortfolioData(
              refreshedPortfolio as unknown as PortfolioResponse
            );

            // Refresh wallet balance
            if (asset?.symbol) {
              const balanceResponse = await fetch(
                `/api/balance?address=${encodeURIComponent(walletAddress)}&token=${encodeURIComponent(asset.symbol)}`
              );
              if (balanceResponse.ok) {
                const balanceData = await balanceResponse.json();
                if (balanceData.success && balanceData.balances?.length > 0) {
                  const tokenBalance = balanceData.balances.find((b: any) => {
                    const symbol = (b.metadata?.symbol || "").toUpperCase();
                    return symbol === asset.symbol.toUpperCase();
                  });
                  if (tokenBalance) {
                    setBalance(tokenBalance.formattedAmount || "0");
                  }
                }
              }
            }

            console.log(
              "[BorrowModal] Portfolio and balance refreshed after transaction"
            );
          } catch (refreshError) {
            console.warn(
              "[BorrowModal] Error refreshing data after transaction:",
              refreshError
            );
            // Don't fail the transaction if refresh fails
          }
        }

        // Call onSuccess callback if provided (for parent component refresh)
        if (onSuccess) {
          onSuccess();
        }
      }, 1500); // Wait 1.5s for transaction to be processed

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
                        // Use zone colors (matching MovePosition)
                        simHealthRed
                          ? "text-red-600 dark:text-red-400"
                          : simHealthYellow
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-green-600 dark:text-green-400"
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
                      {Math.max(
                        0,
                        activeTab === "borrow"
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

            {activeTab === "borrow" && maxBorrowFromPortfolio !== null && (
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 dark:text-zinc-400 text-sm">
                  Max Borrow (Your Limit)
                </span>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {maxBorrowFromPortfolio.toFixed(4)} {asset.symbol}
                </span>
              </div>
            )}
          </div>

          {/* More Button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="w-full text-blue-500 dark:text-blue-400 text-sm font-medium py-2 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          >
            {showMore ? "Less" : "More"}
          </button>

          {/* Warning Messages (matching MovePosition) */}
          {amount && parseFloat(amount) > 0 && activeTab === "borrow" && (
            <>
              {/* Yellow Zone Warning */}
              {simHealthYellow && !simHealthRed && !isLTVWarning && (
                <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-700 dark:text-yellow-400">
                  ⚠️ Warning: This borrow would reduce your health factor to{" "}
                  {displayHealthFactor?.toFixed(2)}x (warning zone: 1.2x -
                  1.5x). Consider borrowing less to maintain a safer position.
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
                  {(simLTV * 100).toFixed(1)}%, which exceeds the recommended
                  95% threshold. Consider borrowing less to maintain a safer
                  position.
                </div>
              )}
            </>
          )}

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
            ) : validationError ? (
              validationError
            ) : parsedAmount <= 0 ? (
              "Enter amount"
            ) : (
              `${activeTab === "borrow" ? "Borrow" : "Repay"} ${asset.symbol}`
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
