/**
 * Supply Confirmation Action Handler
 * Registers the supply confirmation action
 */

import React from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { LendCard } from "../../features/lend/LendCard";
import { EchelonSupplyModal } from "../../echelon-supply-modal";
import { EchelonAssetData } from "../hooks/use-chat-data";

interface UseSupplyActionProps {
  walletAddress: string | null;
  echelonAssets: Record<string, EchelonAssetData>;
  availableBalances: Record<string, number>;
  onSupplySuccess: () => Promise<void>;
}

/**
 * Register supply confirmation action
 */
export function useSupplyAction({
  walletAddress,
  echelonAssets,
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
        return (
          <div className="my-3">
            <LendCard walletAddress={walletAddress} asset={asset} />
          </div>
        );
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
