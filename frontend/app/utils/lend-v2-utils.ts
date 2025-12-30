/**
 * Lend V2 utilities using the same approach as scripts
 * Uses SuperpositionAptosSDK and SuperClient API
 */

import * as superSDK from "../../lib/super-aptos-sdk/src";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";
import {
  Aptos,
  AptosConfig,
  Network,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import {
  MOVEPOSITION_ADDRESS,
  getCoinType,
  getBrokerAddress,
  getCoinDecimals,
} from "./token-utils";
import {
  requireMovementChainId,
  requireMovementApiBase,
  requireMovementRpc,
} from "@/lib/super-aptos-sdk/src/globals";

// Lazy initialization of Aptos instances
let aptosInstance: Aptos | null = null;

function getAptosInstance(): Aptos {
  if (!aptosInstance) {
    const movementRpc = requireMovementRpc();
    aptosInstance = new Aptos(
      new AptosConfig({
        network: Network.MAINNET,
        fullnode: movementRpc,
      })
    );
  }
  return aptosInstance;
}

export interface LendV2Params {
  amount: string; // Raw amount as string
  coinSymbol: string;
  walletAddress: string;
  publicKey: string;
  signHash: (hash: string) => Promise<{ signature: string }>;
  onProgress?: (step: string) => void;
}

export interface PortfolioState {
  collaterals: Array<{ instrumentId: string; amount: string }>;
  liabilities: Array<{ instrumentId: string; amount: string }>;
}

async function getBrokerFromAPI(
  superClient: superJsonApiClient.SuperClient,
  brokerAddress: string,
  coinSymbol?: string
): Promise<superJsonApiClient.Broker> {
  const brokers = await superClient.default.getBrokers();

  // For MOVE, prefer MOVE-FA (fungible asset) over regular MOVE (coin)
  // This matches the backend's preference logic
  if (coinSymbol?.toUpperCase() === "MOVE") {
    const matchingBrokers = brokers.filter((b) => {
      const assetName = (b.underlyingAsset?.name || "").toLowerCase();
      return (
        assetName.includes("move") &&
        (b.networkAddress === brokerAddress ||
          assetName.includes("move-fa") ||
          assetName.includes("move_fa"))
      );
    });

    if (matchingBrokers.length > 0) {
      // Prefer MOVE-FA if available
      const moveFABroker = matchingBrokers.find((b) => {
        const assetName = (b.underlyingAsset?.name || "").toLowerCase();
        return assetName.includes("move-fa") || assetName.includes("move_fa");
      });

      if (moveFABroker) {
        console.log(
          `[LendV2] Selected MOVE-FA broker: ${moveFABroker.underlyingAsset.name}`
        );
        return moveFABroker;
      }

      // Fall back to first matching broker
      const selectedBrokerForReturn = matchingBrokers[0];
      console.log(
        `[LendV2] Selected MOVE broker: ${selectedBrokerForReturn.underlyingAsset.name}`
      );
      return selectedBrokerForReturn;
    }
  }

  // For other tokens, find exact match by networkAddress
  const broker = brokers.find((b) => b.networkAddress === brokerAddress);
  if (!broker) {
    throw new Error(`Broker not found for address: ${brokerAddress}`);
  }
  return broker;
}

async function getPortfolioStateFromAPI(
  superClient: superJsonApiClient.SuperClient,
  address: string
): Promise<PortfolioState> {
  const portfolio = await superClient.default.getPortfolio(address);
  const collaterals = portfolio.collaterals.map((c) => {
    return { instrumentId: c.instrument.name, amount: c.amount };
  });
  const liabilities = portfolio.liabilities.map((l) => {
    return { instrumentId: l.instrument.name, amount: l.amount };
  });
  return {
    collaterals,
    liabilities,
  };
}

/**
 * Check gas balance (MOVE/APT) before transaction
 * Matches MovePosition's checkAPTBalance implementation
 */
async function checkGasBalance(
  aptos: Aptos,
  address: string,
  onProgress?: (step: string) => void
): Promise<void> {
  if (onProgress) {
    onProgress("Checking gas balance...");
  }

  try {
    // MovePosition uses: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
    const aptResource = "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>";

    // Get account resources (new Aptos SDK method)
    const resources = await aptos.account.getAccountResources({
      accountAddress: address,
    });

    // Find APT/MOVE coin store resource
    const gasToken = resources.find((r) => r.type === aptResource);

    if (!gasToken) {
      throw new Error(
        "No MOVE balance found. You need MOVE tokens for transaction fees. Please add MOVE to your wallet."
      );
    }

    const gasBal = BigInt((gasToken.data as any)?.coin?.value || "0");
    const hasGas = gasBal > BigInt(0);

    if (!hasGas) {
      throw new Error(
        "Insufficient gas. You need MOVE tokens for transaction fees. Please add MOVE to your wallet."
      );
    }

    console.log(
      `[GasCheck] ✅ Gas balance: ${gasBal.toString()} (${(Number(gasBal) / Math.pow(10, 8)).toFixed(6)} MOVE)`
    );
  } catch (e: any) {
    console.error("[GasCheck] Error checking gas balance:", e);

    // If it's our custom error, throw it as-is
    if (e.message.includes("MOVE") || e.message.includes("gas")) {
      throw e;
    }

    // Otherwise, wrap in a user-friendly error
    throw new Error(
      `Failed to check gas balance: ${e.message || "Unknown error"}. Please ensure you have MOVE tokens in your wallet for transaction fees.`
    );
  }
}

export async function executeLendV2(params: LendV2Params): Promise<string> {
  const { amount, coinSymbol, walletAddress, publicKey, signHash, onProgress } =
    params;

  if (onProgress) {
    onProgress("Initializing SDK...");
  }

  const movementApiBase = requireMovementApiBase();
  const movementChainId = requireMovementChainId();

  const MOVEMENT_CHAIN_ID = movementChainId;
  const API_BASE = movementApiBase;

  const aptos = getAptosInstance();

  // Check gas balance before proceeding (like MovePosition does)
  await checkGasBalance(aptos, walletAddress, onProgress);

  const sdk = new superSDK.SuperpositionAptosSDK(MOVEPOSITION_ADDRESS);
  const superClient = new superJsonApiClient.SuperClient({
    BASE: API_BASE,
  });

  if (onProgress) {
    onProgress("Fetching broker information...");
  }

  // Get all brokers first (like MovePosition does)
  const brokers = await superClient.default.getBrokers();

  // For MOVE, check balance first to determine which broker to use
  let brokerName: string = "";
  let coinTypeFromBroker: string = "";
  let selectedBroker: superJsonApiClient.Broker | null = null;

  if (coinSymbol === "MOVE" || coinSymbol === "APT") {
    // Check both coin store and fungible asset balances
    let coinStoreBalance = BigInt(0);
    let fungibleAssetBalance = BigInt(0);

    try {
      // Check coin store
      const accountResources = await aptos.account.getAccountResources({
        accountAddress: walletAddress,
      });
      const nativeCoinStoreType =
        "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>";
      const coinStore = accountResources.find(
        (resource) => resource.type === nativeCoinStoreType
      );
      if (coinStore) {
        coinStoreBalance = BigInt((coinStore.data as any).coin?.value || "0");
      }
    } catch (e) {
      console.warn("[LendV2] Could not check coin store:", e);
    }

    try {
      // Check fungible asset
      const balanceResponse = await fetch(
        `/api/balance?address=${encodeURIComponent(walletAddress)}&token=${encodeURIComponent(coinSymbol)}`
      );
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        if (balanceData.success && balanceData.balances?.length > 0) {
          const tokenBalance = balanceData.balances.find((b: any) => {
            const symbol = (b.metadata?.symbol || "").toUpperCase();
            return symbol === coinSymbol.toUpperCase();
          });
          if (tokenBalance) {
            fungibleAssetBalance = BigInt(tokenBalance.amount || "0");
          }
        }
      }
    } catch (e) {
      console.warn("[LendV2] Could not check fungible asset:", e);
    }

    console.log(`[LendV2] Balance check for broker selection:`, {
      coinStoreBalance: coinStoreBalance.toString(),
      fungibleAssetBalance: fungibleAssetBalance.toString(),
      coinStoreBalanceFormatted: (
        Number(coinStoreBalance) / Math.pow(10, 8)
      ).toFixed(6),
      fungibleAssetBalanceFormatted: (
        Number(fungibleAssetBalance) / Math.pow(10, 8)
      ).toFixed(6),
      condition1: coinStoreBalance > BigInt(0),
      condition2: fungibleAssetBalance === BigInt(0),
      conditionMet:
        coinStoreBalance > BigInt(0) && fungibleAssetBalance === BigInt(0),
    });

    // Log all available MOVE brokers for debugging
    const allMoveBrokers = brokers.filter((b) => {
      const assetName = (b.underlyingAsset?.name || "").toLowerCase();
      return assetName.includes("move");
    });
    console.log(
      `[LendV2] Available MOVE brokers:`,
      allMoveBrokers.map((b) => ({
        name: b.underlyingAsset.name,
        networkAddress: b.underlyingAsset.networkAddress,
        isFA:
          (b.underlyingAsset.name || "").toLowerCase().includes("move-fa") ||
          (b.underlyingAsset.name || "").toLowerCase().includes("move_fa"),
      }))
    );

    // CRITICAL: Check condition explicitly and log
    const hasCoinBalance = coinStoreBalance > BigInt(0);
    const hasNoFABalance = fungibleAssetBalance === BigInt(0);
    const shouldUseRegularMove = hasCoinBalance && hasNoFABalance;

    console.log(`[LendV2] Broker selection decision:`, {
      hasCoinBalance,
      coinStoreBalance: coinStoreBalance.toString(),
      hasNoFABalance,
      fungibleAssetBalance: fungibleAssetBalance.toString(),
      shouldUseRegularMove,
      willSelectRegularMove: shouldUseRegularMove,
    });

    // CRITICAL: If user has coin store balance, we MUST use regular MOVE broker
    // Do NOT allow any fallback to MOVE-FA
    if (hasCoinBalance) {
      console.log(
        `[LendV2] 🔒 LOCKED: User has coin store balance. MUST use regular MOVE broker (NOT MOVE-FA).`
      );
      // User has coin MOVE, use regular MOVE broker (NOT MOVE-FA)
      console.log(
        `[LendV2] ✅ User has COIN MOVE balance (${coinStoreBalance.toString()}). Selecting regular MOVE broker (NOT MOVE-FA).`
      );

      // Find regular MOVE broker (NOT MOVE-FA) - match MovePosition's approach
      // MovePosition uses broker.underlyingAsset.networkAddress directly (line 208 in doTx.ts)
      // Broker names: "movement-move-fa" (FA) vs "movement-move" (regular)
      // CRITICAL: Must find broker that matches coin store balance (0x1::aptos_coin::AptosCoin)
      console.log(
        `[LendV2] 🔍 Searching for regular MOVE broker. Available MOVE brokers:`,
        allMoveBrokers.map((b) => ({
          name: b.underlyingAsset.name,
          networkAddress: b.underlyingAsset.networkAddress,
          isFA:
            (b.underlyingAsset.name || "").toLowerCase().includes("move-fa") ||
            (b.underlyingAsset.name || "").toLowerCase().includes("move_fa"),
        }))
      );

      // Filter out ALL MOVE-FA brokers explicitly - be very strict
      const regularMoveBrokers = brokers.filter((b) => {
        const assetName = (b.underlyingAsset?.name || "").toLowerCase();
        const hasMove = assetName.includes("move");
        // Explicitly check for FA patterns - be very strict
        const hasFA =
          assetName.includes("move-fa") ||
          assetName.includes("move_fa") ||
          assetName.includes("movefa") ||
          assetName.includes("-fa") ||
          assetName === "movement-move-fa";
        // Must have "move" but NOT have "fa" in any form
        const isRegular = hasMove && !hasFA;
        console.log(
          `[LendV2] Broker check: "${assetName}" - hasMove: ${hasMove}, hasFA: ${hasFA}, isRegular: ${isRegular}`
        );
        return isRegular;
      });

      console.log(
        `[LendV2] 🔍 Filtered regular MOVE brokers (non-FA):`,
        regularMoveBrokers.map((b) => ({
          name: b.underlyingAsset.name,
          networkAddress: b.underlyingAsset.networkAddress,
        }))
      );

      if (regularMoveBrokers.length > 0) {
        // Use the first regular MOVE broker found
        const regularMoveBroker = regularMoveBrokers[0];
        brokerName = regularMoveBroker.underlyingAsset.name;
        coinTypeFromBroker = regularMoveBroker.underlyingAsset.networkAddress;
        console.log(`[LendV2] ✅ Selected regular MOVE broker (coin store):`, {
          name: brokerName,
          networkAddress: coinTypeFromBroker,
        });

        // IMMEDIATE validation - check the selected broker is NOT FA
        const selectedNameLower = brokerName.toLowerCase();
        if (
          selectedNameLower.includes("move-fa") ||
          selectedNameLower.includes("move_fa") ||
          selectedNameLower.includes("movefa")
        ) {
          throw new Error(
            `CRITICAL: Selected broker "${brokerName}" is MOVE-FA but should be regular MOVE. Broker selection filter failed.`
          );
        }
      } else {
        // No regular MOVE broker found - this is a critical error
        const allMoveBrokerNames = allMoveBrokers.map((b) => ({
          name: b.underlyingAsset.name,
          networkAddress: b.underlyingAsset.networkAddress,
          isFA:
            (b.underlyingAsset.name || "").toLowerCase().includes("move-fa") ||
            (b.underlyingAsset.name || "").toLowerCase().includes("move_fa"),
        }));
        const faBrokers = allMoveBrokerNames.filter((b) => b.isFA);
        throw new Error(
          `CRITICAL: No regular MOVE broker (non-FA) found. You have ${(Number(coinStoreBalance) / Math.pow(10, 8)).toFixed(6)} MOVE in coin store, but only MOVE-FA brokers are available: ${faBrokers.map((b) => b.name).join(", ")}. Cannot proceed with transaction.`
        );
      }

      // CRITICAL: Validate broker was selected and is NOT MOVE-FA
      if (!brokerName || brokerName === "") {
        const allMoveBrokerNames = allMoveBrokers.map((b) => ({
          name: b.underlyingAsset.name,
          networkAddress: b.underlyingAsset.networkAddress,
          isFA:
            (b.underlyingAsset.name || "").toLowerCase().includes("move-fa") ||
            (b.underlyingAsset.name || "").toLowerCase().includes("move_fa"),
        }));
        const regularBrokers = allMoveBrokerNames.filter((b) => !b.isFA);
        const faBrokers = allMoveBrokerNames.filter((b) => b.isFA);

        console.error(`[LendV2] ❌ Regular MOVE broker not found.`, {
          coinStoreBalance: coinStoreBalance.toString(),
          fungibleAssetBalance: fungibleAssetBalance.toString(),
          allBrokers: allMoveBrokerNames,
          regularBrokers: regularBrokers,
          faBrokers: faBrokers,
        });

        throw new Error(
          `CRITICAL: No regular MOVE broker found. You have ${(Number(coinStoreBalance) / Math.pow(10, 8)).toFixed(6)} MOVE in coin store. Available brokers: ${JSON.stringify(allMoveBrokerNames)}. Regular brokers: ${regularBrokers.map((b) => b.name).join(", ") || "NONE"}. FA brokers: ${faBrokers.map((b) => b.name).join(", ")}.`
        );
      }

      // FINAL validation: ensure we didn't accidentally select MOVE-FA
      const selectedBrokerNameLower = brokerName.toLowerCase();
      const selectedIsFA =
        selectedBrokerNameLower.includes("move-fa") ||
        selectedBrokerNameLower.includes("move_fa") ||
        selectedBrokerNameLower.includes("movefa");
      if (selectedIsFA) {
        throw new Error(
          `CRITICAL: Selected MOVE-FA broker (${brokerName}) when coin store balance exists. This should never happen. Broker selection filter failed.`
        );
      }

      console.log(
        `[LendV2] ✅ VALIDATED: Regular MOVE broker selected: ${brokerName}`
      );
    } else if (fungibleAssetBalance > BigInt(0)) {
      // User has fungible asset MOVE, use MOVE-FA broker
      console.log(
        `[LendV2] User has FUNGIBLE ASSET MOVE balance. Selecting MOVE-FA broker.`
      );

      const moveFABroker = brokers.find((b) => {
        const assetName = (b.underlyingAsset?.name || "").toLowerCase();
        return (
          assetName.includes("move") &&
          (assetName.includes("move-fa") || assetName.includes("move_fa"))
        );
      });

      if (moveFABroker) {
        brokerName = moveFABroker.underlyingAsset.name;
        coinTypeFromBroker = moveFABroker.underlyingAsset.networkAddress;
        console.log(`[LendV2] ✅ Selected MOVE-FA broker (fungible asset):`, {
          name: brokerName,
          networkAddress: coinTypeFromBroker,
          reason: "User has fungible asset balance",
        });
      } else {
        // MOVE-FA broker not found - this shouldn't happen if user has fungible asset balance
        throw new Error(
          `MOVE-FA broker not found. User has fungible asset balance but no MOVE-FA broker available. Available brokers: ${allMoveBrokers.map((b) => b.underlyingAsset.name).join(", ")}`
        );
      }
    } else {
      // No balance found - but if we detected coin store balance earlier, this shouldn't happen
      // This is a fallback case - prefer regular MOVE but allow MOVE-FA if no regular exists
      console.warn(
        `[LendV2] ⚠️ No balance detected in initial check. Using default broker selection.`
      );

      // CRITICAL: If coin store balance was detected, we MUST NOT use MOVE-FA
      if (coinStoreBalance > BigInt(0)) {
        console.log(
          `[LendV2] ⚠️ WARNING: Coin store balance detected but not in shouldUseRegularMove condition. This is unexpected.`
        );
        // Force use regular MOVE broker
        const regularMoveBrokers = brokers.filter((b) => {
          const assetName = (b.underlyingAsset?.name || "").toLowerCase();
          const hasMove = assetName.includes("move");
          const hasFA =
            assetName.includes("move-fa") ||
            assetName.includes("move_fa") ||
            assetName.includes("movefa");
          return hasMove && !hasFA;
        });

        if (regularMoveBrokers.length > 0) {
          const regularMoveBroker = regularMoveBrokers[0];
          brokerName = regularMoveBroker.underlyingAsset.name;
          coinTypeFromBroker = regularMoveBroker.underlyingAsset.networkAddress;
          console.log(`[LendV2] ✅ Forced regular MOVE broker selection:`, {
            name: brokerName,
            networkAddress: coinTypeFromBroker,
          });
        } else {
          throw new Error(
            `CRITICAL: Coin store balance exists but no regular MOVE broker found. Available brokers: ${allMoveBrokers.map((b) => b.underlyingAsset.name).join(", ")}`
          );
        }
      } else {
        // No coin store balance - use default: prefer regular MOVE over MOVE-FA
        const regularMoveBroker = brokers.find((b) => {
          const assetName = (b.underlyingAsset?.name || "").toLowerCase();
          const isMove = assetName.includes("move");
          const isFA =
            assetName.includes("move-fa") ||
            assetName.includes("move_fa") ||
            assetName.includes("movefa");
          return isMove && !isFA;
        });

        if (regularMoveBroker) {
          brokerName = regularMoveBroker.underlyingAsset.name;
          coinTypeFromBroker = regularMoveBroker.underlyingAsset.networkAddress;
          console.log(`[LendV2] Using regular MOVE broker (default):`, {
            name: brokerName,
            networkAddress: coinTypeFromBroker,
          });
        } else {
          // Fallback to any MOVE broker (including MOVE-FA) - only if no coin store balance
          const anyMoveBroker = brokers.find((b) => {
            const assetName = (b.underlyingAsset?.name || "").toLowerCase();
            return assetName.includes("move");
          });
          if (anyMoveBroker) {
            brokerName = anyMoveBroker.underlyingAsset.name;
            coinTypeFromBroker = anyMoveBroker.underlyingAsset.networkAddress;
            console.warn(`[LendV2] ⚠️ Using MOVE broker (no regular found):`, {
              name: brokerName,
              networkAddress: coinTypeFromBroker,
            });
          } else {
            throw new Error(
              `No MOVE broker found. Available brokers: ${allMoveBrokers.map((b) => b.underlyingAsset.name).join(", ")}`
            );
          }
        }
      }
    }
  } else {
    // For other tokens, find broker by matching the coinType
    // Match MovePosition: use broker.underlyingAsset.networkAddress
    const coinType = getCoinType(coinSymbol);
    const matchingBroker = brokers.find(
      (b) => b.underlyingAsset.networkAddress === coinType
    );

    if (matchingBroker) {
      brokerName = matchingBroker.underlyingAsset.name;
      coinTypeFromBroker = matchingBroker.underlyingAsset.networkAddress;
      console.log(`[LendV2] Found broker for ${coinSymbol}:`, {
        name: brokerName,
        networkAddress: coinTypeFromBroker,
      });
    } else {
      throw new Error(
        `Broker not found for ${coinSymbol} with coinType ${coinType}. Available brokers: ${brokers.map((b) => `${b.underlyingAsset.name} (${b.underlyingAsset.networkAddress})`).join(", ")}`
      );
    }
  }

  // Validate broker was selected
  if (
    !brokerName ||
    brokerName === "" ||
    !coinTypeFromBroker ||
    coinTypeFromBroker === ""
  ) {
    throw new Error(
      `Broker selection failed: brokerName="${brokerName}", coinTypeFromBroker="${coinTypeFromBroker}"`
    );
  }

  // Get the full broker object for validation (like MovePosition does)
  const fullBroker = brokers.find((b) => b.underlyingAsset.name === brokerName);
  if (!fullBroker) {
    throw new Error(
      `Selected broker "${brokerName}" not found in brokers list`
    );
  }

  console.log(`[LendV2] Selected broker:`, {
    name: brokerName,
    networkAddress: coinTypeFromBroker,
    coinSymbol,
    maxDepositScaled: fullBroker.maxDepositScaled,
    scaledTotalBorrowedUnderlying: fullBroker.scaledTotalBorrowedUnderlying,
    scaledAvailableLiquidityUnderlying:
      fullBroker.scaledAvailableLiquidityUnderlying,
  });

  // VALIDATE DEPOSIT LIMIT BEFORE BUILDING TRANSACTION (like MovePosition does)
  // MovePosition checks: overBrokerDepositLimit = nextTotalSupplied > maxSupplyBroker
  // where maxSupplyBroker = Number(broker?.maxDepositScaled)
  // and nextTotalSupplied = brokerTotal + depositAmount
  // where brokerTotal = brokerBorrowedUnderlying + totalAvailableUnderlying
  const maxDepositScaled = Number(fullBroker.maxDepositScaled || "0");
  const scaledTotalBorrowed = Number(
    fullBroker.scaledTotalBorrowedUnderlying || "0"
  );
  const scaledAvailableLiquidity = Number(
    fullBroker.scaledAvailableLiquidityUnderlying || "0"
  );
  const brokerTotal = scaledTotalBorrowed + scaledAvailableLiquidity;

  // Convert deposit amount to scaled units (same as broker values)
  const coinDecimals = getCoinDecimals(coinSymbol);
  const depositAmountScaled = Number(amount) / Math.pow(10, coinDecimals);
  const nextTotalSupplied = brokerTotal + depositAmountScaled;

  console.log(`[LendV2] Deposit limit validation:`, {
    maxDepositScaled,
    brokerTotal,
    depositAmountScaled,
    nextTotalSupplied,
    wouldExceedLimit: nextTotalSupplied > maxDepositScaled,
  });

  // Check deposit limit (matching MovePosition's logic)
  // MovePosition disables the button when over limit, but allows transaction to be built
  // The simulation will catch ERR_MAX_DEPOSIT_EXCEEDED and show user-friendly error
  // We only block if pool is completely full (no space at all)
  const depositDiffToBrokerLimit = maxDepositScaled - brokerTotal;

  if (nextTotalSupplied > maxDepositScaled) {
    // Log warning but don't throw - let simulation catch it
    console.warn(
      `[LendV2] ⚠️ Deposit would exceed limit, but allowing transaction to proceed. Simulation will catch ERR_MAX_DEPOSIT_EXCEEDED.`,
      {
        maxDepositScaled,
        brokerTotal,
        nextTotalSupplied,
        depositDiffToLimit: depositDiffToBrokerLimit,
      }
    );
  }

  // Only block if pool is completely full (depositDiffToBrokerLimit <= 0)
  // Matching MovePosition's poolIsFull check
  if (depositDiffToBrokerLimit <= 0) {
    throw new Error(
      `Pool is full. The broker has reached its maximum deposit limit of ${maxDepositScaled.toFixed(6)} ${coinSymbol}. No more deposits can be accepted. Broker used: ${brokerName}, CoinType: ${coinTypeFromBroker}`
    );
  }

  // Safety check: If we detected coin store balance, ensure we're NOT using MOVE-FA broker
  if (coinSymbol === "MOVE" || coinSymbol === "APT") {
    const brokerNameLower = brokerName.toLowerCase();
    const isFABroker =
      brokerNameLower.includes("move-fa") ||
      brokerNameLower.includes("move_fa") ||
      brokerNameLower.includes("movefa");

    // Re-check balances to be sure
    let finalCoinStoreBalance = BigInt(0);
    let finalFungibleAssetBalance = BigInt(0);
    try {
      const accountResources = await aptos.account.getAccountResources({
        accountAddress: walletAddress,
      });
      const nativeCoinStoreType =
        "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>";
      const coinStore = accountResources.find(
        (resource) => resource.type === nativeCoinStoreType
      );
      if (coinStore) {
        finalCoinStoreBalance = BigInt(
          (coinStore.data as any).coin?.value || "0"
        );
      }
    } catch (e) {
      console.warn(
        "[LendV2] Could not re-check coin store in safety check:",
        e
      );
    }

    console.log(`[LendV2] Safety check:`, {
      brokerName,
      isFABroker,
      finalCoinStoreBalance: finalCoinStoreBalance.toString(),
      finalFungibleAssetBalance: finalFungibleAssetBalance.toString(),
    });

    if (finalCoinStoreBalance > BigInt(0) && isFABroker) {
      // This is a critical error - we have coin store balance but selected MOVE-FA broker
      // This means the broker selection logic failed
      throw new Error(
        `CRITICAL: Mismatch detected! You have ${(Number(finalCoinStoreBalance) / Math.pow(10, 8)).toFixed(6)} MOVE in coin store, but MOVE-FA broker (${brokerName}) was selected. This will fail. The broker selection logic did not work correctly. Please check the available brokers.`
      );
    }
  }

  if (onProgress) {
    onProgress("Fetching portfolio state...");
  }
  const currentPortfolioState = await getPortfolioStateFromAPI(
    superClient,
    walletAddress
  );

  const signerPubkey = walletAddress;
  const network = "aptos";

  // Validate amount format (use coinDecimals we already calculated)
  const amountFormatted = Number(amount) / Math.pow(10, coinDecimals);

  // Validate amount is a valid integer string (no decimals in raw amount)
  const amountBigIntValidate = BigInt(amount);
  if (amountBigIntValidate <= BigInt(0)) {
    throw new Error(
      `Invalid amount: ${amount}. Amount must be a positive integer in smallest units.`
    );
  }

  console.log(`[LendV2] Amount details:`, {
    rawAmount: amount,
    rawAmountBigInt: amountBigIntValidate.toString(),
    formattedAmount: amountFormatted,
    coinSymbol,
    coinTypeFromBroker,
    decimals: coinDecimals,
  });

  // Check balance - for MOVE, check both coin store and fungible asset store
  // Select the broker that matches the user's actual balance
  if (onProgress) {
    onProgress("Checking wallet balance...");
  }

  let coinStoreBalance = BigInt(0);
  let fungibleAssetBalance = BigInt(0);

  try {
    // Check coin store balance (for native MOVE/APT)
    if (coinSymbol === "MOVE" || coinSymbol === "APT") {
      try {
        const accountResources = await aptos.account.getAccountResources({
          accountAddress: walletAddress,
        });

        // Check for native AptosCoin
        const nativeCoinStoreType =
          "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>";
        const coinStore = accountResources.find(
          (resource) => resource.type === nativeCoinStoreType
        );

        if (coinStore) {
          coinStoreBalance = BigInt((coinStore.data as any).coin?.value || "0");
          console.log(
            `[LendV2] Coin store balance: ${coinStoreBalance.toString()}`
          );
        }
      } catch (e) {
        console.warn("[LendV2] Could not check coin store balance:", e);
      }
    }

    // Check fungible asset balance
    try {
      const balanceResponse = await fetch(
        `/api/balance?address=${encodeURIComponent(walletAddress)}&token=${encodeURIComponent(coinSymbol)}`
      );

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        if (
          balanceData.success &&
          balanceData.balances &&
          balanceData.balances.length > 0
        ) {
          const normalizedToken = coinSymbol
            .toUpperCase()
            .replace(/\./g, "")
            .trim();
          const tokenBalance = balanceData.balances.find((b: any) => {
            const normalizedSymbol = (b.metadata?.symbol || "")
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
            fungibleAssetBalance = BigInt(tokenBalance.amount || "0");
            console.log(
              `[LendV2] Fungible asset balance: ${fungibleAssetBalance.toString()}`
            );
          }
        }
      }
    } catch (e) {
      console.warn("[LendV2] Could not check fungible asset balance:", e);
    }

    // Validate balance based on what we found
    const amountBigIntCheck = BigInt(amount);
    const totalBalance =
      coinStoreBalance > BigInt(0) ? coinStoreBalance : fungibleAssetBalance;

    if (totalBalance === BigInt(0)) {
      throw new Error(
        `No balance found for ${coinSymbol}. Please ensure you have ${coinSymbol} tokens in your wallet.`
      );
    }

    const balanceFormatted = Number(totalBalance) / Math.pow(10, coinDecimals);
    const gasReserve =
      coinSymbol === "MOVE" || coinSymbol === "APT"
        ? BigInt(10000000)
        : BigInt(0);
    const totalNeeded = amountBigIntCheck + gasReserve;

    console.log(`[LendV2] Final balance check:`, {
      coinStoreBalance: coinStoreBalance.toString(),
      fungibleAssetBalance: fungibleAssetBalance.toString(),
      totalBalance: totalBalance.toString(),
      balanceFormatted: balanceFormatted.toFixed(6),
      amount: amount.toString(),
      amountFormatted: amountFormatted.toFixed(6),
      totalNeeded: totalNeeded.toString(),
      brokerName,
      coinTypeFromBroker,
    });

    if (totalBalance < totalNeeded) {
      const totalNeededFormatted =
        Number(totalNeeded) / Math.pow(10, coinDecimals);
      throw new Error(
        `Insufficient balance including gas. You need at least ${totalNeededFormatted.toFixed(6)} ${coinSymbol} but only have ${balanceFormatted.toFixed(6)} ${coinSymbol}.`
      );
    }

    if (totalBalance < amountBigIntCheck) {
      throw new Error(
        `Insufficient balance. You have ${balanceFormatted.toFixed(6)} ${coinSymbol} but trying to supply ${amountFormatted.toFixed(6)} ${coinSymbol}.`
      );
    }

    console.log(
      `[LendV2] Balance check passed. Available: ${balanceFormatted.toFixed(6)}, Needed: ${amountFormatted.toFixed(6)}`
    );
  } catch (error: any) {
    if (
      error.message.includes("Insufficient balance") ||
      error.message.includes("No balance")
    ) {
      throw error;
    }
    // If balance check fails for other reasons, log but continue (API will validate)
    console.warn("[LendV2] Balance check warning:", error.message);
  }

  if (onProgress) {
    onProgress("Requesting lend ticket...");
  }

  // Ensure amount is a clean string (no extra whitespace, valid integer)
  // MovePosition uses: amountValue = txAmount.toString() where txAmount is Math.floor(scaledAmount)
  const amountString = amount.trim();
  const amountBigIntFinal = BigInt(amountString);

  // Validate amount is a positive integer
  if (amountBigIntFinal <= BigInt(0)) {
    throw new Error(
      `Invalid amount: ${amountString}. Amount must be a positive integer.`
    );
  }

  console.log(`[LendV2] 🔵 Requesting ticket with:`, {
    amount: amountString,
    amountBigInt: amountBigIntFinal.toString(),
    amountFormatted: amountFormatted.toFixed(6),
    brokerName: brokerName,
    coinTypeFromBroker: coinTypeFromBroker,
    signerPubkey,
    network,
    portfolioState: currentPortfolioState,
  });

  let lendTicket;
  try {
    console.log(`[LendV2] 📤 Calling API: superClient.default.lendV2 with:`, {
      amount: amountString,
      brokerName: brokerName,
      coinTypeFromBroker: coinTypeFromBroker,
      signerPubkey,
      network,
    });

    lendTicket = await superClient.default.lendV2({
      amount: amountString,
      signerPubkey,
      network,
      brokerName,
      currentPortfolioState,
    });

    console.log(`[LendV2] ✅ Received ticket:`, {
      packetLength: lendTicket.packet.length,
      packetPreview: lendTicket.packet.substring(0, 50) + "...",
      brokerNameUsed: brokerName,
    });
  } catch (apiError: any) {
    console.error(`[LendV2] ❌ API error when requesting ticket:`, {
      error: apiError.message,
      errorStack: apiError.stack,
      amount: amountString,
      brokerName: brokerName,
      coinTypeFromBroker: coinTypeFromBroker,
      signerPubkey,
      coinSymbol,
    });
    throw new Error(
      `Failed to request lend ticket: ${apiError.message || "Unknown error"}. Broker used: ${brokerName}, CoinType: ${coinTypeFromBroker}. Please check your balance and try again.`
    );
  }

  if (onProgress) {
    onProgress("Decoding transaction packet...");
  }

  // Convert hex string to Uint8Array (matching MovePosition approach)
  // MovePosition uses: const packetHex = Hex.fromHexString(packet.packet)
  // const ar = packetHex.toUint8Array()
  const ticketHex = lendTicket.packet.startsWith("0x")
    ? lendTicket.packet
    : `0x${lendTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  // Convert Uint8Array to Array (like MovePosition's super* methods do)
  // MovePosition's superLendV2Ix converts Uint8Array to Array internally
  // This is required because wallets prefer Array over Uint8Array
  const packetArray = Array.from(ticketUintArray);

  // Use superLendV2Ix exactly like MovePosition (line 208 in doTx.ts)
  // MovePosition: ix = superAptosSDK.superLendV2Ix(ar, broker.underlyingAsset.networkAddress, address)
  console.log(
    `[LendV2] 🔧 Building transaction with superLendV2Ix (MovePosition approach):`,
    {
      coinTypeFromBroker: coinTypeFromBroker,
      brokerName: brokerName,
      sender: walletAddress,
      packetLength: ticketUintArray.length,
    }
  );

  // Use superLendV2Ix - matches MovePosition exactly
  // This converts Uint8Array to Array internally and includes sender
  const transactionData = sdk.superLendV2Ix(
    ticketUintArray,
    coinTypeFromBroker,
    walletAddress
  );

  // Extract function and arguments from transactionData
  // transactionData.data can be InputGenerateTransactionPayloadData or InputScriptData
  const txData = transactionData.data as any;
  const txFunction: `${string}::${string}::${string}` = txData.function;
  const txTypeArguments: string[] = txData.typeArguments || [];
  const txFunctionArguments: any[] = txData.functionArguments || [];

  console.log(`[LendV2] Transaction data from superLendV2Ix:`, {
    sender: transactionData.sender,
    function: txFunction,
    typeArguments: txTypeArguments,
    functionArgumentsLength: Array.isArray(txFunctionArguments[0])
      ? txFunctionArguments[0].length
      : "N/A",
    coinTypeUsed: coinTypeFromBroker,
    brokerNameUsed: brokerName,
  });

  if (onProgress) {
    onProgress("Building transaction...");
  }

  // Build transaction using Aptos SDK - extract data from InputTransactionData
  // MovePosition passes this directly to signAndSubmitTransaction, but we use Privy
  // so we need to build it using aptos.transaction.build.simple
  const rawTxn = await aptos.transaction.build.simple({
    sender: transactionData.sender!,
    data: {
      function: txFunction,
      typeArguments: txTypeArguments,
      functionArguments: txFunctionArguments,
    },
  });

  console.log(`[LendV2] ✅ Transaction built successfully:`, {
    function: txFunction,
    typeArguments: txTypeArguments,
    coinTypeUsed: coinTypeFromBroker,
    brokerNameUsed: brokerName,
  });

  // Override chain ID to match Movement Network
  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
  }

  // SIMULATE TRANSACTION BEFORE SIGNING (like MovePosition does)
  // This catches errors like ERR_MAX_DEPOSIT_EXCEEDED before the user signs
  if (onProgress) {
    onProgress("Simulating transaction...");
  }

  try {
    console.log(`[LendV2] 🔍 Simulating transaction before signing...`);

    // Create a simulation transaction (unsigned)
    const simulationTxn = await aptos.transaction.build.simple({
      sender: transactionData.sender!,
      data: {
        function: txFunction,
        typeArguments: txTypeArguments,
        functionArguments: txFunctionArguments,
      },
    });

    // Override chain ID for simulation too
    const simTxnObj = simulationTxn as any;
    if (simTxnObj.rawTransaction) {
      const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
      simTxnObj.rawTransaction.chain_id = movementChainIdObj;
    }

    // Prepare public key for simulation (remove 0x prefix and any scheme prefix)
    let pubKeyForSim = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    // Remove leading "00" if present (Privy adds this prefix)
    if (pubKeyForSim.startsWith("00") && pubKeyForSim.length > 64) {
      pubKeyForSim = pubKeyForSim.slice(2);
    }

    // Simulate the transaction
    // Note: signerPublicKey accepts hex string (without 0x prefix) or PublicKey object
    const simulationResult = await aptos.transaction.simulate.simple({
      signerPublicKey: pubKeyForSim as any, // Aptos SDK accepts string but TypeScript types are strict
      transaction: simulationTxn,
    });

    console.log(`[LendV2] 📊 Simulation result:`, {
      success: simulationResult[0]?.success,
      vmStatus: simulationResult[0]?.vm_status,
      gasUsed: simulationResult[0]?.gas_used,
    });

    // Check if simulation failed
    if (!simulationResult[0]?.success) {
      const vmStatus = simulationResult[0]?.vm_status || "";
      const errorMessage =
        simulationResult[0]?.vm_status || "Transaction simulation failed";

      console.error(`[LendV2] ❌ Simulation failed:`, {
        vmStatus,
        errorMessage,
        brokerName,
        coinTypeFromBroker,
      });

      // Extract error code and message from vm_status
      // Format: "Move abort in <module>::<function>: <ERROR_CODE>(<code>): <message>"
      let userFriendlyError = errorMessage;

      if (vmStatus.includes("ERR_MAX_DEPOSIT_EXCEEDED")) {
        userFriendlyError = `Maximum deposit limit exceeded. The amount you're trying to deposit exceeds the broker's maximum deposit limit. Please try a smaller amount.`;
      } else if (vmStatus.includes("ERR_INSUFFICIENT_BALANCE")) {
        userFriendlyError = `Insufficient balance. You don't have enough ${coinSymbol} to complete this transaction.`;
      } else if (vmStatus.includes("ERR_INVALID_AMOUNT")) {
        userFriendlyError = `Invalid amount. The amount you're trying to deposit is invalid.`;
      } else if (vmStatus.includes("Move abort")) {
        // Extract the error message from Move abort
        const abortMatch = vmStatus.match(
          /Move abort in [^:]+: ([^(]+)\([^)]+\): (.+)/
        );
        if (abortMatch) {
          userFriendlyError = `${abortMatch[1]}: ${abortMatch[2]}`;
        }
      }

      throw new Error(
        `Transaction simulation failed: ${userFriendlyError}. Broker used: ${brokerName}, CoinType: ${coinTypeFromBroker}`
      );
    }

    console.log(`[LendV2] ✅ Simulation passed - transaction will succeed`);
  } catch (simError: any) {
    // If simulation fails, throw a user-friendly error
    if (
      simError.message.includes("simulation failed") ||
      simError.message.includes("ERR_") ||
      simError.message.includes("Maximum deposit") ||
      simError.message.includes("Insufficient balance")
    ) {
      throw simError;
    }
    // If simulation itself errors (network issue, etc.), log but continue
    // The actual transaction submission will catch real errors
    console.warn(
      `[LendV2] ⚠️ Simulation warning (continuing anyway):`,
      simError.message
    );
  }

  // Generate signing message and hash
  const message = generateSigningMessageForTransaction(rawTxn);
  const hash = toHex(message);

  if (onProgress) {
    onProgress("Waiting for wallet signature...");
  }

  const timeoutMilliseconds = 60000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Transaction signing timed out")),
      timeoutMilliseconds
    )
  );

  const signatureResponse = await Promise.race([
    signHash(hash),
    timeoutPromise,
  ]);

  if (onProgress) {
    onProgress("Creating transaction authenticator...");
  }

  // Privy public key format: "004a4b8e35..." or "0x004a4b8e35..."
  // We need to drop the "00" prefix to get the actual 32-byte key
  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
  // Remove leading "00" if present (Privy adds this prefix)
  if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
    pubKeyNoScheme = pubKeyNoScheme.slice(2);
  }
  // Ensure we have exactly 64 hex characters (32 bytes)
  if (pubKeyNoScheme.length !== 64) {
    throw new Error(
      `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`
    );
  }
  const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(
    publicKeyObj,
    sig
  );

  if (onProgress) {
    onProgress("Submitting transaction to network...");
  }

  console.log(`[LendV2] 📤 Submitting transaction with:`, {
    brokerName: brokerName,
    coinTypeFromBroker: coinTypeFromBroker,
    function: txFunction,
    typeArguments: txTypeArguments,
  });

  const pending = await aptos.transaction.submit.simple({
    transaction: rawTxn,
    senderAuthenticator,
  });

  console.log(`[LendV2] ⏳ Transaction submitted, hash: ${pending.hash}`);

  if (onProgress) {
    onProgress("Waiting for transaction confirmation...");
  }

  try {
    const executed = await aptos.waitForTransaction({
      transactionHash: pending.hash,
    });

    if (onProgress) {
      onProgress("Transaction confirmed!");
    }

    console.log(`[LendV2] ✅ Transaction confirmed:`, {
      hash: executed.hash,
      success: executed.success,
      brokerName: brokerName,
      coinTypeFromBroker: coinTypeFromBroker,
    });

    return executed.hash;
  } catch (txError: any) {
    console.error(`[LendV2] ❌ Transaction failed:`, {
      hash: pending.hash,
      error: txError.message,
      brokerName: brokerName,
      coinTypeFromBroker: coinTypeFromBroker,
      function: txFunction,
      typeArguments: txTypeArguments,
    });
    throw new Error(
      `Transaction ${pending.hash} failed: ${txError.message}. Broker used: ${brokerName}, CoinType: ${coinTypeFromBroker}`
    );
  }
}

export async function executeRedeemV2(params: LendV2Params): Promise<string> {
  const { amount, coinSymbol, walletAddress, publicKey, signHash, onProgress } =
    params;

  if (onProgress) {
    onProgress("Initializing SDK...");
  }

  // Load config at function call time, not module load time
  const movementApiBase = requireMovementApiBase();
  const movementChainId = requireMovementChainId();

  const MOVEMENT_CHAIN_ID = movementChainId;
  const API_BASE = movementApiBase;

  const aptos = getAptosInstance();

  // Check gas balance before proceeding (like MovePosition does)
  await checkGasBalance(aptos, walletAddress, onProgress);

  const coinType = getCoinType(coinSymbol);
  const brokerAddress = getBrokerAddress(coinType);

  const sdk = new superSDK.SuperpositionAptosSDK(MOVEPOSITION_ADDRESS);
  const superClient = new superJsonApiClient.SuperClient({
    BASE: API_BASE,
  });

  if (onProgress) {
    onProgress("Fetching broker information...");
  }
  // Get broker data to use the exact networkAddress (coinType) from API
  // This matches MovePosition's approach: broker.underlyingAsset.networkAddress
  const broker = await getBrokerFromAPI(superClient, brokerAddress, coinSymbol);
  const brokerName = broker.underlyingAsset.name;
  // Use the networkAddress from the broker API response (matches MovePosition)
  const coinTypeFromBroker = broker.underlyingAsset.networkAddress;

  console.log(`[RedeemV2] Selected broker:`, {
    name: brokerName,
    networkAddress: coinTypeFromBroker,
    coinSymbol,
  });

  if (onProgress) {
    onProgress("Fetching portfolio state...");
  }
  const currentPortfolioState = await getPortfolioStateFromAPI(
    superClient,
    walletAddress
  );

  // Validate withdrawal amount against user's actual supplied balance
  // The amount parameter is in underlying tokens (raw), but we need to check against portfolio collaterals
  // Portfolio collaterals are in note tokens (raw)
  const depositNoteName = broker.depositNote?.name;
  if (!depositNoteName) {
    throw new Error(`Deposit note not found for broker ${brokerName}`);
  }

  console.log(`[RedeemV2] Validating withdrawal:`, {
    depositNoteName,
    withdrawalAmountRaw: amount,
    coinSymbol,
    brokerName,
  });

  // Find user's deposit note balance from portfolio
  const userDepositNotePosition = currentPortfolioState.collaterals.find(
    (c) => c.instrumentId === depositNoteName
  );

  if (!userDepositNotePosition) {
    throw new Error(
      `You don't have any ${coinSymbol} supplied. Cannot withdraw.`
    );
  }

  const userDepositNoteBalanceRaw = BigInt(userDepositNotePosition.amount);
  const withdrawalAmountRaw = BigInt(amount);

  // Get decimals for formatting error messages
  const coinDecimals = getCoinDecimals(coinSymbol);
  const depositNoteDecimals = broker.depositNote?.decimals ?? coinDecimals;
  const depositNoteExchangeRate = broker.depositNoteExchangeRate || 1;

  // Convert withdrawal amount from underlying tokens (raw) to note tokens (raw)
  // Following MovePosition's approach from TxForm.tsx line 676-686:
  // For WITHDRAW_TAB: depNoteAmount = scaleUp(amount, depNoteDecimals) / exchangeRate
  //                   txAmount = Math.floor(depNoteAmount)
  //
  // Since our 'amount' is already in raw underlying tokens (scaled by coinDecimals):
  // - Convert to formatted underlying: amount / 10^coinDecimals
  // - Scale up by deposit note decimals: (amount / 10^coinDecimals) * 10^depNoteDecimals
  // - Divide by exchange rate: ((amount / 10^coinDecimals) * 10^depNoteDecimals) / exchangeRate
  // - Simplify: (amount * 10^(depNoteDecimals - coinDecimals)) / exchangeRate
  // - Floor to get integer note tokens in raw units

  const decimalDiff = depositNoteDecimals - coinDecimals;
  const scaleFactor = Math.pow(10, decimalDiff);

  // Calculate note tokens: (rawUnderlying * scaleFactor) / exchangeRate
  // Use Number for the calculation, then floor and convert to BigInt
  const withdrawalAmountNoteTokensRaw = BigInt(
    Math.floor(
      (Number(withdrawalAmountRaw) * scaleFactor) / depositNoteExchangeRate
    )
  );

  console.log(`[RedeemV2] Balance comparison:`, {
    userDepositNoteBalanceRaw: userDepositNoteBalanceRaw.toString(),
    withdrawalAmountRaw: withdrawalAmountRaw.toString(),
    withdrawalAmountNoteTokensRaw: withdrawalAmountNoteTokensRaw.toString(),
    depositNoteExchangeRate,
    userBalanceFormatted: (
      Number(userDepositNoteBalanceRaw) / Math.pow(10, depositNoteDecimals)
    ).toFixed(6),
    withdrawalAmountFormatted: (
      Number(withdrawalAmountRaw) / Math.pow(10, coinDecimals)
    ).toFixed(6),
  });

  // Validate withdrawal amount doesn't exceed user's note balance
  // Compare note tokens to note tokens
  if (withdrawalAmountNoteTokensRaw > userDepositNoteBalanceRaw) {
    const userBalanceFormatted =
      (Number(userDepositNoteBalanceRaw) / Math.pow(10, depositNoteDecimals)) *
      depositNoteExchangeRate;
    const withdrawalAmountFormatted =
      Number(withdrawalAmountRaw) / Math.pow(10, coinDecimals);

    throw new Error(
      `Insufficient balance. You have ${userBalanceFormatted.toFixed(6)} ${coinSymbol} supplied, but trying to withdraw ${withdrawalAmountFormatted.toFixed(6)} ${coinSymbol}.`
    );
  }

  // Also check against available liquidity in broker
  // scaledAvailableLiquidityUnderlying is already a scaled (normalized) decimal value
  // We can use it directly as a number for comparison
  const availableLiquidityScaled = parseFloat(
    broker.scaledAvailableLiquidityUnderlying || "0"
  );
  const withdrawalAmountUnderlying =
    Number(withdrawalAmountRaw) / Math.pow(10, coinDecimals);

  // Compare withdrawal amount (in underlying tokens) against available liquidity (scaled)
  if (withdrawalAmountUnderlying > availableLiquidityScaled) {
    throw new Error(
      `Insufficient liquidity. The broker has ${availableLiquidityScaled.toFixed(6)} ${coinSymbol} available, but you're trying to withdraw ${withdrawalAmountUnderlying.toFixed(6)} ${coinSymbol}.`
    );
  }

  console.log(`[RedeemV2] ✅ Withdrawal validation passed:`, {
    userDepositNoteBalanceRaw: userDepositNoteBalanceRaw.toString(),
    withdrawalAmountRaw: withdrawalAmountRaw.toString(),
    withdrawalAmountNoteTokensRaw: withdrawalAmountNoteTokensRaw.toString(),
    availableLiquidityScaled: availableLiquidityScaled.toFixed(6),
    withdrawalAmountUnderlying: withdrawalAmountUnderlying.toFixed(6),
  });

  // CRITICAL: The API expects amount in NOTE TOKENS (raw), not underlying tokens (raw)
  // Following MovePosition's approach: for WITHDRAW, txAmount is in note tokens
  // We've already calculated withdrawalAmountNoteTokensRaw above, use that for the API
  const amountInNoteTokens = withdrawalAmountNoteTokensRaw.toString();

  console.log(`[RedeemV2] Converting amount for API:`, {
    originalAmountUnderlyingRaw: amount,
    convertedAmountNoteTokensRaw: amountInNoteTokens,
    depositNoteExchangeRate,
    coinDecimals,
    depositNoteDecimals,
  });

  const signerPubkey = walletAddress;
  const network = "aptos";

  if (onProgress) {
    onProgress("Requesting redeem ticket...");
  }
  const redeemTicket = await superClient.default.redeemV2({
    amount: amountInNoteTokens, // Use note tokens, not underlying tokens!
    signerPubkey,
    network,
    brokerName,
    currentPortfolioState,
  });

  if (onProgress) {
    onProgress("Decoding transaction packet...");
  }

  // Convert hex string to Uint8Array (matching MovePosition approach)
  // MovePosition uses: const packetHex = Hex.fromHexString(packet.packet)
  // const ar = packetHex.toUint8Array()
  const ticketHex = redeemTicket.packet.startsWith("0x")
    ? redeemTicket.packet
    : `0x${redeemTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  // Convert Uint8Array to Array (like MovePosition's super* methods do)
  // MovePosition's superRedeemV2Ix converts Uint8Array to Array internally
  // This is required because wallets prefer Array over Uint8Array
  const packetArray = Array.from(ticketUintArray);

  // Use the coinType from broker API response (matches MovePosition's broker.underlyingAsset.networkAddress)
  const redeemIX = sdk.redeemV2Ix(ticketUintArray, coinTypeFromBroker);

  if (onProgress) {
    onProgress("Building transaction...");
  }

  // Build transaction using Aptos SDK
  // Convert arguments to Array format (matching MovePosition's super* approach)
  const rawTxn = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: redeemIX.function as `${string}::${string}::${string}`,
      typeArguments: redeemIX.type_arguments || [],
      functionArguments: [packetArray], // Use Array instead of Uint8Array
    },
  });

  // Override chain ID to match Movement Network
  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
  }

  // SIMULATE TRANSACTION BEFORE SIGNING (like MovePosition does)
  // This catches errors like ERR_MAX_DEPOSIT_EXCEEDED before the user signs
  if (onProgress) {
    onProgress("Simulating transaction...");
  }

  try {
    console.log(`[RedeemV2] 🔍 Simulating transaction before signing...`);

    // Create a simulation transaction (unsigned) - use same data as rawTxn
    const simulationTxn = await aptos.transaction.build.simple({
      sender: walletAddress,
      data: {
        function: redeemIX.function as `${string}::${string}::${string}`,
        typeArguments: redeemIX.type_arguments || [],
        functionArguments: [packetArray],
      },
    });

    // Override chain ID for simulation too
    const simTxnObj = simulationTxn as any;
    if (simTxnObj.rawTransaction) {
      const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
      simTxnObj.rawTransaction.chain_id = movementChainIdObj;
    }

    // Prepare public key for simulation (remove 0x prefix and any scheme prefix)
    let pubKeyForSim = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    // Remove leading "00" if present (Privy adds this prefix)
    if (pubKeyForSim.startsWith("00") && pubKeyForSim.length > 64) {
      pubKeyForSim = pubKeyForSim.slice(2);
    }

    // Simulate the transaction
    // Note: signerPublicKey accepts hex string (without 0x prefix) or PublicKey object
    const simulationResult = await aptos.transaction.simulate.simple({
      signerPublicKey: pubKeyForSim as any, // Aptos SDK accepts string but TypeScript types are strict
      transaction: simulationTxn,
    });

    console.log(`[RedeemV2] 📊 Simulation result:`, {
      success: simulationResult[0]?.success,
      vmStatus: simulationResult[0]?.vm_status,
      gasUsed: simulationResult[0]?.gas_used,
    });

    // Check if simulation failed
    if (!simulationResult[0]?.success) {
      const vmStatus = simulationResult[0]?.vm_status || "";
      const errorMessage =
        simulationResult[0]?.vm_status || "Transaction simulation failed";

      console.error(`[RedeemV2] ❌ Simulation failed:`, {
        vmStatus,
        errorMessage,
        brokerName,
        coinTypeFromBroker,
      });

      // Extract error code and message from vm_status
      let userFriendlyError = errorMessage;

      if (vmStatus.includes("ERR_MAX_DEPOSIT_EXCEEDED")) {
        userFriendlyError = `Maximum deposit limit exceeded. The amount you're trying to redeem exceeds the broker's limits. Please try a smaller amount.`;
      } else if (vmStatus.includes("ERR_INSUFFICIENT_BALANCE")) {
        userFriendlyError = `Insufficient balance. You don't have enough ${coinSymbol} to complete this transaction.`;
      } else if (vmStatus.includes("ERR_INVALID_AMOUNT")) {
        userFriendlyError = `Invalid amount. The amount you're trying to redeem is invalid.`;
      } else if (vmStatus.includes("Move abort")) {
        // Extract the error message from Move abort
        const abortMatch = vmStatus.match(
          /Move abort in [^:]+: ([^(]+)\([^)]+\): (.+)/
        );
        if (abortMatch) {
          userFriendlyError = `${abortMatch[1]}: ${abortMatch[2]}`;
        }
      }

      throw new Error(
        `Transaction simulation failed: ${userFriendlyError}. Broker used: ${brokerName}, CoinType: ${coinTypeFromBroker}`
      );
    }

    console.log(`[RedeemV2] ✅ Simulation passed - transaction will succeed`);
  } catch (simError: any) {
    // If simulation fails, throw a user-friendly error
    if (
      simError.message.includes("simulation failed") ||
      simError.message.includes("ERR_") ||
      simError.message.includes("Maximum deposit") ||
      simError.message.includes("Insufficient balance")
    ) {
      throw simError;
    }
    // If simulation itself errors (network issue, etc.), log but continue
    console.warn(
      `[RedeemV2] ⚠️ Simulation warning (continuing anyway):`,
      simError.message
    );
  }

  // Generate signing message and hash
  const message = generateSigningMessageForTransaction(rawTxn);
  const hash = toHex(message);

  if (onProgress) {
    onProgress("Waiting for wallet signature...");
  }

  const timeoutMilliseconds = 60000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Transaction signing timed out")),
      timeoutMilliseconds
    )
  );

  const signatureResponse = await Promise.race([
    signHash(hash),
    timeoutPromise,
  ]);

  if (onProgress) {
    onProgress("Creating transaction authenticator...");
  }

  // Privy public key format: "004a4b8e35..." or "0x004a4b8e35..."
  // We need to drop the "00" prefix to get the actual 32-byte key
  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
  // Remove leading "00" if present (Privy adds this prefix)
  if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
    pubKeyNoScheme = pubKeyNoScheme.slice(2);
  }
  // Ensure we have exactly 64 hex characters (32 bytes)
  if (pubKeyNoScheme.length !== 64) {
    throw new Error(
      `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`
    );
  }
  const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(
    publicKeyObj,
    sig
  );

  if (onProgress) {
    onProgress("Submitting transaction to network...");
  }

  const pending = await aptos.transaction.submit.simple({
    transaction: rawTxn,
    senderAuthenticator,
  });

  if (onProgress) {
    onProgress("Waiting for transaction confirmation...");
  }

  const executed = await aptos.waitForTransaction({
    transactionHash: pending.hash,
  });

  if (onProgress) {
    onProgress("Transaction confirmed!");
  }

  return executed.hash;
}
