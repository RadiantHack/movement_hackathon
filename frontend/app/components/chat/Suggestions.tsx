"use client";

/**
 * Suggestions Component
 *
 * Displays clickable suggestion prompts to help users get started
 */

import React, { useState } from "react";

interface Suggestion {
  id: string;
  text: string;
  icon: string;
  category: "balance" | "swap" | "lending" | "transfer" | "explore" | "learn";
}

const SUGGESTIONS: Suggestion[] = [
  {
    id: "check_balance",
    text: "Check my balance",
    icon: "💰",
    category: "balance",
  },
  {
    id: "show_tokens",
    text: "Show all my tokens",
    icon: "🪙",
    category: "balance",
  },
  {
    id: "swap_move_usdc",
    text: "Swap MOVE for USDC",
    icon: "🔄",
    category: "swap",
  },
  {
    id: "compare_lending",
    text: "Compare lending rates",
    icon: "🏦",
    category: "lending",
  },
  {
    id: "popular_tokens",
    text: "Get popular tokens",
    icon: "📈",
    category: "explore",
  },
  {
    id: "bridge_tokens",
    text: "Bridge tokens to Movement",
    icon: "🌉",
    category: "transfer",
  },
  {
    id: "learn_defi",
    text: "I'm new to crypto",
    icon: "🎓",
    category: "learn",
  },
];

interface SuggestionsProps {
  walletAddress: string | null;
  onSuggestionClick?: (suggestion: string) => void;
  appendMessage?: (message: { role: string; content: string }) => void;
}

export const Suggestions: React.FC<SuggestionsProps> = ({
  walletAddress,
  onSuggestionClick,
  appendMessage,
}) => {
  const [clickedSuggestions, setClickedSuggestions] = useState<Set<string>>(
    new Set()
  );

  const handleSuggestionClick = (suggestion: Suggestion) => {
    // Mark as clicked
    setClickedSuggestions((prev) => new Set(prev).add(suggestion.id));

    // Call callback immediately to hide suggestions
    onSuggestionClick?.(suggestion.text);

    // Function to find and submit message via input field
    const submitViaInput = () => {
      // Try multiple selectors to find the textarea
      const selectors = [
        ".copilotKitInput textarea",
        ".copilotKitInputContainer textarea",
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="Type"]',
        ".copilotKitChat textarea",
      ];

      let textarea: HTMLTextAreaElement | null = null;
      for (const selector of selectors) {
        textarea = document.querySelector(selector) as HTMLTextAreaElement;
        if (textarea) break;
      }

      if (textarea) {
        // Set the value using React's value setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(textarea, suggestion.text);
        } else {
          textarea.value = suggestion.text;
        }

        // Create and dispatch input event (React listens to this)
        const inputEvent = new Event("input", {
          bubbles: true,
          cancelable: true,
        });
        textarea.dispatchEvent(inputEvent);

        // Create and dispatch change event
        const changeEvent = new Event("change", {
          bubbles: true,
          cancelable: true,
        });
        textarea.dispatchEvent(changeEvent);

        // Focus the textarea
        textarea.focus();

        // Submit the form after a short delay to ensure state is updated
        setTimeout(() => {
          // Try to find and click submit button
          const submitSelectors = [
            '.copilotKitInputContainer button[type="submit"]',
            '.copilotKitInput button[type="submit"]',
            'button[aria-label*="Send"]',
            'button[aria-label*="send"]',
            '.copilotKitInputContainer button:not([type="button"])',
            '.copilotKitInput button:not([type="button"])',
          ];

          let submitButton: HTMLButtonElement | null = null;
          for (const selector of submitSelectors) {
            const btn = document.querySelector(selector) as HTMLButtonElement;
            if (btn && !btn.disabled) {
              submitButton = btn;
              break;
            }
          }

          if (submitButton) {
            submitButton.click();
          } else {
            // Fallback: simulate Enter key press
            const enterEvent = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });
            textarea.dispatchEvent(enterEvent);

            // Also try keypress
            const keypressEvent = new KeyboardEvent("keypress", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });
            textarea.dispatchEvent(keypressEvent);
          }
        }, 150);

        return true;
      }
      return false;
    };

    // Try to submit via input field first
    const inputFound = submitViaInput();

    // If input field not found, try appendMessage as fallback
    if (!inputFound && appendMessage) {
      setTimeout(() => {
        try {
          if (typeof appendMessage === "function") {
            appendMessage({
              role: "user",
              content: suggestion.text,
            });
          }
        } catch (error) {
          console.error("Error appending message:", error);
          // Retry input field after error
          setTimeout(() => {
            submitViaInput();
          }, 300);
        }
      }, 100);
    }
  };

  // Filter suggestions based on wallet connection
  const availableSuggestions = walletAddress
    ? SUGGESTIONS
    : SUGGESTIONS.filter(
        (s) =>
          s.category === "learn" ||
          s.category === "explore" ||
          s.id === "check_balance"
      );

  return (
    <div className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-1 sm:mb-1.5 md:mb-2 text-center">
          <p className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide inline-block">
            💡 Quick Actions
          </p>
        </div>

        {/* Suggestions Grid - Horizontal scroll on mobile, wrap on larger screens */}
        <div className="flex gap-1 sm:gap-1.5 md:gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide sm:flex-wrap sm:overflow-x-visible w-full -mx-2 sm:-mx-3 md:mx-0 justify-center sm:justify-center">
          {availableSuggestions.map((suggestion) => {
            const isClicked = clickedSuggestions.has(suggestion.id);
            return (
              <button
                key={suggestion.id}
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isClicked}
                className={`
                  group relative
                  px-2 py-1 sm:px-2.5 sm:py-1.5 md:px-3 md:py-2
                  rounded-md sm:rounded-lg
                  text-[10px] sm:text-xs md:text-sm font-medium
                  transition-all duration-200
                  border
                  flex-shrink-0
                  touch-manipulation
                  min-h-[28px] sm:min-h-[32px] md:min-h-[36px]
                  ${
                    isClicked
                      ? "bg-zinc-100/60 dark:bg-zinc-800/60 border-zinc-300/50 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-500 cursor-not-allowed"
                      : "bg-zinc-50/80 dark:bg-zinc-800/80 border-zinc-200/50 dark:border-zinc-700/50 text-gray-700 dark:text-gray-300 hover:border-purple-300/70 dark:hover:border-purple-600/70 hover:bg-purple-50/70 dark:hover:bg-purple-950/30 hover:shadow-sm active:scale-[0.95] sm:active:scale-[0.98] cursor-pointer"
                  }
                  flex items-center gap-1 sm:gap-1.5 md:gap-2
                `}
              >
                <span className="text-xs sm:text-sm md:text-base flex-shrink-0">
                  {suggestion.icon}
                </span>
                <span className="whitespace-nowrap">{suggestion.text}</span>
                {isClicked && (
                  <span className="ml-0.5 sm:ml-1 md:ml-1.5 text-[10px] sm:text-xs flex-shrink-0">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Wallet Notice */}
        {!walletAddress && (
          <div className="mt-1 sm:mt-1.5 md:mt-2 p-1.5 sm:p-2 md:p-2 bg-yellow-50/70 dark:bg-yellow-950/50 border border-yellow-200/50 dark:border-yellow-800/50 rounded-lg">
            <p className="text-[9px] sm:text-[10px] md:text-xs text-yellow-800 dark:text-yellow-200 leading-relaxed">
              💡 Connect your Movement Network wallet to unlock all features
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
