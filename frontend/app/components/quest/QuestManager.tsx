"use client";

/**
 * QuestManager Component
 *
 * Manages quest state and displays quest cards in the chat interface
 */

import React, { useState, useEffect, useCallback } from "react";
import { Quest, QuestStep, QuestProgress, QuestStatus } from "./types";
import { QuestCard } from "./QuestCard";
import { useCopilotChat } from "@copilotkit/react-core";

interface QuestManagerProps {
  walletAddress: string | null;
  onQuestComplete?: (questId: string) => void;
}

// Define the onboarding quest
const ONBOARDING_QUEST: Quest = {
  id: "onboarding_beginner",
  title: "🚀 Welcome to Movement Network!",
  description: "Complete this quest to master DeFi on Movement Network",
  icon: "🎯",
  status: "not_started",
  currentStepIndex: 0,
  totalRewards: 7,
  steps: [
    {
      id: "step_1_balance",
      title: "Check Your Balance",
      description:
        "Learn how to check your cryptocurrency balance. This is the first step to managing your assets on Movement Network.",
      instruction:
        'Type "check my balance" or "get my wallet balance" in the chat',
      agentName: "balance",
      actionType: "balance",
      reward: "Balance Explorer",
      icon: "💰",
      estimatedTime: 30,
    },
    {
      id: "step_2_swap",
      title: "Swap Tokens",
      description:
        "Learn how to swap one token for another. This is like exchanging currencies - you trade one token for another at the current market rate.",
      instruction: 'Type "swap MOVE for USDC" or "I want to swap tokens"',
      agentName: "swap",
      actionType: "swap",
      reward: "Token Swapper",
      icon: "🔄",
      estimatedTime: 60,
    },
    {
      id: "step_3_lending",
      title: "Explore Lending",
      description:
        "Understand how lending works. You can supply tokens as collateral and earn interest, or borrow tokens against your collateral.",
      instruction:
        'Type "compare borrowing rates for MOVE" or "where should I lend USDC?"',
      agentName: "lending",
      actionType: "lending",
      reward: "Lending Master",
      icon: "🏦",
      estimatedTime: 90,
    },
    {
      id: "step_4_transfer",
      title: "Send Tokens",
      description:
        "Learn how to send tokens to another address. This is how you transfer assets to other wallets.",
      instruction:
        'Type "transfer 1 MOVE to [address]" or "I want to send tokens" (you can use a test address)',
      agentName: "transfer",
      actionType: "transfer",
      reward: "Token Sender",
      icon: "📤",
      estimatedTime: 45,
    },
    {
      id: "step_5_bridge",
      title: "Bridge Tokens",
      description:
        "Learn how to bridge tokens from other networks to Movement Network. This allows you to bring assets from Ethereum, BNB, Polygon, and other chains.",
      instruction:
        'Type "bridge tokens to Movement" or "bridge USDC from Ethereum to Movement"',
      agentName: "bridge",
      actionType: "bridge",
      reward: "Bridge Master",
      icon: "🌉",
      estimatedTime: 90,
    },
  ],
};

export const QuestManager: React.FC<QuestManagerProps> = ({
  walletAddress,
  onQuestComplete,
}) => {
  const [quest, setQuest] = useState<Quest>(ONBOARDING_QUEST);
  const [isVisible, setIsVisible] = useState(false);
  const { visibleMessages } = useCopilotChat();

  // Check if user says they're new/beginner
  useEffect(() => {
    const checkForBeginnerSignal = () => {
      const messages = visibleMessages || [];
      const lastUserMessage = messages
        .filter((m: any) => m.role === "user")
        .pop();

      if (lastUserMessage) {
        const text = (
          (lastUserMessage as any).content ||
          (lastUserMessage as any).text ||
          ""
        ).toLowerCase();
        const beginnerKeywords = [
          "i am new",
          "i'm new",
          "beginner",
          "new to crypto",
          "new to defi",
          "help me learn",
          "how do i",
          "what is",
          "explain",
          "i don't understand",
          "first time",
          "just started",
        ];

        const isBeginner = beginnerKeywords.some((keyword) =>
          text.includes(keyword)
        );

        if (isBeginner && quest.status === "not_started") {
          setQuest((prev) => ({
            ...prev,
            status: "in_progress",
            startedAt: new Date(),
          }));
          setIsVisible(true);
        }
      }
    };

    checkForBeginnerSignal();
  }, [visibleMessages, quest.status]);

  // Check for quest step completion based on agent responses
  useEffect(() => {
    if (quest.status !== "in_progress" || !isVisible) return;

    const messages = visibleMessages || [];
    const currentStep = quest.steps[quest.currentStepIndex];

    // Check if we got a response from the expected agent
    const hasAgentResponse = messages.some((m: any) => {
      if (
        m.type === "ResultMessage" &&
        m.actionName === "send_message_to_a2a_agent"
      ) {
        const args = m.args as any;
        return args?.agentName === currentStep?.agentName;
      }
      return false;
    });

    // Check for action completions
    const hasActionCompletion = messages.some((m: any) => {
      if (m.type === "ResultMessage") {
        const actionName = m.actionName || "";
        const stepAction = currentStep?.actionType;

        if (stepAction === "swap" && actionName === "initiate_swap")
          return true;
        if (stepAction === "transfer" && actionName === "initiate_transfer")
          return true;
        if (
          stepAction === "lending" &&
          actionName === "show_lending_platform_selection"
        )
          return true;
      }
      return false;
    });

    if (hasAgentResponse || hasActionCompletion) {
      // Mark step as complete and move to next
      setTimeout(() => {
        completeCurrentStep();
      }, 2000); // Give user time to see the result
    }
  }, [visibleMessages, quest, isVisible]);

  const completeCurrentStep = useCallback(() => {
    setQuest((prev) => {
      const nextIndex = prev.currentStepIndex + 1;
      const isComplete = nextIndex >= prev.steps.length;

      if (isComplete) {
        onQuestComplete?.(prev.id);
        return {
          ...prev,
          status: "completed",
          completedAt: new Date(),
          currentStepIndex: prev.steps.length - 1,
        };
      }

      return {
        ...prev,
        currentStepIndex: nextIndex,
      };
    });
  }, [onQuestComplete]);

  const skipQuest = useCallback(() => {
    setQuest((prev) => ({
      ...prev,
      status: "skipped",
    }));
    setIsVisible(false);
  }, []);

  const skipCurrentStep = useCallback(() => {
    completeCurrentStep();
  }, [completeCurrentStep]);

  if (
    !isVisible ||
    quest.status === "completed" ||
    quest.status === "skipped"
  ) {
    return null;
  }

  const currentStep = quest.steps[quest.currentStepIndex];
  if (!currentStep) return null;

  const progress: QuestProgress = {
    questId: quest.id,
    currentStep: quest.currentStepIndex + 1,
    totalSteps: quest.steps.length,
    completedSteps: quest.currentStepIndex,
    percentage: Math.round((quest.currentStepIndex / quest.steps.length) * 100),
    status: quest.status,
  };

  return (
    <QuestCard
      step={currentStep}
      progress={progress}
      onComplete={completeCurrentStep}
      onSkip={skipCurrentStep}
    />
  );
};
