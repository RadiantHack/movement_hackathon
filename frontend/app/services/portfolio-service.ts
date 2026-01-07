/**
 * Portfolio Service - Standardized portfolio state management
 * Matches MovePosition's portfolio building patterns
 */

import { requireSDKContext } from "../context/sdk-context";
import * as Gen from "../../lib/super-json-api-client/src";

/**
 * Basic position structure matching MovePosition's approach
 */
export interface BasicPosition {
  instrumentId: string;
  amount: string;
}

/**
 * Portfolio state matching MovePosition's PortfolioState
 */
export interface PortfolioState {
  collaterals: BasicPosition[];
  liabilities: BasicPosition[];
}

/**
 * Extended portfolio with risk data
 */
export interface SPortfolio {
  id: string;
  collaterals: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: number;
  }>;
  liabilities: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: number;
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

/**
 * Fetch portfolio with risk data
 * Matches MovePosition's fetchPortfolioWithRisk
 */
export async function fetchPortfolioWithRisk(
  address: string
): Promise<SPortfolio | null> {
  try {
    const { superClient } = requireSDKContext();
    const portfolio = await superClient.default.getPortfolio(address);

    if (!portfolio) {
      console.log("Portfolio not found for address:", address);
      return null;
    }

    // Transform to match frontend expectations
    const nextCollaterals = portfolio.collaterals.map((c: any) => ({
      ...c,
      scaledAmount: Number(c.scaledAmount),
    }));

    const nextLiabilities = portfolio.liabilities.map((l: any) => ({
      ...l,
      scaledAmount: Number(l.scaledAmount),
    }));

    return {
      ...portfolio,
      collaterals: nextCollaterals,
      liabilities: nextLiabilities,
    } as SPortfolio;
  } catch (e: any) {
    console.error("Failed to fetch portfolio:", e);
    return null;
  }
}

/**
 * Build current portfolio basic state
 * Exact match to MovePosition's buildCurrentPortfolioBasicState
 */
export function buildCurrentPortfolioBasicState(
  freshPortfolioState: SPortfolio | null
): PortfolioState {
  if (!freshPortfolioState) {
    return { collaterals: [], liabilities: [] };
  }

  const mapToBasicPosition = (position: any): BasicPosition => ({
    instrumentId: position.instrument.name,
    amount: position.amount, // Keep as string from API
  });

  return {
    collaterals: freshPortfolioState.collaterals.map(mapToBasicPosition),
    liabilities: freshPortfolioState.liabilities.map(mapToBasicPosition),
  };
}

/**
 * Build next portfolio state for simulation
 * Matches MovePosition's buildNextPortfolioState logic
 */
export function buildNextPortfolioState(
  current: PortfolioState,
  action: "supply" | "withdraw" | "borrow" | "repay",
  txAmount: number,
  broker: Gen.Broker
): PortfolioState {
  if (!current || !broker) {
    return { collaterals: [], liabilities: [] };
  }

  const depNoteName = broker.depositNote?.name;
  const loanNoteName = broker.loanNote?.name;

  if (!depNoteName || !loanNoteName) {
    return current;
  }

  switch (action) {
    case "supply": {
      // Add or increase collateral position
      const hasCollateral = current.collaterals.some(
        (c) => c.instrumentId === depNoteName
      );

      if (!hasCollateral) {
        return {
          ...current,
          collaterals: [
            ...current.collaterals,
            {
              instrumentId: depNoteName,
              amount: txAmount.toString(),
            },
          ],
        };
      }

      return {
        ...current,
        collaterals: current.collaterals.map((c) => {
          if (c.instrumentId === depNoteName) {
            const newAmount = Number(c.amount) + txAmount;
            return {
              instrumentId: c.instrumentId,
              amount: newAmount.toString(),
            };
          }
          return c;
        }),
      };
    }

    case "withdraw": {
      // Reduce collateral position
      return {
        ...current,
        collaterals: current.collaterals
          .map((c) => {
            if (c.instrumentId === depNoteName) {
              const newAmount = Number(c.amount) - txAmount;
              return {
                instrumentId: c.instrumentId,
                amount: newAmount.toString(),
              };
            }
            return c;
          })
          .filter((c) => Number(c.amount) > 0), // Remove zero positions
      };
    }

    case "borrow": {
      // Add or increase liability position
      const hasLiability = current.liabilities.some(
        (l) => l.instrumentId === loanNoteName
      );

      if (!hasLiability) {
        return {
          ...current,
          liabilities: [
            ...current.liabilities,
            {
              instrumentId: loanNoteName,
              amount: txAmount.toString(),
            },
          ],
        };
      }

      return {
        ...current,
        liabilities: current.liabilities.map((l) => {
          if (l.instrumentId === loanNoteName) {
            const newAmount = Number(l.amount) + txAmount;
            return {
              instrumentId: l.instrumentId,
              amount: newAmount.toString(),
            };
          }
          return l;
        }),
      };
    }

    case "repay": {
      // Reduce liability position
      return {
        ...current,
        liabilities: current.liabilities
          .map((l) => {
            if (l.instrumentId === loanNoteName) {
              const newAmount = Number(l.amount) - txAmount;
              return {
                instrumentId: l.instrumentId,
                amount: newAmount.toString(),
              };
            }
            return l;
          })
          .filter((l) => Number(l.amount) > 0), // Remove zero positions
      };
    }

    default:
      return current;
  }
}

/**
 * Fetch simulated portfolio for risk evaluation
 * Matches MovePosition's fetchSimulatedPortfolio
 */
export async function fetchSimulatedPortfolio(
  portfolio: PortfolioState
): Promise<Gen.Evaluation> {
  const { superClient } = requireSDKContext();
  return await superClient.default.getRiskSimulated(portfolio);
}

/**
 * Calculate health factor from evaluation
 * Matches MovePosition's calcHealthFactor
 */
export function calcHealthFactor(evaluation: Gen.Evaluation): number {
  if (!evaluation) return 0;
  return evaluation.health_ratio || 0;
}

/**
 * Check if health factor is in red zone
 */
export function isRedZone(healthFactor: number): boolean {
  return healthFactor > 0 && healthFactor <= 1.0;
}

/**
 * Check if health factor is in yellow zone
 */
export function isYellowZone(healthFactor: number): boolean {
  return healthFactor > 1.0 && healthFactor <= 1.2;
}

/**
 * Determine if risk evaluation should be fetched
 */
export function shouldGetRiskEval(
  action: string,
  portfolio: PortfolioState
): boolean {
  // Always get risk for withdraw and borrow
  if (action === "withdraw" || action === "borrow") {
    return true;
  }

  // For supply and repay, only if there are existing liabilities
  return portfolio.liabilities.length > 0;
}
