/**
 * Supply Confirmation Action Handler
 * Registers the supply confirmation action
 */

import React from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { SupplyModal } from "../../lending/moveposition";
import { EchelonSupplyModal } from "../../lending/echelon";
import {
  EchelonAssetData,
  MovePositionAssetData,
} from "../hooks/use-chat-data";

interface UseSupplyActionProps {
  walletAddress: string | null;
  echelonAssets: Record<string, EchelonAssetData>;
  movePositionAssets: Record<string, MovePositionAssetData>;
  healthFactor: number | null;
  availableBalances: Record<string, number>;
  onSupplySuccess: () => Promise<void>;
}

/**
 * Register supply confirmation action
 */
export function useSupplyAction({
  walletAddress,
  echelonAssets,
  movePositionAssets,
  healthFactor,
  availableBalances,
  onSupplySuccess,
}: UseSupplyActionProps) {
  useCopilotAction({
    name: "show_supply_confirmation",
    description:
      "Show supply card/modal when a supply action has been confirmed. Use this when the user has successfully supplied tokens to a lending protocol.",
    parameters: [
      {
        name: "protocol",
        type: "string",
        description: "The protocol used: 'MovePosition' or 'Echelon'",
        required: true,
      },
      {
        name: "asset",
        type: "string",
        description:
          "The asset symbol that was supplied (e.g., 'MOVE', 'USDC')",
        required: true,
      },
      {
        name: "amount",
        type: "string",
        description: "The amount that was supplied (e.g., '10', '100')",
        required: true,
      },
    ],
    render: (props) => {
      const { protocol, asset, amount } = props.args as {
        protocol?: string;
        asset?: string;
        amount?: string;
      };

      if (!protocol) {
        return <div className="my-3" />;
      }

      const protocolLower = protocol.toLowerCase();
      const isMovePosition = protocolLower === "moveposition";
      const isEchelon = protocolLower === "echelon";

      if (isMovePosition) {
        const assetSymbol = asset?.toUpperCase() || "MOVE";
        const movePositionAsset = movePositionAssets[assetSymbol];

        if (movePositionAsset) {
          return (
            <div className="my-3 max-w-lg mx-auto">
              <SupplyModal
                isOpen={true}
                onClose={() => {}}
                inline={true}
                asset={{
                  token: movePositionAsset.token,
                  symbol: movePositionAsset.symbol,
                  price: movePositionAsset.price,
                  supplyApy: movePositionAsset.supplyApy,
                  totalSupplied: movePositionAsset.totalSupplied,
                }}
                walletAddress={walletAddress}
                healthFactor={healthFactor}
              />
            </div>
          );
        }
      }

      if (isEchelon) {
        const assetSymbol = asset?.toUpperCase() || "UNKNOWN";
        const echelonAsset = echelonAssets[assetSymbol];

        return (
          <EchelonSupplyModal
            isOpen={true}
            onClose={() => {}}
            inline={true}
            asset={
              echelonAsset || {
                symbol: assetSymbol,
                name: asset || "Unknown Asset",
                icon: "",
                price: 1,
                supplyApr: 0,
                faAddress: undefined,
                decimals: 8,
                marketAddress: undefined,
              }
            }
            availableBalance={asset ? availableBalances[assetSymbol] || 0 : 0}
            onSuccess={onSupplySuccess}
          />
        );
      }

      return <div className="my-3" />;
    },
  });
}
