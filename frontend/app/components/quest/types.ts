/**
 * Quest System Types
 *
 * Defines types for the interactive onboarding quest system
 */

export type QuestStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export interface QuestStep {
  id: string;
  title: string;
  description: string;
  instruction: string; // What the user should do
  agentName?: string; // Which agent to interact with
  actionType?: "balance" | "swap" | "transfer" | "lending";
  expectedResponse?: string; // Pattern to match for completion
  reward?: string; // Achievement/badge name
  icon?: string;
  estimatedTime?: number; // in seconds
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  icon: string;
  steps: QuestStep[];
  status: QuestStatus;
  currentStepIndex: number;
  startedAt?: Date;
  completedAt?: Date;
  totalRewards: number;
}

export interface QuestProgress {
  questId: string;
  currentStep: number;
  totalSteps: number;
  completedSteps: number;
  percentage: number;
  status: QuestStatus;
}

export interface QuestAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: Date;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export const QUEST_ACHIEVEMENTS: QuestAchievement[] = [
  {
    id: "first_balance",
    name: "Balance Explorer",
    description: "Checked your first balance",
    icon: "💰",
    rarity: "common",
  },
  {
    id: "first_swap",
    name: "Token Swapper",
    description: "Completed your first swap",
    icon: "🔄",
    rarity: "common",
  },
  {
    id: "first_transfer",
    name: "Token Sender",
    description: "Sent your first transfer",
    icon: "📤",
    rarity: "common",
  },
  {
    id: "lending_master",
    name: "Lending Master",
    description: "Explored lending protocols",
    icon: "🏦",
    rarity: "rare",
  },
  {
    id: "quest_complete",
    name: "Movement Master",
    description: "Completed the full onboarding quest",
    icon: "🏆",
    rarity: "legendary",
  },
];
// Default onboarding quest definition (shared with QuestManager)
export const ONBOARDING_QUEST: Quest = {
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
