import { A2AClient } from "@a2a-js/sdk/client";
import type { SendMessageResponse } from "@a2a-js/sdk";

// Define MessageSendParams based on the A2AClient interface
export interface MessageSendParams {
  message: {
    kind: "message";
    messageId: string;
    role: "user" | "agent";
    parts: Array<{ text: string; kind: "text" }>;
  };
  configuration?: {
    blocking?: boolean;
    pushNotification?: any;
  };
}

export interface SendMessageWithHeadersParams extends MessageSendParams {
  headers?: Record<string, string>;
}

export class A2APremiumA2AClient extends A2AClient {
  private customHeaders: Record<string, string> = {};
  private readonly agentUrl: string;

  constructor(agentUrl: string) {
    super(agentUrl);
    this.agentUrl = agentUrl;
  }

  /**
   * Override getAgentCard to handle 402 Payment Required errors and include custom headers.
   * @param agentBaseUrl Optional. The base URL of the agent to fetch the card from.
   * @param agentCardPath Optional. Path to the agent card.
   * @returns A Promise that resolves to the AgentCard.
   */
  public async getAgentCard(
    agentBaseUrl?: string,
    agentCardPath?: string
  ): Promise<any> {
    const url = agentBaseUrl || this.agentUrl;
    const path = agentCardPath || ".well-known/agent.json";
    const agentCardUrl = `${url.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

    try {
      // Try to fetch agent card with custom headers
      const response = await fetch(agentCardUrl, {
        headers: {
          Accept: "application/json",
          ...this.customHeaders,
        },
      });

      if (!response.ok) {
        // Handle 402 Payment Required
        if (response.status === 402) {
          let errorBody: any = null;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = {
              error: "Payment Required",
              message: "x-payment header is required",
            };
          }
          throw new PaymentRequiredError(
            errorBody.message ||
              errorBody.error ||
              "Payment Required: x-payment header is required to access this agent",
            errorBody
          );
        }

        // Handle other HTTP errors
        let errorBodyText = "";
        try {
          errorBodyText = await response.text();
        } catch {
          errorBodyText = response.statusText;
        }
        throw new Error(
          `Failed to fetch Agent Card from ${agentCardUrl}: ${response.status} ${response.statusText}. Response: ${errorBodyText}`
        );
      }

      return await response.json();
    } catch (error) {
      // Re-throw PaymentRequiredError as-is
      if (error instanceof PaymentRequiredError) {
        throw error;
      }

      // For other errors, try parent implementation as fallback
      try {
        return await super.getAgentCard(agentBaseUrl, agentCardPath);
      } catch (parentError: any) {
        // Check if parent error is also a 402
        const parentErrorMessage = parentError?.message || "";
        if (
          parentError?.status === 402 ||
          parentError?.statusCode === 402 ||
          parentErrorMessage.includes("402") ||
          parentErrorMessage.includes("Payment Required") ||
          parentErrorMessage.includes("x-payment")
        ) {
          throw new PaymentRequiredError(
            parentErrorMessage ||
              "Payment Required: x-payment header is required to access this agent",
            parentError
          );
        }
        // Re-throw the original error
        throw error;
      }
    }
  }

  /**
   * Sends a message to the agent with custom headers.
   * @param params The parameters for sending the message, including optional custom headers.
   * @returns A Promise resolving to SendMessageResponse.
   */
  public async sendMessageWithHeaders(
    params: SendMessageWithHeadersParams
  ): Promise<SendMessageResponse> {
    const { headers, ...messageParams } = params;

    // Store headers for this request
    if (headers) {
      this.customHeaders = { ...this.customHeaders, ...headers };
    }

    try {
      // Get the agent card to find the service endpoint
      // This may throw PaymentRequiredError if 402 is encountered
      let agentCard: any;
      try {
        agentCard = await this.getAgentCard();
      } catch (error) {
        // If getAgentCard throws PaymentRequiredError, re-throw it
        if (error instanceof PaymentRequiredError) {
          throw error;
        }
        // For other errors, try fetching with custom headers
        const agentCardUrl = `${this.agentUrl.replace(/\/$/, "")}/.well-known/agent.json`;
        const cardResponse = await fetch(agentCardUrl, {
          headers: {
            Accept: "application/json",
            ...this.customHeaders,
          },
        });

        if (!cardResponse.ok) {
          if (cardResponse.status === 402) {
            let errorBody: any = null;
            try {
              errorBody = await cardResponse.json();
            } catch {
              errorBody = {
                error: "Payment Required",
                message: "x-payment header is required",
              };
            }
            throw new PaymentRequiredError(
              errorBody.message || errorBody.error || "Payment Required",
              errorBody
            );
          }
          throw new Error(
            `Failed to fetch Agent Card: ${cardResponse.status} ${cardResponse.statusText}`
          );
        }

        agentCard = await cardResponse.json();
      }

      if (!agentCard?.url) {
        throw new Error(
          "Agent Card does not contain a valid 'url' for the service endpoint."
        );
      }

      // Get the service endpoint URL and normalize it
      // Add trailing slash to avoid 307 redirect (POST -> GET conversion)
      // Similar to orchestrator pattern in copilotkit/route.ts
      let serviceEndpointUrl = agentCard.url.trim();
      if (!serviceEndpointUrl.endsWith("/")) {
        serviceEndpointUrl = serviceEndpointUrl + "/";
      }

      // Create JSON-RPC request
      const requestId = Date.now();
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        method: "message/send",
        params: messageParams,
        id: requestId,
      };

      // Make the request with custom headers
      // Use redirect: "manual" to handle redirects ourselves and preserve POST method
      const response = await fetch(serviceEndpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...this.customHeaders,
        },
        body: JSON.stringify(rpcRequest),
        redirect: "follow", // Follow redirects but preserve POST method
      });

      if (!response.ok) {
        // Handle 402 Payment Required
        if (response.status === 402) {
          let errorBody: any = null;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = {
              error: "Payment Required",
              message: "x-payment header is required",
            };
          }
          throw new PaymentRequiredError(
            errorBody.message || errorBody.error || "Payment Required",
            errorBody
          );
        }

        // Handle 405 Method Not Allowed - might be a redirect or URL issue
        if (response.status === 405) {
          let errorBody: any = null;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = {
              error: "Method Not Allowed",
              message: `The endpoint ${serviceEndpointUrl} does not support POST method. This may be due to a redirect issue.`,
            };
          }
          throw new Error(
            errorBody.message ||
              errorBody.error ||
              `Method Not Allowed: ${serviceEndpointUrl}`
          );
        }

        // Handle other HTTP errors
        let errorBodyText = "";
        try {
          errorBodyText = await response.text();
        } catch {
          errorBodyText = response.statusText;
        }
        throw new Error(
          `HTTP error: ${response.status} ${response.statusText}. Response: ${errorBodyText}`
        );
      }

      const rpcResponse: SendMessageResponse = await response.json();

      if ("error" in rpcResponse) {
        // Check if it's a payment-related error in the JSON-RPC response
        if (
          rpcResponse.error?.message?.toLowerCase().includes("payment") ||
          rpcResponse.error?.message?.toLowerCase().includes("x-payment")
        ) {
          throw new PaymentRequiredError(
            rpcResponse.error.message || "Payment Required",
            rpcResponse
          );
        }
        throw new Error(rpcResponse.error.message || "RPC error");
      }

      return rpcResponse;
    } catch (error) {
      // Re-throw PaymentRequiredError as-is
      if (error instanceof PaymentRequiredError) {
        throw error;
      }
      // Wrap other errors
      throw error;
    }
  }

  /**
   * Sets custom headers that will be included in all subsequent requests.
   * @param headers The headers to set.
   */
  public setHeaders(headers: Record<string, string>): void {
    this.customHeaders = { ...this.customHeaders, ...headers };
  }

  /**
   * Clears all custom headers.
   */
  public clearHeaders(): void {
    this.customHeaders = {};
  }
}

/**
 * Custom error class for payment required errors (402).
 */
export class PaymentRequiredError extends Error {
  public readonly statusCode: number = 402;
  public readonly originalError: any;
  public readonly paymentRequirements?: {
    payTo: string;
    maxAmountRequired: string;
    network?: string;
    asset?: string;
    description?: string;
    resource?: string;
    scheme?: string;
  };

  constructor(message: string, originalError?: any) {
    super(message);
    this.name = "PaymentRequiredError";
    this.originalError = originalError;

    // Extract payment requirements from error body
    if (
      originalError?.accepts &&
      Array.isArray(originalError.accepts) &&
      originalError.accepts.length > 0
    ) {
      const accepts = originalError.accepts[0];
      this.paymentRequirements = {
        payTo: accepts.payTo,
        maxAmountRequired: accepts.maxAmountRequired,
        network: accepts.network,
        asset: accepts.asset,
        description: accepts.description,
        resource: accepts.resource,
        scheme: accepts.scheme,
      };
    }
  }
}
