"""
Transfer Agent - Movement Network Token Transfer Agent

This module implements an AI-powered agent that helps users transfer tokens
on Movement Network between addresses.

ARCHITECTURE OVERVIEW:
----------------------
The agent follows the same multi-layered architecture as other agents:

1. LangGraph Agent Layer:
   - Uses LangGraph v1.0+ create_agent() API to build the core AI agent
   - Powered by OpenAI's ChatOpenAI model (configurable via OPENAI_MODEL env var)
   - Has access to tools: execute_transfer(), check_transfer_status(), estimate_transfer_fees()
   - Uses a system prompt that guides the agent on how to handle transfer operations

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
1. User sends a query (e.g., "transfer 1 MOVE to 0x...")
2. RequestContext captures the user input
3. TransferAgentExecutor.execute() is called
4. TransferAgent.invoke() processes the query:
   - Validates OpenAI API key
   - Invokes LangGraph agent with user query
   - Agent uses tools to execute transfers
   - Extracts assistant response from agent result
5. Response is formatted as JSON and sent back via EventQueue

KEY COMPONENTS:
---------------
- TransferAgent: Core agent class that wraps LangGraph agent and ADK Runner
- TransferAgentExecutor: Implements A2A AgentExecutor interface
- Tools: execute_transfer(), check_transfer_status(), estimate_transfer_fees()
- create_transfer_agent_app(): Factory function to create A2A server

ENVIRONMENT VARIABLES:
----------------------
- OPENAI_API_KEY: Required - OpenAI API key for LLM access
- OPENAI_MODEL: Optional - Model name (default: "gpt-4o-mini")
- MOVEMENT_RPC_URL: Optional - Movement Network RPC endpoint

USAGE:
------
Mounted mode:
    from app.agents.transfer.agent import create_transfer_agent_app
    app.mount("/transfer", create_transfer_agent_app(card_url="http://localhost:8000/transfer"))

NOTES:
------
- Works exclusively on Movement Network
- Supports native MOVE token and ERC-20 token transfers
- Validates recipient addresses (66 characters for Movement Network)
- Provides fee estimates before executing transfers
- Monitors transfer transaction status
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
    return """You are a helpful Web3 assistant specializing in token transfers on Movement Network.

CRITICAL: This application works EXCLUSIVELY with Movement Network. All operations default to Movement Network.

CRITICAL: Address Validation Rules
- Movement Network addresses are 66 characters long (0x + 64 hex characters)
- Addresses must start with "0x" and contain valid hexadecimal characters
- NEVER reject an address because it's 66 characters - it's a valid Movement Network address
- If an address starts with "0x" and contains valid hex characters, it is VALID

When users ask about transferring tokens:
1. Extract the token symbol (e.g., "MOVE", "USDC", "USDT", "USDC.e", "USDT.e")
   - If no token specified, default to "MOVE" (native token)
2. Extract the amount to transfer (e.g., "1", "100", "0.5")
3. Extract the recipient address (must be 66 characters, starting with 0x)
4. Extract the sender address if provided (otherwise use connected wallet)
5. Use the appropriate tool to estimate fees or execute the transfer

Available operations:
- Execute transfer transaction (requires: token, amount, to_address, from_address)
- Check transfer transaction status (requires: transaction_hash)
- Estimate transfer fees (requires: token, amount, to_address)

Common token symbols on Movement Network:
- MOVE (native token)
- USDC.e, USDT.e (verified stablecoins)
- WBTC.e, WETH.e (verified wrapped tokens)
- Other tokens from the Movement Network token registry

If the user doesn't provide all required information, politely ask for it.
Always validate recipient addresses (must be 66 characters, starting with 0x).
Provide fee estimates before executing transfers.
Explain that transfers are irreversible once confirmed.
If there's an error, explain it clearly and suggest alternatives."""


def create_agent_skill() -> AgentSkill:
    """Create the agent skill definition."""
    return AgentSkill(
        id="transfer_agent",
        name="Transfer Agent",
        description="Transfer Agent for token transfers on Movement Network",
        tags=["transfer", "send", "movement", "tokens", "web3", "crypto"],
        examples=[
            "transfer 1 MOVE to 0x...",
            "send 100 USDC to address",
            "transfer tokens",
            "send MOVE to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
            "check transfer status for 0x...",
        ],
    )


@tool
def execute_transfer(
    token: str,
    amount: str,
    to_address: str,
    from_address: str = "",
) -> str:
    """Execute a token transfer transaction.

    Args:
        token: The token symbol to transfer (e.g., "MOVE", "USDC", "USDT", "USDC.e", "USDT.e")
               Defaults to "MOVE" if not specified
        amount: The amount to transfer (as string, e.g., "1", "100", "0.5")
        to_address: The recipient address (66 characters, must start with 0x)
        from_address: The sender address (66 characters, must start with 0x).
                      If empty, uses connected wallet address

    Returns:
        Transfer transaction details as a string
    """
    # Validate address format
    if not to_address.startswith("0x") or len(to_address) != 66:
        return json.dumps(
            {
                "status": "error",
                "error": "Invalid recipient address. Movement Network addresses must be 66 characters and start with 0x.",
                "message": "Please provide a valid Movement Network address (66 characters, starting with 0x)",
            }
        )

    # TODO: Implement actual transfer execution via Movement Network smart contracts
    return json.dumps(
        {
            "status": "initiated",
            "token": token.upper() if token else "MOVE",
            "amount": amount,
            "from_address": from_address or "connected_wallet",
            "to_address": to_address,
            "tx_hash": "0x1234567890abcdef...",
            "estimated_time": "30-60 seconds",
            "network": "movement",
            "message": f"Transfer transaction initiated: {amount} {token.upper() if token else 'MOVE'} -> {to_address[:10]}...{to_address[-8:]}",
        }
    )


@tool
def check_transfer_status(tx_hash: str) -> str:
    """Check the status of a transfer transaction.

    Args:
        tx_hash: The transaction hash of the transfer operation (0x...)

    Returns:
        Transfer transaction status as a string
    """
    # TODO: Implement actual transaction status checking
    return json.dumps(
        {
            "tx_hash": tx_hash,
            "status": "completed",
            "confirmations": "12/12",
            "token": "MOVE",
            "amount": "1",
            "from_address": "0x...",
            "to_address": "0x...",
            "message": "Transfer transaction completed successfully",
        }
    )


@tool
def estimate_transfer_fees(
    token: str,
    amount: str,
    to_address: str,
) -> str:
    """Estimate fees for a transfer transaction.

    Args:
        token: The token symbol to transfer (e.g., "MOVE", "USDC", "USDT")
        amount: The amount to transfer (as string, e.g., "1", "100", "0.5")
        to_address: The recipient address (66 characters, must start with 0x)

    Returns:
        Fee estimates as a string
    """
    # TODO: Implement actual fee calculation
    return json.dumps(
        {
            "token": token.upper() if token else "MOVE",
            "amount": amount,
            "to_address": to_address,
            "network_fee": "0.001 MOVE",
            "total_cost": f"{float(amount) + 0.001} {token.upper() if token else 'MOVE'}",
            "estimated_time": "30-60 seconds",
            "message": f"Estimated fees for transferring {amount} {token.upper() if token else 'MOVE'}",
        }
    )


def get_tools() -> List[Any]:
    """Get the list of tools available to the agent."""
    return [execute_transfer, check_transfer_status, estimate_transfer_fees]


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


class TransferAgent:
    def __init__(self):
        self._agent = self._build_agent()
        self._runner = Runner(
            app_name="transferagent",
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


class TransferAgentExecutor(AgentExecutor):
    def __init__(self):
        self.agent = TransferAgent()

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


def create_transfer_agent_app(card_url: str) -> A2AStarletteApplication:
    """Create and configure the A2A server application for the transfer agent.

    Args:
        card_url: The base URL where the agent card will be accessible

    Returns:
        A2AStarletteApplication instance configured for the transfer agent
    """
    agent_card = AgentCard(
        name="transfer",
        description=(
            "LangGraph powered agent that helps transfer tokens "
            "on Movement Network between addresses"
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
        agent_executor=TransferAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )
    return A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=request_handler,
        extended_agent_card=agent_card,
    )

