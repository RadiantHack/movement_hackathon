import { ALL_TOKENS, getTokenBySymbol } from "./token-constants";

/**
 * Get token icon URL from various sources
 * Priority: 1. Token constants, 2. CoinGecko, 3. Fallback
 */
export function getTokenIconUrl(
  symbol: string,
  assetType?: string
): string | null {
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

  // Try to get from token constants by symbol
  const token = getTokenBySymbol(symbol);
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
  const coingeckoMap: Record<string, string> = {
    MOVE: "https://assets.coingecko.com/coins/images/26455/small/movement-labs.png",
    APT: "https://assets.coingecko.com/coins/images/26455/small/aptos.png",
    USDC: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
    "USDC.E":
      "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
    USDT: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    "USDT.E": "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    WETH: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
    "WETH.E": "https://assets.coingecko.com/coins/images/2518/small/weth.png",
    WBTC: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
    "WBTC.E":
      "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
    EZETH: "https://assets.coingecko.com/coins/images/34753/small/renzo-og.png",
    RSETH: "https://assets.coingecko.com/coins/images/33180/small/kelp.png",
    WEETH:
      "https://assets.coingecko.com/coins/images/35613/small/wrapped-eeth.png",
    LBTC: "https://assets.coingecko.com/coins/images/33935/small/lbtc.png",
    USDE: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
    SUSDE: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
    STBTC: "https://assets.coingecko.com/coins/images/24745/small/stbtc.png",
    USDA: "https://assets.coingecko.com/coins/images/33690/small/usde.png", // Using USDe as fallback
    SUSDA: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
  };

  // Try CoinGecko map
  const symbolWithoutE = upperSymbol.replace(/\.E$/, "");
  if (coingeckoMap[upperSymbol] || coingeckoMap[symbolWithoutE]) {
    return coingeckoMap[upperSymbol] || coingeckoMap[symbolWithoutE] || null;
  }

  // Fallback: Try generic CoinGecko URL pattern (may not work for all tokens)
  // This is a last resort and may fail, but worth trying
  return null;
}
