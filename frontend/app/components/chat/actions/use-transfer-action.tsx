/**
 * Transfer Action Handler
 * Registers the token transfer action
 */

import React from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { TransferCard } from "../../features/transfer/TransferCard";
import { TransferData } from "../../types";

interface UseTransferActionProps {
  walletAddress: string | null;
}

/**
 * Register transfer action
 */
export function useTransferAction({ walletAddress }: UseTransferActionProps) {
  useCopilotAction({
    name: "initiate_transfer",
    description:
      "Initiate a token transfer on Movement Network. Use this when user wants to transfer tokens to another address.",
    parameters: [
      {
        name: "amount",
        type: "string",
        description:
          "The amount of tokens to transfer (e.g., '1', '100', '0.5')",
        required: true,
      },
      {
        name: "token",
        type: "string",
        description:
          "The token symbol to transfer (e.g., 'MOVE', 'USDC', 'USDT')",
        required: true,
      },
      {
        name: "toAddress",
        type: "string",
        description:
          "The recipient wallet address (66 characters for Movement Network, must start with 0x)",
        required: true,
      },
    ],
    render: (props) => {
      const { amount, token, toAddress } = props.args as {
        amount: string;
        token: string;
        toAddress: string;
      };

      if (!walletAddress) {
        return (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg my-3">
            <p className="text-sm text-yellow-800">
              Please connect your wallet to initiate a transfer.
            </p>
          </div>
        );
      }

      const transferData: TransferData = {
        amount: amount || "0",
        token: token || "MOVE",
        tokenSymbol: token || "MOVE",
        toAddress: toAddress || "",
        fromAddress: walletAddress,
        network: "movement",
      };

      return (
        <TransferCard
          data={transferData}
          onTransferInitiate={() => {
            console.log("Transfer initiated:", transferData);
          }}
        />
      );
    },
  });
}
