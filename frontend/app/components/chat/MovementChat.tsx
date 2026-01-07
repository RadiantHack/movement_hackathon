"use client";

/**
 * Movement Chat Component
 *
 * Demonstrates key patterns:
 * - A2A Communication: Visualizes message flow between orchestrator and agents
 * - Movement Network: Specialized for Movement Network blockchain operations
 *
 * This component has been refactored for modularity:
 * - Data fetching: useChatData hook
 * - UI state: useChatUIState hook
 * - Message parsing: parseMessages utility
 * - Actions: Separate action handlers
 * - Instructions: generateChatInstructions utility
 */

import { useEffect, useState, useCallback } from "react";
import { useCopilotChat, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { QuestManager } from "../quest/QuestManager";
import { Suggestions } from "./Suggestions";
import { PlatformSelectionCard } from "../lending";
import { LendCard } from "../lending/moveposition";
import { EchelonSupplyModal } from "../lending/echelon";
import { useChatData } from "./hooks/use-chat-data";
import { useChatUIState } from "./hooks/use-chat-ui-state";
import {
  parseMessages,
  SupplyConfirmation,
  LendingRecommendation,
} from "./utils/message-parser";
import { generateChatInstructions } from "./utils/chat-instructions";
import { useA2AAction } from "./actions/use-a2a-action";
import { useTransferAction } from "./actions/use-transfer-action";
import { useSwapAction } from "./actions/use-swap-action";
import { useSupplyAction } from "./actions/use-supply-action";
import { useLendingAction } from "./actions/use-lending-action";

interface MovementChatProps {
  walletAddress: string | null;
}

const ChatInner = ({ walletAddress }: MovementChatProps) => {
  const { visibleMessages, appendMessage } = useCopilotChat();

  // Custom hooks for data and UI state
  const { echelonAssets, availableBalances, refreshBalances } =
    useChatData(walletAddress);
  const {
    hasScrolled,
    suggestionSubmitted,
    inputFocused,
    setSuggestionSubmitted,
  } = useChatUIState();

  // State for parsed message data
  const [lendingRecommendation, setLendingRecommendation] =
    useState<LendingRecommendation | null>(null);
  const [supplyConfirmation, setSupplyConfirmation] =
    useState<SupplyConfirmation | null>(null);

  // Wrapper function to adapt simple message format to CopilotKit Message format
  const handleAppendMessage = useCallback(
    (message: { role: string; content: string }) => {
      if (message.role === "user" && appendMessage) {
        (appendMessage as any)({
          role: "user",
          content: message.content,
        });
      }
    },
    [appendMessage]
  );

  // Register all CopilotKit actions
  useA2AAction();
  useTransferAction({ walletAddress });
  useSwapAction({ walletAddress });
  useSupplyAction({
    walletAddress,
    echelonAssets,
    availableBalances,
    onSupplySuccess: refreshBalances,
  });
  useLendingAction({
    walletAddress,
    onClose: () => setLendingRecommendation(null),
  });

  // Provide wallet address to CopilotKit
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

  // Parse messages to extract structured data
  useEffect(() => {
    if (!visibleMessages || visibleMessages.length === 0) {
      return;
    }

    const parsed = parseMessages(visibleMessages);

    if (parsed.supplyConfirmation) {
      setSupplyConfirmation(parsed.supplyConfirmation);
    }

    if (parsed.lendingRecommendation) {
      setLendingRecommendation(parsed.lendingRecommendation);
    }
  }, [visibleMessages]);

  // Generate chat instructions
  const instructions = generateChatInstructions(walletAddress);

  return (
    <div className="h-full w-full flex flex-col min-h-0">
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
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
        {/* Lending Recommendation Card */}
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

        {/* Supply Confirmation Card */}
        {supplyConfirmation && (
          <>
            {supplyConfirmation.protocol === "moveposition" ? (
              <div className="my-3">
                <LendCard
                  walletAddress={walletAddress}
                  asset={supplyConfirmation.asset}
                />
              </div>
            ) : (
              (() => {
                const assetSymbol = supplyConfirmation.asset.toUpperCase();
                const echelonAsset = echelonAssets[assetSymbol];

                return (
                  <EchelonSupplyModal
                    isOpen={true}
                    onClose={() => setSupplyConfirmation(null)}
                    inline={true}
                    asset={
                      echelonAsset || {
                        symbol: assetSymbol,
                        name: supplyConfirmation.asset,
                        icon: "",
                        price: 1,
                        supplyApr: 0,
                        faAddress: undefined,
                        decimals: 8,
                        marketAddress: undefined,
                      }
                    }
                    availableBalance={availableBalances[assetSymbol] || 0}
                    onSuccess={async () => {
                      await refreshBalances();
                    }}
                  />
                );
              })()
            )}
          </>
        )}

        {/* Chat Interface */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative w-full flex flex-col">
          <CopilotChat
            className="h-full w-full min-h-0 max-w-full flex flex-col"
            instructions={instructions}
            labels={{
              title: "Movement Assistant",
              initial: "Hi! 👋 How can I assist you today?",
            }}
          />
        </div>

        {/* Suggestions - Positioned between messages and input container */}
        {(!visibleMessages || visibleMessages.length <= 2) &&
          !hasScrolled &&
          !suggestionSubmitted &&
          !inputFocused && (
            <div className="flex-shrink-0 relative z-10 px-2 sm:px-4 pt-0 pb-1.5 sm:pt-1.5 sm:pb-3 mt-0">
              <Suggestions
                walletAddress={walletAddress}
                appendMessage={handleAppendMessage}
                onSuggestionClick={(text) => {
                  console.log("Suggestion clicked:", text);
                  setSuggestionSubmitted(true);
                }}
              />
            </div>
          )}
      </div>
    </div>
  );
};

export default function MovementChat({ walletAddress }: MovementChatProps) {
  return <ChatInner walletAddress={walletAddress} />;
}
