/**
 * Shared token utilities for both scripts and frontend
 * Handles token type mapping, decimals, and amount conversions
 */

export const MOVEPOSITION_ADDRESS =
  "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf";

export function getCoinType(coinSymbol: string = "APT"): string {
  const coinTypes: Record<string, string> = {
    APT: "0x1::aptos_coin::AptosCoin",
    MOVE: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::MOVE",
    USDC: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDC",
    USDT: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDt",
    WETH: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WETH",
    WBTC: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WBTC",
    EZETH:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::EZETH",
    STBTC:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::STBTC",
    RSETH:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::RSETH",
    WEETH:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WEETH",
    LBTC: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::LBTC",
    USDA: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDa",
    SUSDA:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::SUSDa",
  };
  return coinTypes[coinSymbol.toUpperCase()] || coinTypes.APT;
}

export function getCoinDecimals(coinSymbol: string = "APT"): number {
  const decimals: Record<string, number> = {
    APT: 8,
    MOVE: 8,
    USDC: 6,
    USDT: 6,
    WETH: 8,
    WBTC: 8,
    EZETH: 8,
    STBTC: 8,
    RSETH: 8,
    WEETH: 8,
    LBTC: 8,
    USDA: 8,
    SUSDA: 8,
  };
  return decimals[coinSymbol.toUpperCase()] || 8;
}

export function convertAmountToRaw(amount: string, decimals: number): string {
  // Trim whitespace
  const trimmedAmount = amount.trim();
  if (!trimmedAmount || trimmedAmount === "") {
    throw new Error(`Invalid amount: empty string`);
  }
  
  const amountNum = parseFloat(trimmedAmount);
  if (isNaN(amountNum)) {
    throw new Error(`Invalid amount: ${amount} is not a valid number`);
  }
  
  if (amountNum <= 0) {
    throw new Error(`Invalid amount: ${amount} must be greater than 0`);
  }
  
  const multiplier = Math.pow(10, decimals);
  const rawAmount = Math.floor(amountNum * multiplier);
  
  if (rawAmount <= 0) {
    throw new Error(
      `Amount ${amount} is too small to convert to raw units (decimals: ${decimals}). ` +
      `Minimum amount: ${1 / multiplier}`
    );
  }
  
  return rawAmount.toString();
}

export function convertAmountFromRaw(
  rawAmount: string,
  decimals: number
): string {
  const rawNum = BigInt(rawAmount);
  const divisor = BigInt(Math.pow(10, decimals));
  const wholePart = rawNum / divisor;
  const fractionalPart = rawNum % divisor;
  if (fractionalPart === BigInt(0)) {
    return wholePart.toString();
  }
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  const trimmedFractional = fractionalStr.replace(/0+$/, "");
  return trimmedFractional
    ? `${wholePart}.${trimmedFractional}`
    : wholePart.toString();
}

export function getBrokerAddress(coinType: string): string {
  return `${MOVEPOSITION_ADDRESS}::broker::Broker<${coinType}>`;
}
