/**
 * Broker selection utilities matching MovePosition's logic
 * Handles robust broker selection from symbol/asset information
 */

import * as superJsonApiClient from "../../../lib/super-json-api-client/src";
import { getBrokerName } from "./lending-transaction";
import { getCoinType } from "../shared/tokens";

export interface BrokerSelectionOptions {
  symbol: string;
  brokers: superJsonApiClient.Broker[];
  walletAddress?: string;
  preferFungibleAsset?: boolean;
  coinStoreBalance?: bigint; // Optional: If provided, use this to determine broker selection for MOVE
  fungibleAssetBalance?: bigint; // Optional: If provided, use this to determine broker selection for MOVE
}

/**
 * Select broker from brokers list based on symbol
 * Matches MovePosition's broker selection logic:
 * 1. For MOVE: Prefer MOVE-FA (fungible asset) over regular MOVE
 * 2. For other tokens: Match by underlyingAsset.name or networkAddress
 * 3. Fallback to name matching with normalization
 */
export function selectBroker(
  options: BrokerSelectionOptions
): superJsonApiClient.Broker | null {
  const { symbol, brokers, preferFungibleAsset = true } = options;
  const normalizedSymbol = symbol.toUpperCase().replace(/\./g, "").trim();

  // Special handling for MOVE tokens (matching MovePosition's logic)
  if (normalizedSymbol === "MOVE" || normalizedSymbol === "APT") {
    const matchingBrokers = brokers.filter((b) => {
      const assetName = (b.underlyingAsset?.name || "").toLowerCase();
      return assetName.includes("move");
    });

    if (matchingBrokers.length > 0) {
      // CRITICAL: If coin store balance is provided, check it first (matching MovePosition's logic)
      // If user has coin store balance, MUST use regular MOVE broker (NOT MOVE-FA)
      if (options.coinStoreBalance !== undefined) {
        const hasCoinBalance = options.coinStoreBalance > BigInt(0);
        const hasNoFABalance = options.fungibleAssetBalance === undefined || options.fungibleAssetBalance === BigInt(0);
        
        if (hasCoinBalance) {
          // User has coin store balance - MUST use regular MOVE broker (NOT MOVE-FA)
          const regularMoveBroker = matchingBrokers.find((b) => {
            const assetName = (b.underlyingAsset?.name || "").toLowerCase();
            const hasMove = assetName.includes("move");
            const hasFA =
              assetName.includes("move-fa") ||
              assetName.includes("move_fa") ||
              assetName.includes("movefa");
            return hasMove && !hasFA;
          });

          if (regularMoveBroker) {
            console.log(
              `[BrokerSelection] Selected regular MOVE broker (coin store balance exists): ${regularMoveBroker.underlyingAsset.name}`
            );
            return regularMoveBroker;
          } else {
            console.warn(
              `[BrokerSelection] Coin store balance exists but no regular MOVE broker found. Available: ${matchingBrokers.map((b) => b.underlyingAsset.name).join(", ")}`
            );
          }
        } else if (options.fungibleAssetBalance !== undefined && options.fungibleAssetBalance > BigInt(0)) {
          // User has fungible asset balance - use MOVE-FA broker
          const moveFABroker = matchingBrokers.find((b) => {
            const assetName = (b.underlyingAsset?.name || "").toLowerCase();
            return (
              assetName.includes("move-fa") ||
              assetName.includes("move_fa") ||
              assetName === "movement-move-fa"
            );
          });

          if (moveFABroker) {
            console.log(
              `[BrokerSelection] Selected MOVE-FA broker (fungible asset balance exists): ${moveFABroker.underlyingAsset.name}`
            );
            return moveFABroker;
          }
        }
      }

      // If no balance info provided, use preferFungibleAsset preference
      // Prefer MOVE-FA (fungible asset) if available and preferFungibleAsset is true
      if (preferFungibleAsset) {
        const moveFABroker = matchingBrokers.find((b) => {
          const assetName = (b.underlyingAsset?.name || "").toLowerCase();
          return (
            assetName.includes("move-fa") ||
            assetName.includes("move_fa") ||
            assetName === "movement-move-fa"
          );
        });

        if (moveFABroker) {
          console.log(
            `[BrokerSelection] Selected MOVE-FA broker (preferFungibleAsset=true): ${moveFABroker.underlyingAsset.name}`
          );
          return moveFABroker;
        }
      }

      // Fall back to first matching broker
      const selectedBroker = matchingBrokers[0];
      console.log(
        `[BrokerSelection] Selected MOVE broker (fallback): ${selectedBroker.underlyingAsset.name}`
      );
      return selectedBroker;
    }
  }

  // For other tokens, try multiple matching strategies
  const brokerName = getBrokerName(symbol);

  // Strategy 1: Match by exact underlyingAsset.name
  let broker = brokers.find(
    (b) => b.underlyingAsset?.name?.toLowerCase() === brokerName.toLowerCase()
  );

  if (broker) {
    console.log(
      `[BrokerSelection] Found broker by name: ${broker.underlyingAsset.name}`
    );
    return broker;
  }

  // Strategy 2: Match by networkAddress (coinType)
  try {
    const coinType = getCoinType(normalizedSymbol);
    broker = brokers.find(
      (b) =>
        b.underlyingAsset?.networkAddress?.toLowerCase() ===
        coinType.toLowerCase()
    );

    if (broker) {
      console.log(
        `[BrokerSelection] Found broker by networkAddress: ${broker.underlyingAsset.name}`
      );
      return broker;
    }
  } catch (e) {
    console.warn(`[BrokerSelection] Could not get coinType for ${symbol}:`, e);
  }

  // Strategy 3: Match by partial name (contains brokerName)
  broker = brokers.find((b) => {
    const assetName = (b.underlyingAsset?.name || "").toLowerCase();
    return assetName.includes(brokerName.toLowerCase());
  });

  if (broker) {
    console.log(
      `[BrokerSelection] Found broker by partial name: ${broker.underlyingAsset.name}`
    );
    return broker;
  }

  // Strategy 4: Match by symbol in token metadata (if available)
  broker = brokers.find((b) => {
    const tokenMeta = (b as any).tokenMeta;
    if (tokenMeta?.ticker) {
      const ticker = tokenMeta.ticker.toUpperCase().replace(/\./g, "").trim();
      return ticker === normalizedSymbol;
    }
    return false;
  });

  if (broker) {
    console.log(
      `[BrokerSelection] Found broker by ticker: ${broker.underlyingAsset.name}`
    );
    return broker;
  }

  console.warn(
    `[BrokerSelection] No broker found for symbol: ${symbol}, brokerName: ${brokerName}`
  );
  return null;
}

/**
 * Select broker from API (fetches brokers and selects)
 * This is a convenience function that combines fetching and selection
 */
export async function selectBrokerFromAPI(
  superClient: superJsonApiClient.SuperClient,
  symbol: string,
  options?: {
    preferFungibleAsset?: boolean;
    walletAddress?: string;
  }
): Promise<superJsonApiClient.Broker | null> {
  const brokers = await superClient.default.getBrokers();
  return selectBroker({
    symbol,
    brokers,
    preferFungibleAsset: options?.preferFungibleAsset ?? true,
    walletAddress: options?.walletAddress,
  });
}

/**
 * Validate broker selection - ensures broker has required fields
 */
export function validateBroker(
  broker: superJsonApiClient.Broker | null
): broker is superJsonApiClient.Broker {
  if (!broker) {
    return false;
  }

  if (!broker.underlyingAsset?.name) {
    console.warn("[BrokerSelection] Broker missing underlyingAsset.name");
    return false;
  }

  if (!broker.underlyingAsset?.networkAddress) {
    console.warn(
      "[BrokerSelection] Broker missing underlyingAsset.networkAddress"
    );
    return false;
  }

  return true;
}
