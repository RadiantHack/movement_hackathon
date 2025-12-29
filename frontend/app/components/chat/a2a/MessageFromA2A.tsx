/**
 * MessageFromA2A Component
 *
 * Visualizes agent → orchestrator responses as a blue box showing
 * sender/receiver badges and confirmation. Actual structured data
 * is rendered separately in the main content area.
 */

import React from "react";
import { MessageActionRenderProps } from "../../types";
import { getAgentStyle } from "./agent-styles";

export const MessageFromA2A: React.FC<MessageActionRenderProps> = ({
  status,
  args,
}) => {
  switch (status) {
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
    <div className="my-3">
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-4 shadow-sm hover:shadow-md transition-shadow max-w-full">
        {/* Agent badges and response */}
        <div className="space-y-2 sm:space-y-3">
          {/* Agent badges row */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex flex-col items-center">
              <span
                className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold border-2 ${agentStyle.bgColor} ${agentStyle.textColor} ${agentStyle.borderColor} flex items-center gap-1 sm:gap-1.5 shadow-sm`}
              >
                <span className="text-xs sm:text-sm">{agentStyle.icon}</span>
                <span className="capitalize whitespace-nowrap">
                  {args.agentName}
                </span>
              </span>
              {agentStyle.framework && (
                <span className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 font-medium">
                  {agentStyle.framework}
                </span>
              )}
            </div>

            <div className="flex items-center relative px-1 sm:px-2">
              {/* Animated arrow - animation stops when complete */}
              <div className="relative w-8 h-5 sm:w-10 sm:h-6 md:w-12 md:h-6 flex items-center justify-center overflow-visible">
                {/* Base arrow - always visible */}
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-blue-500 dark:text-blue-400"
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
                {/* Animated sliding dots - only show when executing (before complete) */}
                {/* Note: MessageFromA2A only shows when complete, so animation won't show here */}
                {/* But keeping structure for consistency */}
              </div>
            </div>

            <div className="flex flex-col items-center">
              <span className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold bg-gray-700 dark:bg-gray-600 text-white shadow-sm whitespace-nowrap">
                Orchestrator
              </span>
              <span className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 font-medium">
                ADK
              </span>
            </div>
          </div>

          {/* Response confirmation */}
          <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-blue-200 dark:border-blue-800">
            <div className="text-center px-1 sm:px-0">
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700">
                <svg
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-[10px] sm:text-xs font-semibold text-green-700 dark:text-green-300">
                  Response received
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
