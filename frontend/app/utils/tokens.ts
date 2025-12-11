/**
 * Movement Network Token Addresses
 *
 * Common token addresses on Movement Network for transfers.
 * These are the contract addresses for various tokens.
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

/**
 * Token address mapping for Movement Network
 * Note: These are example addresses - update with actual Movement Network token addresses
 */
export const MOVEMENT_TOKENS: Record<string, TokenInfo> = {
  MOVE: {
    symbol: "MOVE",
    name: "Movement",
    address: "0x1::aptos_coin::AptosCoin", // Native token - uses special address
    decimals: 8, // Movement uses 8 decimals like Aptos
  },
  // Add more tokens as needed - these are placeholder addresses
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x1::coin::USDC", // Update with actual USDC address on Movement
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x1::coin::USDT", // Update with actual USDT address on Movement
    decimals: 6,
  },
  DAI: {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0x1::coin::DAI", // Update with actual DAI address on Movement
    decimals: 18,
  },
};

/**
 * Get token info by symbol
 */
export function getTokenInfo(symbol: string): TokenInfo | null {
  const upperSymbol = symbol.toUpperCase();
  return MOVEMENT_TOKENS[upperSymbol] || null;
}

/**
 * Check if token is native MOVE token
 */
export function isNativeToken(symbol: string): boolean {
  return symbol.toUpperCase() === "MOVE";
}

