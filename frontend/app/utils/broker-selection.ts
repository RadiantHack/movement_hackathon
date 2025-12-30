/**
 * Broker selection utilities matching MovePosition's logic
 * Handles robust broker selection from symbol/asset information
 */

import * as superJsonApiClient from "../../lib/super-json-api-client/src";
import { getBrokerName } from "./lending-transaction";
import { getCoinType } from "./token-utils";

export interface BrokerSelectionOptions {
  symbol: string;
  brokers: superJsonApiClient.Broker[];
  walletAddress?: string;
  preferFungibleAsset?: boolean;
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
            `[BrokerSelection] Selected MOVE-FA broker: ${moveFABroker.underlyingAsset.name}`
          );
          return moveFABroker;
        }
      }

      // Fall back to first matching broker
      const selectedBroker = matchingBrokers[0];
      console.log(
        `[BrokerSelection] Selected MOVE broker: ${selectedBroker.underlyingAsset.name}`
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
