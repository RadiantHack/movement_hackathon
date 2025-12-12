import { NextRequest, NextResponse } from "next/server";

// Movement Network Indexer GraphQL endpoint
const MOVEMENT_INDEXER_URL =
  "https://rpc.sentio.xyz/movement-indexer/v1/graphql";

// Native token asset type (MOVE coin)
const NATIVE_TOKEN_ASSET_TYPE =
  "0x000000000000000000000000000000000000000000000000000000000000000a";

// GraphQL query to get user token balances with pagination
const GET_USER_BALANCES_QUERY = `
  query GetUserTokenBalances($ownerAddress: String!, $limit: Int, $offset: Int) {
    current_fungible_asset_balances(
      where: {
        owner_address: {_eq: $ownerAddress},
        amount: {_gt: 0}
      }
      order_by: {amount: desc}
      limit: $limit
      offset: $offset
    ) {
      asset_type
      amount
      last_transaction_timestamp
      metadata {
        name
        symbol
        decimals
      }
    }
  }
`;

/**
 * GET /api/balance
 *
 * Fetches token balance for a wallet address on Movement Network
 * Directly queries the Movement Network indexer GraphQL API
 *
 * Query params:
 * - address: Wallet address (required)
 * - token: Token symbol (optional, filters to specific token)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get("address");
    const token = searchParams.get("token");

    if (!address) {
      return NextResponse.json(
        { error: "Address parameter is required" },
        { status: 400 }
      );
    }

    // Validate address format
    if (!address.startsWith("0x") || address.length < 3) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    // Fetch all balances with pagination
    const allBalances: any[] = [];
    let offset = 0;
    const batchSize = 1000;

    while (true) {
      const variables = {
        ownerAddress: address,
        limit: batchSize,
        offset: offset,
      };

      const payload = {
        query: GET_USER_BALANCES_QUERY,
        variables,
      };

      const response = await fetch(MOVEMENT_INDEXER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Movement-Nexus-Frontend/1.0",
          Origin: "https://movementnetwork.xyz",
          Referer: "https://movementnetwork.xyz/",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 403) {
          return NextResponse.json(
            { error: "Forbidden - Indexer endpoint access restricted" },
            { status: 403 }
          );
        }
        const errorText = await response.text();
        console.error("Indexer API error:", errorText);
        return NextResponse.json(
          { error: "Failed to fetch balance from Movement Network indexer" },
          { status: response.status }
        );
      }

      const data = await response.json();

      if (data.errors) {
        return NextResponse.json(
          { error: `GraphQL errors: ${JSON.stringify(data.errors)}` },
          { status: 500 }
        );
      }

      const batchBalances = data.data?.current_fungible_asset_balances || [];
      allBalances.push(...batchBalances);

      // If we got fewer results than requested, we've reached the end
      if (batchBalances.length < batchSize) {
        break;
      }

      offset += batchSize;
    }

    // Filter out test tokens (tokens with "test" in name or symbol starting with "t" followed by token name)
    const filteredBalances = allBalances.filter((balance) => {
      const metadata = balance.metadata || {};
      const name = (metadata.name || "").toLowerCase();
      const symbol = (metadata.symbol || "").toLowerCase();
      const isTestToken =
        name.includes("test") ||
        (symbol.startsWith("t") &&
          symbol.length > 1 &&
          symbol[1]?.match(/[A-Z]/));
      return !isTestToken;
    });

    // Sort balances to show native token first
    filteredBalances.sort((a, b) => {
      const aIsNative =
        a.asset_type?.toLowerCase() === NATIVE_TOKEN_ASSET_TYPE.toLowerCase();
      const bIsNative =
        b.asset_type?.toLowerCase() === NATIVE_TOKEN_ASSET_TYPE.toLowerCase();
      if (aIsNative && !bIsNative) return -1;
      if (!aIsNative && bIsNative) return 1;
      return parseInt(b.amount || "0") - parseInt(a.amount || "0");
    });

    // If token filter is specified, filter to that token
    let resultBalances = filteredBalances;
    if (token) {
      const tokenUpper = token.toUpperCase();
      resultBalances = filteredBalances.filter((balance) => {
        const symbol = (balance.metadata?.symbol || "").toUpperCase();
        return symbol === tokenUpper || symbol.includes(tokenUpper);
      });
    }

    // Format balances for response
    const formattedBalances = resultBalances.map((balance) => {
      const metadata = balance.metadata || {};
      const decimals = parseInt(metadata.decimals || "18");
      const amount = parseInt(balance.amount || "0");
      const formattedAmount = amount / Math.pow(10, decimals);

      return {
        assetType: balance.asset_type,
        amount: balance.amount,
        formattedAmount: formattedAmount.toFixed(6),
        metadata: {
          name: metadata.name || "Unknown Token",
          symbol: metadata.symbol || "UNKNOWN",
          decimals: decimals,
        },
        isNative:
          balance.asset_type?.toLowerCase() ===
          NATIVE_TOKEN_ASSET_TYPE.toLowerCase(),
      };
    });

    return NextResponse.json({
      success: true,
      address: address,
      balances: formattedBalances,
      total: formattedBalances.length,
    });
  } catch (error: any) {
    console.error("Balance API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
