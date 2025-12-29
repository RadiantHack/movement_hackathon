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

    const vaultResourceResponse = await fetch(
      `https://mainnet.movementnetwork.xyz/v1/accounts/${address}/resource/${resourceType}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        // Cache the resource fetch for 5 seconds
        next: { revalidate: 5 },
      }
    );

    if (!vaultResourceResponse.ok) {
      if (vaultResourceResponse.status === 404) {
        // No vault found - user hasn't supplied anything
        return NextResponse.json({
          collaterals: [],
          liabilities: [],
        });
      }
      return NextResponse.json(
        { error: "Failed to fetch vault data" },
        { status: vaultResourceResponse.status }
      );
    }

    const vaultData = await vaultResourceResponse.json();
    const vault = vaultData.data;

    console.log(`[Echelon Vault] Fetching vault for address: ${address}`);

    // Process collaterals: convert shares to coins (PARALLEL for performance)
    const processedCollaterals = [];
    if (vault?.collaterals?.data) {
      console.log(
        `[Echelon Vault] Found ${vault.collaterals.data.length} collateral(s)`
      );

      // Process all view calls in parallel for better performance
      const collateralPromises = vault.collaterals.data.map(
        async (item: any) => {
          const marketAddress = item.key.inner;
          const shares = item.value; // This is u64 (shares)

          try {
            // Call shares_to_coins view function to convert shares to actual coin amount
            const viewResponse = await fetch(
              `https://mainnet.movementnetwork.xyz/v1/view`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  function: `${ECHELON_CONTRACT}::lending::shares_to_coins`,
                  type_arguments: [],
                  arguments: [marketAddress, shares],
                }),
              }
            );

            if (viewResponse.ok) {
              const viewData = await viewResponse.json();
              const coinAmount = viewData[0]; // shares_to_coins returns [u64]

              console.log(`[Echelon Vault] Market: ${marketAddress}`);
              console.log(`  - Shares: ${shares}`);
              console.log(`  - Coin Amount (raw): ${coinAmount}`);

              return {
                marketAddress,
                shares,
                coinAmount,
              };
            } else {
              // Fallback: use shares directly if view call fails
              console.log(
                `[Echelon Vault] Market: ${marketAddress} (view call failed, using shares)`
              );
              console.log(`  - Shares: ${shares}`);
              return {
                marketAddress,
                shares,
                coinAmount: shares,
              };
            }
          } catch (err) {
            console.error(
              `[Echelon Vault] Error converting shares to coins for market ${marketAddress}:`,
              err
            );
            // Fallback: use shares directly
            return {
              marketAddress,
              shares,
              coinAmount: shares,
            };
          }
        }
      );

      // Wait for all parallel requests to complete
      const results = await Promise.all(collateralPromises);
      processedCollaterals.push(...results);

      // Summary log
      console.log(
        `[Echelon Vault] Summary - Total Collaterals: ${processedCollaterals.length}`
      );
      processedCollaterals.forEach((collateral, index) => {
        console.log(`  ${index + 1}. Market: ${collateral.marketAddress}`);
        console.log(`     Shares: ${collateral.shares}`);
        console.log(`     Coin Amount: ${collateral.coinAmount}`);
      });
    } else {
      console.log(
        `[Echelon Vault] No collaterals found for address: ${address}`
      );
    }

    // Process liabilities: parse Liability struct (principal + interest_accumulated)
    const processedLiabilities = [];
    if (vault?.liabilities?.data) {
      console.log(
        `[Echelon Vault] Found ${vault.liabilities.data.length} liability/borrow(s)`
      );

      for (const item of vault.liabilities.data) {
        const marketAddress = item.key.inner;
        const liability = item.value; // This is a Liability struct

        // Liability struct has: principal, interest_accumulated, last_interest_rate_index
        // Total liability = principal + interest_accumulated
        let totalLiability = "0";

        if (typeof liability === "object") {
          const principal = BigInt(liability.principal || "0");
          const interestAccumulated = BigInt(
            liability.interest_accumulated || "0"
          );
          totalLiability = (principal + interestAccumulated).toString();

          console.log(`[Echelon Vault] Borrow Market: ${marketAddress}`);
          console.log(`  - Principal: ${liability.principal || "0"}`);
          console.log(
            `  - Interest Accumulated: ${liability.interest_accumulated || "0"}`
          );
          console.log(`  - Total Liability: ${totalLiability}`);
        } else if (typeof liability === "string") {
          // If it's already a string representation, try to parse it
          totalLiability = liability;
          console.log(
            `[Echelon Vault] Borrow Market: ${marketAddress} (string format)`
          );
          console.log(`  - Total Liability: ${totalLiability}`);
        }

        processedLiabilities.push({
          marketAddress,
          principal: liability?.principal || "0",
          interestAccumulated: liability?.interest_accumulated || "0",
          totalLiability,
          lastInterestRateIndex: liability?.last_interest_rate_index || null,
        });
      }
    } else {
      console.log(
        `[Echelon Vault] No liabilities/borrows found for address: ${address}`
      );
    }

    const response = NextResponse.json({
      data: {
        efficiency_mode_id: vault?.efficiency_mode_id || 0,
        collaterals: processedCollaterals,
        liabilities: processedLiabilities,
      },
      raw: vaultData, // Include raw data for reference
    });

    // Add caching headers for better performance
    // Cache for 10 seconds, revalidate in background
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=10, stale-while-revalidate=60"
    );

    return response;
  } catch (error) {
    console.error("Echelon vault API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
