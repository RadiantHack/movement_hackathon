/**
 * Facilitator Supported Endpoint - x402 Supported Networks
 *
 * This endpoint returns information about supported networks and schemes.
 */

import { NextRequest, NextResponse } from "next/server";

// Prioritize runtime BACKEND_URL for server-side, then build-time NEXT_PUBLIC_BACKEND_URL
const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Forward request to Python backend facilitator
    const response = await fetch(`${BACKEND_URL}/facilitator/supported`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    // Return the response from backend
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("[facilitator/supported] Error:", error);
    return NextResponse.json(
      {
        supported: {
          networks: ["movement"],
          schemes: ["exact"],
        },
      },
      { status: 200 }
    );
  }
}
