/**
 * MessageToA2A Component
 *
 * Visualizes orchestrator → agent communication as a green box showing
 * sender/receiver badges and task description.
 */

import React from "react";
import { MessageActionRenderProps } from "../../types";
import { getAgentStyle } from "./agent-styles";

export const MessageToA2A: React.FC<MessageActionRenderProps> = ({
  status,
  args,
}) => {
  switch (status) {
    case "executing":
    case "complete":
      break;
    default:
      return null;
  }

  // Don't render if agentName or task is missing/empty
  if (
    !args?.agentName ||
    !args?.task ||
    args.agentName.trim() === "" ||
    args.task.trim() === ""
  ) {
    return null;
  }

  const agentStyle = getAgentStyle(args.agentName);

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800 rounded-lg sm:rounded-xl px-2.5 py-2 sm:px-3 sm:py-3 md:px-4 md:py-4 my-2 sm:my-3 shadow-sm hover:shadow-md transition-shadow a2a-message-enter w-full max-w-full overflow-hidden">
      {/* Agent badges and query */}
      <div className="space-y-1.5 sm:space-y-3">
        {/* Agent badges row */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 md:gap-3 flex-wrap">
          <div className="flex flex-col items-center">
            <span className="px-1.5 py-0.5 sm:px-3 sm:py-1.5 rounded-full text-[9px] sm:text-xs font-semibold bg-gray-700 dark:bg-gray-600 text-white shadow-sm whitespace-nowrap">
              Orchestrator
            </span>
            <span className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 font-medium">
              ADK
            </span>
          </div>

          <div className="flex items-center relative px-0.5 sm:px-2">
            {/* Animated arrow - animation stops when complete */}
            <div className="relative w-6 h-4 sm:w-10 sm:h-6 md:w-12 md:h-6 flex items-center justify-center overflow-visible">
              {/* Base arrow - always visible */}
              <svg
                className="w-3 h-3 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-500 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              {/* Animated sliding dots - only show when executing */}
              {status === "executing" && (
                <div className="absolute inset-0 flex items-center overflow-visible">
                  <div className="flex gap-0.5 sm:gap-1.5 a2a-flow-dots">
                    <div className="w-0.5 h-0.5 sm:w-1.5 sm:h-1.5 bg-green-500 dark:bg-green-400 rounded-full"></div>
                    <div className="w-0.5 h-0.5 sm:w-1.5 sm:h-1.5 bg-green-500 dark:bg-green-400 rounded-full"></div>
                    <div className="w-0.5 h-0.5 sm:w-1.5 sm:h-1.5 bg-green-500 dark:bg-green-400 rounded-full"></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center">
            <span
              className={`px-1.5 py-0.5 sm:px-3 sm:py-1.5 rounded-full text-[9px] sm:text-xs font-semibold border-2 ${agentStyle.bgColor} ${agentStyle.textColor} ${agentStyle.borderColor} flex items-center gap-0.5 sm:gap-1.5 shadow-sm`}
            >
              <span className="text-[10px] sm:text-sm">{agentStyle.icon}</span>
              <span className="capitalize whitespace-nowrap">
                {args.agentName}
              </span>
            </span>
            {agentStyle.framework && (
              <span className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 font-medium">
                {agentStyle.framework}
              </span>
            )}
          </div>
        </div>

        {/* Query section */}
        <div className="mt-2 sm:mt-4 pt-1.5 sm:pt-3 border-t border-green-200 dark:border-green-800">
          <div className="text-center px-0.5 sm:px-0">
            <p className="text-[9px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1.5 uppercase tracking-wide">
              Query
            </p>
            <p
              className="text-[10px] sm:text-sm text-gray-800 dark:text-gray-200 break-words leading-relaxed overflow-wrap-anywhere"
              title={args.task}
            >
              {args.task}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
