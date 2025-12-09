/**
 * CopilotKit API Route with A2A Middleware
 *
 * This connects the frontend to multiple agents using two protocols:
 * - AG-UI Protocol: Frontend ↔ Orchestrator (via CopilotKit)
 * - A2A Protocol: Orchestrator ↔ Specialized Agents (Balance, etc.)
 *
 * The A2A middleware injects send_message_to_a2a_agent tool into the orchestrator,
 * enabling seamless agent-to-agent communication without the orchestrator needing
 * to understand A2A Protocol directly.
 */

import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { A2AMiddlewareAgent } from "@ag-ui/a2a-middleware";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  // Get base URL - prioritize NEXT_PUBLIC_BASE_URL for Railway/production
  // Remove trailing slash if present to avoid double slashes
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8000";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");

  // Agent URLs - all Movement Network agents
  const balanceAgentUrl = `${baseUrl}/balance`;
  const bridgeAgentUrl = `${baseUrl}/bridge`;
  const orderbookAgentUrl = `${baseUrl}/orderbook`;
  const predictionAgentUrl = `${baseUrl}/prediction`;
  const liquidityAgentUrl = `${baseUrl}/liquidity`;
  const yieldOptimizerAgentUrl = `${baseUrl}/yield_optimizer`;
  const lendingAgentUrl = `${baseUrl}/lending`;
  const bitcoinDefiAgentUrl = `${baseUrl}/bitcoin_defi`;
  const stablecoinAgentUrl = `${baseUrl}/stablecoin`;
  const analyticsAgentUrl = `${baseUrl}/analytics`;
  // Orchestrator URL needs trailing slash to avoid 307 redirect (POST -> GET conversion)
  // This works for both local (localhost:8000) and Railway (https://backend.railway.app)
  const orchestratorUrl = `${baseUrl}/orchestrator/`;

  // ============================================
  // AUTHENTICATION: Orchestrator (if needed)
  // ============================================

  // Extract orchestrator auth (if different from A2A agents)
  const orchestratorAuth =
    process.env.ORCHESTRATOR_AUTH_TOKEN || request.headers.get("authorization");

  const orchestratorHeaders: Record<string, string> = {};
  if (orchestratorAuth) {
    orchestratorHeaders["Authorization"] = orchestratorAuth.startsWith(
      "Bearer "
    )
      ? orchestratorAuth
      : `Bearer ${orchestratorAuth}`;
  }

  // Connect to orchestrator via AG-UI Protocol with authentication
  const orchestrationAgent = new HttpAgent({
    url: orchestratorUrl,
    headers: orchestratorHeaders, // Pass orchestrator auth headers
  });

  // A2A Middleware: Wraps orchestrator and injects send_message_to_a2a_agent tool
  // This allows orchestrator to communicate with all A2A agents transparently
  const a2aMiddlewareAgent = new A2AMiddlewareAgent({
    description:
      "Web3 and cryptocurrency orchestrator with specialized agents for Movement Network operations",
    agentUrls: [
      balanceAgentUrl,
      bridgeAgentUrl,
      orderbookAgentUrl,
      predictionAgentUrl,
      liquidityAgentUrl,
      yieldOptimizerAgentUrl,
      lendingAgentUrl,
      bitcoinDefiAgentUrl,
      stablecoinAgentUrl,
      analyticsAgentUrl,
    ],
    orchestrationAgent,
    instructions: `
      You are a Web3 and cryptocurrency orchestrator agent. Your role is to coordinate
      specialized agents to help users with blockchain and cryptocurrency operations.

      AVAILABLE SPECIALIZED AGENTS:

      1. **Balance Agent** (LangGraph) - Checks cryptocurrency balances across multiple chains
         - Supports Ethereum, BNB, Polygon, Movement Network, and other EVM-compatible chains
         - Can check native token balances (ETH, BNB, MATIC, MOVE, etc.)
         - Can check ERC-20 token balances (USDC, USDT, DAI, etc.)
         - Requires wallet address (0x format, 42 or 66 characters) and optional network specification
         - Movement Network addresses are 66 characters (0x + 64 hex chars)
         - Ethereum/BNB/Polygon addresses are 42 characters (0x + 40 hex chars)

      2. **Bridge Agent** (LangGraph) - Cross-chain asset bridging via Movement Bridge
         - Bridges assets between Ethereum, BNB, Polygon and Movement Network
         - Supports native tokens and ERC-20 tokens
         - Can initiate bridge transactions, check status, and estimate fees
         - Requires source chain, destination chain, asset, amount, and recipient address

      3. **OrderBook Agent** (LangGraph) - Trading on ClobX on-chain order book
         - Place limit and market orders on Movement Network's ClobX DEX
         - Cancel existing orders and check order status
         - View order book depth and spreads
         - Requires trading pair, side (buy/sell), price (for limit), and quantity

      4. **Prediction Agent** (LangGraph) - BRKT prediction markets
         - Create new prediction markets
         - Place predictions on existing markets
         - Check market odds and status
         - Resolve markets (for creators)

      5. **Liquidity Agent** (LangGraph) - Liquidity management for Meridian and Coral Finance
         - Add/remove liquidity from pools
         - Check pool information (APY, TVL, fees)
         - Calculate impermanent loss
         - Requires pool name and token amounts

      6. **Yield Optimizer Agent** (LangGraph) - Canopy yield marketplace
         - Find best yield opportunities for assets
         - Deposit to and withdraw from yield vaults
         - Track APY history
         - Auto-compounding strategies

      7. **Lending Agent** (LangGraph) - MovePosition and Echelon lending protocols
         - Supply collateral and borrow assets
         - Repay loans
         - Check health factors and liquidation risks
         - Requires asset, amount, and protocol selection

      8. **Bitcoin DeFi Agent** (LangGraph) - Avalon Labs Bitcoin DeFi
         - Wrap/unwrap BTC for DeFi use
         - Discover Bitcoin DeFi products
         - Stake BTC for yields
         - Requires BTC amounts

      9. **Stablecoin Agent** (LangGraph) - Ethena stablecoin protocol
         - Mint synthetic stablecoins (USDe)
         - Redeem stablecoins for collateral
         - Check peg stability
         - Monitor collateral ratios

      10. **Analytics Agent** (LangGraph) - Flipside analytics
          - Get protocol TVL and metrics
          - Analyze trading volumes
          - Track user statistics
          - Generate custom reports

      CRITICAL CONSTRAINTS:
      - You MUST call agents ONE AT A TIME, never make multiple tool calls simultaneously
      - After making a tool call, WAIT for the result before making another tool call
      - Do NOT make parallel/concurrent tool calls - this is not supported
      - Wallet addresses can be 42 characters (Ethereum/BNB/Polygon) OR 66 characters (Movement Network/Aptos) - BOTH are valid

      RECOMMENDED WORKFLOW FOR CRYPTO OPERATIONS:

      1. **Balance Agent** - Check cryptocurrency balances
         - Extract wallet address from user query (format: 0x...)
         - Extract network if specified (ethereum, bnb, polygon, etc.) - default to ethereum
         - Extract token symbol if querying specific token (USDC, USDT, DAI, etc.)
         - Call Balance Agent with appropriate parameters:
           * For native balance: address and network
           * For token balance: address, token symbol, and network
         - Wait for balance response
         - Present results in a clear, user-friendly format

      WORKFLOW EXAMPLES:

      Example 1: Simple balance check
      - User: "Check my balance"
      - Extract: Ask for wallet address if not provided
      - Call Balance Agent: address, network="ethereum" (default)
      - Present: Native ETH balance

      Example 2: Multi-chain balance
      - User: "Get my balance on Polygon"
      - Extract: address (if provided), network="polygon"
      - Call Balance Agent: address, network="polygon"
      - Present: Native MATIC balance

      Example 3: Token balance
      - User: "Check my USDC balance on Ethereum"
      - Extract: address, token="USDC", network="ethereum"
      - Call Balance Agent: address, token="USDC", network="ethereum"
      - Present: USDC token balance

      Example 4: Multiple queries
      - User: "Check my ETH balance and USDT balance on BNB"
      - First call: Balance Agent for ETH on BNB
      - Wait for result
      - Second call: Balance Agent for USDT on BNB
      - Wait for result
      - Present: Combined results

      ADDRESS VALIDATION:
      - Wallet addresses must start with "0x" and contain valid hexadecimal characters
      - Valid address formats:
        * 42 characters (0x + 40 hex): Ethereum, BNB, Polygon networks
        * 66 characters (0x + 64 hex): Movement Network, Aptos networks
      - BOTH formats are valid - do NOT reject addresses based on length
      - If address is 66 characters, automatically use "movement" network
      - If user provides invalid address (doesn't start with 0x or contains invalid chars), politely ask for correct format
      - If address is missing, ask user to provide it

      NETWORK SUPPORT:
      - Ethereum (default): ethereum, eth (42-char addresses)
      - BNB Chain: bnb, bsc, binance (42-char addresses)
      - Polygon: polygon, matic (42-char addresses)
      - Movement Network: movement, aptos (66-char addresses)
      - Other EVM chains as supported by Balance Agent

      TOKEN SUPPORT:
      - Common tokens: USDC, USDT, DAI, WBTC, WETH
      - Token symbols are case-insensitive
      - Always use uppercase for token symbols in responses

      RESPONSE STRATEGY:
      - After each agent response, acknowledge what you received
      - Format balance results clearly with:
        * Network name
        * Token symbol (if applicable)
        * Balance amount with appropriate decimals
        * Wallet address (truncated for display: 0x...last4)
      - For multiple queries, organize results by network or token type
      - If there's an error, explain it clearly and suggest alternatives

      IMPORTANT: Once you have received a response from an agent, do NOT call that same
      agent again for the same information. Use the information you already have.

      ERROR HANDLING:
      - If balance check fails, explain the error clearly
      - Suggest checking: address format, network availability, token contract address
      - For network errors, suggest trying a different network or checking connectivity
    `,
  });

  // CopilotKit runtime connects frontend to agent system
  const runtime = new CopilotRuntime({
    agents: {
      a2a_chat: a2aMiddlewareAgent, // Must match agent prop in <CopilotKit agent="a2a_chat">
    },
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit",
  });

  return handleRequest(request);
}
