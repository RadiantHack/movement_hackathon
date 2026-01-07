import { getTokenIconUrl } from "./token-icons";
import { getTokenBySymbol } from "../tokens/token-constants";

/**
 * Centralized asset icon utility
 * Fetches token icons from online sources (CoinGecko, token constants, etc.)
 */

/**
 * Normalize Echelon icon URL
 * Handles both relative paths (starting with /) and full URLs
 */
export function normalizeEchelonIconUrl(
  icon: string | null | undefined
): string | null {
  if (!icon) return null;
  if (icon.startsWith("/")) {
    return `https://app.echelon.market${icon}`;
  }
  return icon;
}

/**
 * Get CoinGecko icon URL for a token symbol
 * Uses CoinGecko's CDN for reliable token icons
 */
function getCoinGeckoIconUrl(symbol: string): string | null {
  const upperSymbol = symbol.toUpperCase();
  const symbolWithoutE = upperSymbol.replace(/\.E$/, "");

  // CoinGecko CDN mapping for common tokens
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
    USDA: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
    SUSDA: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
    SOLVBTC: "https://assets.coingecko.com/coins/images/24745/small/stbtc.png",
    SUSD: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
  };

  // Try exact match first
  if (coingeckoMap[upperSymbol]) {
    return coingeckoMap[upperSymbol];
  }

  // Try without .E suffix
  if (coingeckoMap[symbolWithoutE]) {
    return coingeckoMap[symbolWithoutE];
  }

  return null;
}

/**
 * Get asset icon URL with fallback logic
 * Priority:
 * 1. Echelon icon (if provided and valid)
 * 2. Token constants iconUri (from ALL_TOKENS)
 * 3. CoinGecko CDN URL
 * 4. getTokenIconUrl utility (includes more fallbacks)
 * 5. null (will trigger gradient fallback in component)
 */
export function getAssetIconUrl(
  symbol: string,
  echelonIcon?: string | null,
  assetType?: string
): string | null {
  // Priority 1: Echelon icon if provided
  if (echelonIcon) {
    const normalized = normalizeEchelonIconUrl(echelonIcon);
    if (
      normalized &&
      !normalized.includes("example.com") &&
      !normalized.includes("test.io")
    ) {
      return normalized;
    }
  }

  // Priority 2: Token constants iconUri
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

  // Priority 3: CoinGecko CDN
  const coingeckoUrl = getCoinGeckoIconUrl(symbol);
  if (coingeckoUrl) {
    return coingeckoUrl;
  }

  // Priority 4: Use existing getTokenIconUrl utility (includes more fallbacks)
  const tokenIconUrl = getTokenIconUrl(symbol, assetType);
  if (tokenIconUrl) {
    return tokenIconUrl;
  }

  return null;
}
