import { NextRequest, NextResponse } from "next/server";

// Token symbol to CoinGecko ID mapping for Movement Network tokens
const TOKEN_COINGECKO_MAP: Record<string, string> = {
  MOVE: "movement", // move is movement in coingecko
  USDC: "usd-coin",
  "USDC.E": "usd-coin",
  USDT: "tether",
  "USDT.E": "tether",
  WETH: "weth",
  "WETH.E": "weth",
  WBTC: "wrapped-bitcoin",
  "WBTC.E": "wrapped-bitcoin",
  EZETH: "renzo-restaked-eth",
  RSETH: "kelpdao-restaked-eth",
  WEETH: "wrapped-eeth",
  LBTC: "lombard-staked-bitcoin",
  USDA: "usda",
  SUSDA: "susda",
  STBTC: "staked-bitcoin",
  USDE: "ethena-usde", // Ethena USDe
  SUSDE: "ethena-staked-usde", // Staked USDe
};

/**
 * GET /api/prices
 *
 * Fetches token prices in USD from CoinGecko
 *
 * Query params:
 * - symbols: Comma-separated list of token symbols (e.g., "MOVE,USDC,WBTC")
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get("symbols");

    if (!symbolsParam) {
      return NextResponse.json(
        { error: "Symbols parameter is required" },
        { status: 400 }
      );
    }

    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    // Map symbols to CoinGecko IDs
    const symbolToIdMap: Record<string, string> = {};
    const coingeckoIds: string[] = [];

    symbols.forEach((symbol) => {
      // Try exact match first
      let coingeckoId = TOKEN_COINGECKO_MAP[symbol];

      // Try without .e suffix
      if (!coingeckoId) {
        const symbolWithoutE = symbol.replace(/\.E$/, "");
        coingeckoId = TOKEN_COINGECKO_MAP[symbolWithoutE];
      }

      // Try with .E suffix
      if (!coingeckoId) {
        coingeckoId = TOKEN_COINGECKO_MAP[`${symbol}.E`];
      }

      if (coingeckoId) {
        symbolToIdMap[symbol] = coingeckoId;
        if (!coingeckoIds.includes(coingeckoId)) {
          coingeckoIds.push(coingeckoId);
        }
      }
    });

    if (coingeckoIds.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    // Fetch prices from CoinGecko
    const uniqueIds = [...new Set(coingeckoIds)];
    const idsParam = uniqueIds.join(",");

    const buildUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
    console.log(buildUrl);

    const response = await fetch(buildUrl);

    if (!response.ok) {
      console.error(
        "CoinGecko API error:",
        response.status,
        response.statusText
      );
      // Return empty prices object on error
      return NextResponse.json({ prices: {} });
    }

    const data = await response.json();

    // Map CoinGecko IDs back to symbols
    const prices: Record<string, number> = {};

    // Map prices back to symbols using our symbolToIdMap
    Object.entries(data).forEach(([id, priceData]: [string, any]) => {
      const usdPrice = priceData?.usd;
      if (usdPrice) {
        // Find all symbols that map to this CoinGecko ID
        Object.entries(symbolToIdMap).forEach(([symbol, mappedId]) => {
          if (mappedId === id) {
            prices[symbol] = usdPrice;
          }
        });
      }
    });

    return NextResponse.json({ prices });
  } catch (error: any) {
    console.error("Price API error:", error);
    // Return empty prices object on error
    return NextResponse.json({ prices: {} });
  }
}
