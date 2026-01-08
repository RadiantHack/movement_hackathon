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
 * Retry configuration for broker fetching
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Wait for a specified duration (for retry delays)
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch all brokers with caching and retry logic
 * Matches MovePosition's broker fetching pattern
 */
export async function fetchBrokers(
  forceRefresh = false
): Promise<Gen.Broker[]> {
  const now = Date.now();

  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && brokersCache && now - brokersCacheTime < CACHE_TTL) {
    return brokersCache;
  }

  // If cache exists but is stale, we'll try to refresh but return stale cache on failure
  const hasStaleCache = brokersCache !== null;

  let lastError: any = null;

  // Retry logic with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { superClient } = requireSDKContext();
      console.log(
        `[BrokerService] Fetching brokers from API... (attempt ${attempt + 1}/${MAX_RETRIES})`
      );

      const brokers = await superClient.default.getBrokers();

      // Validate response
      if (!Array.isArray(brokers)) {
        throw new Error("Invalid broker response: expected array");
      }

      console.log(
        `[BrokerService] ✅ Successfully fetched ${brokers.length} brokers:`,
        brokers.map((b) => b.underlyingAsset.name)
      );

      // Update cache on success
      brokersCache = brokers;
      brokersCacheTime = now;

      return brokers;
    } catch (error: any) {
      lastError = error;

      // Log error with more context
      const errorMessage = error?.message || "Unknown error";
      const errorStatus = error?.status || error?.response?.status;
      const isNetworkError =
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("timeout");

      console.error(
        `[BrokerService] ❌ Failed to fetch brokers (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        {
          error: errorMessage,
          status: errorStatus,
          isNetworkError,
          willRetry: attempt < MAX_RETRIES - 1,
        }
      );

      // If this is the last attempt, break out of retry loop
      if (attempt === MAX_RETRIES - 1) {
        break;
      }

      // Exponential backoff: wait before retrying
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
      console.log(`[BrokerService] ⏳ Retrying in ${delay}ms...`);
      await wait(delay);
    }
  }

  // All retries failed
  console.error(
    `[BrokerService] ❌ All ${MAX_RETRIES} attempts failed. Last error:`,
    lastError
  );

  // Clear cache on error to prevent serving stale data
  // This ensures next request will try fresh fetch
  if (forceRefresh || !hasStaleCache) {
    console.warn(
      "[BrokerService] ⚠️ Clearing broker cache due to fetch failure"
    );
    brokersCache = null;
    brokersCacheTime = 0;
  }

  // If we have stale cache and this wasn't a forced refresh, return stale cache
  // This allows graceful degradation - user can still see previous data
  if (hasStaleCache && !forceRefresh) {
    console.warn(
      `[BrokerService] ⚠️ Returning stale cache (${brokersCache!.length} brokers) due to fetch failure. User may see outdated data.`
    );
    return brokersCache!;
  }

  // No cache available and all retries failed - return empty array
  // This allows graceful degradation but callers should handle empty array
  console.error(
    "[BrokerService] ❌ No brokers available. Returning empty array. Callers should handle this case."
  );
  return [];
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
