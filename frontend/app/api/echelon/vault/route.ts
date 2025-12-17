import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  try {
    const ECHELON_CONTRACT =
      "0x6a01d5761d43a5b5a0ccbfc42edf2d02c0611464aae99a2ea0e0d4819f0550b5";
    const resourceType = `${ECHELON_CONTRACT}::lending::Vault`;

    const response = await fetch(
      `https://mainnet.movementnetwork.xyz/v1/accounts/${address}/resource/${resourceType}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        // No vault found - user hasn't supplied anything
        return NextResponse.json({
          collaterals: [],
          liabilities: [],
        });
      }
      return NextResponse.json(
        { error: "Failed to fetch vault data" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Echelon vault API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

