"""
Balance Agent - Web3 Cryptocurrency Balance Checking Agent

This module implements an AI-powered agent that helps users check cryptocurrency
balances across multiple blockchain networks (Ethereum, BNB, Polygon, Movement Network, etc.).

Movement Network support:
- Uses Movement Indexer GraphQL API to fetch balances
- Supports Aptos-compatible addresses (0x format)
- Network parameter: "movement" or "aptos" (both work)
- Fetches all fungible asset balances including native MOVE token

ARCHITECTURE OVERVIEW:
----------------------
The agent follows a multi-layered architecture:

1. LangGraph Agent Layer:
   - Uses LangGraph v1.0+ create_agent() API to build the core AI agent
   - Powered by OpenAI's ChatOpenAI model (configurable via OPENAI_MODEL env var)
   - Has access to tools: get_balance() and get_token_balance()
   - Uses a system prompt that guides the agent on how to handle balance queries

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
   - Can run standalone (on configurable port) or be mounted as a sub-application
   - Provides agent card endpoint for discovery

WORKFLOW:
---------
1. User sends a query (e.g., "get balance of 0x742d35... on ethereum")
2. RequestContext captures the user input
3. BalanceAgentExecutor.execute() is called
4. BalanceAgent.invoke() processes the query:
   - Validates OpenAI API key
   - Invokes LangGraph agent with user query
   - Agent uses tools to fetch balance data (currently stubbed)
   - Extracts assistant response from agent result
5. Response is formatted as JSON and sent back via EventQueue

KEY COMPONENTS:
---------------
- BalanceAgent: Core agent class that wraps LangGraph agent and ADK Runner
- BalanceAgentExecutor: Implements A2A AgentExecutor interface
- Tools: get_balance() and get_token_balance() for blockchain queries
- create_server(): Factory function to create A2A server (standalone or mounted)

ENVIRONMENT VARIABLES:
----------------------
- OPENAI_API_KEY: Required - OpenAI API key for LLM access
- OPENAI_MODEL: Optional - Model name (default: "gpt-4o-mini")
- ITINERARY_PORT: Optional - Server port (default: 9001)
- RENDER_EXTERNAL_URL: Optional - External URL for agent card

USAGE:
------
Standalone mode:
    python -m app.agents.balance.agent
    # Server starts on http://0.0.0.0:9001 (or ITINERARY_PORT)

Mounted mode:
    from app.agents.balance.agent import create_server
    app.mount("/balance", create_server(base_url="http://localhost:8000/balance"))

NOTES:
------
- Movement Network balance fetching is fully implemented using the indexer API
- Other networks (Ethereum, BNB, etc.) are stubbed and will be implemented later
- Uses in-memory services (sessions, artifacts, memory) - not persistent
- Error handling includes user-friendly messages for common issues
- Supports streaming responses via AgentCapabilities
- Movement Network uses Sentio indexer by default (configurable via MOVEMENT_INDEXER_URL)
"""

import os
import uuid
import json
from typing import Any, List, Dict, Optional

import uvicorn
import requests
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
DEFAULT_PORT = 9001
DEFAULT_NETWORK = "ethereum"
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0
DEFAULT_SESSION_ID = "default_session"
EMPTY_RESPONSE_MESSAGE = (
    "I apologize, but I couldn't generate a response. Please try rephrasing your question."
)

# Environment variables
ENV_ITINERARY_PORT = "ITINERARY_PORT"
ENV_RENDER_EXTERNAL_URL = "RENDER_EXTERNAL_URL"
ENV_OPENAI_API_KEY = "OPENAI_API_KEY"
ENV_OPENAI_MODEL = "OPENAI_MODEL"
ENV_MOVEMENT_INDEXER_URL = "MOVEMENT_INDEXER_URL"

# Movement Indexer constants
SENTIO_INDEXER = "https://rpc.sentio.xyz/movement-indexer/v1/graphql"
MOVEMENT_INDEXER_MAINNET = "https://indexer.mainnet.movementnetwork.xyz/v1/graphql"
MOVEMENT_INDEXER_TESTNET = "https://indexer.testnet.movementnetwork.xyz/v1/graphql"

# GraphQL query for Movement balances
MOVEMENT_BALANCES_QUERY = """
query GetUserTokenBalances($ownerAddress: String!) {
  current_fungible_asset_balances(
    where: {
      owner_address: {_eq: $ownerAddress},
      amount: {_gt: 0}
    }
  ) {
    asset_type
    amount
    last_transaction_timestamp
    metadata {
      name
      symbol
      decimals
    }
  }
}
"""

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
    return """You are a helpful Web3 assistant specializing in checking cryptocurrency balances.

CRITICAL: Address Validation Rules
- Wallet addresses can be 42 characters OR 66 characters long - BOTH are valid
- 42-character addresses (0x + 40 hex): Ethereum, BNB, Polygon networks
- 66-character addresses (0x + 64 hex): Movement Network, Aptos networks
- If an address starts with "0x" and contains valid hex characters, it is VALID
- NEVER reject an address because of its length
- NEVER say an address is "invalid" if it's 66 characters - it's a valid Movement Network address
- When you see a 66-character address, automatically use network="movement"

When users ask about balances:
1. Extract the wallet address if provided (format: 0x...)
2. Determine which network:
   - If address is 66 characters: use "movement" network
   - If address is 42 characters: use network specified by user, or default to "ethereum"
   - For Movement Network: use "movement" or "aptos" (they are the same)
3. For token queries, identify the token symbol (USDC, USDT, DAI, MOVE, etc.)
4. Call the appropriate tool (get_balance or get_token_balance) with the address and network
5. Present results in a clear, user-friendly format

Special handling for Movement Network:
- Movement Network uses 66-character addresses (0x + 64 hex characters)
- These addresses are VALID - do not reject them
- When you see a 66-character address, use network="movement" or network="aptos"
- The tool functions automatically handle 66-character addresses correctly

If the user doesn't provide an address, politely ask for it.
If there's an error, explain it clearly and suggest alternatives."""


def get_port() -> int:
    """Get the port number from environment or default."""
    return int(os.getenv(ENV_ITINERARY_PORT, str(DEFAULT_PORT)))


def get_card_url(port: int) -> str:
    """Get the card URL from environment or construct from port."""
    return os.getenv(ENV_RENDER_EXTERNAL_URL, f"http://localhost:{port}")


def create_agent_skill() -> AgentSkill:
    """Create the agent skill definition."""
    return AgentSkill(
        id="balance_agent",
        name="Balance Agent",
        description="Balance Agent for checking crypto balances on multiple chains including Movement Network",
        tags=["balance", "ethereum", "bnb", "movement", "aptos", "web3", "crypto"],
        examples=[
            "get balance",
            "get my balance",
            "give my balance",
            "get balance on movement",
            "get balance on ethereum",
            "get balance of 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
            "get balance of usdc on bnb",
            "get balance of usdc on ethereum",
            "check my USDT balance",
            "get my balance on movement",
        ],
    )


def create_agent_card(port: int) -> AgentCard:
    """Create the public agent card."""
    card_url = get_card_url(port)
    skill = create_agent_skill()
    return AgentCard(
        name="Balance Agent",
        description=(
            "LangGraph powered agent that helps to get "
            "cryptocurrency balances across multiple chains"
        ),
        url=card_url,
        version="2.0.0",
        default_input_modes=["text"],
        default_output_modes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[skill],
        supports_authenticated_extended_card=False,
    )


def get_movement_indexer_url() -> str:
    """Get Movement Indexer URL from environment or default to Sentio.
    
    Returns:
        Movement Indexer GraphQL URL
    """
    return os.getenv(ENV_MOVEMENT_INDEXER_URL, SENTIO_INDEXER)


def fetch_movement_balances(address: str) -> Dict[str, Any]:
    """Fetch balances from Movement Network using the indexer API with pagination.
    
    Uses the robust balance fetching function from get_movement_balance.py
    which includes pagination, proper error handling, and native token sorting.
    
    Args:
        address: Wallet address to check
        
    Returns:
        Dictionary with balance information
    """
    try:
        # Import the robust balance fetching functions
        import sys
        import os
        from pathlib import Path
        
        # Add backend directory to path to import get_movement_balance
        # From: backend/app/agents/balance/agent.py
        # To: backend/get_movement_balance.py
        current_file = Path(__file__).resolve()
        backend_dir = current_file.parent.parent.parent.parent
        backend_dir_str = str(backend_dir)
        
        if backend_dir_str not in sys.path:
            sys.path.insert(0, backend_dir_str)
        
        # Import the functions
        from get_movement_balance import get_balances, get_indexer_url
        
        # Get indexer URL (uses default provider: sentio)
        indexer_url = get_indexer_url()
        
        # Fetch balances with pagination support
        result = get_balances(indexer_url=indexer_url, address=address)
        
        # Return in the format expected by the agent
        if result.get("success", False):
            return {
                "success": True,
                "balances": result.get("balances", []),
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Unknown error"),
            }
    except ImportError as e:
        # Fallback to original implementation if import fails
        try:
            indexer_url = get_movement_indexer_url()
            variables = {"ownerAddress": address}
            payload = {
                "query": MOVEMENT_BALANCES_QUERY,
                "variables": variables,
            }
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            response = requests.post(
                indexer_url,
                json=payload,
                headers=headers,
                timeout=30,
            )
            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"Indexer API error: {response.status_code}",
                }
            data = response.json()
            if "errors" in data:
                return {
                    "success": False,
                    "error": f"GraphQL errors: {json.dumps(data['errors'])}",
                }
            balances = data.get("data", {}).get("current_fungible_asset_balances", [])
            return {
                "success": True,
                "balances": balances,
            }
        except Exception as fallback_error:
            return {
                "success": False,
                "error": f"Import error: {str(e)}, Fallback error: {str(fallback_error)}",
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


def format_movement_balance_response(balances_data: Dict[str, Any], address: str) -> str:
    """Format Movement balance data into a user-friendly string.
    
    Args:
        balances_data: Dictionary with balance data from indexer
        address: Wallet address
        
    Returns:
        Formatted balance string
    """
    if not balances_data.get("success", False):
        return f"Error fetching Movement balance: {balances_data.get('error', 'Unknown error')}"
    balances = balances_data.get("balances", [])
    if not balances:
        return f"Address {address} has no token balances on Movement Network."
    
    # Process each token individually (don't group - show all 6 tokens separately)
    token_list: List[Dict[str, Any]] = []
    
    for balance in balances:
        amount = balance.get("amount", "0")
        metadata = balance.get("metadata", {})
        asset_type = balance.get("asset_type", "Unknown")
        
        # Handle metadata structure (can be dict or nested)
        if isinstance(metadata, dict):
            name = metadata.get("name", "Unknown Token")
            symbol = metadata.get("symbol", "Unknown")
            decimals_str = metadata.get("decimals", "18")
        else:
            name = "Unknown Token"
            symbol = "Unknown"
            decimals_str = "18"
        
        try:
            decimals = int(decimals_str)
        except (ValueError, TypeError):
            decimals = 18
        
        try:
            amount_int = int(amount)
            
            # Skip only truly zero balances - show all tokens with any balance (even very small)
            if amount_int == 0:
                continue
            
            formatted_balance = amount_int / (10 ** decimals)
            
            # Store each token individually (don't group by symbol)
            token_list.append({
                "name": name,
                "symbol": symbol.upper(),
                "balance": formatted_balance,
                "asset_type": asset_type
            })
        except (ValueError, TypeError):
            # If we can't parse, skip it
            continue
    
    if not token_list:
        return f"Address {address} has no non-zero token balances on Movement Network."
    
    # Format output - show all tokens individually
    result_lines = [f"Movement Network balances for {address}:\n"]
    for idx, token_data in enumerate(token_list, 1):
        balance = token_data["balance"]
        name = token_data["name"]
        symbol = token_data["symbol"]
        # Format with appropriate decimal places
        # For very small balances, show more decimal places to avoid showing as 0.000000
        if balance >= 1:
            formatted = f"{balance:.6f}".rstrip('0').rstrip('.')
        elif balance >= 0.000001:
            formatted = f"{balance:.6f}".rstrip('0').rstrip('.')
        else:
            # For very small balances (like WBTC.e with 0.00000013), show up to 8 decimal places
            # This ensures we don't display 0.000000 for tokens that actually have a balance
            formatted = f"{balance:.8f}".rstrip('0').rstrip('.')
            # If after stripping it's empty or just ".", show at least 8 decimals
            if not formatted or formatted == ".":
                formatted = f"{balance:.8f}"
        result_lines.append(f"{idx}. {name} ({symbol}): {formatted} {symbol}")
    
    return "\n".join(result_lines)


@tool
def get_balance(address: str, network: str = DEFAULT_NETWORK) -> str:
    """Get the balance of a cryptocurrency address on a specific network.
    
    This tool accepts both 42-character (Ethereum) and 66-character (Movement/Aptos) addresses.
    If address is 66 characters, it automatically uses Movement Network.

    Args:
        address: The cryptocurrency wallet address starting with 0x.
                 Accepts 42-character (Ethereum/BNB/Polygon) or 66-character (Movement/Aptos) addresses.
        network: The blockchain network (ethereum, bnb, polygon, movement, aptos, etc.)
                 If address is 66 characters, automatically uses "movement" network.

    Returns:
        The balance as a string
    """
    # Auto-detect Movement Network for 66-character addresses
    if len(address) == 66 and address.startswith("0x"):
        network = "movement"
    
    network_lower = network.lower()
    if network_lower in ["movement", "aptos"]:
        balances_data = fetch_movement_balances(address)
        return format_movement_balance_response(balances_data, address)
    return f"Balance for {address} on {network}: Not implemented yet (only Movement Network is currently supported)"


@tool
def get_token_balance(address: str, token: str, network: str = DEFAULT_NETWORK) -> str:
    """Get the balance of a specific token for an address on a network.
    
    This tool accepts both 42-character (Ethereum) and 66-character (Movement/Aptos) addresses.
    If address is 66 characters, it automatically uses Movement Network.

    Args:
        address: The cryptocurrency wallet address starting with 0x.
                 Accepts 42-character (Ethereum/BNB/Polygon) or 66-character (Movement/Aptos) addresses.
        token: The token symbol (e.g., USDC, USDT, DAI, MOVE)
        network: The blockchain network (ethereum, bnb, polygon, movement, aptos, etc.)
                 If address is 66 characters, automatically uses "movement" network.

    Returns:
        The token balance as a string
    """
    # Auto-detect Movement Network for 66-character addresses
    if len(address) == 66 and address.startswith("0x"):
        network = "movement"
    
    network_lower = network.lower()
    if network_lower in ["movement", "aptos"]:
        balances_data = fetch_movement_balances(address)
        if not balances_data.get("success", False):
            return f"Error fetching Movement balance: {balances_data.get('error', 'Unknown error')}"
        balances = balances_data.get("balances", [])
        token_upper = token.upper()
        for balance in balances:
            metadata = balance.get("metadata", {})
            symbol = metadata.get("symbol", "").upper()
            if symbol == token_upper or token_upper in symbol:
                amount = balance.get("amount", "0")
                decimals = int(metadata.get("decimals", 18))
                name = metadata.get("name", "Unknown Token")
                try:
                    amount_int = int(amount)
                    formatted_balance = amount_int / (10 ** decimals)
                    return f"{address} has {formatted_balance:.6f} {symbol} ({name}) on Movement Network"
                except (ValueError, TypeError):
                    return f"{address} has {amount} {symbol} (raw) on Movement Network"
        return f"No {token_upper} balance found for {address} on Movement Network"
    return f"Token balance for {address}: {token.upper()} on {network} - Not implemented yet (only Movement Network is currently supported)"


def get_tools() -> List[Any]:
    """Get the list of tools available to the agent."""
    return [get_balance, get_token_balance]


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


class BalanceAgent:
    def __init__(self):
        self._agent = self._build_agent()
        self._runner = Runner(
            app_name="balanceagent",
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
            {"messages": [{MESSAGE_KEY_ROLE: MESSAGE_ROLE_USER, MESSAGE_KEY_CONTENT: query}]},
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


class BalanceAgentExecutor(AgentExecutor):
    def __init__(self):
        self.agent = BalanceAgent()

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


def create_balance_agent_app(card_url: str) -> A2AStarletteApplication:
    """Create and configure the A2A server application for the balance agent.

    Args:
        card_url: The base URL where the agent card will be accessible

    Returns:
        A2AStarletteApplication instance configured for the balance agent
    """
    agent_card = AgentCard(
        name="Balance Agent",
        description=(
            "LangGraph powered agent that helps to get "
            "cryptocurrency balances across multiple chains"
        ),
        url=card_url,
        version="2.0.0",
        default_input_modes=["text"],
        default_output_modes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[create_agent_skill()],
        supports_authenticated_extended_card=False,
    )
    request_handler = DefaultRequestHandler(
        agent_executor=BalanceAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )
    return A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=request_handler,
        extended_agent_card=agent_card,
    )
