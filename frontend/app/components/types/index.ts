/**
 * Shared Type Definitions
 *
 * This file contains all TypeScript interfaces and types used across
 * the DeFi agent components. Centralizing types makes them
 * easier to maintain and reuse.
 */

import { ActionRenderProps } from "@copilotkit/react-core";


/**
 * Type for the send_message_to_a2a_agent action parameters
 * Used when the orchestrator sends tasks to A2A agents
 */
export type MessageActionRenderProps = ActionRenderProps<
  [
    {
      readonly name: "agentName";
      readonly type: "string";
      readonly description: "The name of the A2A agent to send the message to";
    },
    {
      readonly name: "task";
      readonly type: "string";
      readonly description: "The message to send to the A2A agent";
    },
  ]
>;

/**
 * Agent styling configuration
 * Used to style agent badges with consistent colors and icons
 */
export interface AgentStyle {
    bgColor: string;
    textColor: string;
    borderColor: string;
    icon: string;
    framework: string;
  }

/**
 * Transfer action parameters
 * Used when user wants to transfer tokens
 */
export type TransferActionRenderProps = ActionRenderProps<
  [
    {
      readonly name: "amount";
      readonly type: "string";
      readonly description: "The amount of tokens to transfer";
    },
    {
      readonly name: "token";
      readonly type: "string";
      readonly description: "The token symbol to transfer (e.g., MOVE, USDC, USDT)";
    },
    {
      readonly name: "toAddress";
      readonly type: "string";
      readonly description: "The recipient wallet address (66 characters for Movement Network)";
    },
  ]
>;

/**
 * Transfer data structure
 */
export interface TransferData {
  amount: string;
  token: string;
  tokenSymbol: string;
  toAddress: string;
  fromAddress: string;
  network: string;
  error?: string;
}