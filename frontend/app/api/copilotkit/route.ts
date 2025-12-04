import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";

const serviceAdapter = new OpenAIAdapter();
const runtime = new CopilotRuntime({
  // Configure remote endpoints for agent-to-agent (a2a) communication
  // You can add multiple remote endpoints here
  remoteEndpoints: [
    // Example: Add your remote agent endpoints here
    // {
    //   endpoint: 'http://localhost:8000',
    //   apiKey: process.env.REMOTE_AGENT_API_KEY,
    // },
  ],
  // Optional: Configure LangServe remote chains
  // langserveRemoteChainParameters: [
  //   {
  //     url: 'http://localhost:8000',
  //     apiKey: process.env.LANGSERVE_API_KEY,
  //   },
  // ],
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
