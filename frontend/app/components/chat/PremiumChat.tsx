"use client";

/**
 * Premium Chat Component - ChatGPT-like Interface
 *
 * A clean, modern chat interface that directly calls Python agents via A2A protocol
 * without using CopilotKit or orchestrator.
 */

import { useEffect, useState, useRef } from "react";
import { Crown, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  A2APremiumA2AClient,
  PaymentRequiredError,
  type MessageSendParams,
} from "./helper/index";
import { PaymentModal } from "../payment-modal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PremiumChatProps {
  walletAddress: string | null;
  selectedAgent: string;
  onAgentChange?: (agent: string) => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function PremiumChat({
  walletAddress,
  selectedAgent,
  onAgentChange,
}: PremiumChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingRequest, setPendingRequest] =
    useState<MessageSendParams | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const clientRef = useRef<A2APremiumA2AClient | null>(null);

  // Initialize A2A client for the selected agent
  useEffect(() => {
    const baseUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.BACKEND_URL ||
      "http://localhost:8000";

    const agentUrlMap: Record<string, string> = {
      lending: `${baseUrl}/lending`,
      balance: `${baseUrl}/balance`,
      bridge: `${baseUrl}/bridge`,
      swap: `${baseUrl}/swap`,
      transfer: `${baseUrl}/transfer`,
    };

    const agentUrl = agentUrlMap[selectedAgent] || agentUrlMap.lending;

    try {
      clientRef.current = new A2APremiumA2AClient(agentUrl);

      // Try to fetch agent card immediately to catch payment errors early
      // This is done asynchronously so it doesn't block initialization
      clientRef.current.getAgentCard().catch((error) => {
        // If it's a payment error, we'll handle it when user tries to send a message
        // For now, just log it
        if (error instanceof PaymentRequiredError) {
          console.log("Payment required for agent card access");
        } else {
          console.error("Error fetching agent card:", error);
        }
      });
    } catch (error) {
      console.error("Error initializing client:", error);
    }

    // Clear messages when agent changes
    setMessages([]);
  }, [selectedAgent]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !clientRef.current) return;

    const userMessage = input.trim();
    const messageId = Date.now().toString();

    // Add user message
    const userMsg: Message = {
      id: messageId,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Build query with wallet address context if available
    let query = userMessage;
    if (walletAddress && selectedAgent === "balance") {
      // For balance queries, include wallet address in context
      query = `${userMessage}. My wallet address is ${walletAddress} on Movement Network.`;
    } else if (walletAddress) {
      // For other agents, include wallet address as context
      query = `${userMessage} (Wallet: ${walletAddress} on Movement Network)`;
    }

    // Prepare message params
    const messageParams: MessageSendParams = {
      message: {
        kind: "message",
        messageId: messageId,
        role: "user",
        parts: [{ text: query, kind: "text" }],
      },
    };

    try {
      // Send message to agent via A2A protocol with headers support
      const response =
        await clientRef.current.sendMessageWithHeaders(messageParams);

      if ("error" in response) {
        throw new Error(response.error.message || "Failed to get response");
      }

      // Extract response content
      const result = response.result;
      let responseContent = "";

      if (
        result.kind === "message" &&
        result.parts.length > 0 &&
        result.parts[0].kind === "text"
      ) {
        responseContent = result.parts[0].text;
      } else {
        responseContent = JSON.stringify(result, null, 2);
      }

      // Try to parse JSON response and extract readable content
      try {
        const parsed = JSON.parse(responseContent);
        if (parsed.response) {
          responseContent = parsed.response;
        } else if (parsed.message) {
          responseContent = parsed.message;
        }
      } catch {
        // Not JSON, use as-is
      }

      // Add assistant message
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Error sending message:", error);

      // Check if this is a PaymentRequiredError (402)
      if (error instanceof PaymentRequiredError) {
        // Store the pending request to retry after payment
        setPendingRequest(messageParams);
        setShowPaymentModal(true);
        setIsLoading(false);
        return;
      }

      // Handle other errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to get response from agent";
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Error: ${errorMessage}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handlePaymentComplete = async (paymentToken: string) => {
    if (!clientRef.current || !pendingRequest) {
      setShowPaymentModal(false);
      return;
    }

    setShowPaymentModal(false);
    setIsLoading(true);

    try {
      // Set the payment header and retry the request
      clientRef.current.setHeaders({ "x-payment": paymentToken });

      // Retry the pending request with payment header
      const response =
        await clientRef.current.sendMessageWithHeaders(pendingRequest);

      if ("error" in response) {
        throw new Error(response.error.message || "Failed to get response");
      }

      // Extract response content
      const result = response.result;
      let responseContent = "";

      if (
        result.kind === "message" &&
        result.parts.length > 0 &&
        result.parts[0].kind === "text"
      ) {
        responseContent = result.parts[0].text;
      } else {
        responseContent = JSON.stringify(result, null, 2);
      }

      // Try to parse JSON response and extract readable content
      try {
        const parsed = JSON.parse(responseContent);
        if (parsed.response) {
          responseContent = parsed.response;
        } else if (parsed.message) {
          responseContent = parsed.message;
        }
      } catch {
        // Not JSON, use as-is
      }

      // Add assistant message
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setPendingRequest(null);
    } catch (error) {
      console.error("Error retrying after payment:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to get response after payment";
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Error: ${errorMessage}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setPendingRequest(null);
    }
  };

  const agentLabels: Record<string, string> = {
    lending: "Lending Agent",
    balance: "Balance Agent",
    bridge: "Bridge Agent",
    swap: "Swap Agent",
    transfer: "Transfer Agent",
  };

  const agentOptions = [
    { value: "lending", label: "Lending Agent" },
    { value: "balance", label: "Balance Agent" },
    { value: "bridge", label: "Bridge Agent" },
    { value: "swap", label: "Swap Agent" },
    { value: "transfer", label: "Transfer Agent" },
  ];

  const agentLabel = agentLabels[selectedAgent] || "Premium Agent";

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      {/* Premium Content Notice */}
      <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-2.5 dark:border-amber-800 dark:from-amber-900/20 dark:to-yellow-900/20">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-semibold">💎 Premium Content:</span> You can
            buy premium content with <span className="font-semibold">x402</span>{" "}
            and the agent will find and provide it to you.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 px-3 py-1.5 dark:from-amber-900/20 dark:to-yellow-900/20">
            <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Premium
            </span>
          </div>
          <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" />
          <select
            value={selectedAgent}
            onChange={(e) => {
              if (onAgentChange) {
                onAgentChange(e.target.value);
                // Clear messages when switching agents
                setMessages([]);
              }
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:focus:border-purple-400"
          >
            {agentOptions.map((agent) => (
              <option key={agent.value} value={agent.value}>
                {agent.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <div className="rounded-full bg-gradient-to-r from-purple-100 to-blue-100 p-4 dark:from-purple-900/30 dark:to-blue-900/30">
                    <Crown className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Premium Chat
                </h3>
                <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
                  Chat directly with {agentLabel.toLowerCase()}. Ask questions
                  and get instant responses.
                </p>
                <div className="space-y-2 text-left">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Example questions:
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {selectedAgent === "lending" && (
                        <>
                          <li>• Compare lending rates for USDC</li>
                          <li>• Where should I borrow MOVE?</li>
                          <li>• Show me the best supply APY</li>
                        </>
                      )}
                      {selectedAgent === "balance" && (
                        <>
                          <li>• Check my balance</li>
                          <li>• Show my USDC balance</li>
                          <li>• Get popular tokens</li>
                        </>
                      )}
                      {selectedAgent === "bridge" && (
                        <>
                          <li>• Bridge 100 USDC from Ethereum</li>
                          <li>• Estimate bridge fees</li>
                          <li>• Check bridge status</li>
                        </>
                      )}
                      {selectedAgent === "swap" && (
                        <>
                          <li>• Swap MOVE for USDC</li>
                          <li>• Get swap quote</li>
                          <li>• Best rate for swapping tokens</li>
                        </>
                      )}
                      {selectedAgent === "transfer" && (
                        <>
                          <li>• Transfer 10 MOVE to address</li>
                          <li>• Send USDC to wallet</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.role === "user";
              const isPaymentError =
                message.content.includes("💳 Payment Required") ||
                message.content.includes("x-payment header is required");
              const isError =
                message.content.startsWith("Error:") || isPaymentError;

              return (
                <div
                  key={message.id}
                  className={`flex gap-4 ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {!isUser && (
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isPaymentError
                          ? "bg-gradient-to-r from-amber-500 to-yellow-500"
                          : "bg-gradient-to-r from-purple-500 to-blue-500"
                      }`}
                    >
                      <Crown className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`flex max-w-[80%] flex-col gap-2 ${
                      isUser ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-2.5 ${
                        isUser
                          ? "bg-purple-600 text-white"
                          : isPaymentError
                            ? "bg-amber-50 border-2 border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-600 dark:text-amber-200"
                            : isError
                              ? "bg-red-50 border border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
                              : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
                          {message.content}
                        </p>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              // Headers
                              h1: ({ children, ...props }) => (
                                <h1
                                  className="text-lg font-bold mb-2 mt-3 first:mt-0 text-zinc-900 dark:text-zinc-100"
                                  {...props}
                                >
                                  {children}
                                </h1>
                              ),
                              h2: ({ children, ...props }) => (
                                <h2
                                  className="text-base font-semibold mb-2 mt-3 first:mt-0 text-zinc-900 dark:text-zinc-100"
                                  {...props}
                                >
                                  {children}
                                </h2>
                              ),
                              h3: ({ children, ...props }) => (
                                <h3
                                  className="text-sm font-semibold mb-1.5 mt-2 first:mt-0 text-zinc-900 dark:text-zinc-100"
                                  {...props}
                                >
                                  {children}
                                </h3>
                              ),
                              // Paragraphs
                              p: ({ children, ...props }) => (
                                <p
                                  className="mb-2 last:mb-0 text-zinc-900 dark:text-zinc-100"
                                  {...props}
                                >
                                  {children}
                                </p>
                              ),
                              // Text formatting
                              strong: ({ children, ...props }) => (
                                <strong
                                  className="font-semibold text-zinc-900 dark:text-zinc-100"
                                  {...props}
                                >
                                  {children}
                                </strong>
                              ),
                              em: ({ children, ...props }) => (
                                <em
                                  className="italic text-zinc-800 dark:text-zinc-200"
                                  {...props}
                                >
                                  {children}
                                </em>
                              ),
                              // Lists
                              ul: ({ children, ...props }) => (
                                <ul
                                  className="list-disc list-inside mb-2 space-y-1 text-zinc-900 dark:text-zinc-100 ml-2"
                                  {...props}
                                >
                                  {children}
                                </ul>
                              ),
                              ol: ({ children, ...props }) => (
                                <ol
                                  className="list-decimal list-inside mb-2 space-y-1 text-zinc-900 dark:text-zinc-100 ml-2"
                                  {...props}
                                >
                                  {children}
                                </ol>
                              ),
                              li: ({ children, ...props }) => (
                                <li
                                  className="text-zinc-900 dark:text-zinc-100"
                                  {...props}
                                >
                                  {children}
                                </li>
                              ),
                              // Code blocks
                              code: ({
                                className,
                                children,
                                ...props
                              }: any) => {
                                const isInline = !className;
                                return isInline ? (
                                  <code
                                    className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-mono"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                ) : (
                                  <code
                                    className="block p-2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-mono overflow-x-auto mb-2"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                              pre: ({ children, ...props }) => (
                                <pre
                                  className="mb-2 overflow-x-auto"
                                  {...props}
                                >
                                  {children}
                                </pre>
                              ),
                              // Blockquotes
                              blockquote: ({ children, ...props }) => (
                                <blockquote
                                  className="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 italic my-2 text-zinc-700 dark:text-zinc-300"
                                  {...props}
                                >
                                  {children}
                                </blockquote>
                              ),
                              // Horizontal rule
                              hr: ({ ...props }) => (
                                <hr
                                  className="my-3 border-zinc-300 dark:border-zinc-700"
                                  {...props}
                                />
                              ),
                              // Tables (from remark-gfm)
                              table: ({ children, ...props }) => (
                                <div className="overflow-x-auto my-3">
                                  <table
                                    className="min-w-full border-collapse border border-zinc-300 dark:border-zinc-700"
                                    {...props}
                                  >
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children, ...props }) => (
                                <thead
                                  className="bg-zinc-200 dark:bg-zinc-800"
                                  {...props}
                                >
                                  {children}
                                </thead>
                              ),
                              tbody: ({ children, ...props }) => (
                                <tbody {...props}>{children}</tbody>
                              ),
                              tr: ({ children, ...props }) => (
                                <tr
                                  className="border-b border-zinc-300 dark:border-zinc-700"
                                  {...props}
                                >
                                  {children}
                                </tr>
                              ),
                              th: ({ children, ...props }) => (
                                <th
                                  className="px-3 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700"
                                  {...props}
                                >
                                  {children}
                                </th>
                              ),
                              td: ({ children, ...props }) => (
                                <td
                                  className="px-3 py-2 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700"
                                  {...props}
                                >
                                  {children}
                                </td>
                              ),
                              // Task lists (from remark-gfm)
                              input: ({ checked, ...props }: any) => (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled
                                  className="mr-2 accent-purple-600"
                                  {...props}
                                />
                              ),
                              // Links
                              a: ({ children, href, ...props }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-600 dark:text-purple-400 hover:underline"
                                  {...props}
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        You
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {isLoading && (
            <div className="flex gap-4 justify-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500">
                <Crown className="h-4 w-4 text-white" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-600 dark:text-zinc-400" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Thinking...
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-zinc-50 p-2 shadow-sm transition-colors focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agentLabel}...`}
              rows={1}
              className="max-h-32 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-400"
              style={{
                height: "auto",
                minHeight: "40px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="h-10 w-10 shrink-0 rounded-xl bg-purple-600 p-0 text-white transition-colors hover:bg-purple-700 disabled:bg-zinc-400 disabled:cursor-not-allowed dark:bg-purple-500 dark:hover:bg-purple-600"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Premium chat connects directly to {agentLabel.toLowerCase()}. Press
            Enter to send, Shift+Enter for new line.
          </p>
        </form>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPendingRequest(null);
        }}
        onPaymentComplete={handlePaymentComplete}
        amount="0.01"
        currency="USDC"
      />
    </div>
  );
}
