import { NextResponse } from "next/server";
import {
  RawVaultCollateral,
  RawVaultLiability,
  VaultLiabilityStruct,
  ProcessedVaultCollateral,
  ProcessedVaultLiability,
  RawVaultData,
  VaultApiResponse,
  SharesToCoinsViewResponse,
} from "@/app/types/echelon";
import { ECHELON_CONTRACT_ADDRESS } from "@/app/constants/echelon";
import { getMovementRpcUrl } from "@/app/utils/shared/api-constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  try {
    // Get Movement RPC URL from environment variable with fallback to default
    const movementRpcUrl = getMovementRpcUrl();

    const resourceType = `${ECHELON_CONTRACT_ADDRESS}::lending::Vault`;

    const vaultResourceResponse = await fetch(
      `${movementRpcUrl}/accounts/${address}/resource/${resourceType}`,
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

    const vaultData = (await vaultResourceResponse.json()) as RawVaultData;

    // Type guard to ensure vault data structure is valid
    if (!vaultData || !vaultData.data) {
      return NextResponse.json(
        { error: "Invalid vault data structure" },
        { status: 500 }
      );
    }

    const vault = vaultData.data;

    console.log(`[Echelon Vault] Fetching vault for address: ${address}`);

    // Process collaterals: convert shares to coins (PARALLEL for performance)
    const processedCollaterals: ProcessedVaultCollateral[] = [];
    if (vault.collaterals?.data && Array.isArray(vault.collaterals.data)) {
      console.log(
        `[Echelon Vault] Found ${vault.collaterals.data.length} collateral(s)`
      );

      // Process all view calls in parallel for better performance
      const collateralPromises = vault.collaterals.data.map(
        async (item: RawVaultCollateral): Promise<ProcessedVaultCollateral> => {
          const marketAddress = item.key.inner;
          const shares = item.value; // This is u64 (shares)

          try {
            // Call shares_to_coins view function to convert shares to actual coin amount
            const viewResponse = await fetch(`${movementRpcUrl}/view`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                function: `${ECHELON_CONTRACT_ADDRESS}::lending::shares_to_coins`,
                type_arguments: [],
                arguments: [marketAddress, shares],
              }),
            });

            if (viewResponse.ok) {
              const viewData =
                (await viewResponse.json()) as SharesToCoinsViewResponse;
              // Validate that viewData has the expected structure
              if (!viewData || typeof viewData[0] !== "string") {
                throw new Error("Invalid view response format");
              }
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
    const processedLiabilities: ProcessedVaultLiability[] = [];
    if (vault.liabilities?.data && Array.isArray(vault.liabilities.data)) {
      console.log(
        `[Echelon Vault] Found ${vault.liabilities.data.length} liability/borrow(s)`
      );

      for (const item of vault.liabilities.data) {
        // Type guard to ensure item has required structure
        if (!item || !item.key || typeof item.key.inner !== "string") {
          console.error(
            "[Echelon Vault] Invalid liability item structure:",
            item
          );
          continue;
        }

        const marketAddress = item.key.inner;
        const liability = item.value;

        // Liability struct has: principal, interest_accumulated, last_interest_rate_index
        // Total liability = principal + interest_accumulated
        let totalLiability = "0";
        let liabilityStruct: VaultLiabilityStruct | null = null;

        if (typeof liability === "object" && liability !== null) {
          // Type guard to validate liability struct
          if (
            "principal" in liability &&
            "interest_accumulated" in liability &&
            typeof liability.principal === "string" &&
            typeof liability.interest_accumulated === "string"
          ) {
            liabilityStruct = liability as VaultLiabilityStruct;
            const principal = BigInt(liabilityStruct.principal || "0");
            const interestAccumulated = BigInt(
              liabilityStruct.interest_accumulated || "0"
            );
            totalLiability = (principal + interestAccumulated).toString();

            console.log(`[Echelon Vault] Borrow Market: ${marketAddress}`);
            console.log(`  - Principal: ${liabilityStruct.principal || "0"}`);
            console.log(
              `  - Interest Accumulated: ${liabilityStruct.interest_accumulated || "0"}`
            );
            console.log(`  - Total Liability: ${totalLiability}`);
          } else {
            console.warn(
              `[Echelon Vault] Invalid liability struct format for market ${marketAddress}`
            );
          }
        } else if (typeof liability === "string") {
          // If it's already a string representation, use it directly
          totalLiability = liability;
          console.log(
            `[Echelon Vault] Borrow Market: ${marketAddress} (string format)`
          );
          console.log(`  - Total Liability: ${totalLiability}`);
        } else {
          console.warn(
            `[Echelon Vault] Unknown liability format for market ${marketAddress}:`,
            typeof liability
          );
        }

        const processedLiability: ProcessedVaultLiability = {
          marketAddress,
          principal: liabilityStruct?.principal || "0",
          interestAccumulated: liabilityStruct?.interest_accumulated || "0",
          totalLiability,
          lastInterestRateIndex:
            liabilityStruct?.last_interest_rate_index || null,
        };

        processedLiabilities.push(processedLiability);
      }
    } else {
      console.log(
        `[Echelon Vault] No liabilities/borrows found for address: ${address}`
      );
    }

    const responseData: VaultApiResponse = {
      data: {
        efficiency_mode_id: vault.efficiency_mode_id ?? 0,
        collaterals: processedCollaterals,
        liabilities: processedLiabilities,
      },
      raw: vaultData, // Include raw data for reference
    };

    const response = NextResponse.json(responseData);

    // Vault data is user-specific and should not be cached publicly
    // Use private cache with short TTL to prevent serving stale user data
    // Frontend uses cache: "no-store" which aligns with this strategy
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate"
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
