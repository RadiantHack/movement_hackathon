import { getTokenIconUrl } from "./token-icons";
import { getTokenBySymbol } from "../tokens/token-constants";

/**
 * Centralized asset icon utility
 * Fetches token icons from online sources (CoinGecko, token constants, etc.)
 */

/**
 * Normalize token symbol for icon lookup
 * Maps variants to their base symbols:
 * - USDC.e, USDC* -> USDC
 * - USDT.e, USDT* -> USDT
 * - WETH, WETH* -> ETH
 * - WBTC, WBTC* -> BTC
 */
export function normalizeSymbolForIcon(symbol: string): string {
  const upperSymbol = symbol.toUpperCase();

  // USDC variants -> USDC
  if (upperSymbol.startsWith("USDC")) {
    return "USDC";
  }

  // USDT variants -> USDT
  if (upperSymbol.startsWith("USDT")) {
    return "USDT";
  }

  // WETH variants -> ETH
  if (upperSymbol.startsWith("WETH")) {
    return "ETH";
  }

  // WBTC variants -> BTC
  if (upperSymbol.startsWith("WBTC")) {
    return "BTC";
  }

  // Remove .E suffix if present
  return upperSymbol.replace(/\.E$/, "");
}

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
 * Normalizes symbols before lookup (USDC.e -> USDC, WETH -> ETH, WBTC -> BTC)
 */
function getCoinGeckoIconUrl(symbol: string): string | null {
  // Normalize symbol for icon lookup
  const normalizedSymbol = normalizeSymbolForIcon(symbol);
  const upperSymbol = symbol.toUpperCase();

  // CoinGecko CDN mapping for common tokens
  // Use normalized symbols as keys
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
    SOLVBTC: "https://assets.coingecko.com/coins/images/24745/small/stbtc.png",
    SUSD: "https://assets.coingecko.com/coins/images/33690/small/usde.png",
  };

  // Try normalized symbol first (USDC.e -> USDC, WETH -> ETH, WBTC -> BTC)
  if (coingeckoMap[normalizedSymbol]) {
    return coingeckoMap[normalizedSymbol];
  }

  // Try exact match as fallback
  if (coingeckoMap[upperSymbol]) {
    return coingeckoMap[upperSymbol];
  }

  return null;
}

/**
 * Get asset icon URL with fallback logic
 * Priority:
 * 1. Echelon icon (if provided and valid)
 * 2. Token constants iconUri (from ALL_TOKENS) - using normalized symbol
 * 3. CoinGecko CDN URL - using normalized symbol
 * 4. getTokenIconUrl utility (includes more fallbacks) - using normalized symbol
 * 5. null (will trigger gradient fallback in component)
 */
export function getAssetIconUrl(
  symbol: string,
  echelonIcon?: string | null,
  assetType?: string
): string | null {
  // Normalize symbol for icon lookup (USDC.e -> USDC, WETH -> ETH, WBTC -> BTC)
  const normalizedSymbol = normalizeSymbolForIcon(symbol);

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

  // Priority 2: Token constants iconUri - try both original and normalized symbol
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

  // Priority 3: CoinGecko CDN - uses normalized symbol internally
  const coingeckoUrl = getCoinGeckoIconUrl(symbol);
  if (coingeckoUrl) {
    return coingeckoUrl;
  }

  // Priority 4: Use existing getTokenIconUrl utility - try normalized symbol
  let tokenIconUrl = getTokenIconUrl(normalizedSymbol, assetType);
  if (!tokenIconUrl) {
    tokenIconUrl = getTokenIconUrl(symbol, assetType);
  }
  if (tokenIconUrl) {
    return tokenIconUrl;
  }

  return null;
}
