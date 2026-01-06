"use client";

/**
 * QuestManager Component
 *
 * Manages quest state and displays quest cards in the chat interface
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Quest,
  QuestStep,
  QuestProgress,
  QuestStatus,
  ONBOARDING_QUEST,
} from "./types";
import { QuestCard } from "./QuestCard";
import { useCopilotChat } from "@copilotkit/react-core";

interface QuestManagerProps {
  walletAddress: string | null;
  onQuestComplete?: (questId: string) => void;
}

// ONBOARDING_QUEST is imported from types.ts

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
          // Track message count when quest first starts
          setStepStartMessageCount((visibleMessages || []).length);
        }
      }
    };

    checkForBeginnerSignal();
  }, [visibleMessages, quest.status]);

  // Track if current step has been completed (user action detected)
  // But don't auto-advance - wait for user confirmation via "I've Done This" button
  const [stepActionDetected, setStepActionDetected] = useState(false);

  // Track the message count when the current step started
  // This ensures we only detect actions that occurred AFTER the step started
  const [stepStartMessageCount, setStepStartMessageCount] = useState(0);

  // Reset action detection and track message count when step changes
  useEffect(() => {
    setStepActionDetected(false);
    // Track the current message count when step changes
    // Only reset when step index changes, not when messages change
    setStepStartMessageCount((visibleMessages || []).length);
  }, [quest.currentStepIndex]); // Removed visibleMessages from dependencies

  // Check for quest step completion based on agent responses
  // Only track that action was detected, but don't auto-advance
  useEffect(() => {
    if (quest.status !== "in_progress" || !isVisible) {
      setStepActionDetected(false);
      return;
    }

    const messages = visibleMessages || [];
    const currentStep = quest.steps[quest.currentStepIndex];

    // Only check messages that occurred AFTER the step started
    // This prevents false positives from actions triggered before the quest step began
    const messagesAfterStepStart = messages.slice(stepStartMessageCount);

    // Check if we got a response from the expected agent
    // Only check messages that occurred AFTER the step started
    const hasAgentResponse = messagesAfterStepStart.some((m: any) => {
      // Check for ResultMessage with send_message_to_a2a_agent
      if (
        m.type === "ResultMessage" &&
        m.actionName === "send_message_to_a2a_agent"
      ) {
        const args = m.args as any;
        const agentName = args?.agentName;

        // For other agents, just check if agent name matches
        if (agentName === currentStep?.agentName) {
          return true;
        }
      }

      // Also check for assistant messages that contain balance information
      // This is a fallback in case the ResultMessage format is different
      if (currentStep?.actionType === "balance" && m.role === "assistant") {
        const content = m.content || m.text || "";
        const contentLower =
          typeof content === "string" ? content.toLowerCase() : "";
        // Check if the message mentions balance results (MOVE, USDT, USDC, etc.)
        const hasBalanceInfo =
          (contentLower.includes("move:") || contentLower.includes("move ")) &&
          (contentLower.includes("balance") ||
            contentLower.includes("usdt") ||
            contentLower.includes("usdc"));

        if (hasBalanceInfo) {
          return true;
        }
      }

      return false;
    });

    // Check for action completions and action rendering
    // Only check messages that occurred AFTER the step started
    // CRITICAL: Only detect actions that match the CURRENT step's action type
    const hasActionCompletion = messagesAfterStepStart.some((m: any) => {
      const actionName = m.actionName || "";
      const stepAction = currentStep?.actionType;

      // CRITICAL: Only check if the action matches the CURRENT step's action type
      // This prevents detecting actions from future quest steps
      if (!stepAction) return false;

      // For transfer, swap, and lending - check if action exists in messages
      // This catches both when actions are rendered (cards open) and when they complete
      // ONLY return true if the action matches EXACTLY the current step's action type
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

      // For balance step, skip action completion check (no action card)
      if (stepAction === "balance") {
        return false;
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

    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV === "development") {
      console.log("[QuestManager] Detection check:", {
        stepIndex: quest.currentStepIndex,
        stepAction: currentStep?.actionType,
        stepAgentName: currentStep?.agentName,
        totalMessages: messages.length,
        messagesAfterStepStart: messagesAfterStepStart.length,
        stepStartMessageCount,
        hasAgentResponse,
        hasActionCompletion,
        actionDetected: hasAgentResponse || hasActionCompletion,
      });
    }
  }, [visibleMessages, quest, isVisible, stepStartMessageCount]);

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

  const jumpToStep = useCallback(
    (stepIndex: number) => {
      if (stepIndex >= 0 && stepIndex < quest.steps.length) {
        setQuest((prev) => ({
          ...prev,
          currentStepIndex: stepIndex,
        }));
        setStepActionDetected(false);
      }
    },
    [quest.steps.length]
  );

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
      onJumpToStep={jumpToStep}
      allSteps={quest.steps}
      actionDetected={stepActionDetected}
    />
  );
};
