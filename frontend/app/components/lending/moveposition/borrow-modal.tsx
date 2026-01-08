"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMovementWallet } from "../../../hooks/useMovementWallet";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { type TokenInfo } from "../../../utils/shared/tokens";
import { getBrokerName } from "../../../utils/moveposition";
import {
  getCoinDecimals,
  convertAmountToRaw,
} from "../../../utils/shared/tokens";
// Unified transaction flow via TransactionService
import { useMovePositionBorrow } from "../../../hooks/useMovePositionBorrow";
import * as superJsonApiClient from "../../../../lib/super-json-api-client/src";
import { getMovementApiBase } from "@/lib/super-aptos-sdk/src/globals";
import { useTokenBalance } from "../../../hooks/useTokenBalance";
import { TransactionSuccessMessage } from "../../shared/modals";
import { getAssetIconUrl } from "../../../utils/shared/icons/asset-icon";

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
  inline?: boolean; // If true, renders inline without backdrop (for chat)
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

export function BorrowModal({
  isOpen,
  onClose,
  asset,
  walletAddress,
  healthFactor,
  onSuccess,
  inline = false,
}: BorrowModalProps) {
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();

  const movementApiBase = getMovementApiBase();

  const [activeTab, setActiveTab] = useState<"borrow" | "repay">("borrow");
  const [amount, setAmount] = useState("");
  const [showMore, setShowMore] = useState(false);

  // Use shared hook for token balance (must be before callbacks that use it)
  const {
    balance,
    loading: loadingBalance,
    refresh: fetchBalance,
  } = useTokenBalance({
    walletAddress,
    tokenSymbol: asset?.symbol || null,
    enabled: isOpen,
    autoRefresh: true,
  });

  // Use ref for fetchBalance to avoid dependency issues
  const fetchBalanceRef = useRef(fetchBalance);
  useEffect(() => {
    fetchBalanceRef.current = fetchBalance;
  }, [fetchBalance]);

  // Memoize callbacks to prevent infinite re-renders
  const handleBorrowSuccess = useCallback(() => {
    // Refresh portfolio and balance after transaction completes
    setTimeout(async () => {
      if (walletAddress) {
        try {
          const superClient = new superJsonApiClient.SuperClient({
            BASE: movementApiBase,
          });
          const refreshedPortfolio =
            await superClient.default.getPortfolio(walletAddress);
          setPortfolioData(refreshedPortfolio as unknown as PortfolioResponse);
          await fetchBalanceRef.current();
          console.log(
            "[BorrowModal] Portfolio and balance refreshed after transaction"
          );
        } catch (refreshError) {
          console.warn(
            "[BorrowModal] Error refreshing data after transaction:",
            refreshError
          );
        }
      }
      // Also bubble up success for parent listeners
      if (onSuccess) onSuccess();
    }, 1500);
  }, [walletAddress, onSuccess, movementApiBase]);

  const handleBorrowError = useCallback((err: string) => {
    setSubmitError(err);
  }, []);

  // Derived from unified borrow hook
  const borrow = useMovePositionBorrow({
    onSuccess: handleBorrowSuccess,
    onError: handleBorrowError,
  });

  const submitting =
    activeTab === "borrow" ? borrow.borrowing : borrow.repaying;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionStep, setSubmissionStep] = useState<string>("");

  // Token icon error state
  const [iconError, setIconError] = useState(false);

  // Compute icon URL
  const iconUrl = useMemo(() => {
    if (!asset) return null;
    setIconError(false); // Reset error when asset changes
    return getAssetIconUrl(asset.symbol, asset.token?.iconUri);
  }, [asset?.symbol, asset?.token?.iconUri]);

  // Get txHash from hook
  const txHash = borrow.txHash;

  // Track previous tab to detect tab switches
  const prevActiveTabRef = useRef<"borrow" | "repay">(activeTab);
  const [displayTxHash, setDisplayTxHash] = useState<string | null>(null);
  const [showButtonComplete, setShowButtonComplete] = useState(false);
  // Track last shown txHash per tab to prevent re-showing
  const lastShownTxHashRef = useRef<{
    borrow: string | null;
    repay: string | null;
  }>({
    borrow: null,
    repay: null,
  });
  const [portfolioData, setPortfolioData] = useState<PortfolioResponse | null>(
    null
  );
  const [brokerData, setBrokerData] =
    useState<superJsonApiClient.Broker | null>(null);
  const [simulatedRiskData, setSimulatedRiskData] = useState<any | null>(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  // Risk simulation state (matching MovePosition)
  const [simHealthFactor, setSimHealthFactor] = useState<number>(0);
  const [simHealthYellow, setSimHealthYellow] = useState<boolean>(false);
  const [simHealthRed, setSimHealthRed] = useState<boolean>(false);
  const [isSimHealthy, setIsSimHealthy] = useState<boolean>(false);
  const [isLTVWarning, setIsLTVWarning] = useState<boolean>(false);
  const [simLTV, setSimLTV] = useState<number>(0);

  const movementWallet = useMovementWallet();

  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setShowMore(false);
      setActiveTab("borrow");
      setSubmitError(null);
      setSubmissionStep("");
      setDisplayTxHash(null);
      setShowButtonComplete(false);
      // Reset hooks will be handled by the hooks themselves
      setSimulatedRiskData(null);
      lastShownTxHashRef.current = { borrow: null, repay: null };
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

  // Balance is automatically fetched by useTokenBalance hook

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

  // Amount input formatter
  const handleAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    const parts = numericValue.split(".");
    const formattedValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : numericValue;
    setAmount(formattedValue);
  };

  // User's current borrowed amount for the selected asset (in underlying tokens)
  // Calculated from note token balance * exchange rate
  const userBorrowedAmount = useMemo(() => {
    if (!portfolioData || !asset || !brokerData) return 0;
    const brokerName = getBrokerName(asset.symbol);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;
    const liability = portfolioData.liabilities.find(
      (l) => l.instrument.name === loanNoteName
    );
    if (!liability) return 0;
    const loanNoteDecimals =
      brokerData.loanNote?.decimals ?? getCoinDecimals(asset.symbol);
    const loanNoteExchangeRate = brokerData.loanNoteExchangeRate || 1;
    // Calculate from raw note token amount to avoid floating point precision issues
    const noteBalanceRaw = BigInt(liability.amount);
    const noteBalanceFormatted =
      Number(noteBalanceRaw) / Math.pow(10, loanNoteDecimals);
    // Convert to underlying tokens: noteBalance * exchangeRate
    const underlyingAmount = noteBalanceFormatted * loanNoteExchangeRate;
    // Floor to 8 decimal places to match MovePosition's precision
    return Math.floor(underlyingAmount * 1e8) / 1e8;
  }, [portfolioData, asset, brokerData]);

  // Current health factor from portfolio API or prop
  const currentHealthFactor = useMemo(() => {
    if (portfolioData?.evaluation?.health_ratio) {
      return portfolioData.evaluation.health_ratio;
    }
    return healthFactor || 0;
  }, [portfolioData, healthFactor]);

  // Max borrow amount from portfolio API for the selected asset
  const maxBorrowFromPortfolio = useMemo(() => {
    if (!portfolioData?.maxBorrow || !asset) return null;
    const brokerName = getBrokerName(asset.symbol);
    const loanNoteName = `${brokerName}-super-aptos-loan-note`;
    const maxBorrowValue = (portfolioData.maxBorrow as any)[loanNoteName];
    if (!maxBorrowValue) return null;
    const maxBorrowAmount = parseFloat(maxBorrowValue);
    if (isNaN(maxBorrowAmount) || maxBorrowAmount <= 0) return null;
    return maxBorrowAmount;
  }, [portfolioData, asset]);

  const handleSubmit = async () => {
    if (!asset || !walletAddress || !movementWallet) {
      setSubmitError("Missing wallet or asset information");
      return;
    }
    setSubmitError(null);

    // Derive constraints for validation
    const borrowPower = maxBorrowFromPortfolio ?? null;
    const availableLiquidity = asset.availableLiquidity ?? null;

    let ok = false;
    if (activeTab === "borrow") {
      ok = await borrow.handleBorrow(
        { symbol: asset.symbol, token: asset.token },
        amount,
        borrowPower,
        availableLiquidity
      );
    } else {
      ok = await borrow.handleRepay(
        { symbol: asset.symbol, token: asset.token },
        amount,
        userBorrowedAmount || null
      );
    }

    if (ok) {
      // Reset form state after successful transaction
      setAmount("");
    }
  };

  // Reflect hook progress state into local submissionStep (in useEffect to avoid infinite renders)
  useEffect(() => {
    const hookStep = borrow.step;
    if (hookStep !== submissionStep) {
      setSubmissionStep(hookStep || "");
    }
  }, [borrow.step, submissionStep]);

  // Clear txHash display and button state when switching tabs
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      // Tab switched - clear the displayed txHash and button state immediately
      setDisplayTxHash(null);
      setShowButtonComplete(false);
      prevActiveTabRef.current = activeTab;
    }
  }, [activeTab]);

  // Show notification when txHash appears on current tab - only if it's a new txHash
  // Also reset amount input when transaction completes
  useEffect(() => {
    if (activeTab === "borrow" && borrow.txHash) {
      // Only show if this is a new txHash we haven't shown before
      if (borrow.txHash !== lastShownTxHashRef.current.borrow) {
        setDisplayTxHash(borrow.txHash);
        lastShownTxHashRef.current.borrow = borrow.txHash;
        // Reset amount input when transaction completes
        setAmount("");
      }
    } else if (activeTab === "repay" && borrow.txHash) {
      // Only show if this is a new txHash we haven't shown before
      if (borrow.txHash !== lastShownTxHashRef.current.repay) {
        setDisplayTxHash(borrow.txHash);
        lastShownTxHashRef.current.repay = borrow.txHash;
        // Reset amount input when transaction completes
        setAmount("");
      }
    } else if (
      (activeTab === "borrow" && !borrow.txHash) ||
      (activeTab === "repay" && !borrow.txHash)
    ) {
      // Clear displayTxHash when current tab's txHash is cleared
      setDisplayTxHash(null);
    }
  }, [activeTab, borrow.txHash]);

  // Show "Transaction Complete" on button briefly, then clear immediately
  // This ensures button state clears as soon as notification appears
  useEffect(() => {
    if (borrow.txHash && !showButtonComplete) {
      setShowButtonComplete(true);
      // Clear button state immediately (notification handles the success display)
      const timer = setTimeout(() => {
        setShowButtonComplete(false);
      }, 100); // Very short delay just for visual feedback

      return () => clearTimeout(timer);
    }
    // Also clear if txHash disappears
    if (!borrow.txHash && showButtonComplete) {
      setShowButtonComplete(false);
    }
  }, [borrow.txHash, showButtonComplete]);

  const handleTabSwitch = (tab: "borrow" | "repay") => {
    setActiveTab(tab);
    setAmount("");
    // Reset hooks will be handled by the hooks themselves
    setSimulatedRiskData(null);
    setShowButtonComplete(false);
  };
  // Build next portfolio state for risk simulation API
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
   * For borrow tab: only if there's collateral
   * For repay tab: always simulate (repaying improves health factor)
   */
  const shouldGetRiskEval = (): boolean => {
    if (!buildNextPortfolioState) {
      return false;
    }

    if (activeTab === "borrow") {
      // For borrow: only simulate if there's collateral
      const hasCollateral = buildNextPortfolioState.collaterals.some(
        (c) => BigInt(c.amount) > 0
      );
      return hasCollateral;
    } else if (activeTab === "repay") {
      // For repay: always simulate (repaying reduces debt, improves health factor)
      return true;
    }

    return false;
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
   * Always returns underlying token amount (not note tokens)
   */
  const maxRepayAmount = useMemo(() => {
    if (userBorrowedAmount <= 0) return 0;
    // If balance is not loaded yet, use borrowed amount (user can still click Max)
    if (!balance || parseFloat(balance) <= 0) {
      return userBorrowedAmount;
    }
    // Return minimum of wallet balance and borrowed amount (both in underlying tokens)
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
    } else if (activeTab === "repay") {
      // Max repay: use borrowed amount if available, otherwise use wallet balance
      // Always display in underlying tokens (not note tokens)
      if (userBorrowedAmount > 0) {
        // Calculate max amount (min of balance and borrowed amount)
        let maxAmount = userBorrowedAmount;
        if (balance && parseFloat(balance) > 0) {
          maxAmount = Math.min(parseFloat(balance), userBorrowedAmount);
        }
        // Floor to 8 decimal places and ensure it doesn't exceed userBorrowedAmount
        // This prevents floating point precision issues
        const flooredAmount = Math.min(
          Math.floor(maxAmount * 1e8) / 1e8,
          userBorrowedAmount
        );
        setAmount(
          Math.max(0, flooredAmount)
            .toFixed(8)
            .replace(/\.?0+$/, "")
        );
      } else if (balance && parseFloat(balance) > 0) {
        // Fallback to wallet balance if no borrowed amount
        const flooredBalance = Math.floor(parseFloat(balance) * 1e8) / 1e8;
        setAmount(flooredBalance.toFixed(8).replace(/\.?0+$/, ""));
      }
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
      // Check if exceeds wallet balance (with small tolerance for floating point precision)
      if (balance && parsedAmount > parseFloat(balance) + 0.000001) {
        return "Exceeds wallet balance";
      }
      // Check if exceeds borrowed amount (with small tolerance for floating point precision)
      // Allow tiny differences due to rounding (0.000001 tolerance)
      if (parsedAmount > userBorrowedAmount + 0.000001) {
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
    return portfolioData.collaterals.some((c) => BigInt(c.amount) > 0);
  }, [portfolioData]);

  if (!isOpen || !asset) {
    return null;
  }

  const baseClasses = inline
    ? "w-full max-w-md mx-auto rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900 shadow-lg"
    : "relative w-[calc(100%-2rem)] sm:w-[calc(100%-4rem)] max-w-sm sm:max-w-md rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl";

  const content = (
    <div className={baseClasses}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-lg md:text-xl font-semibold text-zinc-950 dark:text-zinc-50 truncate">
            {activeTab === "borrow" ? "Borrow" : "Repay"} {asset.symbol}
          </h2>
        </div>
        {!inline && (
          <button
            onClick={onClose}
            className="ml-2 flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1"
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6"
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
        )}
      </div>

      {/* Tabs */}
      <div className="flex p-1.5 sm:p-2 gap-1.5 sm:gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => {
            handleTabSwitch("borrow");
          }}
          className={`flex-1 py-2 sm:py-3 text-xs sm:text-sm rounded-md font-medium transition-colors ${
            activeTab === "borrow"
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Borrow
        </button>
        <button
          onClick={() => {
            handleTabSwitch("repay");
          }}
          className={`flex-1 py-2 sm:py-3 text-xs sm:text-sm font-medium rounded-md transition-colors ${
            activeTab === "repay"
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Repay
        </button>
      </div>

      {/* Form Content */}
      <div className="p-4 sm:p-6">
        {/* Amount Input */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            {iconUrl && !iconError ? (
              <img
                src={iconUrl}
                alt={asset.symbol}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
                onError={() => setIconError(true)}
              />
            ) : (
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs sm:text-sm">
                  {asset.symbol.charAt(0)}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-xl sm:text-2xl md:text-3xl text-zinc-500 dark:text-zinc-400 font-light outline-none"
              />
              <div className="text-zinc-500 dark:text-zinc-400 text-[10px] sm:text-xs md:text-sm mt-0.5 sm:mt-1">
                ${usdValue.toFixed(2)}
              </div>
            </div>
            <button
              onClick={handleMax}
              className="px-3 sm:px-4 py-1.5 sm:py-1 bg-blue-500 text-white text-xs sm:text-sm font-medium rounded hover:bg-blue-400 transition-colors flex-shrink-0"
            >
              Max
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
          <div className="flex justify-between items-center flex-wrap gap-1 sm:gap-0">
            <span className="text-[10px] sm:text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
              Health factor
              {loadingSimulation && (
                <span className="ml-1 sm:ml-1.5 sm:ml-2 text-[9px] sm:text-[10px] md:text-xs text-zinc-400">
                  (simulating...)
                </span>
              )}
            </span>
            <span className="text-[10px] sm:text-xs md:text-sm font-medium flex items-center gap-1 sm:gap-2 flex-wrap">
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

          <div className="flex justify-between items-center flex-wrap gap-1 sm:gap-0">
            <span className="text-[10px] sm:text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
              Borrowed
            </span>
            <span className="text-[10px] sm:text-xs md:text-sm font-medium flex items-center gap-1 sm:gap-2 flex-wrap">
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

          <div className="flex justify-between items-center flex-wrap gap-1 sm:gap-0">
            <span className="text-[10px] sm:text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
              Borrow APY
            </span>
            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-red-600 dark:text-red-400">
              {asset.borrowApy.toFixed(2)}%
            </span>
          </div>

          <div className="flex justify-between items-center flex-wrap gap-1 sm:gap-0">
            <span className="text-[10px] sm:text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
              Available Liquidity
            </span>
            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {asset.availableLiquidity.toFixed(4)} {asset.symbol}
            </span>
          </div>

          {activeTab === "repay" && userBorrowedAmount > 0 && (
            <div className="flex justify-between items-center flex-wrap gap-1 sm:gap-0">
              <span className="text-[10px] sm:text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
                Available to repay
              </span>
              <span className="text-[10px] sm:text-xs md:text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {maxRepayAmount.toFixed(6)} {asset.symbol}
              </span>
            </div>
          )}

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
                {displayHealthFactor?.toFixed(2)}x (warning zone: 1.2x - 1.5x).
                Consider borrowing less to maintain a safer position.
              </div>
            )}

            {/* Red Zone Warning */}
            {simHealthRed && !isLTVWarning && (
              <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[10px] sm:text-xs md:text-sm text-red-700 dark:text-red-400">
                🚨 Danger: This borrow would make your position unhealthy
                (health factor ≤ 1.2x). Your position may be at risk of
                liquidation. Please reduce the amount.
              </div>
            )}

            {/* LTV Warning */}
            {isLTVWarning && isSimHealthy && simLTV > 0 && (
              <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-[10px] sm:text-xs md:text-sm text-orange-700 dark:text-orange-400">
                ⚠️ LTV Warning: This borrow would result in an LTV of{" "}
                {(simLTV * 100).toFixed(1)}%, which exceeds the recommended 95%
                threshold. Consider borrowing less to maintain a safer position.
              </div>
            )}
          </>
        )}

        {/* Error Message */}
        {submitError && (
          <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[10px] sm:text-xs md:text-sm text-red-700 dark:text-red-400">
            {submitError}
          </div>
        )}

        {/* Success Message - Self-managing, shows for 5 seconds then auto-dismisses */}
        {/* Key ensures component unmounts completely when displayTxHash changes */}
        {displayTxHash && (
          <TransactionSuccessMessage
            key={displayTxHash}
            txHash={displayTxHash}
            onClose={() => {
              // Clear displayTxHash when notification closes
              // The lastShownTxHashRef prevents it from showing again
              setDisplayTxHash(null);
              setShowButtonComplete(false);
            }}
          />
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={(!canReview || submitting) && !borrow.txHash}
          className={`w-full font-semibold py-2.5 sm:py-3 md:py-3.5 rounded-lg transition-all duration-200 mt-3 sm:mt-4 shadow-lg text-xs sm:text-sm md:text-base ${
            borrow.txHash
              ? "bg-green-600 text-white cursor-pointer"
              : canReview && !submitting
                ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-xl active:scale-[0.98] cursor-pointer"
                : "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
          }`}
        >
          {displayTxHash && showButtonComplete ? (
            <span className="flex items-center justify-center gap-1.5 sm:gap-2">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Transaction Complete
            </span>
          ) : submitting ? (
            <span className="flex items-center justify-center gap-1.5 sm:gap-2">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 animate-spin"
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
              {submissionStep ||
                (activeTab === "borrow" ? "Borrowing..." : "Repaying...")}
            </span>
          ) : validationError ? (
            validationError
          ) : parsedAmount <= 0 ? (
            "Enter amount"
          ) : activeTab === "borrow" ? (
            <span className="flex items-center justify-center gap-1.5 sm:gap-2">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              Borrow {asset.symbol}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5 sm:gap-2">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                />
              </svg>
              Repay {asset.symbol}
            </span>
          )}
        </button>

        {/* Wallet Balance */}
        <div className="flex justify-between items-center mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-zinc-200 dark:border-zinc-800 flex-wrap gap-1 sm:gap-0">
          <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Wallet balance
          </span>
          <span className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2 flex-wrap">
            {loadingBalance ? (
              <span className="text-zinc-400">Loading...</span>
            ) : balance ? (
              <>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {parseFloat(balance).toFixed(4)} {asset.symbol}
                </span>
                {amount && parseFloat(amount) > 0 && activeTab === "repay" && (
                  <>
                    <span className="text-yellow-500">→</span>
                    <span className="text-zinc-900 dark:text-zinc-50">
                      {(parseFloat(balance) - parseFloat(amount)).toFixed(4)}{" "}
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
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6">
      {content}
    </div>
  );
}
