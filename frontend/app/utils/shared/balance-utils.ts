import { Aptos } from "@aptos-labs/ts-sdk";

/**
 * Native token asset type (FA MOVE) - asset type 0xa
 * This is the fungible asset representation of native MOVE token
 */
const NATIVE_TOKEN_ASSET_TYPE =
  "0x000000000000000000000000000000000000000000000000000000000000000a";

/**
 * Coin store type for MOVE/APT (deprecated but some wallets still have it)
 * According to Aptos FA migration: CoinStore is automatically converted to FA,
 * but some wallets may still have CoinStore balances during migration period
 */
const APTOS_COIN_TYPE = "0x1::aptos_coin::AptosCoin";
const COIN_STORE_TYPE = `0x1::coin::CoinStore<${APTOS_COIN_TYPE}>`;
const FA_BALANCE_TYPE = `0x1::fungible_asset::Balance<${APTOS_COIN_TYPE}>`;

/**
 * Result of checking MOVE/APT balance
 * Includes both CoinStore (legacy) and FA (new) balances
 */
export interface MoveBalanceResult {
  hasBalance: boolean;
  coinStoreBalance: bigint;
  faBalance: bigint;
  totalBalance: bigint;
}

/**
 * Generic balance result for any coin type
 */
export interface CoinBalanceResult {
  hasBalance: boolean;
  coinStoreBalance: bigint;
  faBalance: bigint;
  totalBalance: bigint;
  coinType: string;
}

/**
 * Checks both FA balance (asset type 0xa) and coin store balance (0x1::aptos_coin::AptosCoin)
 * for MOVE/APT tokens. Both are treated as valid balances.
 * 
 * According to Aptos FA migration best practices:
 * - Always check both CoinStore and FA balances
 * - Sum both balances for accurate total
 * - CoinStore is deprecated but still valid during migration
 * 
 * @param aptos - Aptos SDK instance
 * @param address - Wallet address to check
 * @returns Balance information including both types
 */
export async function checkMoveBalance(
  aptos: Aptos,
  address: string
): Promise<MoveBalanceResult> {
  let coinStoreBalance = BigInt(0);
  let faBalance = BigInt(0);

  try {
    // Check coin store balance (deprecated but some wallets still have it)
    try {
      const resources = await aptos.account.getAccountResources({
        accountAddress: address,
      });
      const coinStore = resources.find((r) => r.type === COIN_STORE_TYPE);
      if (coinStore) {
        coinStoreBalance = BigInt((coinStore.data as any)?.coin?.value || "0");
      }
    } catch (_) {
      // Coin store not found, continue
    }

    // Check FA balance (asset type 0xa) via resource
    try {
      const faRes: any = await aptos.account.getAccountResource({
        accountAddress: address,
        resourceType: FA_BALANCE_TYPE as `${string}::${string}::${string}`,
      });
      const faBalanceValue = faRes?.data?.balance ?? faRes?.data?.value;
      if (faBalanceValue != null) {
        faBalance = BigInt(faBalanceValue);
      }
    } catch (_) {
      // FA balance not found via resource, try balance API
      try {
        const balanceResponse = await fetch(
          `/api/balance?address=${encodeURIComponent(address)}&token=MOVE`
        );
        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          if (
            balanceData.success &&
            balanceData.balances &&
            balanceData.balances.length > 0
          ) {
            // Find MOVE balance (asset type 0xa or symbol MOVE)
            const moveBalance = balanceData.balances.find((b: any) => {
              const assetType = (b.assetType || "").toLowerCase();
              const symbol = (b.metadata?.symbol || "").toUpperCase();
              // Check for asset type 0xa (FA MOVE) or symbol MOVE
              return (
                assetType === NATIVE_TOKEN_ASSET_TYPE.toLowerCase() ||
                assetType === "0xa" ||
                symbol === "MOVE"
              );
            });
            if (moveBalance) {
              faBalance = BigInt(moveBalance.amount || "0");
            }
          }
        }
      } catch (apiError) {
        // Balance API failed, continue with coin store balance only
        console.warn(
          "[BalanceUtils] Could not fetch FA balance from API:",
          apiError
        );
      }
    }
  } catch (error) {
    console.warn("[BalanceUtils] Error checking balance:", error);
  }

  const totalBalance = coinStoreBalance + faBalance;
  const hasBalance = totalBalance > BigInt(0);

  return {
    hasBalance,
    coinStoreBalance,
    faBalance,
    totalBalance,
  };
}

/**
 * Checks balance for any coin type (not just MOVE/APT)
 * Checks both CoinStore and FA balances according to Aptos FA migration best practices
 * 
 * @param aptos - Aptos SDK instance
 * @param address - Wallet address to check
 * @param coinType - Coin type (e.g., "0x1::aptos_coin::AptosCoin" or custom coin type)
 * @returns Balance information including both CoinStore and FA balances
 */
export async function checkCoinBalance(
  aptos: Aptos,
  address: string,
  coinType: string
): Promise<CoinBalanceResult> {
  let coinStoreBalance = BigInt(0);
  let faBalance = BigInt(0);

  try {
    const coinStoreType = `0x1::coin::CoinStore<${coinType}>`;
    const faType = `0x1::fungible_asset::Balance<${coinType}>`;

    // Check CoinStore balance (legacy, but still valid during migration)
    try {
      const csRes: any = await aptos.account.getAccountResource({
        accountAddress: address,
        resourceType: coinStoreType as `${string}::${string}::${string}`,
      });
      const val = csRes?.data?.coin?.value ?? csRes?.data?.balance;
      if (val != null) {
        coinStoreBalance = BigInt(val);
      }
    } catch (_) {
      // CoinStore not found, continue
    }

    // Check FA balance (new standard)
    try {
      const faRes: any = await aptos.account.getAccountResource({
        accountAddress: address,
        resourceType: faType as `${string}::${string}::${string}`,
      });
      const faBalanceValue = faRes?.data?.balance ?? faRes?.data?.value;
      if (faBalanceValue != null) {
        faBalance = BigInt(faBalanceValue);
      }
    } catch (_) {
      // FA balance not found, continue
    }
  } catch (error) {
    console.warn(`[BalanceUtils] Error checking balance for ${coinType}:`, error);
  }

  const totalBalance = coinStoreBalance + faBalance;
  const hasBalance = totalBalance > BigInt(0);

  return {
    hasBalance,
    coinStoreBalance,
    faBalance,
    totalBalance,
    coinType,
  };
}

/**
 * Checks if user has sufficient gas balance (MOVE/APT) for transactions.
 * Accepts both FA balance (asset type 0xa) and coin store balance.
 * 
 * According to Aptos FA migration:
 * - Both CoinStore and FA balances are valid
 * - Total balance = CoinStore + FA balance
 * 
 * @param aptos - Aptos SDK instance
 * @param address - Wallet address to check
 * @param onProgress - Optional progress callback
 * @throws Error if no balance found
 */
export async function checkGasBalanceWithFA(
  aptos: Aptos,
  address: string,
  onProgress?: (step: string) => void
): Promise<void> {
  onProgress?.("Checking gas balance...");

  const balanceResult = await checkMoveBalance(aptos, address);

  if (!balanceResult.hasBalance) {
    throw new Error(
      "No MOVE balance found. You need MOVE tokens (coin store or fungible asset) for transaction fees. Please add MOVE to your wallet."
    );
  }

  console.log(
    `[GasCheck] ✅ Gas balance: ${balanceResult.totalBalance.toString()} (${(Number(balanceResult.totalBalance) / Math.pow(10, 8)).toFixed(6)} MOVE) - CoinStore: ${balanceResult.coinStoreBalance.toString()}, FA: ${balanceResult.faBalance.toString()}`
  );
}
