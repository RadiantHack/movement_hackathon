/**
 * Lending Platform Selection Action Handler
 * Registers the lending platform selection action
 */

import React from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { PlatformSelectionCard } from "../../lending";

interface UseLendingActionProps {
  walletAddress: string | null;
  onClose: () => void;
}

/**
 * Register lending platform selection action
 */
export function useLendingAction({
  walletAddress,
  onClose,
}: UseLendingActionProps) {
  useCopilotAction({
    name: "show_lending_platform_selection",
    description:
      "Show platform selection UI after comparing lending/borrowing rates between Echelon and MovePosition. Use this when a lending comparison has been completed and the user needs to choose a platform.",
    parameters: [
      {
        name: "action",
        type: "string",
        description: "The action type: 'borrow' or 'lend'",
        required: true,
      },
      {
        name: "asset",
        type: "string",
        description: "The asset symbol (e.g., 'MOVE', 'USDC')",
        required: true,
      },
      {
        name: "recommendedProtocol",
        type: "string",
        description: "The recommended protocol: 'Echelon' or 'MovePosition'",
        required: true,
      },
      {
        name: "echelonRate",
        type: "string",
        description: "The Echelon rate (e.g., '30.91%')",
        required: true,
      },
      {
        name: "movepositionRate",
        type: "string",
        description: "The MovePosition rate (e.g., '62.00%')",
        required: true,
      },
      {
        name: "reason",
        type: "string",
        description: "The reason for the recommendation",
        required: true,
      },
    ],
    render: (props) => {
      const {
        action,
        asset,
        recommendedProtocol,
        echelonRate,
        movepositionRate,
        reason,
      } = props.args as {
        action: string;
        asset: string;
        recommendedProtocol: string;
        echelonRate: string;
        movepositionRate: string;
        reason: string;
      };

      return (
        <PlatformSelectionCard
          action={action === "borrow" ? "borrow" : "lend"}
          asset={asset}
          recommendedProtocol={recommendedProtocol}
          echelonRate={echelonRate}
          movepositionRate={movepositionRate}
          reason={reason}
          walletAddress={walletAddress}
          onClose={onClose}
        />
      );
    },
  });
}
