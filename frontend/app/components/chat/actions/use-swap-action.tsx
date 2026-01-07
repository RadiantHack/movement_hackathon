/**
 * Swap Action Handler
 * Registers the token swap action
 */

import React from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { SwapCard } from "../../swap";
import { getAllTokens } from "../../../utils/shared/tokens";

interface UseSwapActionProps {
  walletAddress: string | null;
}

/**
 * Normalize token symbol for swap (USDC -> USDC.e, USDT -> USDT.e)
 * Uses lowercase e to match actual token symbols and SwapCard expectations
 */
function normalizeTokenForSwap(token: string): string {
  const upperToken = token?.toUpperCase() || "";
  if (upperToken === "USDC") {
    return "USDC.e";
  }
  if (upperToken === "USDT") {
    return "USDT.e";
  }
  return upperToken;
}

/**
 * Register swap action
 */
export function useSwapAction({ walletAddress }: UseSwapActionProps) {
  useCopilotAction({
    name: "initiate_swap",
    description:
      "Initiate a token swap on Movement Network. Use this when user wants to swap one token for another (e.g., 'swap MOVE for USDC', 'exchange USDT to MOVE', 'swap tokens'). Only tokens from the available token list can be swapped.",
    parameters: [
      {
        name: "fromToken",
        type: "string",
        description:
          "The token symbol to swap from. Must be from the available token list (e.g., 'MOVE', 'USDC', 'USDT', 'USDC.e', 'USDT.e', 'WBTC.e', 'WETH.e', etc.). Use getAllTokens() to see all available tokens.",
        required: true,
      },
      {
        name: "toToken",
        type: "string",
        description:
          "The token symbol to swap to. Must be from the available token list (e.g., 'MOVE', 'USDC', 'USDT', 'USDC.e', 'USDT.e', 'WBTC.e', 'WETH.e', etc.). Use getAllTokens() to see all available tokens.",
        required: true,
      },
    ],
    render: (props) => {
      const { fromToken, toToken } = props.args as {
        fromToken: string;
        toToken: string;
      };

      if (!walletAddress) {
        return (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg my-3">
            <p className="text-sm text-yellow-800">
              Please connect your wallet to initiate a swap.
            </p>
          </div>
        );
      }

      const availableTokens = getAllTokens();
      const availableSymbols = availableTokens.map((t) =>
        t.symbol.toUpperCase()
      );

      const fromTokenUpper = fromToken?.toUpperCase() || "";
      const toTokenUpper = toToken?.toUpperCase() || "";

      const normalizedFromToken = normalizeTokenForSwap(fromTokenUpper);
      const normalizedToToken = normalizeTokenForSwap(toTokenUpper);

      // Check if token is valid - accept both normalized and original forms
      // availableSymbols are uppercase, so normalizeTokenForSwap returns uppercase with .e
      // But we need to check against uppercase version in availableSymbols
      const isValidFromToken =
        normalizedFromToken &&
        (availableSymbols.includes(normalizedFromToken.toUpperCase()) ||
          availableSymbols.includes(fromTokenUpper));
      const isValidToToken =
        normalizedToToken &&
        (availableSymbols.includes(normalizedToToken.toUpperCase()) ||
          availableSymbols.includes(toTokenUpper));

      if (fromTokenUpper && !isValidFromToken) {
        return (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg my-3">
            <p className="text-sm text-red-800 font-medium mb-2">
              Invalid token: {fromToken}
            </p>
            <p className="text-xs text-red-600">
              The token "{fromToken}" is not available for swapping. Please use
              a token from the available list.
            </p>
          </div>
        );
      }

      if (toTokenUpper && !isValidToToken) {
        return (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg my-3">
            <p className="text-sm text-red-800 font-medium mb-2">
              Invalid token: {toToken}
            </p>
            <p className="text-xs text-red-600">
              The token "{toToken}" is not available for swapping. Please use a
              token from the available list.
            </p>
          </div>
        );
      }

      const finalFromToken = normalizeTokenForSwap(fromTokenUpper) || "MOVE";
      const finalToToken = normalizeTokenForSwap(toTokenUpper) || "USDC";

      return (
        <div className="my-3 max-w-lg mx-auto relative z-10">
          <div className="relative rounded-xl border border-zinc-200/60 dark:border-zinc-700/40 bg-white dark:bg-zinc-900 p-2.5 shadow-lg shadow-zinc-200/30 dark:shadow-zinc-950/30 overflow-hidden z-10">
            {/* Subtle background decoration */}
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-br from-purple-500/3 to-violet-500/3 rounded-full blur-xl" />
            <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-gradient-to-tr from-purple-500/3 to-violet-500/3 rounded-full blur-xl" />

            {/* Swap Card Content - Compact for chat */}
            <div className="relative -m-1.5 scale-[0.95] origin-center">
              <SwapCard
                walletAddress={walletAddress}
                initialFromToken={finalFromToken}
                initialToToken={finalToToken}
              />
            </div>
          </div>
        </div>
      );
    },
  });
}
