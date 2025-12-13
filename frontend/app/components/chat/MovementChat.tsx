"use client";

/**
 * Movement Chat Component
 *
 * Demonstrates key patterns:
 * - A2A Communication: Visualizes message flow between orchestrator and agents
 * - Movement Network: Specialized for Movement Network blockchain operations
 */

import { useEffect } from "react";
import {
  useCopilotChat,
  useCopilotReadable,
  useCopilotAction,
} from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { MessageToA2A } from "./a2a/MessageToA2A";
import { MessageFromA2A } from "./a2a/MessageFromA2A";
import { TransferCard } from "../features/transfer/TransferCard";
import { SwapCard } from "../features/swap/SwapCard";
import { TransferData } from "../types";
import { getAllTokens } from "../../utils/token-constants";

interface MovementChatProps {
  walletAddress: string | null;
}

const ChatInner = ({ walletAddress }: MovementChatProps) => {
  const { visibleMessages } = useCopilotChat();

  // Provide wallet address to CopilotKit so orchestrator can use it automatically
  useCopilotReadable({
    description: "User's connected wallet address for Movement Network",
    value: walletAddress
      ? {
          address: walletAddress,
          network: "movement",
          chainType: "aptos",
        }
      : null,
  });

  // Register A2A message visualizer (renders green/blue communication boxes)
  // Note: available: "frontend" means this is only for UI rendering, not a backend tool
  // The actual tool is provided by A2A middleware in the API route
  useCopilotAction({
    name: "send_message_to_a2a_agent",
    description: "Sends a message to an A2A agent",
    available: "frontend",
    parameters: [
      {
        name: "agentName",
        type: "string",
        description: "The name of the A2A agent to send the message to",
      },
      {
        name: "task",
        type: "string",
        description: "The message to send to the A2A agent",
      },
    ],
    render: (props) => (
      <>
        <MessageToA2A {...props} />
        <MessageFromA2A {...props} />
      </>
    ),
  });

  // Register transfer action - shows TransferCard when user wants to transfer tokens
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

  // Register swap action - shows SwapCard when user wants to swap tokens
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

      // Validate tokens against allowed list
      const availableTokens = getAllTokens();
      const availableSymbols = availableTokens.map((t) =>
        t.symbol.toUpperCase()
      );

      const fromTokenUpper = fromToken?.toUpperCase() || "";
      const toTokenUpper = toToken?.toUpperCase() || "";

      // Validate tokens are in the allowed list
      if (fromTokenUpper && !availableSymbols.includes(fromTokenUpper)) {
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

      if (toTokenUpper && !availableSymbols.includes(toTokenUpper)) {
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

      return (
        <SwapCard
          walletAddress={walletAddress}
          initialFromToken={fromTokenUpper || "MOVE"}
          initialToToken={toTokenUpper || "USDC"}
        />
      );
    },
  });

  // Extract structured data from A2A agent responses
  useEffect(() => {
    const extractDataFromMessages = () => {
      for (const message of visibleMessages) {
        const msg = message as any;

        if (
          msg.type === "ResultMessage" &&
          msg.actionName === "send_message_to_a2a_agent"
        ) {
          try {
            const result = msg.result;
            console.log(
              "📥 Raw A2A result:",
              typeof result,
              result?.substring?.(0, 200) || result
            );
            let parsed;

            if (typeof result === "string") {
              let cleanResult = result;
              if (result.startsWith("A2A Agent Response: ")) {
                cleanResult = result.substring("A2A Agent Response: ".length);
              }

              // Try to parse as JSON directly
              try {
                parsed = JSON.parse(cleanResult);
              } catch (e) {
                // If direct parsing fails, try to extract JSON from the string
                // Strategy: Find the largest valid JSON object in the string
                let found = false;
                let bestMatch = null;
                let bestLength = 0;

                // Find all potential JSON object starts
                for (let i = 0; i < cleanResult.length; i++) {
                  if (cleanResult[i] === "{") {
                    // Try to find the matching closing brace
                    let braceCount = 0;
                    let j = i;
                    while (j < cleanResult.length) {
                      if (cleanResult[j] === "{") braceCount++;
                      if (cleanResult[j] === "}") {
                        braceCount--;
                        if (braceCount === 0) {
                          // Found a complete JSON object
                          const candidate = cleanResult.substring(i, j + 1);
                          try {
                            const candidateParsed = JSON.parse(candidate);
                            // Verify it's a valid structured response with a type field
                            if (
                              candidateParsed &&
                              typeof candidateParsed === "object" &&
                              candidateParsed.type
                            ) {
                              if (candidate.length > bestLength) {
                                bestMatch = candidateParsed;
                                bestLength = candidate.length;
                                found = true;
                              }
                            }
                          } catch (e2) {
                            // Not valid JSON, continue
                          }
                          break;
                        }
                      }
                      j++;
                    }
                  }
                }

                if (found && bestMatch) {
                  parsed = bestMatch;
                  console.log(
                    "✅ Extracted JSON with type:",
                    parsed.type,
                    "Length:",
                    bestLength
                  );
                } else {
                  // Try one more time with a simpler approach - look for bridge type specifically
                  const bridgeMatch = cleanResult.match(
                    /type["\s]*:["\s]*"bridge"/i
                  );
                  if (bridgeMatch) {
                    // Try to extract a larger JSON block around the bridge type
                    const startIdx = cleanResult.indexOf("{");
                    const endIdx = cleanResult.lastIndexOf("}");
                    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                      try {
                        const candidate = cleanResult.substring(
                          startIdx,
                          endIdx + 1
                        );
                        parsed = JSON.parse(candidate);
                        console.log(
                          "✅ Extracted bridge JSON with fallback method"
                        );
                      } catch (e) {
                        console.warn(
                          "No valid JSON found in result string. Raw result:",
                          cleanResult.substring(0, 500)
                        );
                        return; // Skip this message
                      }
                    } else {
                      console.warn(
                        "No valid JSON found in result string. Raw result:",
                        cleanResult.substring(0, 500)
                      );
                      return; // Skip this message
                    }
                  } else {
                    console.warn(
                      "No valid JSON found in result string. Raw result:",
                      cleanResult.substring(0, 500)
                    );
                    return; // Skip this message
                  }
                }
              }
            } else if (typeof result === "object" && result !== null) {
              parsed = result;
            }

            // Process parsed data here if needed
            if (parsed) {
              console.log("📦 Parsed A2A response:", parsed);
            }
          } catch (e) {
            // Silently ignore parsing errors
          }
        }
      }
    };

    extractDataFromMessages();
  }, [visibleMessages]);

  const instructions = `You are a Web3 and cryptocurrency assistant for Movement Network. Help users with blockchain operations, balance checks, token swaps, and market analysis. Always be helpful and provide clear, actionable information.

CRITICAL: This application works EXCLUSIVELY with Movement Network. All operations default to Movement Network.

AVAILABLE ACTIONS:
- Balance queries: Use Balance Agent to check token balances
- Transfer tokens: Use initiate_transfer action to transfer tokens to another address
- Swap tokens: Use initiate_swap action to swap one token for another (e.g., "swap MOVE for USDC", "exchange USDT to MOVE")

${
  walletAddress
    ? `🔑 WALLET ADDRESS PROVIDED - USE THIS EXACT ADDRESS:
The user has a connected Movement Network wallet address: ${walletAddress}

⚠️ CRITICAL INSTRUCTIONS FOR BALANCE QUERIES:
1. When user says "get balance at my wallet", "check my balance", "my balance", or "get my wallet balance":
   - YOU MUST use this EXACT wallet address: ${walletAddress}
   - DO NOT use any other address
   - DO NOT ask the user for an address
   - Network is ALWAYS "movement" (Movement Network)
   - DO NOT ask for network

2. Call Balance Agent IMMEDIATELY with this exact format:
   "get balance of ${walletAddress} on movement"

3. DO NOT ask questions - just use the address ${walletAddress} and call the agent

EXAMPLE RESPONSE:
User: "get my wallet balance"
You: "I'll check your Movement Network balance now."
[Then IMMEDIATELY call Balance Agent: "get balance of ${walletAddress} on movement"]

REMEMBER: The wallet address is ${walletAddress} - use it exactly as shown.`
    : "Note: No Movement Network wallet is currently connected. Please ask the user to create a Movement Network wallet first."
}`;

  return (
    <div className="h-full w-full">
      <CopilotChat
        className="h-full w-full"
        instructions={instructions}
        labels={{
          title: "Movement Assistant",
          initial: "Hi! 👋 How can I assist you today?",
        }}
      />
    </div>
  );
};

export default function MovementChat({ walletAddress }: MovementChatProps) {
  return <ChatInner walletAddress={walletAddress} />;
}
