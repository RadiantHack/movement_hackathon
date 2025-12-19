/**
 * Mosaic Aggregator API Service
 *
 * Integration with Mosaic Aggregator for token swaps on Movement Network.
 * Documentation: https://docs.mosaic.ag/swap-integration/api
 */

const DEFAULT_MOSAIC_API_BASE_URL = "https://api.mosaic.ag/v1";

/**
 * Get Mosaic API key from environment variable
 *
 * @returns API key string
 * @throws Error if API key is not configured
 */
function getMosaicApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_MOSAIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Mosaic API key is not configured. Please set NEXT_PUBLIC_MOSAIC_API_KEY in your environment variables."
    );
  }
  return apiKey;
}

/**
 * Get Mosaic API base URL from environment or use default
 * The URL should come from Redux config, but as a fallback use the default
 *
 * @returns Mosaic API base URL
 */
export function getMosaicApiBaseUrl(): string {
  // Default Mosaic API base URL
  return "https://api.mosaic.ag/v1";
}

/**
 * Mosaic API Quote Response
 */
export interface MosaicQuoteResponse {
  code: number;
  message: string;
  requestId: string;
  data: {
    srcAsset: string;
    dstAsset: string;
    srcAmount: number;
    dstAmount: number;
    feeAmount: number;
    isFeeIn: boolean;
    paths: Array<{
      source: string;
      srcAsset: string;
      dstAsset: string;
      srcAmount: number;
      dstAmount: number;
    }>;
    tx: {
      function: string;
      typeArguments: string[];
      functionArguments: (string | number | boolean | string[])[];
    };
  };
}

/**
 * Mosaic API Token Response
 */
export interface MosaicTokenResponse {
  tokenById: Record<
    string,
    {
      id: string;
      decimals: number;
      name: string;
      symbol: string;
    }
  >;
  nextCursor: number;
}

/**
 * Get quote parameters
 */
export interface GetQuoteParams {
  srcAsset: string;
  dstAsset: string;
  amount: string; // Amount in smallest unit (e.g., 100000000 for 1 APT with 8 decimals)
  sender?: string;
  receiver?: string;
  slippage?: number; // Slippage in basis points (e.g., 10 = 0.1%, 100 = 1%)
  isFeeIn?: boolean;
  feeInBps?: number;
  feeReceiver?: string;
}

/**
 * Get token list parameters
 */
export interface GetTokensParams {
  ids?: string[];
  cursor?: number;
  count?: number;
  pattern?: string;
}

/**
 * Get a quote from Mosaic Aggregator API
 *
 * @param params - Quote parameters
 * @param baseUrl - Optional custom Mosaic API base URL (defaults to config or hardcoded default)
 * @returns Promise resolving to quote response
 */
export async function getQuote(
  params: GetQuoteParams,
  baseUrl?: string
): Promise<MosaicQuoteResponse> {
  const MOSAIC_API_BASE_URL = baseUrl || DEFAULT_MOSAIC_API_BASE_URL;

  const queryParams = new URLSearchParams();
  queryParams.append("srcAsset", params.srcAsset);
  queryParams.append("dstAsset", params.dstAsset);
  queryParams.append("amount", params.amount);

  if (params.sender) {
    queryParams.append("sender", params.sender);
  }
  if (params.receiver) {
    queryParams.append("receiver", params.receiver);
  }
  if (params.slippage !== undefined) {
    queryParams.append("slippage", params.slippage.toString());
  }
  if (params.isFeeIn !== undefined) {
    queryParams.append("isFeeIn", params.isFeeIn.toString());
  }
  if (params.feeInBps !== undefined) {
    queryParams.append("feeInBps", params.feeInBps.toString());
  }
  if (params.feeReceiver) {
    queryParams.append("feeReceiver", params.feeReceiver);
  }

  const response = await fetch(
    `${MOSAIC_API_BASE_URL}/quote?${queryParams.toString()}`,
    {
      method: "GET",
      headers: {
        "X-API-Key": getMosaicApiKey(),
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mosaic API error: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
}

/**
 * Get tokens from Mosaic API
 *
 * @param params - Token list parameters
 * @param baseUrl - Optional custom Mosaic API base URL (defaults to config or hardcoded default)
 * @returns Promise resolving to token response
 */
export async function getTokens(
  params: GetTokensParams = {},
  baseUrl?: string
): Promise<MosaicTokenResponse> {
  const MOSAIC_API_BASE_URL = baseUrl || DEFAULT_MOSAIC_API_BASE_URL;

  const queryParams = new URLSearchParams();

  if (params.ids && params.ids.length > 0) {
    params.ids.forEach((id) => queryParams.append("ids", id));
  }
  if (params.cursor !== undefined) {
    queryParams.append("cursor", params.cursor.toString());
  }
  if (params.count !== undefined) {
    queryParams.append("count", params.count.toString());
  }
  if (params.pattern) {
    queryParams.append("pattern", params.pattern);
  }

  const url = `${MOSAIC_API_BASE_URL}/tokens${
    queryParams.toString() ? `?${queryParams.toString()}` : ""
  }`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": getMosaicApiKey(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mosaic API error: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
}

/**
 * Convert token info to Mosaic asset format
 *
 * For native MOVE token: "0x1::aptos_coin::AptosCoin"
 * For coins: Use coinType
 * For fungible assets: May need to query Mosaic API or use known mappings
 *
 * @param tokenInfo - Token information from token-constants
 * @returns Mosaic asset format string
 */
export function getMosaicAssetFormat(tokenInfo: {
  symbol: string;
  coinType?: string;
  faAddress?: string;
  type?: "coin" | "fungibleAsset";
}): string {
  // Native MOVE token
  if (tokenInfo.symbol.toUpperCase() === "MOVE") {
    return "0x1::aptos_coin::AptosCoin";
  }

  // If coinType is available, use it (for coin type tokens)
  if (tokenInfo.coinType) {
    return tokenInfo.coinType;
  }

  // For fungible assets, we need to query Mosaic API to get the correct format
  // Common tokens mapping (can be extended)
  const knownTokens: Record<string, string> = {
    USDC: "0x275f508689de8756169d1ee02d889c777de1cebda3a7bbcce63ba8a27c563c6f::tokens::USDC",
    "USDC.e":
      "0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39",
    USDT: "0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d",
    "USDT.e":
      "0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d",
  };

  const upperSymbol = tokenInfo.symbol.toUpperCase();
  if (knownTokens[upperSymbol]) {
    return knownTokens[upperSymbol];
  }

  // For other fungible assets, try using faAddress directly
  // Note: This may not work for all tokens - may need to query Mosaic /tokens endpoint
  if (tokenInfo.faAddress) {
    return tokenInfo.faAddress;
  }

  throw new Error(
    `Cannot determine Mosaic asset format for token: ${tokenInfo.symbol}. Please check token configuration.`
  );
}
