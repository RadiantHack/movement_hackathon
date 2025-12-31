"use client";

/**
 * Movement Chat Component
 *
 * Demonstrates key patterns:
 * - A2A Communication: Visualizes message flow between orchestrator and agents
 * - Movement Network: Specialized for Movement Network blockchain operations
 */

import { useEffect, useState } from "react";
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
import { PlatformSelectionCard } from "../features/lending/PlatformSelectionCard";
import { LendCard } from "../features/lend/LendCard";
import { EchelonSupplyModal } from "../echelon-supply-modal";
import { TransferData } from "../types";
import { getAllTokens } from "../../utils/token-constants";
import { QuestManager } from "../quest/QuestManager";
import { Suggestions } from "./Suggestions";

interface MovementChatProps {
  walletAddress: string | null;
}

const ChatInner = ({ walletAddress }: MovementChatProps) => {
  const { visibleMessages, appendMessage } = useCopilotChat();
  const [hasScrolled, setHasScrolled] = useState(false);
  const [suggestionSubmitted, setSuggestionSubmitted] = useState(false);
  const [lendingRecommendation, setLendingRecommendation] = useState<{
    action: "borrow" | "lend";
    asset: string;
    recommendedProtocol: string;
    echelonRate: string;
    movepositionRate: string;
    reason: string;
  } | null>(null);
  const [supplyConfirmation, setSupplyConfirmation] = useState<{
    protocol: "moveposition" | "echelon";
    asset: string;
    amount: string;
  } | null>(null);

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
    render: (props) => {
      // Only show A2A communication if agentName and task are valid
      if (
        !props.args?.agentName ||
        !props.args?.task ||
        props.args.agentName.trim() === "" ||
        props.args.task.trim() === ""
      ) {
        return <></>;
      }
      return (
        <>
          <MessageToA2A {...props} />
          <MessageFromA2A {...props} />
        </>
      );
    },
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

      // Normalize tokens: USDC -> USDC.e, USDT -> USDT.e
      const fromTokenUpper = fromToken?.toUpperCase() || "";
      const toTokenUpper = toToken?.toUpperCase() || "";

      // Map USDC to USDC.e and USDT to USDT.e for validation
      const normalizedFromToken =
        fromTokenUpper === "USDC"
          ? "USDC.E"
          : fromTokenUpper === "USDT"
            ? "USDT.E"
            : fromTokenUpper;
      const normalizedToToken =
        toTokenUpper === "USDC"
          ? "USDC.E"
          : toTokenUpper === "USDT"
            ? "USDT.E"
            : toTokenUpper;

      // Validate tokens are in the allowed list (check both original and normalized)
      const isValidFromToken =
        normalizedFromToken &&
        (availableSymbols.includes(normalizedFromToken) ||
          availableSymbols.includes(fromTokenUpper));
      const isValidToToken =
        normalizedToToken &&
        (availableSymbols.includes(normalizedToToken) ||
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

      // Use normalized tokens (USDC -> USDC.e, USDT -> USDT.e) for SwapCard
      const finalFromToken =
        fromTokenUpper === "USDC"
          ? "USDC.e"
          : fromTokenUpper === "USDT"
            ? "USDT.e"
            : fromTokenUpper || "MOVE";
      const finalToToken =
        toTokenUpper === "USDC"
          ? "USDC.e"
          : toTokenUpper === "USDT"
            ? "USDT.e"
            : toTokenUpper || "USDC";

      return (
        <SwapCard
          walletAddress={walletAddress}
          initialFromToken={finalFromToken}
          initialToToken={finalToToken}
        />
      );
    },
  });

  // Detect scroll to hide suggestions
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      // Hide suggestions if scrolled more than 50px
      if (target.scrollTop > 50) {
        setHasScrolled(true);
      }
    };

    const handleWindowScroll = () => setHasScrolled(true);

    // Find the messages container - try multiple selectors
    const findMessagesContainer = () => {
      return (
        document.querySelector(
          '.copilotKitChat [class*="MessagesContainer"]'
        ) ||
        document.querySelector(
          '.copilotKitChat [class*="messages-container"]'
        ) ||
        document.querySelector(".copilotKitChat > div > div:first-child") ||
        document.querySelector(".copilotKitChat")
      );
    };

    const messagesContainer = findMessagesContainer();

    if (messagesContainer) {
      messagesContainer.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    }

    // Also check for scroll on window (mobile browsers)
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => {
      if (messagesContainer) {
        messagesContainer.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, []);

  // Reset scroll state when messages are cleared
  useEffect(() => {
    if (!visibleMessages || visibleMessages.length === 0) {
      setHasScrolled(false);
      setSuggestionSubmitted(false);
    }
  }, [visibleMessages]);

  // Hide suggestions when a new user message is sent (suggestion was submitted)
  useEffect(() => {
    if (visibleMessages && visibleMessages.length > 2) {
      setSuggestionSubmitted(true);
    }
  }, [visibleMessages]);

  // Extract structured data from A2A agent responses and detect supply confirmations
  useEffect(() => {
    const extractDataFromMessages = () => {
      for (const message of visibleMessages) {
        const msg = message as any;

        // Detect supply confirmations from text messages
        if (msg.type === "text" && msg.role === "assistant") {
          const text = msg.content || "";

          // Pattern: "You've successfully supplied X [ASSET] as collateral on [PROTOCOL]"
          // or "You've successfully supplied X [ASSET] to [PROTOCOL]"
          // or "supplied X [ASSET] as collateral on [PROTOCOL]"
          const supplyPatterns = [
            /(?:successfully|supplied)\s+([\d.]+)\s+([A-Z]+)\s+(?:as collateral|to|on)\s+(MovePosition|Echelon)/i,
            /supplied\s+([\d.]+)\s+([A-Z]+)\s+(?:as collateral|to|on)\s+(MovePosition|Echelon)/i,
            /(?:successfully|supplied)\s+([\d.]+)\s+([A-Z]+)\s+to\s+(MovePosition|Echelon)/i,
          ];

          for (const pattern of supplyPatterns) {
            const match = text.match(pattern);
            if (match) {
              const amount = match[1];
              const asset = match[2];
              const protocol =
                match[3].toLowerCase() === "moveposition"
                  ? "moveposition"
                  : "echelon";

              console.log("✅ Supply confirmation detected from text:", {
                protocol,
                asset,
                amount,
              });
              setSupplyConfirmation({ protocol, asset, amount });
              break;
            }
          }
        }

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

              // Check if this is a supply confirmation response
              if (
                parsed.status === "success" &&
                parsed.protocol &&
                parsed.asset &&
                parsed.amount &&
                (parsed.message?.toLowerCase().includes("supplied") ||
                  parsed.message?.toLowerCase().includes("supply"))
              ) {
                const protocol = parsed.protocol.toLowerCase();
                const isMovePosition = protocol === "moveposition";
                const isEchelon = protocol === "echelon";

                if (isMovePosition || isEchelon) {
                  console.log("✅ Supply confirmation from A2A response:", {
                    protocol,
                    asset: parsed.asset,
                    amount: parsed.amount,
                  });
                  setSupplyConfirmation({
                    protocol: isMovePosition ? "moveposition" : "echelon",
                    asset: parsed.asset,
                    amount: parsed.amount,
                  });
                }
              }

              // Check if this is a lending recommendation response
              if (
                parsed.action &&
                (parsed.action === "borrow" || parsed.action === "lend") &&
                parsed.recommended_protocol &&
                parsed.echelon_rate &&
                parsed.moveposition_rate
              ) {
                setLendingRecommendation({
                  action: parsed.action,
                  asset: parsed.asset || "MOVE",
                  recommendedProtocol: parsed.recommended_protocol,
                  echelonRate: parsed.echelon_rate,
                  movepositionRate: parsed.moveposition_rate,
                  reason: parsed.reason || parsed.message || "",
                });
              }
            }
          } catch (e) {
            // Silently ignore parsing errors
          }
        }
      }
    };

    extractDataFromMessages();
  }, [visibleMessages]);

  // Register supply confirmation action - opens supply card when supply is confirmed
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
            <LendCard walletAddress={walletAddress} />
          </div>
        );
      } else if (isEchelon) {
        return (
          <EchelonSupplyModal
            isOpen={true}
            onClose={() => setSupplyConfirmation(null)}
            asset={{
              symbol: asset || "UNKNOWN",
              name: asset || "Unknown Asset",
              icon: "",
              price: 1,
              supplyApr: 0,
            }}
          />
        );
      }

      // Fallback: return empty div if protocol is not recognized
      return <div className="my-3" />;
    },
  });

  // Register lending platform selection action
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
          onClose={() => setLendingRecommendation(null)}
        />
      );
    },
  });

  const instructions = `You are a Web3 and cryptocurrency assistant for Movement Network. Help users with blockchain operations, balance checks, token swaps, and market analysis. Always be helpful and provide clear, actionable information.

**BEGINNER DETECTION & ONBOARDING:**
- If a user says they are "new", "beginner", "new to crypto", "new to DeFi", "first time", "just started", "help me learn", "I don't understand", or asks "what is" or "how do I" questions:
  - Acknowledge they're new and welcome them warmly
  - Explain that an interactive quest will appear to guide them step-by-step
  - Encourage them to follow the quest cards that appear above the chat
  - Be patient and explain concepts in simple terms
  - The quest system will automatically detect when they complete each step

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
    <div className="h-full w-full flex flex-col">
      {/* Quest Manager - Shows onboarding quest for beginners */}
      <div className="flex-shrink-0">
        <QuestManager
          walletAddress={walletAddress}
          onQuestComplete={(questId) => {
            console.log("Quest completed:", questId);
          }}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-h-0 overflow-visible flex flex-col">
        {lendingRecommendation && (
          <PlatformSelectionCard
            action={lendingRecommendation.action}
            asset={lendingRecommendation.asset}
            recommendedProtocol={lendingRecommendation.recommendedProtocol}
            echelonRate={lendingRecommendation.echelonRate}
            movepositionRate={lendingRecommendation.movepositionRate}
            reason={lendingRecommendation.reason}
            walletAddress={walletAddress}
            onClose={() => setLendingRecommendation(null)}
          />
        )}
        {supplyConfirmation && (
          <>
            {supplyConfirmation.protocol === "moveposition" ? (
              <div className="my-3">
                <LendCard walletAddress={walletAddress} />
              </div>
            ) : (
              <EchelonSupplyModal
                isOpen={true}
                onClose={() => setSupplyConfirmation(null)}
                asset={{
                  symbol: supplyConfirmation.asset,
                  name: supplyConfirmation.asset,
                  icon: "",
                  price: 1,
                  supplyApr: 0,
                }}
              />
            )}
          </>
        )}
        <div className="flex-1 min-h-0 overflow-visible relative">
          <CopilotChat
            className="h-full w-full"
            instructions={instructions}
            labels={{
              title: "Movement Assistant",
              initial: "Hi! 👋 How can I assist you today?",
            }}
          />

          {/* Suggestions - Positioned just above chat input box, hide when scrolled or submitted */}
          {(!visibleMessages || visibleMessages.length <= 2) &&
            !hasScrolled &&
            !suggestionSubmitted && (
              <div
                className={`fixed sm:absolute bottom-32 sm:bottom-32 left-0 right-0 z-[100] pointer-events-none sm:left-auto sm:right-auto suggestions-container-mobile transition-all duration-300 ${hasScrolled || suggestionSubmitted ? "opacity-0 pointer-events-none" : "opacity-100"}`}
              >
                <div className="pointer-events-auto max-w-full sm:max-w-none">
                  <Suggestions
                    walletAddress={walletAddress}
                    appendMessage={appendMessage}
                    onSuggestionClick={(text) => {
                      console.log("Suggestion clicked:", text);
                      // Hide suggestions immediately when clicked
                      setSuggestionSubmitted(true);
                    }}
                  />
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default function MovementChat({ walletAddress }: MovementChatProps) {
  return <ChatInner walletAddress={walletAddress} />;
}
