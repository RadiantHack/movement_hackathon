"use client";

import { useState, useEffect, useMemo } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { type TokenInfo } from "../utils/tokens";
import { getBrokerName } from "../utils/lending-transaction";
import { getCoinDecimals, convertAmountToRaw } from "../utils/token-utils";
import { executeLendV2, executeRedeemV2 } from "../utils/lend-v2-utils";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";
import { getMovementApiBase } from "@/lib/super-aptos-sdk/src/globals";
import { selectBroker, validateBroker } from "../utils/broker-selection";

// Utility functions for formatting (matching MovePosition's format.ts)
function prettyTokenBal(num: number): string {
  if (num === 0) {
    return "0";
  } else if (num < 1) {
    return num.toFixed(8).replace(/\.?0+$/, "");
  } else if (num < 1000) {
    return num.toFixed(4).replace(/\.?0+$/, "");
  } else if (num < 1_000_000) {
    return Math.floor(num).toString();
  } else if (num < 1_000_000_000) {
    return (num / 1_000_000).toFixed(1) + "M";
  } else if (num < 1_000_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + "B";
  }
  return num.toString();
}

function formatPercentage(num: number): string {
  if (num === 0 || num < 0.0001) {
    return "0%";
  }
  return (num * 100).toFixed(2) + "%";
}

// Calculate interest rate from utilization and interest rate curve (matching MovePosition's SDK)
function getInterestRate(
  utilization: number,
  interestRateCurve: {
    u1: number;
    u2: number;
    r0: number;
    r1: number;
    r2: number;
    r3: number;
  }
): number {
  if (utilization === 0) {
    return interestRateCurve.r0;
  }

  const u1 = interestRateCurve.u1;
  const u2 = interestRateCurve.u2;

  if (utilization < u1) {
    return interpolate(
      utilization,
      0,
      u1,
      interestRateCurve.r0,
      interestRateCurve.r1
    );
  } else if (utilization < u2) {
    return interpolate(
      utilization,
      u1,
      u2,
      interestRateCurve.r1,
      interestRateCurve.r2
    );
  } else {
    return interpolate(
      utilization,
      u2,
      1,
      interestRateCurve.r2,
      interestRateCurve.r3
    );
  }
}

function interpolate(
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

// Calculate lending rate (matching MovePosition's calcLendRate)
function calcLendRate(
  borrowRate: number,
  interestFeeRate: number,
  utilization: number
): number {
  return borrowRate * (1 - interestFeeRate) * utilization;
}

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
  const [selectedBroker, setSelectedBroker] =
    useState<superJsonApiClient.Broker | null>(null);
  const [simulatedRiskData, setSimulatedRiskData] = useState<any | null>(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>("");

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

  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setShowMore(false);
      setActiveTab("supply");
      setSubmitError(null);
      setTxHash(null);
      setSubmissionStep("");
      setSimulatedRiskData(null);
      return;
    }
  }, [isOpen]);

  const handleTabSwitch = (tab: "supply" | "withdraw") => {
    setActiveTab(tab);
    setAmount("");
    setSubmitError(null);
    setTxHash(null);
    setSubmissionStep("");
    setSimulatedRiskData(null);
  };

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

  // Fetch portfolio data for risk simulation and select broker
  useEffect(() => {
    if (!walletAddress || !isOpen || !asset) {
      setPortfolioData(null);
      setBrokerData([]);
      setSelectedBroker(null);
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

        setPortfolioData(portfolioRes as unknown as PortfolioResponse);
        setBrokerData(brokersRes as unknown as any[]);

        // Select broker using robust selection logic (matching MovePosition)
        const broker = selectBroker({
          symbol: asset.symbol,
          brokers: brokersRes as unknown as superJsonApiClient.Broker[],
          walletAddress,
          preferFungibleAsset: true,
        });

        if (validateBroker(broker)) {
          setSelectedBroker(broker);
          console.log("[SupplyModal] Selected broker:", {
            name: broker.underlyingAsset.name,
            networkAddress: broker.underlyingAsset.networkAddress,
            symbol: asset.symbol,
          });
        } else {
          console.warn(
            "[SupplyModal] Failed to select valid broker for symbol:",
            asset.symbol
          );
          setSelectedBroker(null);
        }
      } catch (error) {
        console.error("Error fetching portfolio/brokers:", error);
        setPortfolioData(null);
        setBrokerData([]);
        setSelectedBroker(null);
      } finally {
        setLoadingPortfolio(false);
      }
    };

    fetchPortfolioAndBrokers();
  }, [walletAddress, isOpen, movementApiBase, asset?.symbol]);

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
   * Uses selectedBroker for more reliable matching
   */
  const userSuppliedAmount = useMemo(() => {
    if (!portfolioData || !asset || !selectedBroker) return 0;

    // Use selectedBroker's depositNote name for matching
    const depositNoteName = selectedBroker.depositNote?.name;
    if (!depositNoteName) return 0;

    const collateral = portfolioData.collaterals.find(
      (c) => c.instrument.name === depositNoteName
    );

    if (!collateral) return 0;

    // Get deposit note exchange rate from selected broker
    const exchangeRate = selectedBroker.depositNoteExchangeRate || 1;

    // scaledAmount × depositNoteExchangeRate = actual underlying amount
    return parseFloat(collateral.scaledAmount) * exchangeRate;
  }, [portfolioData, asset, selectedBroker]);

  /**
   * Get current health factor from portfolio data
   * Matching MovePosition's selectHealthFactor and calcHealthFactor logic
   * Formula: equity / minRequiredEquity
   * where equity = total_collateral - total_liability
   * and minRequiredEquity = mm (from evaluation) or requiredEquity (from risk)
   */
  const currentHealthFactor = useMemo(() => {
    // If portfolio not loaded, return null (will show N/A)
    if (!portfolioData) {
      return null;
    }

    // Calculate equity = total_collateral - total_liability (matching MovePosition)
    const totalCollateral = portfolioData.evaluation?.total_collateral ?? 0;
    const totalLiability = portfolioData.evaluation?.total_liability ?? 0;
    const equity = totalCollateral - totalLiability;

    // Get minRequiredEquity from mm (evaluation) or requiredEquity (risk)
    // Matching MovePosition's calcHealthFactor: minReq = simRisk.mm
    const minRequiredEquity =
      portfolioData.evaluation?.mm ?? portfolioData.risk?.requiredEquity ?? 0;

    // If no required equity, can't calculate health factor
    if (minRequiredEquity <= 0) {
      return null;
    }

    // Calculate health factor: equity / minRequiredEquity
    const calculatedHF = equity / minRequiredEquity;

    // If health factor is invalid, return null
    if (calculatedHF <= 0 || !isFinite(calculatedHF)) {
      return null;
    }

    // Prefer API health_ratio if available and valid, otherwise use calculated
    if (
      portfolioData.evaluation?.health_ratio &&
      portfolioData.evaluation.health_ratio > 0 &&
      isFinite(portfolioData.evaluation.health_ratio)
    ) {
      return portfolioData.evaluation.health_ratio;
    }

    return calculatedHF;
  }, [portfolioData]);

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

    // Use selectedBroker's depositNote name for matching (more reliable)
    if (!selectedBroker?.depositNote?.name) {
      return null;
    }
    const depositNoteName = selectedBroker.depositNote.name;

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
          BASE: movementApiBase,
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
  }, [buildNextPortfolioState, amount, movementApiBase]);

  /**
   * Handle Max button click - works for both Supply and Withdraw tabs
   * Matching MovePosition's setMax logic
   */
  const handleMax = () => {
    if (activeTab === "supply") {
      // For supply: use min of wallet balance and available deposit space
      // Matching MovePosition's walletBalanceOrDepositDiffLessShaved
      if (maxDepositableAmount !== null && maxDepositableAmount > 0) {
        // Floor to 8 decimals like MovePosition
        const floored = Math.floor(maxDepositableAmount * 1e8) / 1e8;
        setAmount(floored.toFixed(6));
      } else if (balance && parseFloat(balance) > 0) {
        // Fallback to wallet balance if maxDepositableAmount not calculated
        setAmount(balance);
      }
    } else {
      // For withdraw: use max withdrawable (min of supplied amount and available liquidity)
      // Matching MovePosition's maxWithdrawUnderlyingUserShaved
      if (maxWithdrawableAmount > 0) {
        // Format to avoid floating point issues, floor to 8 decimals like MovePosition
        const floored = Math.floor(maxWithdrawableAmount * 1e8) / 1e8;
        setAmount(floored.toFixed(6));
      }
    }
  };

  const usdValue = amount && asset ? parseFloat(amount) * asset.price : 0;

  // Calculate max withdrawable amount (matching MovePosition's maxWithdrawUnderlyingUser)
  // Max withdraw = min(userSuppliedAmount, availableLiquidity)
  // Uses selectedBroker for more reliable matching
  const maxWithdrawableAmount = useMemo(() => {
    if (activeTab !== "withdraw" || !selectedBroker) return 0;

    // Available liquidity is already in scaled (normalized) format
    const availableLiquidity = parseFloat(
      selectedBroker.scaledAvailableLiquidityUnderlying || "0"
    );

    // Return minimum of user's supplied amount and available liquidity
    return Math.min(userSuppliedAmount, availableLiquidity);
  }, [activeTab, selectedBroker, userSuppliedAmount]);

  // Calculate max depositable amount (matching MovePosition's walletBalanceOrDepositDiffLess)
  // Max deposit = min(walletBalance, depositDiffToBrokerLimit)
  // Uses selectedBroker for more reliable matching
  const maxDepositableAmount = useMemo(() => {
    if (activeTab !== "supply" || !selectedBroker) return null;

    // Use Number() like MovePosition does (line 250)
    const maxDepositScaled = Number(selectedBroker.maxDepositScaled || "0");
    const scaledTotalBorrowed = Number(
      selectedBroker.scaledTotalBorrowedUnderlying || "0"
    );
    const scaledAvailableLiquidity = Number(
      selectedBroker.scaledAvailableLiquidityUnderlying || "0"
    );
    const brokerTotal = scaledTotalBorrowed + scaledAvailableLiquidity;
    const depositDiffToBrokerLimit = maxDepositScaled - brokerTotal;

    // Pool is full if depositDiffToBrokerLimit <= 0
    if (depositDiffToBrokerLimit <= 0) {
      return 0; // Pool is full
    }

    const walletBalance = balance ? parseFloat(balance) : 0;

    // Return minimum of wallet balance and available deposit space
    return Math.min(walletBalance, depositDiffToBrokerLimit);
  }, [activeTab, selectedBroker, balance]);

  // Calculate next total supplied (matching MovePosition's nextTotalSupplied calculation)
  // nextTotalSupplied = nextAvailable + nextTotalBorrowed
  // This is used to check overBrokerDepositLimit
  const nextTotalSupplied = useMemo(() => {
    if (!selectedBroker || !amount || parseFloat(amount) <= 0) return null;

    const amountNum = parseFloat(amount);
    const scaledTotalBorrowed = Number(
      selectedBroker.scaledTotalBorrowedUnderlying || "0"
    );
    const scaledAvailableLiquidity = Number(
      selectedBroker.scaledAvailableLiquidityUnderlying || "0"
    );

    if (activeTab === "supply") {
      // For supply: available increases, total supplied increases
      const nextAvailable = scaledAvailableLiquidity + amountNum;
      const nextTotalSupplied = nextAvailable + scaledTotalBorrowed;
      return nextTotalSupplied;
    } else if (activeTab === "withdraw") {
      // For withdraw: available decreases, total supplied decreases
      const nextAvailable = Math.max(0, scaledAvailableLiquidity - amountNum);
      const nextTotalSupplied = nextAvailable + scaledTotalBorrowed;
      return nextTotalSupplied;
    }

    return null;
  }, [selectedBroker, amount, activeTab]);

  // Check overBrokerDepositLimit (matching MovePosition's line 254)
  // overBrokerDepositLimit = nextTotalSupplied > maxSupplyBroker
  const overBrokerDepositLimit = useMemo(() => {
    if (activeTab !== "supply" || !selectedBroker || !nextTotalSupplied)
      return false;

    const maxSupplyBroker = Number(selectedBroker.maxDepositScaled || "0");
    return nextTotalSupplied > maxSupplyBroker;
  }, [activeTab, selectedBroker, nextTotalSupplied]);

  // Check poolIsFull (matching MovePosition's line 257)
  const poolIsFull = useMemo(() => {
    if (activeTab !== "supply" || !selectedBroker) return false;

    const maxDepositScaled = Number(selectedBroker.maxDepositScaled || "0");
    const scaledTotalBorrowed = Number(
      selectedBroker.scaledTotalBorrowedUnderlying || "0"
    );
    const scaledAvailableLiquidity = Number(
      selectedBroker.scaledAvailableLiquidityUnderlying || "0"
    );
    const brokerTotal = scaledTotalBorrowed + scaledAvailableLiquidity;
    const depositDiffToBrokerLimit = maxDepositScaled - brokerTotal;

    return depositDiffToBrokerLimit <= 0;
  }, [activeTab, selectedBroker]);

  // Check if amount exceeds limits (matching MovePosition's overLimit logic)
  // For DEPOSIT_TAB: over = over || poolIsFull || overBrokerDepositLimit (line 350)
  const isOverLimit = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) return false;

    const amountNum = parseFloat(amount);

    if (activeTab === "supply") {
      // For supply: check wallet balance and deposit limit
      const overWalletBalance = balance
        ? amountNum > parseFloat(balance)
        : true;

      // Check deposit limit (matching MovePosition's overLimit logic line 350)
      // isOver = over || poolIsFull || overBrokerDepositLimit
      return overWalletBalance || poolIsFull || overBrokerDepositLimit;
    } else {
      // For withdraw: check against max withdrawable
      return amountNum > maxWithdrawableAmount;
    }
  }, [
    amount,
    activeTab,
    balance,
    maxWithdrawableAmount,
    poolIsFull,
    overBrokerDepositLimit,
  ]);

  // Get error message for over limit (matching MovePosition's overLimitInfoBox line 409)
  const overLimitErrorMessage = useMemo(() => {
    if (!isOverLimit || activeTab !== "supply") return null;

    if (poolIsFull) {
      return `${asset?.symbol || "Token"} pool is full. Pool limits are set by the broker and can be adjusted. They are in place to protect the health of the pool and the safety of the users.`;
    }
    if (overBrokerDepositLimit) {
      return `Amount exceeds max deposit value set for ${asset?.symbol || "token"} by broker`;
    }
    if (balance && parseFloat(amount) > parseFloat(balance)) {
      return `Amount exceeds wallet balance of ${asset?.symbol || "token"}`;
    }

    return null;
  }, [
    isOverLimit,
    activeTab,
    poolIsFull,
    overBrokerDepositLimit,
    asset,
    balance,
    amount,
  ]);

  // Check health factor simulation (matching MovePosition's simHealthRed)
  const simHealthRed = useMemo(() => {
    if (!simulatedRiskData?.health_ratio) return false;
    const simHealthFactor = simulatedRiskData.health_ratio;
    // Red zone: health factor <= 1.2 (matching MovePosition's isRedZone)
    return simHealthFactor <= 1.2;
  }, [simulatedRiskData]);

  // Check if user would become unhealthy (health factor <= 1.0)
  const isSimUnhealthy = useMemo(() => {
    if (!simulatedRiskData?.health_ratio) return false;
    return simulatedRiskData.health_ratio <= 1.0;
  }, [simulatedRiskData]);

  // Calculate Supply APY (current and next) matching MovePosition's logic
  // Uses selectedBroker for more reliable matching
  // Uses Number() like MovePosition does (line 224-225)
  const supplyAPY = useMemo(() => {
    if (!selectedBroker || !asset) return { current: 0, next: null };

    const broker = selectedBroker;

    if (!broker.interestRateCurve)
      return { current: asset.supplyApy / 100, next: null };

    // Current utilization and rates (matching MovePosition's calcUtil line 60-65)
    // Use Number() like MovePosition does (line 224-225)
    const totalAvailable = Number(
      broker.scaledAvailableLiquidityUnderlying || "0"
    );
    const totalLoaned = Number(broker.scaledTotalBorrowedUnderlying || "0");
    const totalSupplied = totalAvailable + totalLoaned;
    const utilization = totalSupplied > 0 ? totalLoaned / totalSupplied : 0;

    // Current borrow interest rate from curve
    const currentBorrowInterestRate = getInterestRate(
      utilization,
      broker.interestRateCurve
    );
    const stabilityFeeRate = 0.0015; // 0.15%
    const currentBorrowAPR = currentBorrowInterestRate + stabilityFeeRate;

    // Current Supply APY = calcLendRate(borrowInterestRate, interestFeeRate, utilization)
    // Note: MovePosition uses broker.interestRate (which is already calculated) for current
    // But for next, they recalculate from the curve
    const currentSupplyAPY = calcLendRate(
      broker.interestRate || currentBorrowInterestRate,
      broker.interestFeeRate || 0.22,
      utilization
    );

    // Calculate next values if amount is entered
    const hasInput = amount && parseFloat(amount) > 0;
    let nextSupplyAPY: number | null = null;

    if (hasInput) {
      let nextAvailable = totalAvailable;
      let nextTotalLoaned = totalLoaned;
      let nextTotalSupplied = totalSupplied;

      if (activeTab === "supply") {
        // For supply: available increases, total supplied increases
        nextAvailable = totalAvailable + parseFloat(amount);
        nextTotalSupplied = totalSupplied + parseFloat(amount);
      } else if (activeTab === "withdraw") {
        // For withdraw: available decreases, total supplied decreases
        nextAvailable = Math.max(0, totalAvailable - parseFloat(amount));
        nextTotalSupplied = Math.max(0, totalSupplied - parseFloat(amount));
      }

      const nextUtilization =
        nextTotalSupplied > 0 ? nextTotalLoaned / nextTotalSupplied : 0;

      // Next borrow interest rate from curve
      const nextBorrowInterestRate = getInterestRate(
        nextUtilization,
        broker.interestRateCurve
      );
      const nextBorrowAPR = nextBorrowInterestRate + stabilityFeeRate;

      // Next Supply APY
      nextSupplyAPY = calcLendRate(
        nextBorrowAPR,
        broker.interestFeeRate || 0.22,
        nextUtilization
      );
    }

    return {
      current: currentSupplyAPY,
      next: hasInput ? nextSupplyAPY : null,
    };
  }, [selectedBroker, asset, amount, activeTab]);

  // Calculate broker stats (matching MovePosition's brokerStats)
  // Uses selectedBroker for more reliable matching
  // Uses Number() like MovePosition does (line 224-225)
  const brokerStats = useMemo(() => {
    if (!selectedBroker || !asset) return null;

    const broker = selectedBroker;

    // Use Number() like MovePosition does (line 224-225)
    const totalAvailable = Number(
      broker.scaledAvailableLiquidityUnderlying || "0"
    );
    const totalLoaned = Number(broker.scaledTotalBorrowedUnderlying || "0");
    const totalSupplied = totalAvailable + totalLoaned;
    const poolMaxLimit = Number(broker.maxDepositScaled || "0");
    // Calculate utilization matching MovePosition's calcUtil (line 60-65)
    const utilization = totalSupplied > 0 ? totalLoaned / totalSupplied : 0;

    // Calculate next values if amount is entered
    const hasInput = amount && parseFloat(amount) > 0;
    const inputAmount = hasInput ? parseFloat(amount) : 0;

    let nextAvailable = totalAvailable;
    let nextTotalLoaned = totalLoaned;
    let nextTotalSupplied = totalSupplied;
    let nextUtilization = utilization;

    if (hasInput && activeTab === "supply") {
      // For supply: available increases, total supplied increases
      nextAvailable = totalAvailable + inputAmount;
      nextTotalSupplied = totalSupplied + inputAmount;
      nextUtilization =
        nextTotalSupplied > 0 ? nextTotalLoaned / nextTotalSupplied : 0;
    } else if (hasInput && activeTab === "withdraw") {
      // For withdraw: available decreases, total supplied decreases
      nextAvailable = Math.max(0, totalAvailable - inputAmount);
      nextTotalSupplied = Math.max(0, totalSupplied - inputAmount);
      nextUtilization =
        nextTotalSupplied > 0 ? nextTotalLoaned / nextTotalSupplied : 0;
    }

    return {
      totalAvailable,
      totalLoaned,
      totalSupplied,
      poolMaxLimit,
      utilization,
      nextAvailable: hasInput ? nextAvailable : null,
      nextTotalLoaned: hasInput ? nextTotalLoaned : null,
      nextTotalSupplied: hasInput ? nextTotalSupplied : null,
      nextUtilization: hasInput ? nextUtilization : null,
    };
  }, [selectedBroker, asset, amount, activeTab]);

  // Zero input check (matching MovePosition's zeroInput)
  const zeroInput = !amount || parseFloat(amount) <= 0;

  // Final canReview logic matching MovePosition's disabledForm
  // disabledForm = !isLoadedUser || overLimit() || zeroInput || isSimulatedLoading
  // For WITHDRAW: overLimit = over || simHealthRed || isLTVWarning
  const canReview =
    ready &&
    authenticated &&
    movementWallet &&
    walletAddress &&
    !submitting &&
    asset &&
    !loadingPortfolio && // isLoadedUser equivalent
    !zeroInput &&
    !loadingSimulation && // isSimulatedLoading equivalent
    !isOverLimit &&
    (activeTab === "supply"
      ? true // Supply doesn't check health factor
      : !simHealthRed); // Withdraw: disable if health would be in red zone

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
      // Use API response - matching MovePosition's calcHealthFactor
      // Formula: equity / minRequiredEquity
      // where equity = total_collateral - total_liability
      // and minRequiredEquity = mm (from evaluation)
      const simTotalCollateral =
        simulatedRiskData.total_collateral ?? currentEquity + supplyAmountUSD;
      const simTotalLiability =
        simulatedRiskData.total_liability ?? currentDebt;
      const simEquity = simTotalCollateral - simTotalLiability;
      const simMinRequiredEquity =
        simulatedRiskData.mm ??
        simulatedRiskData.requiredEquity ??
        currentRequiredEquity;

      // Calculate health factor from simulated data (matching MovePosition's calcHealthFactor)
      if (simMinRequiredEquity > 0) {
        newHealthFactor = simEquity / simMinRequiredEquity;
      } else {
        newHealthFactor = simulatedRiskData.health_ratio || null;
      }

      newEquity = simEquity;
      newRequiredEquity = simMinRequiredEquity;

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

  // Format health factor matching MovePosition's formatHealthFactor
  // Returns 'N/A' if <= 0, 'MAX' if >= 135, otherwise compactNum + 'x'
  const formatHealthFactor = (hf: number | null | undefined): string => {
    if (!hf || hf <= 0) return "N/A";
    if (hf >= 135) return "MAX";
    // Use compact notation for large numbers, otherwise show 2 decimals
    if (hf >= 100) {
      return `${Math.floor(hf)}x`;
    } else if (hf >= 10) {
      return `${hf.toFixed(1)}x`;
    } else {
      return `${hf.toFixed(2)}x`;
    }
  };

  // Use simulated health factor from API if available, otherwise fallback to current
  // Only show simulated when there's an amount input (matching MovePosition's logic)
  const displayHealthFactor =
    amount && parseFloat(amount) > 0
      ? (simulatedRiskData?.health_ratio ??
        getRiskSimulated?.newHealthFactor ??
        currentHealthFactor)
      : null; // Don't show simulated when no input

  /**
   * Check if Max button should be shown
   */
  const showMaxButton = useMemo(() => {
    if (activeTab === "supply") {
      return balance && parseFloat(balance) > 0;
    } else {
      return userSuppliedAmount > 0;
    }
  }, [activeTab, balance, userSuppliedAmount]);

  const handleSubmit = async () => {
    // Validate Privy wallet connection
    if (!ready || !authenticated) {
      setSubmitError("Please connect your Privy wallet first");
      return;
    }

    if (!movementWallet || !walletAddress || !asset) {
      setSubmitError(
        "Privy wallet not connected. Please connect your Movement wallet."
      );
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setSubmitError("Please enter a valid amount");
      return;
    }

    if (activeTab === "supply") {
      if (balance && parseFloat(amount) > parseFloat(balance)) {
        setSubmitError("Insufficient balance");
        return;
      }

      // Check deposit limits before submission (matching MovePosition's validation)
      if (overBrokerDepositLimit) {
        setSubmitError(
          `Amount exceeds max deposit value set for ${asset.symbol} by broker`
        );
        return;
      }

      if (poolIsFull) {
        setSubmitError(
          `${asset.symbol} pool is full. Pool limits are set by the broker and can be adjusted.`
        );
        return;
      }
    }

    if (activeTab === "withdraw") {
      if (parseFloat(amount) > maxWithdrawableAmount) {
        // Check which limit was exceeded (matching MovePosition's overLimitInfoBox)
        const availableLiquidity = selectedBroker
          ? parseFloat(selectedBroker.scaledAvailableLiquidityUnderlying || "0")
          : 0;

        if (userSuppliedAmount < availableLiquidity) {
          setSubmitError(
            `Amount exceeds your supplied balance of ${asset.symbol}`
          );
        } else {
          setSubmitError(
            `Amount exceeds available liquidity for ${asset.symbol} in broker`
          );
        }
        return;
      }

      // Also check health factor (matching MovePosition's simHealthRed check)
      if (simHealthRed) {
        if (isSimUnhealthy) {
          setSubmitError("Withdrawal would make your portfolio unhealthy");
        } else {
          setSubmitError(
            "Withdrawal would put your position near liquidation threshold"
          );
        }
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);
    setTxHash(null);
    setSubmissionStep("Initializing transaction with Privy...");

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

      console.log(
        `${activeTab === "supply" ? "Supply" : "Withdraw"} transaction successful:`,
        txHash
      );
      setTxHash(txHash);

      // Refresh portfolio data to update supplied amounts
      if (walletAddress) {
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
          console.error("Error refreshing portfolio:", error);
        }
      }

      // Close modal on success after a short delay
      setTimeout(() => {
        onClose();
        setAmount("");
        setTxHash(null);
      }, 2000);
    } catch (err: any) {
      debugger;
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
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              {activeTab === "supply" ? "Lend" : "Withdraw"} {asset.symbol}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {activeTab === "supply"
                ? "Supply tokens to earn interest"
                : "Withdraw your supplied tokens"}
            </p>
          </div>
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
              handleTabSwitch("supply");
              // setActiveTab("supply");
              // setAmount("");
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
              handleTabSwitch("withdraw");
              // setActiveTab("withdraw");
              // setAmount("");
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
              {/* Single Max button - works for both supply and withdraw */}
              {showMaxButton && (
                <button
                  onClick={handleMax}
                  className="px-4 py-1 bg-yellow-500 text-black text-sm font-medium rounded hover:bg-yellow-400 transition-colors"
                >
                  Max
                </button>
              )}
            </div>

            {/* Available balance hint - different text for supply vs withdraw */}
            {activeTab === "supply" && balance && parseFloat(balance) > 0 && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                Available to supply:{" "}
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                  {parseFloat(balance).toFixed(6)} {asset.symbol}
                </span>
              </div>
            )}
            {activeTab === "withdraw" && userSuppliedAmount > 0 && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                Available to withdraw:{" "}
                {loadingPortfolio ? (
                  <span className="text-zinc-400">Loading...</span>
                ) : (
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                    {userSuppliedAmount.toFixed(6)} {asset.symbol}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Stats - Always show previously supplied and health factor */}
          <div className="mb-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-3">
            {/* Health Factor - Prominently displayed */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-zinc-500 dark:text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Health Factor
                  {loadingSimulation && (
                    <span className="ml-2 text-xs text-zinc-400">
                      (simulating...)
                    </span>
                  )}
                </span>
              </div>
              <span className="text-sm font-bold flex items-center gap-2">
                {loadingPortfolio ? (
                  <span className="text-zinc-400">Loading...</span>
                ) : (
                  <span
                    className={`${
                      currentHealthFactor && currentHealthFactor >= 1.2
                        ? "text-green-600 dark:text-green-400"
                        : currentHealthFactor && currentHealthFactor >= 1.0
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatHealthFactor(currentHealthFactor)}
                  </span>
                )}
                {amount &&
                  parseFloat(amount) > 0 &&
                  displayHealthFactor !== null && (
                    <>
                      <span className="text-zinc-400">→</span>
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
                          : formatHealthFactor(displayHealthFactor)}
                      </span>
                    </>
                  )}
              </span>
            </div>

            {/* Previously Supplied - Prominently displayed */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-zinc-500 dark:text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {activeTab === "supply"
                    ? "Previously Supplied"
                    : "Available to Withdraw"}
                  {loadingPortfolio && (
                    <span className="ml-2 text-xs text-zinc-400">
                      (loading...)
                    </span>
                  )}
                </span>
              </div>
              <span className="text-sm font-bold flex items-center gap-2">
                {loadingPortfolio ? (
                  <span className="text-zinc-400">Loading...</span>
                ) : (
                  <>
                    <span className="text-zinc-900 dark:text-zinc-50">
                      {userSuppliedAmount.toFixed(4)} {asset.symbol}
                    </span>
                    {amount && parseFloat(amount) > 0 && (
                      <>
                        <span className="text-zinc-400">→</span>
                        <span className="text-zinc-900 dark:text-zinc-50">
                          {(activeTab === "supply"
                            ? userSuppliedAmount + parseFloat(amount)
                            : Math.max(
                                0,
                                userSuppliedAmount - parseFloat(amount)
                              )
                          ).toFixed(4)}{" "}
                          {asset.symbol}
                        </span>
                      </>
                    )}
                  </>
                )}
              </span>
            </div>

            {/* Supply APY with next value (matching MovePosition) */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Supply APY
              </span>
              <span className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
                {formatPercentage(supplyAPY.current)}
                {supplyAPY.next !== null && supplyAPY.next < 1 && (
                  <>
                    <span className="text-zinc-400">→</span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {formatPercentage(supplyAPY.next)}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* More/Less Button (matching MovePosition's ParamList) */}
          {brokerStats && (
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700"></div>
              <button
                onClick={() => setShowMore(!showMore)}
                className="text-yellow-500 dark:text-yellow-400 text-sm font-medium px-4 py-2 hover:text-yellow-600 dark:hover:text-yellow-300 transition-colors"
              >
                {showMore ? "Less" : "More"}
              </button>
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700"></div>
            </div>
          )}

          {/* Broker Stats Section (matching MovePosition's brokerStats) - Only shown when showMore is true */}
          {brokerStats && showMore && (
            <div className="mb-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-3">
              <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide mb-2">
                Broker Statistics
              </div>

              {/* Total Available In Broker */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Total Available In Broker
                  </span>
                  <div className="group relative">
                    <svg
                      className="w-3 h-3 text-zinc-400 cursor-help"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 dark:bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      Liquidity available for borrowing or withdrawal in tokens
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  {prettyTokenBal(brokerStats.totalAvailable)} {asset.symbol}
                  {brokerStats.nextAvailable !== null && (
                    <>
                      <span className="text-zinc-400">→</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {prettyTokenBal(brokerStats.nextAvailable)}{" "}
                        {asset.symbol}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {/* Total Loaned By Broker */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Total Loaned By Broker
                  </span>
                  <div className="group relative">
                    <svg
                      className="w-3 h-3 text-zinc-400 cursor-help"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 dark:bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      Liquidity currently loaned to borrowers in tokens
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  {prettyTokenBal(brokerStats.totalLoaned)} {asset.symbol}
                  {brokerStats.nextTotalLoaned !== null && (
                    <>
                      <span className="text-zinc-400">→</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {prettyTokenBal(brokerStats.nextTotalLoaned)}{" "}
                        {asset.symbol}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {/* Total Supplied In Broker */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Total Supplied In Broker
                  </span>
                  <div className="group relative">
                    <svg
                      className="w-3 h-3 text-zinc-400 cursor-help"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 dark:bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      Liquidity supplied in tokens
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  {prettyTokenBal(brokerStats.totalSupplied)} {asset.symbol}
                  {brokerStats.nextTotalSupplied !== null && (
                    <>
                      <span className="text-zinc-400">→</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {prettyTokenBal(brokerStats.nextTotalSupplied)}{" "}
                        {asset.symbol}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {/* Pool Max Limit (shown for supply/withdraw tabs) */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Pool Max Limit
                  </span>
                  <div className="group relative">
                    <svg
                      className="w-3 h-3 text-zinc-400 cursor-help"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 dark:bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      Maximum liquidity that can be supplied to the pool
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {prettyTokenBal(brokerStats.poolMaxLimit)} {asset.symbol}
                </span>
              </div>

              {/* Utilization */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Utilization
                  </span>
                  <div className="group relative">
                    <svg
                      className="w-3 h-3 text-zinc-400 cursor-help"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 dark:bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      Ratio of debt / collateral. High utilization increases
                      interest
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  {formatPercentage(brokerStats.utilization)}
                  {brokerStats.nextUtilization !== null && (
                    <>
                      <span className="text-zinc-400">→</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {formatPercentage(brokerStats.nextUtilization)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Error Message - Show over limit errors before submission */}
          {overLimitErrorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-700 dark:text-yellow-400">
              {overLimitErrorMessage}
            </div>
          )}

          {/* Transaction Error Message */}
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

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!canReview || submitting}
            className={`w-full font-semibold py-3.5 rounded-lg transition-all duration-200 mt-4 shadow-lg ${
              canReview && !submitting
                ? activeTab === "supply"
                  ? "bg-green-600 text-white hover:bg-green-700 hover:shadow-xl active:scale-[0.98] cursor-pointer"
                  : "bg-yellow-500 text-black hover:bg-yellow-400 hover:shadow-xl active:scale-[0.98] cursor-pointer"
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
                {submissionStep ||
                  (activeTab === "supply"
                    ? "Initiating Supply..."
                    : "Initiating Withdraw...")}
              </span>
            ) : activeTab === "supply" ? (
              <span className="flex items-center justify-center gap-2">
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
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Supply {asset.symbol}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
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
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Withdraw {asset.symbol}
              </span>
            )}
          </button>

          {!walletAddress && (
            <p className="mt-3 text-xs text-center text-zinc-500 dark:text-zinc-400">
              Connect your Privy wallet to{" "}
              {activeTab === "supply" ? "supply" : "withdraw"} tokens
            </p>
          )}

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
