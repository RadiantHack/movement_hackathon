import { NextResponse } from "next/server";
import { EchelonMarketsApiResponse } from "@/app/types/echelon";

const ECHELON_API_URL = "https://app.echelon.market/api/markets?network=movement_mainnet";
const FETCH_TIMEOUT = 10000; // 10 seconds

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export async function GET() {
  try {
    console.log(`[Echelon API] Fetching markets from ${ECHELON_API_URL}`);

    const response = await fetchWithTimeout(
      ECHELON_API_URL,
      {
        headers: {
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 },
      },
      FETCH_TIMEOUT
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(
        `[Echelon API] Failed to fetch markets: ${response.status} ${response.statusText}`,
        errorText
      );
      return NextResponse.json(
        {
          error: "Failed to fetch Echelon markets",
          status: response.status,
          statusText: response.statusText,
        },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    let data: EchelonMarketsApiResponse["data"];
    try {
      const json = await response.json();
      data = json.data || json;
    } catch (jsonError: any) {
      console.error("[Echelon API] Failed to parse JSON response:", jsonError);
      return NextResponse.json(
        {
          error: "Invalid JSON response from Echelon API",
          details: jsonError.message,
        },
        { status: 502 }
      );
    }

    // Validate response structure
    if (!data) {
      console.error("[Echelon API] Response data is null or undefined");
      return NextResponse.json(
        { error: "Invalid API response: data is missing" },
        { status: 502 }
      );
    }

    if (!Array.isArray(data.assets)) {
      console.error(
        "[Echelon API] Invalid response structure: assets is not an array",
        { dataType: typeof data.assets, dataKeys: Object.keys(data) }
      );
      return NextResponse.json(
        {
          error: "Invalid API response structure: assets must be an array",
          received: typeof data.assets,
        },
        { status: 502 }
      );
    }

    if (!Array.isArray(data.marketStats)) {
      console.error(
        "[Echelon API] Invalid response structure: marketStats is not an array",
        { dataType: typeof data.marketStats }
      );
      return NextResponse.json(
        {
          error: "Invalid API response structure: marketStats must be an array",
          received: typeof data.marketStats,
        },
        { status: 502 }
      );
    }

    console.log(
      `[Echelon API] Successfully fetched ${data.assets.length} assets and ${data.marketStats.length} market stats`
    );

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("[Echelon API] Error fetching markets:", {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });

    // Handle specific error types
    if (error.message?.includes("timeout")) {
      return NextResponse.json(
        {
          error: "Request timeout: Echelon API did not respond in time",
          details: error.message,
        },
        { status: 504 }
      );
    }

    if (error.message?.includes("fetch")) {
      return NextResponse.json(
        {
          error: "Network error: Unable to reach Echelon API",
          details: error.message,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
