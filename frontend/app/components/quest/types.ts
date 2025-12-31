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
  actionType?:
    | "balance"
    | "swap"
    | "transfer"
    | "lending"
    | "bridge"
    | "sentiment";
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
    id: "bridge_explorer",
    name: "Bridge Explorer",
    description: "Used cross-chain bridge",
    icon: "🌉",
    rarity: "rare",
  },
  {
    id: "sentiment_analyst",
    name: "Market Analyst",
    description: "Analyzed market sentiment",
    icon: "📊",
    rarity: "epic",
  },
  {
    id: "quest_complete",
    name: "Movement Master",
    description: "Completed the full onboarding quest",
    icon: "🏆",
    rarity: "legendary",
  },
];
