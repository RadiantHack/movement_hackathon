/**
 * Custom hook for managing chat UI state
 * Handles scroll detection, suggestion visibility, and input focus
 */

import { useState, useEffect } from "react";
import { useCopilotChat } from "@copilotkit/react-core";

export interface UseChatUIStateReturn {
  hasScrolled: boolean;
  suggestionSubmitted: boolean;
  inputFocused: boolean;
  setSuggestionSubmitted: (value: boolean) => void;
  setInputFocused: (value: boolean) => void;
}

/**
 * Hook to manage chat UI state (scroll, suggestions, input focus)
 */
export function useChatUIState(): UseChatUIStateReturn {
  const { visibleMessages } = useCopilotChat();
  const [hasScrolled, setHasScrolled] = useState(false);
  const [suggestionSubmitted, setSuggestionSubmitted] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // Detect when chat input is focused to hide suggestions
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(".copilotKitInput") ||
        target.closest(".copilotKitInputContainer") ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT"
      ) {
        setInputFocused(true);
      }
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(".copilotKitInput") ||
        target.closest(".copilotKitInputContainer") ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT"
      ) {
        setTimeout(() => {
          const activeElement = document.activeElement;
          if (
            !activeElement?.closest(".copilotKitInput") &&
            !activeElement?.closest(".copilotKitInputContainer") &&
            activeElement?.tagName !== "TEXTAREA" &&
            activeElement?.tagName !== "INPUT"
          ) {
            setInputFocused(false);
          }
        }, 100);
      }
    };

    document.addEventListener("focusin", handleFocus);
    document.addEventListener("focusout", handleBlur);

    return () => {
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("focusout", handleBlur);
    };
  }, []);

  // Detect message submission to hide suggestions immediately
  useEffect(() => {
    const handleMessageSubmit = () => {
      setSuggestionSubmitted(true);
    };

    const handlers: Array<{
      element: Element | Document;
      event: string;
      handler: EventListener;
      options?: any;
    }> = [];

    const setupListeners = () => {
      const textarea =
        (document.querySelector(
          ".copilotKitInput textarea"
        ) as HTMLTextAreaElement) ||
        (document.querySelector(
          ".copilotKitInputContainer textarea"
        ) as HTMLTextAreaElement) ||
        (document.querySelector(
          ".copilotKitChat textarea"
        ) as HTMLTextAreaElement);

      if (textarea && !textarea.hasAttribute("data-suggestion-listener")) {
        const keyDownHandler = (e: Event) => {
          const keyEvent = e as KeyboardEvent;
          if (
            keyEvent.key === "Enter" &&
            !keyEvent.shiftKey &&
            !keyEvent.isComposing
          ) {
            handleMessageSubmit();
          }
        };
        textarea.addEventListener("keydown", keyDownHandler, { capture: true });
        textarea.setAttribute("data-suggestion-listener", "true");
        handlers.push({
          element: textarea,
          event: "keydown",
          handler: keyDownHandler,
          options: { capture: true },
        });
      }

      const submitButtons = document.querySelectorAll(
        '.copilotKitInput button[type="submit"], ' +
          '.copilotKitInputContainer button[type="submit"], ' +
          '.copilotKitChat button[type="submit"], ' +
          '.copilotKitInput button[aria-label*="Send"], ' +
          '.copilotKitInput button[aria-label*="send"]'
      );

      submitButtons.forEach((button) => {
        if (!button.hasAttribute("data-suggestion-listener")) {
          button.addEventListener("click", handleMessageSubmit, {
            capture: true,
          });
          button.setAttribute("data-suggestion-listener", "true");
          handlers.push({
            element: button,
            event: "click",
            handler: handleMessageSubmit,
            options: { capture: true },
          });
        }
      });
    };

    let timeoutId: NodeJS.Timeout | null = setTimeout(setupListeners, 100);

    const observer = new MutationObserver(() => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(setupListeners, 50);
    });

    const chatContainer =
      document.querySelector(".copilotKitChat") ||
      document.querySelector(".copilotKitInput") ||
      document.querySelector(".copilotKitInputContainer") ||
      document.body;

    if (chatContainer) {
      observer.observe(chatContainer, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      handlers.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
      });
      handlers.length = 0;
      observer.disconnect();
    };
  }, []);

  // Detect scroll to hide suggestions
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.scrollTop > 50) {
        setHasScrolled(true);
      }
    };

    const handleWindowScroll = () => setHasScrolled(true);

    const findMessagesContainer = () => {
      return (
        document.querySelector(
          '.copilotKitChat [class*="MessagesContainer"]'
        ) ||
        document.querySelector(
          '.copilotKitChat [class*="messages-container"]'
        ) ||
        document.querySelector(".copilotKitChat > div > div:first-child") ||
        document.querySelector(".copilotKitChat")
      );
    };

    const messagesContainer = findMessagesContainer();

    if (messagesContainer) {
      messagesContainer.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    }

    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => {
      if (messagesContainer) {
        messagesContainer.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, []);

  // Reset scroll state when messages are cleared
  useEffect(() => {
    if (!visibleMessages || visibleMessages.length === 0) {
      setHasScrolled(false);
      setSuggestionSubmitted(false);
    }
  }, [visibleMessages]);

  // Hide suggestions when a new user message is sent
  useEffect(() => {
    if (visibleMessages && visibleMessages.length > 2) {
      setSuggestionSubmitted(true);
    }
  }, [visibleMessages]);

  return {
    hasScrolled,
    suggestionSubmitted,
    inputFocused,
    setSuggestionSubmitted,
    setInputFocused,
  };
}
