/**
 * Broker Service - Standardized broker selection and management
 * Matches MovePosition's broker selection patterns
 */

import { requireSDKContext } from "../context/sdk-context";
import * as Gen from "../../lib/super-json-api-client/src";
import { selectBroker as selectBrokerUtil } from "../utils/moveposition/broker-selection";
// Note: getCoinType is defined locally in this file, so we don't import it

/**
 * Broker cache to avoid repeated API calls
 */
let brokersCache: Gen.Broker[] | null = null;
let brokersCacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Fetch all brokers with caching
 * Matches MovePosition's broker fetching pattern
 */
export async function fetchBrokers(
  forceRefresh = false
): Promise<Gen.Broker[]> {
  const now = Date.now();

  if (!forceRefresh && brokersCache && now - brokersCacheTime < CACHE_TTL) {
    return brokersCache;
  }

  try {
    const { superClient } = requireSDKContext();
    console.log("[BrokerService] Fetching brokers from API...");
    const brokers = await superClient.default.getBrokers();
    console.log(
      `[BrokerService] Fetched ${brokers.length} brokers:`,
      brokers.map((b) => b.underlyingAsset.name)
    );

    brokersCache = brokers;
    brokersCacheTime = now;

    return brokers;
  } catch (error: any) {
    console.error("[BrokerService] Failed to fetch brokers:", error);
    // Return empty array instead of throwing to allow graceful degradation
    return [];
  }
}

/**
 * Get broker by underlying asset name
 * Uses existing broker-selection utility with multiple fallback strategies
 */
export async function getBrokerByAssetName(
  assetName: string
): Promise<Gen.Broker | null> {
  console.log(
    `[BrokerService] Looking for broker with asset name: ${assetName}`
  );
  const brokers = await fetchBrokers();

  if (brokers.length === 0) {
    console.error("[BrokerService] No brokers available");
    return null;
  }

  // Use the existing broker selection utility which has multiple fallback strategies
  const broker = selectBrokerUtil({
    symbol: assetName,
    brokers,
    preferFungibleAsset: true,
  });

  if (broker) {
    console.log(
      `[BrokerService] Found broker for ${assetName}:`,
      broker.underlyingAsset.name
    );
  } else {
    console.log(
      `[BrokerService] No broker found for ${assetName}. Available brokers:`,
      brokers.map((b) => b.underlyingAsset.name).join(", ")
    );
  }

  return broker;
}

/**
 * Get broker by network address
 * Useful when you have the coin type address
 */
export async function getBrokerByNetworkAddress(
  networkAddress: string
): Promise<Gen.Broker | null> {
  const brokers = await fetchBrokers();

  const broker = brokers.find(
    (b) => b.underlyingAsset.networkAddress === networkAddress
  );

  return broker || null;
}

/**
 * Get broker by deposit note name
 * Used for withdrawal operations
 */
export async function getBrokerByDepositNote(
  depositNoteName: string
): Promise<Gen.Broker | null> {
  const brokers = await fetchBrokers();

  const broker = brokers.find((b) => b.depositNote?.name === depositNoteName);

  return broker || null;
}

/**
 * Get broker by loan note name
 * Used for repayment operat?ions
 */
export async function getBrokerByLoanNote(
  loanNoteName: string
): Promise<Gen.Broker | null> {
  const brokers = await fetchBrokers();

  const broker = brokers.find((b) => b.loanNote?.name === loanNoteName);

  return broker || null;
}

/**
 * Validate broker has required data for transaction
 */
export function validateBroker(
  broker: Gen.Broker | null,
  action: "supply" | "withdraw" | "borrow" | "repay"
): { isValid: boolean; error?: string } {
  if (!broker) {
    return { isValid: false, error: "Broker not found" };
  }

  if (!broker.underlyingAsset) {
    return { isValid: false, error: "Broker missing underlying asset data" };
  }

  if ((action === "supply" || action === "withdraw") && !broker.depositNote) {
    return {
      isValid: false,
      error: "Broker missing deposit note configuration",
    };
  }

  if ((action === "borrow" || action === "repay") && !broker.loanNote) {
    return {
      isValid: false,
      error: "Broker missing loan note configuration",
    };
  }

  return { isValid: true };
}

/**
 * Get broker name for transaction (matches MovePosition's format)
 */
export function getBrokerName(broker: Gen.Broker): string {
  return broker.underlyingAsset.name;
}

/**
 * Get coin type for transaction (matches MovePosition's format)
 */
export function getCoinType(broker: Gen.Broker): string {
  return broker.underlyingAsset.networkAddress;
}

/**
 * Check if broker has available liquidity
 */
export function hasAvailableLiquidity(
  broker: Gen.Broker,
  amountNeeded: number
): boolean {
  const availableLiquidity = Number(
    broker.scaledAvailableLiquidityUnderlying || 0
  );
  return availableLiquidity >= amountNeeded;
}

/**
 * Check if amount exceeds max deposit
 */
export function exceedsMaxDeposit(broker: Gen.Broker, amount: number): boolean {
  if (!broker.maxDepositScaled) return false;
  const maxDeposit = Number(broker.maxDepositScaled);
  if (maxDeposit === 0) return false; // No limit
  return amount > maxDeposit;
}

/**
 * Get all broker names for portfolio refresh
 * Matches MovePosition's approach of passing broker names for refresh
 */
export function getBrokerNames(brokers: Gen.Broker[]): string[] {
  return brokers.map((b) => b.underlyingAsset.name);
}

/**
 * Clear broker cache (useful for manual refresh)
 */
export function clearBrokerCache(): void {
  brokersCache = null;
  brokersCacheTime = 0;
}
