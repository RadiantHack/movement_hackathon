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

  // Track if current step has been completed (user action detected)
  // But don't auto-advance - wait for user confirmation via "I've Done This" button
  const [stepActionDetected, setStepActionDetected] = useState(false);

  // Reset action detection when step changes
  useEffect(() => {
    setStepActionDetected(false);
  }, [quest.currentStepIndex]);

  // Check for quest step completion based on agent responses
  // Only track that action was detected, but don't auto-advance
  useEffect(() => {
    if (quest.status !== "in_progress" || !isVisible) {
      setStepActionDetected(false);
      return;
    }

    const messages = visibleMessages || [];
    const currentStep = quest.steps[quest.currentStepIndex];

    // Check if we got a response from the expected agent
    const hasAgentResponse = messages.some((m: any) => {
      if (
        m.type === "ResultMessage" &&
        m.actionName === "send_message_to_a2a_agent"
      ) {
        const args = m.args as any;
        const agentName = args?.agentName;
        
        // For bridge quest, we need to verify it's Movement -> Ethereum
        if (currentStep?.actionType === "bridge" && agentName === "bridge") {
          const task = args?.task || "";
          const result = m.result || "";
          const taskLower = task.toLowerCase();
          const resultLower = typeof result === "string" ? result.toLowerCase() : "";
          
          // Check if it mentions Movement to Ethereum (or Movement -> Ethereum)
          const isMovementToEthereum = 
            (taskLower.includes("movement") && taskLower.includes("ethereum")) ||
            (taskLower.includes("movement") && taskLower.includes("eth")) ||
            (resultLower.includes("movement") && resultLower.includes("ethereum")) ||
            (resultLower.includes("movement") && resultLower.includes("eth"));
          
          // Also check that it's FROM movement (not TO movement)
          const isFromMovement = 
            taskLower.includes("from movement") ||
            taskLower.includes("movement to") ||
            resultLower.includes("from movement") ||
            resultLower.includes("movement to");
          
          return isMovementToEthereum && isFromMovement;
        }
        
        // For other agents, just check if agent name matches
        return agentName === currentStep?.agentName;
      }
      return false;
    });

    // Check for action completions and action rendering
    const hasActionCompletion = messages.some((m: any) => {
      const actionName = m.actionName || "";
      const stepAction = currentStep?.actionType;

      // For transfer, swap, and lending - check if action exists in messages
      // This catches both when actions are rendered (cards open) and when they complete
      if (stepAction === "transfer" && actionName === "initiate_transfer") {
        // TransferCard is rendered when initiate_transfer action is called
        return true;
      }
      if (stepAction === "swap" && actionName === "initiate_swap") {
        // SwapCard is rendered when initiate_swap action is called
        return true;
      }
      if (
        stepAction === "lending" &&
        actionName === "show_lending_platform_selection"
      ) {
        // PlatformSelectionCard is rendered when show_lending_platform_selection action is called
        return true;
      }

      // Also check for ResultMessage type (action completed)
      if (m.type === "ResultMessage") {
        if (stepAction === "swap" && actionName === "initiate_swap")
          return true;
        if (stepAction === "transfer" && actionName === "initiate_transfer")
          return true;
        if (
          stepAction === "lending" &&
          actionName === "show_lending_platform_selection"
        )
          return true;
        // Bridge completion is handled in hasAgentResponse above
      }

      return false;
    });

    // Only track that action was detected - don't auto-advance
    // User must click "I've Done This" button to proceed
    if (hasAgentResponse || hasActionCompletion) {
      setStepActionDetected(true);
    } else {
      setStepActionDetected(false);
    }
  }, [visibleMessages, quest, isVisible]);

  const completeCurrentStep = useCallback(() => {
    setQuest((prev) => {
      const nextIndex = prev.currentStepIndex + 1;
      const isComplete = nextIndex >= prev.steps.length;

      // Reset action detection when moving to next step
      setStepActionDetected(false);

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
      actionDetected={stepActionDetected}
    />
  );
};
