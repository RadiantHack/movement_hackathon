/**
 * Facilitator Verify Endpoint - x402 Payment Verification
 * 
 * This endpoint proxies payment verification requests to the Python backend facilitator.
 * It implements the x402 facilitator protocol for verifying payment transactions.
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward request to Python backend facilitator
    const response = await fetch(`${BACKEND_URL}/facilitator/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Return the response from backend
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("[facilitator/verify] Error:", error);
    return NextResponse.json(
      {
        isValid: false,
        invalidReason: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

