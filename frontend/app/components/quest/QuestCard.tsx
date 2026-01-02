"use client";

/**
 * QuestCard Component
 *
 * Innovative, compact quest card with modern design and smooth animations
 */

import React, { useState, useEffect, useRef } from "react";
import { QuestStep, QuestProgress } from "./types";

interface QuestCardProps {
  step: QuestStep;
  progress: QuestProgress;
  onComplete?: () => void;
  onSkip?: () => void;
  onJumpToStep?: (stepIndex: number) => void;
  allSteps?: QuestStep[];
  actionDetected?: boolean;
}

export const QuestCard: React.FC<QuestCardProps> = ({
  step,
  progress,
  onComplete,
  onSkip,
  onJumpToStep,
  allSteps,
  actionDetected = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showStepSelector, setShowStepSelector] = useState(false);
  const stepSelectorRef = useRef<HTMLDivElement>(null);

  // Close step selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        stepSelectorRef.current &&
        !stepSelectorRef.current.contains(event.target as Node)
      ) {
        setShowStepSelector(false);
      }
    };

    if (showStepSelector) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStepSelector]);

  if (isMinimized) {
    return (
      <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-indigo-500/10 dark:from-purple-500/20 dark:via-blue-500/20 dark:to-indigo-500/20 backdrop-blur-sm border-l-4 border-purple-500 dark:border-purple-400 rounded-r-lg p-2 my-1.5 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group">
        <div
          className="flex items-center justify-between gap-2"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {step.icon && (
              <span className="text-base flex-shrink-0 animate-pulse">
                {step.icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                {step.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 h-1 rounded-full transition-all duration-500 shadow-sm"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-600 dark:text-gray-400 whitespace-nowrap font-medium">
                  {progress.currentStep}/{progress.totalSteps}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(false);
            }}
            className="text-[10px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 px-1.5 py-0.5 rounded flex-shrink-0 transition-colors"
            title="Expand"
          >
            ▲
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-purple-50/80 via-blue-50/80 to-indigo-50/80 dark:from-purple-950/40 dark:via-blue-950/40 dark:to-indigo-950/40 backdrop-blur-sm border-l-4 border-purple-500 dark:border-purple-400 rounded-r-xl p-3 my-2 shadow-lg hover:shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      {/* Animated gradient background effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-indigo-500/5 rounded-r-xl opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Header with icon and progress */}
      <div className="relative flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {step.icon && (
            <div className="relative flex-shrink-0">
              <span className="text-2xl relative z-10">{step.icon}</span>
              <span className="absolute inset-0 text-2xl blur-sm opacity-30 animate-pulse">
                {step.icon}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-0.5">
              {step.title}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                Step {progress.currentStep}/{progress.totalSteps}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {progress.percentage}% complete
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onJumpToStep && allSteps && allSteps.length > 1 && (
            <div className="relative" ref={stepSelectorRef}>
              <button
                onClick={() => setShowStepSelector(!showStepSelector)}
                className="text-[10px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 px-1.5 py-1 rounded transition-colors"
                title="Jump to step"
              >
                ⚡
              </button>
              {showStepSelector && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                  <div className="p-2">
                    <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 mb-2 px-2">
                      Jump to Step:
                    </p>
                    {allSteps.map((s, index) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          onJumpToStep(index);
                          setShowStepSelector(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors mb-1 ${
                          index === progress.currentStep - 1
                            ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{s.icon || "•"}</span>
                          <span className="flex-1 truncate">{s.title}</span>
                          {index < progress.currentStep - 1 && (
                            <span className="text-green-500">✓</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setIsMinimized(true)}
            className="text-[10px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 px-1.5 py-1 rounded transition-colors"
            title="Minimize"
          >
            ▼
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 px-1.5 py-1 rounded transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Animated Progress Bar */}
      <div className="mb-2.5">
        <div className="w-full bg-gray-200/60 dark:bg-gray-700/60 rounded-full h-2 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 h-2 rounded-full transition-all duration-700 ease-out shadow-sm relative overflow-hidden"
            style={{ width: `${progress.percentage}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-700 dark:text-gray-300 mb-2.5 leading-relaxed">
        {step.description}
      </p>

      {/* Instruction Card */}
      <div className="relative bg-white/70 dark:bg-gray-800/70 border border-purple-200/50 dark:border-purple-700/50 rounded-lg p-2.5 mb-2.5 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-start gap-2">
          <span className="text-sm flex-shrink-0">💡</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-purple-700 dark:text-purple-300 mb-1 uppercase tracking-wider">
              Try This:
            </p>
            <p className="text-xs text-gray-800 dark:text-gray-200 font-medium leading-snug">
              {step.instruction}
            </p>
          </div>
        </div>
      </div>

      {/* Action Status Message */}
      {actionDetected && (
        <div className="mb-2.5 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-xs text-green-700 dark:text-green-300 font-medium flex items-center gap-1.5">
            <span>✓</span>
            <span>Great! Action completed. Click below to continue to the next step.</span>
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {onComplete && (
        <div className="flex flex-col gap-2">
          {actionDetected ? (
            <button
              onClick={onComplete}
              className="relative w-full text-xs font-bold py-2 px-4 rounded-lg transition-all duration-200 shadow-md transform hover:scale-[1.02] active:scale-[0.98] overflow-hidden group bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white hover:shadow-lg cursor-pointer"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <span>✓</span>
                <span>I've Done This - Continue</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={onComplete}
                className="relative w-full text-xs font-bold py-2 px-4 rounded-lg transition-all duration-200 shadow-md transform hover:scale-[1.02] active:scale-[0.98] overflow-hidden group bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white hover:shadow-lg cursor-pointer border border-blue-400/50"
              >
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  <span>✓</span>
                  <span>I've Already Done This - Mark as Complete</span>
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </button>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
                Or complete the action above to automatically detect completion
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
