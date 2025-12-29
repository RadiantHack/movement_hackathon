/**
 * Premium API Route - Direct Agent Communication
 *
 * This route directly calls premium agents via A2A protocol, bypassing the orchestrator.
 * Used for premium chat mode with x-payment header support (402 status code).
 * Supports multiple premium agents - add more as they become available.
 */

import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { NextRequest, NextResponse } from "next/server";

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, x-payment, x-402, x-selected-agent",
    },
  });
}

export async function POST(request: NextRequest) {
  // Prioritize runtime BACKEND_URL for server-side, then build-time NEXT_PUBLIC_BACKEND_URL
  const baseUrl =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://movement-production-ee30.up.railway.app";

  // Log the backend URL being used (for debugging)
  console.log("[premium] Using backend URL:", baseUrl);

  // Get selected premium agent from query parameter or header
  const url = new URL(request.url);
  const selectedAgent =
    url.searchParams.get("agent") ||
    request.headers.get("x-selected-agent") ||
    "premium_lending";

  // Map premium agent names to their URLs
  // Add more premium agents here as they become available
  const premiumAgentUrlMap: Record<string, string> = {
    premium_lending: `${baseUrl}/premium_lending_agent`,
    // Future premium agents can be added here:
    // premium_balance: `${baseUrl}/premium_balance_agent`,
    // premium_swap: `${baseUrl}/premium_swap_agent`,
  };

  const agentUrl =
    premiumAgentUrlMap[selectedAgent] || premiumAgentUrlMap.premium_lending;

  // Get x-payment header from request and forward it (check both lowercase and uppercase)
  const xPaymentHeader =
    request.headers.get("x-payment") ||
    request.headers.get("X-Payment") ||
    request.headers.get("x-402") ||
    request.headers.get("X-402");

  console.log(`Selected premium agent: ${selectedAgent} at ${agentUrl}`);
  console.log(
    `x-payment header present: ${xPaymentHeader ? "yes" : "no"} with value: ${xPaymentHeader} `
  );

  // Create direct agent connection to selected premium agent
  const directAgent = new HttpAgent({
    url: agentUrl,
    headers: xPaymentHeader
      ? {
          "x-payment": xPaymentHeader,
        }
      : undefined,
  });

  // Create CopilotKit runtime with premium agent
  const runtime = new CopilotRuntime({
    agents: {
      premium_agent: directAgent as any,
    },
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/premium",
    logLevel: "debug",
  });

  return handleRequest(request);
}
