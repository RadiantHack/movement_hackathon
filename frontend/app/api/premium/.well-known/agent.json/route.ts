/**
 * Agent Card Route - .well-known/agent.json
 *
 * This route handles requests for the agent card (A2A protocol).
 * It proxies requests to the backend premium agent's agent card endpoint.
 * 
 * NOTE: Agent card is NOT protected by x402 - it's just metadata for discovery.
 * Payment is required for actual agent requests (/api/premium), not for discovery.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * GET handler for agent card
 * Proxies request to backend premium agent's agent card endpoint
 * No payment required - agent card is just metadata for discovery
 */
export async function GET(request: NextRequest) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.BACKEND_URL ||
      "http://localhost:8000";

    // Get selected premium agent from query parameter or header
    const selectedAgent =
      request.nextUrl.searchParams.get("agent") ||
      request.headers.get("x-selected-agent") ||
      "premium_lending";

    // Map premium agent names to their URLs
    const premiumAgentUrlMap: Record<string, string> = {
      premium_lending: `${baseUrl}/premium_lending_agent`,
    };

    const agentUrl =
      premiumAgentUrlMap[selectedAgent] || premiumAgentUrlMap.premium_lending;

    const agentCardUrl = `${agentUrl}/.well-known/agent.json`;
    console.log("[agent.json] Fetching agent card from:", agentCardUrl);

    // Fetch agent card from backend (no payment required for discovery)
    let backendResponse: Response;
    try {
      backendResponse = await fetch(agentCardUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
    } catch (fetchError: any) {
      console.error("[agent.json] Failed to fetch from backend:", fetchError);
      return NextResponse.json(
        { 
          error: "Failed to connect to backend",
          message: fetchError.message || "Backend server may be down",
          url: agentCardUrl
        },
        { status: 503 }
      );
    }

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => "");
      console.error("[agent.json] Backend returned error:", backendResponse.status, errorText);
      return NextResponse.json(
        { 
          error: "Failed to fetch agent card from backend",
          status: backendResponse.status,
          message: errorText || backendResponse.statusText
        },
        { status: backendResponse.status }
      );
    }

    let agentCard: any;
    try {
      agentCard = await backendResponse.json();
    } catch (parseError: any) {
      console.error("[agent.json] Failed to parse agent card JSON:", parseError);
      return NextResponse.json(
        { 
          error: "Invalid agent card format",
          message: parseError.message || "Backend returned invalid JSON"
        },
        { status: 500 }
      );
    }
    
    // Return agent card with updated URL to point to /api/premium
    // This ensures actual agent requests go through payment middleware
    const updatedAgentCard = {
      ...agentCard,
      url: agentCard.url || `${request.nextUrl.origin}/api/premium`,
    };

    console.log("[agent.json] Successfully fetched and returning agent card");
    return NextResponse.json(updatedAgentCard, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("[agent.json] Unexpected error:", error);
    console.error("[agent.json] Error stack:", error.stack);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error.message || "An unexpected error occurred"
      },
      { status: 500 }
    );
  }
}
