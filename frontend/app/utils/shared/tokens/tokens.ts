/**
 * Movement Network Token Addresses
 *
 * Common token addresses on Movement Network for transfers.
 * These are the contract addresses for various tokens.
 */

export interface TokenInfo {
  id: string;
  decimals: number;
  name: string;
  symbol: string;
  type: "coin" | "fungibleAsset";
  isVerified: boolean;
  iconUri?: string;
  faAddress: string;
  coinType?: string;
}

/**
 * Token address mapping for Movement Network
 * Note: These are example addresses - update with actual Movement Network token addresses
 */
export const MOVEMENT_TOKENS: Record<string, TokenInfo> = {
  MOVE: {
    id: "move",
    symbol: "MOVE",
    name: "Movement",
    faAddress: "0x1::aptos_coin::AptosCoin", // Native token - uses special address
    decimals: 8, // Movement uses 8 decimals like Aptos
    type: "coin",
    isVerified: true,
  },
  // Add more tokens as needed - these are placeholder addresses
  USDC: {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    faAddress: "0x1::coin::USDC", // Update with actual USDC address on Movement
    decimals: 6,
    type: "coin",
    isVerified: true,
  },
  USDT: {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    faAddress: "0x1::coin::USDT", // Update with actual USDT address on Movement
    decimals: 6,
    type: "coin",
    isVerified: true,
  },
  DAI: {
    id: "dai",
    symbol: "DAI",
    name: "Dai Stablecoin",
    faAddress: "0x1::coin::DAI", // Update with actual DAI address on Movement
    decimals: 18,
    type: "coin",
    isVerified: true,
  },
};
