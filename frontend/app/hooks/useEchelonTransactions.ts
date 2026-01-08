/**
 * Echelon Transaction Utilities
 * Handles repay, supply, borrow transactions for Echelon protocol
 */

"use client";

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
import { store } from "@/store";

const ECHELON_CONTRACT =
  "0x6a01d5761d43a5b5a0ccbfc42edf2d02c0611464aae99a2ea0e0d4819f0550b5";

const TYPE_ARGUMENTS: Record<string, string> = {
  MOVE: "0x1::aptos_coin::AptosCoin",
  USDC: "0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39",
  USDT: "0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d",
  WBTC: "0xb06f29f24dde9c6daeec1f930f14a441a8d6c0fbea590725e88b340af3e1939c",
  WETH: "0x908828f4fb0213d4034c3ded1630bbd904e8a3a6bf3c63270887f0b06653a376",
  LBTC: "0x658f4ef6f76c8eeffdc06a30946f3f06723a7f9532e2413312b2a612183759c",
  SolvBTC: "0x527c43638a6c389a9ad702e7085f31c48223624d5102a5207dfab861f482c46d",
  ezETH: "0x2f6af255328fe11b88d840d1e367e946ccd16bd7ebddd6ee7e2ef9f7ae0c53ef",
  sUSDe: "0x74f0c7504507f7357f8a218cc70ce3fc0f4b4e9eb8474e53ca778cb1e0c6dcc5",
  rsETH: "0x51ffc9885233adf3dd411078cad57535ed1982013dc82d9d6c433a55f2e0035d",
};

const MOVEMENT_CHAIN_ID = 126;

/**
 * Get Movement RPC URL from runtime config
 */
function getMovementRpc(): string {
  const state = store.getState() as any;
  const cfg = state.config || {};
  if (!cfg.loaded) {
    // Fallback to default if config not loaded
    return "https://mainnet.movementnetwork.xyz/v1";
  }
  return cfg.movementRpc || "https://mainnet.movementnetwork.xyz/v1";
}

/**
 * Get Aptos client instance using RPC from config
 */
function getAptosClient(): Aptos {
  const movementRpc = getMovementRpc();
  return new Aptos(
    new AptosConfig({
      network: Network.CUSTOM,
      fullnode: movementRpc,
    })
  );
}

export interface AssetInfo {
  symbol: string;
  decimals: number;
  marketAddress: string;
  faAddress?: string;
  price?: number;
}

export interface RepayTransactionParams {
  asset: AssetInfo;
  amount: number;
  maxRepayable: number;
  movementWallet: {
    address: string;
  } & any;
  publicKey: string;
  signRawHash: (params: any) => Promise<{ signature: string }>;
  onStepChange: (step: string) => void;
}

export interface SupplyTransactionParams {
  asset: AssetInfo;
  amount: number;
  movementWallet: {
    address: string;
  } & any;
  publicKey: string;
  signRawHash: (params: any) => Promise<{ signature: string }>;
  onStepChange: (step: string) => void;
}

export interface BorrowTransactionParams {
  asset: AssetInfo;
  amount: number;
  availableBalance: number;
  hasCollateral: boolean;
  totalSupplyBalance: number;
  totalBorrowBalance: number;
  movementWallet: {
    address: string;
  } & any;
  publicKey: string;
  signRawHash: (params: any) => Promise<{ signature: string }>;
  onStepChange: (step: string) => void;
}

export interface WithdrawTransactionParams {
  asset: AssetInfo;
  amount: number;
  percentage: number;
  movementWallet: {
    address: string;
  } & any;
  publicKey: string;
  signRawHash: (params: any) => Promise<{ signature: string }>;
  onStepChange: (step: string) => void;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Execute a repay transaction on Echelon protocol
 */
export async function executeRepayTransaction(
  params: RepayTransactionParams
): Promise<TransactionResult> {
  const {
    asset,
    amount,
    maxRepayable,
    movementWallet,
    publicKey,
    signRawHash,
    onStepChange,
  } = params;

  try {
    // Validation
    if (amount <= 0) {
      return {
        success: false,
        error: "Please enter a valid amount to repay",
      };
    }

    if (!movementWallet?.address) {
      return {
        success: false,
        error: "Please connect a Movement wallet",
      };
    }

    const debtAmount = maxRepayable;
    if (amount > debtAmount) {
      return {
        success: false,
        error: `Cannot repay more than the debt amount (${debtAmount.toFixed(6)} ${asset.symbol})`,
      };
    }

    const senderAddress = movementWallet.address as string;

    console.log("[Repay Utility] Wallet info", {
      senderAddress: !!senderAddress,
      publicKey: !!publicKey,
    });

    if (!senderAddress || !publicKey) {
      return {
        success: false,
        error: "Wallet address or public key not found",
      };
    }

    // Determine if it's a fungible asset
    const isFungibleAsset = asset.symbol !== "MOVE" && !!asset.faAddress;

    console.log("[Repay Utility] Asset details", {
      symbol: asset.symbol,
      marketAddress: asset.marketAddress,
      faAddress: asset.faAddress,
      isFungibleAsset,
      amount,
    });

    // Convert amount to smallest unit
    const rawAmount = Math.floor(
      amount * Math.pow(10, asset.decimals)
    ).toString();

    console.log("[Repay Utility] Amount conversion", {
      amount,
      decimals: asset.decimals,
      rawAmount,
    });

    onStepChange("Building transaction...");

    // Use repay_all when repaying 100%, otherwise use repay with amount
    const isRepayAll = (amount / maxRepayable) * 100 >= 99.9;

    // Build the transaction payload
    let functionName: `${string}::${string}::${string}`;
    let typeArguments: string[] | undefined = undefined;
    let functionArguments: any[];

    if (isFungibleAsset && asset.faAddress) {
      // For fungible assets, use repay_fa or repay_all_fa (no type arguments needed)
      functionName = isRepayAll
        ? (`${ECHELON_CONTRACT}::scripts::repay_all_fa` as `${string}::${string}::${string}`)
        : (`${ECHELON_CONTRACT}::scripts::repay_fa` as `${string}::${string}::${string}`);

      functionArguments = isRepayAll
        ? [asset.marketAddress]
        : [asset.marketAddress, rawAmount];
    } else {
      // For coins (like MOVE), use repay or repay_all with type argument
      const typeArgument = TYPE_ARGUMENTS[asset.symbol];
      if (!typeArgument) {
        return {
          success: false,
          error: `Unsupported asset: ${asset.symbol}. Type argument not found.`,
        };
      }

      functionName = isRepayAll
        ? (`${ECHELON_CONTRACT}::scripts::repay_all` as `${string}::${string}::${string}`)
        : (`${ECHELON_CONTRACT}::scripts::repay` as `${string}::${string}::${string}`);

      typeArguments = [typeArgument];
      functionArguments = isRepayAll
        ? [asset.marketAddress]
        : [asset.marketAddress, rawAmount];
    }

    console.log("[Repay Utility] Building transaction", {
      functionName,
      typeArguments,
      marketAddress: asset.marketAddress,
      functionArguments,
      isRepayAll,
      isFungibleAsset,
    });

    const transactionData: any = {
      function: functionName,
      functionArguments,
    };

    // Only add typeArguments if they exist (for coin types, not fungible assets)
    if (typeArguments && typeArguments.length > 0) {
      transactionData.typeArguments = typeArguments;
    }

    const aptos = getAptosClient();
    const rawTxn = await aptos.transaction.build.simple({
      sender: senderAddress,
      data: transactionData,
    });

    const txnObj = rawTxn as any;
    if (txnObj.rawTransaction) {
      txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
    }

    console.log("[Repay Utility] Transaction built successfully");

    onStepChange("Waiting for signature...");

    const message = generateSigningMessageForTransaction(rawTxn);
    const hash = toHex(message);

    const signatureResponse = await signRawHash({
      address: senderAddress,
      chainType: "aptos",
      hash: hash as `0x${string}`,
    });

    onStepChange("Submitting transaction...");

    // Create authenticator
    let pubKeyNoScheme = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
      pubKeyNoScheme = pubKeyNoScheme.slice(2);
    }
    if (pubKeyNoScheme.length !== 64) {
      return {
        success: false,
        error: `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`,
      };
    }

    const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
    const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
    const senderAuthenticator = new AccountAuthenticatorEd25519(
      publicKeyObj,
      sig
    );

    // Submit transaction
    const pending = await aptos.transaction.submit.simple({
      transaction: rawTxn,
      senderAuthenticator,
    });

    onStepChange("Waiting for confirmation...");

    // Wait for transaction
    await aptos.waitForTransaction({
      transactionHash: pending.hash,
      options: { checkSuccess: true },
    });

    console.log("[Repay Utility] Transaction completed:", pending.hash);

    return {
      success: true,
      txHash: pending.hash,
    };
  } catch (err: any) {
    console.error("[Repay Utility] Error occurred:", err);
    console.error("[Repay Utility] Error details:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });

    // Parse Move abort errors for better user experience
    let errorMessage = err.message || "Transaction failed";

    if (errorMessage.includes("Move abort")) {
      const abortMatch = errorMessage.match(
        /Move abort in .*?::(\w+):\s*(\w+)\(0x([0-9a-fA-F]+)\)/
      );
      if (abortMatch) {
        const [, , errorName, errorCode] = abortMatch;
        errorMessage = `Transaction failed: ${errorName} (Error code: 0x${errorCode}). Please check your balance and try again.`;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute a supply transaction on Echelon protocol
 */
export async function executeSupplyTransaction(
  params: SupplyTransactionParams
): Promise<TransactionResult> {
  const {
    asset,
    amount,
    movementWallet,
    publicKey,
    signRawHash,
    onStepChange,
  } = params;

  try {
    // Validation
    if (amount <= 0) {
      return {
        success: false,
        error: "Please enter a valid amount to supply",
      };
    }

    if (!movementWallet?.address) {
      return {
        success: false,
        error: "Please connect a Movement wallet",
      };
    }

    const senderAddress = movementWallet.address;
    const numericAmount = amount;

    // Determine if it's a fungible asset
    const knownFungibleAssets = [
      "USDC",
      "USDT",
      "WBTC",
      "WETH",
      "LBTC",
      "SolvBTC",
      "ezETH",
      "sUSDe",
      "rsETH",
    ];
    const isKnownFungible = knownFungibleAssets.includes(
      asset.symbol.toUpperCase()
    );
    const isFungibleAsset =
      asset.symbol.toUpperCase() !== "MOVE" &&
      (!!asset.faAddress || isKnownFungible);

    // Verify balance
    onStepChange("Verifying balance...");

    let actualDecimals = asset.decimals || 8;
    let rawAmount: string;

    if (isFungibleAsset) {
      try {
        const balanceResponse = await fetch(
          `/api/balance?address=${encodeURIComponent(senderAddress)}&token=${encodeURIComponent(asset.symbol)}`
        );

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          if (
            balanceData.success &&
            balanceData.balances &&
            balanceData.balances.length > 0
          ) {
            const normalizedToken = asset.symbol
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
              actualDecimals =
                tokenBalance.metadata?.decimals || asset.decimals || 8;
              rawAmount = Math.floor(
                numericAmount * Math.pow(10, actualDecimals)
              ).toString();

              const balanceAmount = BigInt(tokenBalance.amount || "0");
              const requestedAmount = BigInt(rawAmount);

              if (balanceAmount < requestedAmount) {
                const balanceFormatted =
                  Number(balanceAmount) / Math.pow(10, actualDecimals);
                return {
                  success: false,
                  error: `Insufficient balance. You have ${balanceFormatted.toFixed(actualDecimals)} ${asset.symbol}, but trying to supply ${numericAmount} ${asset.symbol}.`,
                };
              }
            } else {
              return {
                success: false,
                error: `No balance found for ${asset.symbol}. Please ensure you have ${asset.symbol} tokens in your wallet.`,
              };
            }
          } else {
            return {
              success: false,
              error: `No balance found for ${asset.symbol}. Please ensure you have ${asset.symbol} tokens in your wallet.`,
            };
          }
        } else {
          actualDecimals = asset.decimals || 8;
          rawAmount = Math.floor(
            numericAmount * Math.pow(10, actualDecimals)
          ).toString();
        }
      } catch (balanceError: any) {
        actualDecimals = asset.decimals || 8;
        rawAmount = Math.floor(
          numericAmount * Math.pow(10, actualDecimals)
        ).toString();
      }
    } else {
      // For coins (MOVE/APT) - check both coin store and FA balance
      actualDecimals = 8;
      rawAmount = Math.floor(
        numericAmount * Math.pow(10, actualDecimals)
      ).toString();

      try {
        const coinType = TYPE_ARGUMENTS[asset.symbol];
        const coinStoreResource = `0x1::coin::CoinStore<${coinType}>`;
        const faResource = `0x1::fungible_asset::Balance<${coinType}>`;

        const aptos = getAptosClient();
        const resources = await aptos.account.getAccountResources({
          accountAddress: senderAddress,
        });
        const coinStore = resources.find((r) => r.type === coinStoreResource);

        let coinBalance = BigInt(0);
        let faBalance = BigInt(0);

        // Check coin store balance (legacy, but still valid during migration)
        if (coinStore) {
          coinBalance = BigInt((coinStore.data as any)?.coin?.value || "0");
        }

        // Check FA balance for all coin types (not just MOVE/APT)
        // According to Aptos FA migration: all coins can have both CoinStore and FA balances
        try {
          const faRes: any = await aptos.account.getAccountResource({
            accountAddress: senderAddress,
            resourceType: faResource as `${string}::${string}::${string}`,
          });
          const faBalanceValue = faRes?.data?.balance ?? faRes?.data?.value;
          if (faBalanceValue != null) {
            faBalance = BigInt(faBalanceValue);
          }
        } catch (_) {
          // FA balance not found via resource, try balance API for MOVE/APT
          // Asset type 0xa (0x000000000000000000000000000000000000000000000000000000000000000a) is FA MOVE
          if (coinType === "0x1::aptos_coin::AptosCoin") {
            try {
              // Try fetching from balance API (which handles asset type 0xa)
            try {
              const balanceResponse = await fetch(
                `/api/balance?address=${encodeURIComponent(senderAddress)}&token=MOVE`
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
                      assetType ===
                        "0x000000000000000000000000000000000000000000000000000000000000000a" ||
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
                  "[Echelon] Could not fetch FA balance from API:",
                  apiError
                );
              }
            }
          }
        }

        // Sum both balances (user may have both during migration period)
        // According to Aptos FA migration best practices: aggregate both balances
        const totalBalance = coinBalance + faBalance;
        
        if (faBalance > BigInt(0)) {
          console.log(
            `[Echelon] Balance check for ${asset.symbol}: CoinStore=${coinBalance.toString()}, FA=${faBalance.toString()}, Total=${totalBalance.toString()}`
          );
        }
        
        coinBalance = totalBalance;

        if (coinBalance === BigInt(0)) {
          return {
            success: false,
            error: `No balance found for ${asset.symbol}. Please ensure you have ${asset.symbol} tokens (coin store or fungible asset) in your wallet.`,
          };
        }
        const requestedAmount = BigInt(rawAmount);

        if (coinBalance < requestedAmount) {
          const balanceFormatted =
            Number(coinBalance) / Math.pow(10, actualDecimals);
          return {
            success: false,
            error: `Insufficient balance. You have ${balanceFormatted.toFixed(actualDecimals)} ${asset.symbol}, but trying to supply ${numericAmount} ${asset.symbol}.`,
          };
        }
      } catch (balanceError: any) {
        console.warn(
          "[Supply Utility] Coin balance check failed:",
          balanceError
        );
      }
    }

    onStepChange("Building transaction...");

    // Build transaction
    let functionName: `${string}::${string}::${string}`;
    let typeArguments: string[] | undefined = undefined;
    let functionArguments: any[];

    if (isFungibleAsset) {
      functionName =
        `${ECHELON_CONTRACT}::scripts::supply_fa` as `${string}::${string}::${string}`;
      functionArguments = [asset.marketAddress, rawAmount];
    } else {
      const typeArgument = TYPE_ARGUMENTS[asset.symbol];
      if (!typeArgument) {
        return {
          success: false,
          error: `Unsupported asset: ${asset.symbol}. Type argument not found.`,
        };
      }
      functionName =
        `${ECHELON_CONTRACT}::scripts::supply` as `${string}::${string}::${string}`;
      typeArguments = [typeArgument];
      functionArguments = [asset.marketAddress, rawAmount];
    }

    const transactionData: any = {
      function: functionName,
      functionArguments,
    };

    if (typeArguments && typeArguments.length > 0) {
      transactionData.typeArguments = typeArguments;
    }

    const aptos = getAptosClient();
    const rawTxn = await aptos.transaction.build.simple({
      sender: senderAddress,
      data: transactionData,
    });

    const txnObj = rawTxn as any;
    if (txnObj.rawTransaction) {
      txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
    }

    onStepChange("Waiting for signature...");

    const message = generateSigningMessageForTransaction(rawTxn);
    const hash = toHex(message);

    const signatureResponse = await signRawHash({
      address: senderAddress,
      chainType: "aptos",
      hash: hash as `0x${string}`,
    });

    onStepChange("Submitting transaction...");

    let pubKeyNoScheme = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
      pubKeyNoScheme = pubKeyNoScheme.slice(2);
    }
    if (pubKeyNoScheme.length !== 64) {
      return {
        success: false,
        error: `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`,
      };
    }

    const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
    const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
    const senderAuthenticator = new AccountAuthenticatorEd25519(
      publicKeyObj,
      sig
    );

    const pending = await aptos.transaction.submit.simple({
      transaction: rawTxn,
      senderAuthenticator,
    });

    onStepChange("Waiting for confirmation...");

    await aptos.waitForTransaction({
      transactionHash: pending.hash,
      options: { checkSuccess: true },
    });

    return {
      success: true,
      txHash: pending.hash,
    };
  } catch (err: any) {
    console.error("[Supply Utility] Error occurred:", err);
    let errorMessage = err.message || "Transaction failed";

    if (errorMessage.includes("Move abort")) {
      const abortMatch = errorMessage.match(
        /Move abort in .*?::(\w+):\s*(\w+)\(0x([0-9a-fA-F]+)\)/
      );
      if (abortMatch) {
        const [, , errorName, errorCode] = abortMatch;
        errorMessage = `Transaction failed: ${errorName} (Error code: 0x${errorCode}). Please check your balance and try again.`;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute a borrow transaction on Echelon protocol
 */
export async function executeBorrowTransaction(
  params: BorrowTransactionParams
): Promise<TransactionResult> {
  const {
    asset,
    amount,
    availableBalance,
    hasCollateral,
    totalSupplyBalance,
    totalBorrowBalance,
    movementWallet,
    publicKey,
    signRawHash,
    onStepChange,
  } = params;

  try {
    const numericAmount = amount;

    // Validation
    if (!asset || numericAmount <= 0) {
      return {
        success: false,
        error: "Please enter a valid amount to borrow",
      };
    }

    if (!movementWallet?.address) {
      return {
        success: false,
        error: "Please connect a Movement wallet",
      };
    }

    // Validate collateral
    if (!hasCollateral && totalSupplyBalance <= 0) {
      return {
        success: false,
        error:
          "You need to supply collateral before you can borrow. Please supply assets first.",
      };
    }

    // Validate borrowing power
    if (availableBalance <= 0) {
      let errorMsg;
      if (hasCollateral) {
        errorMsg = `Insufficient borrowing power. ${totalBorrowBalance > 0 ? `You have ${totalBorrowBalance.toFixed(2)} USD borrowed. ` : ""}${totalSupplyBalance > 0 ? `Your collateral is worth ${totalSupplyBalance.toFixed(2)} USD. ` : "Your collateral value is being calculated. "}Please supply more assets or repay existing borrows to increase your borrowing power.`;
      } else {
        errorMsg = `Insufficient borrowing power. You have ${totalBorrowBalance.toFixed(2)} USD borrowed against ${totalSupplyBalance.toFixed(2)} USD collateral. Please supply more assets or repay existing borrows.`;
      }
      return {
        success: false,
        error: errorMsg,
      };
    }

    // Validate against availableBalance (which already includes 10% safety buffer)
    // Add a small tolerance for floating point precision
    const TOLERANCE = 0.000001;
    if (numericAmount > availableBalance + TOLERANCE) {
      return {
        success: false,
        error: `Insufficient borrowing power. You can borrow up to ${availableBalance.toFixed(6)} ${asset.symbol} based on your collateral.`,
      };
    }

    // Use the entered amount (availableBalance is already conservative enough)
    const finalAmount = numericAmount;

    const senderAddress = movementWallet.address;

    // Determine asset type
    const isFungibleAsset = asset.symbol !== "MOVE" && !!asset.faAddress;

    onStepChange("Building transaction...");

    // Convert amount (use the reduced safe amount)
    const decimals = asset.decimals || 8;
    const maxU64 = BigInt("18446744073709551615");
    const maxAmount = Number(maxU64) / Math.pow(10, decimals);

    if (finalAmount > maxAmount) {
      return {
        success: false,
        error: `Amount too large. Maximum borrowable amount is ${maxAmount.toFixed(decimals)} ${asset.symbol}`,
      };
    }

    if (finalAmount <= 0) {
      return {
        success: false,
        error: "Amount must be greater than 0",
      };
    }

    const multiplier = Math.pow(10, decimals);

    if (finalAmount * multiplier > Number.MAX_SAFE_INTEGER) {
      return {
        success: false,
        error: "Amount too large. Please use a smaller amount.",
      };
    }

    const rawAmountNum = Math.floor(finalAmount * multiplier);
    const maxU64Num = Number(maxU64);

    if (rawAmountNum > maxU64Num || !Number.isSafeInteger(rawAmountNum)) {
      return {
        success: false,
        error: `Amount too large. Maximum borrowable amount is ${maxAmount.toFixed(decimals)} ${asset.symbol}`,
      };
    }

    if (rawAmountNum <= 0) {
      return {
        success: false,
        error: "Amount must be greater than 0",
      };
    }

    const rawAmount = rawAmountNum.toString();

    // Build transaction
    let functionName: `${string}::${string}::${string}`;
    let typeArguments: string[] | undefined = undefined;
    let functionArguments: any[];

    if (isFungibleAsset && asset.faAddress) {
      functionName =
        `${ECHELON_CONTRACT}::scripts::borrow_fa` as `${string}::${string}::${string}`;
      functionArguments = [asset.marketAddress, rawAmount];
    } else {
      const typeArgument = TYPE_ARGUMENTS[asset.symbol];
      if (!typeArgument) {
        return {
          success: false,
          error: `Unsupported asset: ${asset.symbol}. Type argument not found.`,
        };
      }
      functionName =
        `${ECHELON_CONTRACT}::scripts::borrow` as `${string}::${string}::${string}`;
      typeArguments = [typeArgument];
      functionArguments = [asset.marketAddress, rawAmount];
    }

    const transactionData: any = {
      function: functionName,
      functionArguments,
    };

    if (typeArguments && typeArguments.length > 0) {
      transactionData.typeArguments = typeArguments;
    }

    const aptos = getAptosClient();
    const rawTxn = await aptos.transaction.build.simple({
      sender: senderAddress,
      data: transactionData,
    });

    const txnObj = rawTxn as any;
    if (txnObj.rawTransaction) {
      txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
    }

    onStepChange("Waiting for signature...");

    const message = generateSigningMessageForTransaction(rawTxn);
    const hash = toHex(message);

    const signatureResponse = await signRawHash({
      address: senderAddress,
      chainType: "aptos",
      hash: hash as `0x${string}`,
    });

    onStepChange("Submitting transaction...");

    let pubKeyNoScheme = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
      pubKeyNoScheme = pubKeyNoScheme.slice(2);
    }
    if (pubKeyNoScheme.length !== 64) {
      return {
        success: false,
        error: `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`,
      };
    }

    const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
    const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
    const senderAuthenticator = new AccountAuthenticatorEd25519(
      publicKeyObj,
      sig
    );

    const pending = await aptos.transaction.submit.simple({
      transaction: rawTxn,
      senderAuthenticator,
    });

    onStepChange("Waiting for confirmation...");

    await aptos.waitForTransaction({
      transactionHash: pending.hash,
      options: { checkSuccess: true },
    });

    return {
      success: true,
      txHash: pending.hash,
    };
  } catch (err: any) {
    console.error("[Borrow Utility] Error occurred:", err);
    let errorMessage = err.message || "Transaction failed";

    if (errorMessage.includes("ERR_LENDING_INSUFFICIENT_BORROW_POWER")) {
      errorMessage =
        "Insufficient borrowing power. You don't have enough collateral to borrow this amount. Please supply more assets or reduce the borrow amount.";
    } else if (errorMessage.includes("Move abort")) {
      const abortMatch = errorMessage.match(
        /Move abort in .*?::(\w+):\s*(\w+)\(0x([0-9a-fA-F]+)\)/
      );
      if (abortMatch) {
        const [, , errorName, errorCode] = abortMatch;
        errorMessage = `Transaction failed: ${errorName} (Error code: 0x${errorCode}).`;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute a withdraw transaction on Echelon protocol
 */
export async function executeWithdrawTransaction(
  params: WithdrawTransactionParams
): Promise<TransactionResult> {
  const {
    asset,
    amount,
    percentage,
    movementWallet,
    publicKey,
    signRawHash,
    onStepChange,
  } = params;

  try {
    const numericAmount = amount;

    if (!asset || numericAmount <= 0) {
      return {
        success: false,
        error: "Please enter a valid amount to withdraw",
      };
    }

    if (!movementWallet?.address) {
      return {
        success: false,
        error: "Please connect a Movement wallet",
      };
    }

    const senderAddress = movementWallet.address;

    // Determine if it's a fungible asset
    const isFungibleAsset = asset.symbol !== "MOVE" && !!asset.faAddress;

    onStepChange("Building transaction...");

    const isWithdrawAll = percentage >= 99.9;

    // Build transaction
    let functionName: `${string}::${string}::${string}`;
    let typeArguments: string[] | undefined = undefined;
    let functionArguments: any[];

    if (isFungibleAsset && asset.faAddress) {
      functionName = isWithdrawAll
        ? (`${ECHELON_CONTRACT}::scripts::withdraw_all_fa` as `${string}::${string}::${string}`)
        : (`${ECHELON_CONTRACT}::scripts::withdraw_fa` as `${string}::${string}::${string}`);

      functionArguments = isWithdrawAll
        ? [asset.marketAddress]
        : [
            asset.marketAddress,
            Math.floor(numericAmount * Math.pow(10, asset.decimals)).toString(),
          ];
    } else {
      const typeArgument = TYPE_ARGUMENTS[asset.symbol];
      if (!typeArgument) {
        return {
          success: false,
          error: `Unsupported asset: ${asset.symbol}. Type argument not found.`,
        };
      }

      functionName = isWithdrawAll
        ? (`${ECHELON_CONTRACT}::scripts::withdraw_all` as `${string}::${string}::${string}`)
        : (`${ECHELON_CONTRACT}::scripts::withdraw` as `${string}::${string}::${string}`);

      typeArguments = [typeArgument];
      functionArguments = isWithdrawAll
        ? [asset.marketAddress]
        : [
            asset.marketAddress,
            Math.floor(numericAmount * Math.pow(10, asset.decimals)).toString(),
          ];
    }

    const transactionData: any = {
      function: functionName,
      functionArguments,
    };

    if (typeArguments && typeArguments.length > 0) {
      transactionData.typeArguments = typeArguments;
    }

    const aptos = getAptosClient();
    const rawTxn = await aptos.transaction.build.simple({
      sender: senderAddress,
      data: transactionData,
    });

    const txnObj = rawTxn as any;
    if (txnObj.rawTransaction) {
      txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
    }

    onStepChange("Waiting for signature...");

    const message = generateSigningMessageForTransaction(rawTxn);
    const hash = toHex(message);

    const signatureResponse = await signRawHash({
      address: senderAddress,
      chainType: "aptos",
      hash: hash as `0x${string}`,
    });

    onStepChange("Submitting transaction...");

    let pubKeyNoScheme = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
      pubKeyNoScheme = pubKeyNoScheme.slice(2);
    }
    if (pubKeyNoScheme.length !== 64) {
      return {
        success: false,
        error: `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`,
      };
    }

    const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
    const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
    const senderAuthenticator = new AccountAuthenticatorEd25519(
      publicKeyObj,
      sig
    );

    const pending = await aptos.transaction.submit.simple({
      transaction: rawTxn,
      senderAuthenticator,
    });

    onStepChange("Waiting for confirmation...");

    await aptos.waitForTransaction({
      transactionHash: pending.hash,
      options: { checkSuccess: true },
    });

    return {
      success: true,
      txHash: pending.hash,
    };
  } catch (err: any) {
    console.error("[Withdraw Utility] Error occurred:", err);
    let errorMessage = err.message || "Transaction failed";

    if (errorMessage.includes("Move abort")) {
      const abortMatch = errorMessage.match(
        /Move abort in .*?::(\w+):\s*(\w+)\(0x([0-9a-fA-F]+)\)/
      );
      if (abortMatch) {
        const [, , errorName, errorCode] = abortMatch;
        errorMessage = `Transaction failed: ${errorName} (Error code: 0x${errorCode}).`;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
