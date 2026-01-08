import { ALL_TOKENS, getTokenBySymbol } from "../tokens/token-constants";
import { normalizeSymbolForIcon } from "./asset-icon";

/**
 * Get token icon URL from various sources
 * Priority: 1. Token constants, 2. CoinGecko, 3. Fallback
 * Normalizes symbols before lookup (USDC.e -> USDC, WETH -> ETH, WBTC -> BTC)
 */
export function getTokenIconUrl(
  symbol: string,
  assetType?: string
): string | null {
  // Normalize symbol for icon lookup
  const normalizedSymbol = normalizeSymbolForIcon(symbol);
  const upperSymbol = symbol.toUpperCase();

  // First, try to get from token constants by asset type
  if (assetType && ALL_TOKENS[assetType]?.iconUri) {
    const iconUri = ALL_TOKENS[assetType].iconUri;
    if (
      iconUri &&
      !iconUri.includes("example.com") &&
      !iconUri.includes("test.io")
    ) {
      return iconUri;
    }
  }

  // Try to get from token constants by symbol - try both original and normalized
  let token = getTokenBySymbol(symbol);
  if (!token) {
    token = getTokenBySymbol(normalizedSymbol);
  }
  if (token?.iconUri) {
    const iconUri = token.iconUri;
    if (
      iconUri &&
      !iconUri.includes("example.com") &&
      !iconUri.includes("test.io")
    ) {
      return iconUri;
    }
  }

  // Map to CoinGecko image URLs for common tokens
  // Using CoinGecko's CDN for reliable token icons
  // Use normalized symbols as keys (USDC, USDT, ETH, BTC)
  const coingeckoMap: Record<string, string> = {
    MOVE: "https://assets.coingecko.com/coins/images/26455/small/movement-labs.png",
    APT: "https://assets.coingecko.com/coins/images/26455/small/aptos.png",
    USDC: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
    USDT: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    ETH: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    BTC: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
    EZETH: "https://assets.coingecko.com/coins/images/34753/small/renzo-og.png",
    RSETH: "https://assets.coingecko.com/coins/images/33180/small/kelp.png",
    WEETH:
      "https://assets.coingecko.com/coins/images/35613/small/wrapped-eeth.png",
    LBTC: "https://assets.coingecko.com/coins/images/33935/small/lbtc.png",
    USDE: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
    SUSDE: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
    STBTC: "https://assets.coingecko.com/coins/images/24745/small/stbtc.png",
    USDA: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
    SUSDA: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
  };

  // Try normalized symbol first (USDC.e -> USDC, WETH -> ETH, WBTC -> BTC)
  if (coingeckoMap[normalizedSymbol]) {
    return coingeckoMap[normalizedSymbol];
  }

  // Try original symbol as fallback
  if (coingeckoMap[upperSymbol]) {
    return coingeckoMap[upperSymbol];
  }

  // Fallback: Try generic CoinGecko URL pattern (may not work for all tokens)
  // This is a last resort and may fail, but worth trying
  return null;
}
