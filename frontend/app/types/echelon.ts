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

/**
 * Raw vault collateral item from API response
 */
export interface RawVaultCollateral {
  key: {
    inner: string; // marketAddress
  };
  value: string; // shares (u64)
}

/**
 * Processed vault collateral with coin amount
 */
export interface ProcessedVaultCollateral {
  marketAddress: string;
  shares: string;
  coinAmount: string;
}

/**
 * Raw vault liability item from API response
 */
export interface RawVaultLiability {
  key: {
    inner: string; // marketAddress
  };
  value: VaultLiabilityStruct | string; // Liability struct or string representation
}

/**
 * Liability struct from the vault
 */
export interface VaultLiabilityStruct {
  principal: string;
  interest_accumulated: string;
  last_interest_rate_index?: string | null;
}

/**
 * Processed vault liability with total liability
 */
export interface ProcessedVaultLiability {
  marketAddress: string;
  principal: string;
  interestAccumulated: string;
  totalLiability: string;
  lastInterestRateIndex: string | null;
}

/**
 * Raw vault data structure from Movement Network API
 */
export interface RawVaultData {
  data: {
    efficiency_mode_id?: number;
    collaterals?: {
      data: RawVaultCollateral[];
    };
    liabilities?: {
      data: RawVaultLiability[];
    };
  };
}

/**
 * Vault API response structure
 */
export interface VaultApiResponse {
  data: {
    efficiency_mode_id: number;
    collaterals: ProcessedVaultCollateral[];
    liabilities: ProcessedVaultLiability[];
  };
  raw?: RawVaultData;
}

/**
 * View function response for shares_to_coins
 */
export interface SharesToCoinsViewResponse {
  0: string; // coinAmount (u64)
}

/**
 * Raw asset data from Echelon markets API
 */
export interface RawEchelonAsset {
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
  market: string;
}

/**
 * Echelon markets API response structure
 */
export interface EchelonMarketsApiResponse {
  data: {
    assets: RawEchelonAsset[];
    marketStats: [string, MarketStats][];
  };
}
