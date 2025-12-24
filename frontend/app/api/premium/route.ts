/**
 * Premium API Route - Direct Agent Communication
 *
 * This route directly calls Python agents via A2A protocol, bypassing the orchestrator.
 * Used for premium chat mode where users can select and chat directly with specific agents.
 */

import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:8000";

  // Get selected agent from query parameter or header
  const url = new URL(request.url);
  const selectedAgent =
    url.searchParams.get("agent") ||
    request.headers.get("x-selected-agent") ||
    "lending";

  // Map agent names to their URLs
  const agentUrlMap: Record<string, string> = {
    lending: `${baseUrl}/lending`,
    balance: `${baseUrl}/balance`,
    bridge: `${baseUrl}/bridge`,
    swap: `${baseUrl}/swap`,
    transfer: `${baseUrl}/transfer`,
  };

  const agentUrl = agentUrlMap[selectedAgent] || agentUrlMap.lending;

  // Create direct agent connection (bypassing orchestrator)
  const directAgent = new HttpAgent({
    url: agentUrl,
  });

  // Create CopilotKit runtime with direct agent
  const runtime = new CopilotRuntime({
    agents: {
      premium_agent: directAgent as any,
    },
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/premium",
    logLevel: "debug",
  });

  return handleRequest(request);
}
