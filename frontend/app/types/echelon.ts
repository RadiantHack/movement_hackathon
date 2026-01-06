/**
 * Echelon Protocol Type Definitions
 * Shared types for Echelon lending protocol interactions
 */

export interface EchelonAsset {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  supplyApr: number;
  borrowApr: number;
  supplyCap: number;
  borrowCap: number;
  ltv: number;
  decimals: number;
  faAddress: string;
  market?: string;
  totalCash?: number;
}

export interface MarketStats {
  totalShares: number;
  totalLiability: number;
  totalReserve: number;
  totalCash: number;
}

export interface UserSupply {
  marketAddress: string;
  amount: string;
  symbol: string;
  icon: string;
  price: number;
  apr: number;
  decimals: number;
}

export interface UserBorrow {
  marketAddress: string;
  amount: string;
  symbol: string;
  icon: string;
  price: number;
  apr: number;
  decimals: number;
}
