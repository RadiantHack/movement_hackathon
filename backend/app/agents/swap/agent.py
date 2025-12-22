"""
Swap Agent - Movement Network Token Swap Agent

This module implements an AI-powered agent that helps users swap tokens
on Movement Network using decentralized exchanges.

ARCHITECTURE OVERVIEW:
----------------------
The agent follows the same multi-layered architecture as other agents:

1. LangGraph Agent Layer:
   - Uses LangGraph v1.0+ create_agent() API to build the core AI agent
   - Powered by OpenAI's ChatOpenAI model (configurable via OPENAI_MODEL env var)
   - Has access to tools: get_swap_quote(), execute_swap(), check_swap_status()
   - Uses a system prompt that guides the agent on how to handle swap operations

2. A2A (Agent-to-Agent) Integration Layer:
   - Implements AgentExecutor interface for A2A protocol compatibility
   - Creates AgentCard for agent discovery and capabilities
   - Uses A2AStarletteApplication to expose the agent as an HTTP service
   - Handles request/response through DefaultRequestHandler

3. Google ADK (Agent Development Kit) Layer:
   - Uses Runner to orchestrate agent execution
   - InMemoryArtifactService for artifact storage
   - InMemorySessionService for session management
   - InMemoryMemoryService for conversation memory

4. Server Layer:
   - Exposes agent via Starlette/FastAPI application
   - Can run standalone or be mounted as a sub-application
   - Provides agent card endpoint for discovery

WORKFLOW:
---------
1. User sends a query (e.g., "swap 1 MOVE for USDC")
2. RequestContext captures the user input
3. SwapAgentExecutor.execute() is called
4. SwapAgent.invoke() processes the query:
   - Validates OpenAI API key
   - Invokes LangGraph agent with user query
   - Agent uses tools to get quotes and execute swaps
   - Extracts assistant response from agent result
5. Response is formatted as JSON and sent back via EventQueue

KEY COMPONENTS:
---------------
- SwapAgent: Core agent class that wraps LangGraph agent and ADK Runner
- SwapAgentExecutor: Implements A2A AgentExecutor interface
- Tools: get_swap_quote(), execute_swap(), check_swap_status()
- create_swap_agent_app(): Factory function to create A2A server

ENVIRONMENT VARIABLES:
----------------------
- OPENAI_API_KEY: Required - OpenAI API key for LLM access
- OPENAI_MODEL: Optional - Model name (default: "gpt-4o-mini")
- MOVEMENT_RPC_URL: Optional - Movement Network RPC endpoint

USAGE:
------
Mounted mode:
    from app.agents.swap.agent import create_swap_agent_app
    app.mount("/swap", create_swap_agent_app(card_url="http://localhost:8000/swap"))

NOTES:
------
- Works exclusively on Movement Network
- Supports token swaps via DEX protocols
- Provides quote estimates before executing swaps
- Monitors swap transaction status
"""

import os
import uuid
import json
from typing import Any, List

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
    Message,
    Part,
    Role,
    TextPart,
)
from google.adk.artifacts import InMemoryArtifactService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent

# Constants
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0
DEFAULT_SESSION_ID = "default_session"
EMPTY_RESPONSE_MESSAGE = (
    "I apologize, but I couldn't generate a response. Please try rephrasing your question."
)

# Environment variables
ENV_OPENAI_API_KEY = "OPENAI_API_KEY"
ENV_OPENAI_MODEL = "OPENAI_MODEL"
ENV_MOVEMENT_RPC_URL = "MOVEMENT_RPC_URL"

# Message types
MESSAGE_TYPE_AI = "ai"
MESSAGE_ROLE_ASSISTANT = "assistant"
MESSAGE_ROLE_USER = "user"
MESSAGE_KEY_MESSAGES = "messages"
MESSAGE_KEY_OUTPUT = "output"
MESSAGE_KEY_CONTENT = "content"
MESSAGE_KEY_ROLE = "role"
MESSAGE_KEY_TYPE = "type"

# Error messages
ERROR_API_KEY = "api key"
ERROR_TIMEOUT = "timeout"
ERROR_AUTH_MESSAGE = "Authentication error: Please check your OpenAI API key configuration."
ERROR_TIMEOUT_MESSAGE = "Request timed out. Please try again."
ERROR_GENERIC_PREFIX = "I encountered an error while processing your request: "


def get_system_prompt() -> str:
    """Get the system prompt for the agent."""
    return """You are a helpful Web3 assistant specializing in token swaps on Movement Network.

CRITICAL: This application works EXCLUSIVELY with Movement Network. All operations default to Movement Network.

When users ask about swapping tokens:
1. Extract the token to swap from (e.g., "MOVE", "USDC", "USDT", "USDC.e", "USDT.e", "WBTC.e", "WETH.e")
2. Extract the token to swap to (e.g., "USDC", "MOVE", "USDT", "USDC.e", "USDT.e", "WBTC.e", "WETH.e")
3. Extract the amount to swap if provided (e.g., "1", "100", "0.5")
4. Use the appropriate tool to get a quote or execute the swap

Available operations:
- Get swap quote (requires: from_token, to_token, amount)
- Execute swap transaction (requires: from_token, to_token, amount, slippage_tolerance)
- Check swap transaction status (requires: transaction_hash)

Common token symbols on Movement Network:
- MOVE (native token)
- USDC.e, USDT.e (verified stablecoins)
- WBTC.e, WETH.e (verified wrapped tokens)
- Other tokens from the Movement Network token registry

If the user doesn't provide all required information, politely ask for it.
Always provide quote estimates before executing swaps.
Explain slippage tolerance and its impact on swap execution.
If there's an error, explain it clearly and suggest alternatives."""


def create_agent_skill() -> AgentSkill:
    """Create the agent skill definition."""
    return AgentSkill(
        id="swap_agent",
        name="Swap Agent",
        description="Swap Agent for token exchanges on Movement Network",
        tags=["swap", "exchange", "dex", "movement", "tokens", "web3"],
        examples=[
            "swap 1 MOVE for USDC",
            "swap MOVE to USDT",
            "exchange USDC for MOVE",
            "get quote for swapping 100 USDC to MOVE",
            "swap tokens",
        ],
    )


@tool
def get_swap_quote(from_token: str, to_token: str, amount: str) -> str:
    """Get a quote for swapping tokens.

    Args:
        from_token: The token symbol to swap from (e.g., "MOVE", "USDC", "USDT", "USDC.e", "USDT.e")
        to_token: The token symbol to swap to (e.g., "USDC", "MOVE", "USDT", "USDC.e", "USDT.e")
        amount: The amount to swap (as string, e.g., "1", "100", "0.5")

    Returns:
        Swap quote details as a string
    """
    # TODO: Implement actual quote fetching from DEX API (e.g., Mosaic API)
    return json.dumps(
        {
            "from_token": from_token.upper(),
            "to_token": to_token.upper(),
            "amount_in": amount,
            "amount_out": "0.95",  # Example: 1 MOVE = 0.95 USDC
            "price_impact": "2.5%",
            "slippage_tolerance": "0.5%",
            "estimated_gas": "0.001 MOVE",
            "route": f"{from_token.upper()} -> {to_token.upper()}",
            "message": f"Quote: {amount} {from_token.upper()} = ~{0.95 * float(amount)} {to_token.upper()} (estimated)",
        }
    )


@tool
def execute_swap(
    from_token: str,
    to_token: str,
    amount: str,
    slippage_tolerance: str = "0.5",
) -> str:
    """Execute a token swap transaction.

    Args:
        from_token: The token symbol to swap from (e.g., "MOVE", "USDC", "USDT")
        to_token: The token symbol to swap to (e.g., "USDC", "MOVE", "USDT")
        amount: The amount to swap (as string, e.g., "1", "100", "0.5")
        slippage_tolerance: Maximum acceptable slippage percentage (default: "0.5")

    Returns:
        Swap transaction details as a string
    """
    # TODO: Implement actual swap execution via DEX smart contracts
    return json.dumps(
        {
            "status": "initiated",
            "from_token": from_token.upper(),
            "to_token": to_token.upper(),
            "amount_in": amount,
            "amount_out": "0.95",  # Example
            "slippage_tolerance": f"{slippage_tolerance}%",
            "tx_hash": "0x1234567890abcdef...",
            "estimated_time": "30-60 seconds",
            "message": f"Swap transaction initiated: {amount} {from_token.upper()} -> {to_token.upper()}",
        }
    )


@tool
def check_swap_status(tx_hash: str) -> str:
    """Check the status of a swap transaction.

    Args:
        tx_hash: The transaction hash of the swap operation (0x...)

    Returns:
        Swap transaction status as a string
    """
    # TODO: Implement actual transaction status checking
    return json.dumps(
        {
            "tx_hash": tx_hash,
            "status": "completed",
            "confirmations": "12/12",
            "from_token": "MOVE",
            "to_token": "USDC",
            "amount_in": "1",
            "amount_out": "0.95",
            "message": "Swap transaction completed successfully",
        }
    )


def get_tools() -> List[Any]:
    """Get the list of tools available to the agent."""
    return [get_swap_quote, execute_swap, check_swap_status]


def validate_openai_api_key() -> None:
    """Validate that OpenAI API key is set."""
    openai_api_key = os.getenv(ENV_OPENAI_API_KEY)
    if not openai_api_key:
        raise ValueError(
            "OPENAI_API_KEY environment variable is required.\n"
            "Please set it before running the agent:\n"
            "  export OPENAI_API_KEY=your-api-key-here\n"
            "Or add it to your environment configuration."
        )


def create_chat_model() -> ChatOpenAI:
    """Create and configure the ChatOpenAI model."""
    model_name = os.getenv(ENV_OPENAI_MODEL, DEFAULT_MODEL)
    return ChatOpenAI(model=model_name, temperature=DEFAULT_TEMPERATURE)


def is_assistant_message(message: Any) -> bool:
    """Check if a message is from the assistant."""
    if hasattr(message, MESSAGE_KEY_TYPE) and hasattr(message, MESSAGE_KEY_CONTENT):
        return (
            message.type == MESSAGE_TYPE_AI
            or getattr(message, MESSAGE_KEY_ROLE, None) == MESSAGE_ROLE_ASSISTANT
        )
    if isinstance(message, dict):
        return (
            message.get(MESSAGE_KEY_ROLE) == MESSAGE_ROLE_ASSISTANT
            or message.get(MESSAGE_KEY_TYPE) == MESSAGE_TYPE_AI
        )
    return False


def extract_message_content(message: Any) -> str:
    """Extract content from a message object."""
    if hasattr(message, MESSAGE_KEY_CONTENT):
        return message.content
    if isinstance(message, dict):
        return message.get(MESSAGE_KEY_CONTENT, "")
    return ""


def extract_assistant_response(result: Any) -> str:
    """Extract the assistant's response from the agent result."""
    if not isinstance(result, dict) or MESSAGE_KEY_MESSAGES not in result:
        return _extract_fallback_output(result)
    messages = result[MESSAGE_KEY_MESSAGES]
    if not messages:
        return _extract_fallback_output(result)
    assistant_content = _find_assistant_message(messages)
    if assistant_content:
        return assistant_content
    return _extract_last_message_content(messages)


def _find_assistant_message(messages: List[Any]) -> str:
    """Find the last assistant message in the messages list."""
    for message in reversed(messages):
        if is_assistant_message(message):
            content = extract_message_content(message)
            if content:
                return content
    return ""


def _extract_last_message_content(messages: List[Any]) -> str:
    """Extract content from the last message as fallback."""
    if not messages:
        return ""
    last_message = messages[-1]
    return extract_message_content(last_message)


def _extract_fallback_output(result: Any) -> str:
    """Extract output from result dictionary or convert to string."""
    if isinstance(result, dict):
        return result.get(MESSAGE_KEY_OUTPUT, "")
    return str(result)


def format_error_message(error: Exception) -> str:
    """Format error message for user-friendly display."""
    error_msg = str(error).lower()
    if ERROR_API_KEY in error_msg:
        return ERROR_AUTH_MESSAGE
    if ERROR_TIMEOUT in error_msg:
        return ERROR_TIMEOUT_MESSAGE
    return f"{ERROR_GENERIC_PREFIX}{error}. Please try again."


class SwapAgent:
    def __init__(self):
        self._agent = self._build_agent()
        self._runner = Runner(
            app_name="swapagent",
            agent=self._agent,
            artifact_service=InMemoryArtifactService(),
            session_service=InMemorySessionService(),
            memory_service=InMemoryMemoryService(),
        )

    def _build_agent(self):
        """Build the agent using the new create_agent API."""
        validate_openai_api_key()
        model = create_chat_model()
        tools = get_tools()
        system_prompt = get_system_prompt()
        return create_agent(
            model=model,
            tools=tools,
            system_prompt=system_prompt,
        )

    async def invoke(self, query: str, session_id: str) -> str:
        """Invoke the agent with a query."""
        try:
            result = await self._invoke_agent(query, session_id)
            output = extract_assistant_response(result)
            validated_output = self._validate_output(output)
            # Return as JSON string to ensure compatibility with ADK agent expectations
            return json.dumps({"response": validated_output, "success": True})
        except Exception as e:
            print(f"Error in agent invoke: {e}")
            error_message = format_error_message(e)
            # Return error as JSON string
            return json.dumps({"response": error_message, "success": False, "error": str(e)})

    async def _invoke_agent(self, query: str, session_id: str) -> Any:
        """Invoke the agent with the given query and session."""
        return await self._agent.ainvoke(
            {
                MESSAGE_KEY_MESSAGES: [
                    {MESSAGE_KEY_ROLE: MESSAGE_ROLE_USER, MESSAGE_KEY_CONTENT: query}
                ]
            },
            config={"configurable": {"thread_id": session_id}},
        )

    def _validate_output(self, output: str) -> str:
        """Validate and return output, or return default message if empty."""
        if not output or not output.strip():
            return EMPTY_RESPONSE_MESSAGE
        return output


def get_session_id(context: RequestContext) -> str:
    """Extract session ID from context or return default."""
    return getattr(context, "context_id", DEFAULT_SESSION_ID)


def create_message(content: str) -> Message:
    """Create a message object with the given content."""
    return Message(
        message_id=str(uuid.uuid4()),
        role=Role.agent,
        parts=[Part(root=TextPart(kind="text", text=content))],
    )


class SwapAgentExecutor(AgentExecutor):
    def __init__(self):
        self.agent = SwapAgent()

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        """Execute the agent's logic for a given request context."""
        query = context.get_user_input()
        session_id = get_session_id(context)
        final_content = await self.agent.invoke(query, session_id)
        message = create_message(final_content)
        await event_queue.enqueue_event(message)

    async def cancel(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        """Request the agent to cancel an ongoing task."""
        raise NotImplementedError("cancel not supported")


def create_swap_agent_app(card_url: str) -> A2AStarletteApplication:
    """Create and configure the A2A server application for the swap agent.

    Args:
        card_url: The base URL where the agent card will be accessible

    Returns:
        A2AStarletteApplication instance configured for the swap agent
    """
    agent_card = AgentCard(
        name="swap",
        description=(
            "LangGraph powered agent that helps swap tokens "
            "on Movement Network using decentralized exchanges"
        ),
        url=card_url,
        version="1.0.0",
        default_input_modes=["text"],
        default_output_modes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[create_agent_skill()],
        supports_authenticated_extended_card=False,
    )
    request_handler = DefaultRequestHandler(
        agent_executor=SwapAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )
    return A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=request_handler,
        extended_agent_card=agent_card,
    )

