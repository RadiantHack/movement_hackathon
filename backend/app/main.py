"""
Main FastAPI application entry point.

This module creates and configures the main FastAPI application, registers
agent applications, and sets up middleware and health check endpoints.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI

# Load environment variables from .env file
load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.agents.balance.agent import create_balance_agent_app
from app.agents.bridge.agent import create_bridge_agent_app
from app.agents.lending_comparison.agent import (
    create_lending_agent_app,
    create_lending_comparison_agent_app,  # Backward compatibility alias
)
from app.agents.orchestrator.agent import create_orchestrator_agent_app
from app.agents.premium_lending.agent import create_lending_agent_app as create_premium_lending_agent_app
from app.agents.sentiment.agent import create_sentiment_agent_app
from app.agents.swap.agent import create_swap_agent_app
from app.agents.transfer.agent import create_transfer_agent_app

# Configuration constants
DEFAULT_AGENTS_PORT = 8000
API_VERSION = "0.1.0"
SERVICE_NAME = "backend-api"

# Environment variable keys
ENV_AGENTS_PORT = "AGENTS_PORT"
ENV_RENDER_EXTERNAL_URL = "RENDER_EXTERNAL_URL"


def get_base_url() -> str:
    """Get the base URL for agent card endpoints.

    Returns:
        Base URL from environment or constructed from port
    """
    port = int(os.getenv(ENV_AGENTS_PORT, str(DEFAULT_AGENTS_PORT)))
    return os.getenv(ENV_RENDER_EXTERNAL_URL, f"http://localhost:{port}")


def register_agents(app: FastAPI) -> None:
    """Register all agent applications with the main FastAPI app.

    Args:
        app: The FastAPI application instance to mount agents on
    """
    base_url = get_base_url()

    # Balance Agent (A2A Protocol)
    balance_agent_app = create_balance_agent_app(card_url=f"{base_url}/balance")
    app.mount("/balance", balance_agent_app.build())

    # Bridge Agent (A2A Protocol)
    bridge_agent_app = create_bridge_agent_app(card_url=f"{base_url}/bridge")
    app.mount("/bridge", bridge_agent_app.build())

    # Unified Lending Agent (A2A Protocol) - Combines comparison and operations
    # Both endpoints point to the same unified agent for backward compatibility
    lending_agent_app = create_lending_agent_app(card_url=f"{base_url}/lending")
    app.mount("/lending", lending_agent_app.build())

    # Lending Comparison endpoint (same unified agent, different route for backward compatibility)
    lending_comparison_agent_app = create_lending_comparison_agent_app(
        card_url=f"{base_url}/lending_comparison"
    )
    app.mount("/lending_comparison", lending_comparison_agent_app.build())

    # Swap Agent (A2A Protocol)
    swap_agent_app = create_swap_agent_app(card_url=f"{base_url}/swap")
    app.mount("/swap", swap_agent_app.build())

    # Transfer Agent (A2A Protocol)
    transfer_agent_app = create_transfer_agent_app(card_url=f"{base_url}/transfer")
    app.mount("/transfer", transfer_agent_app.build())

    # Orchestrator Agent (AG-UI ADK Protocol)
    orchestrator_agent_app = create_orchestrator_agent_app()
    app.mount("/orchestrator", orchestrator_agent_app)

    # Premium Lending Agent (A2A Protocol)
    premium_lending_agent_app = create_premium_lending_agent_app(
        card_url=f"{base_url}/premium_lending_agent"
    )
    app.mount("/premium_lending_agent", premium_lending_agent_app.build())

    # Sentiment Agent (A2A Protocol)
    sentiment_agent_app = create_sentiment_agent_app(card_url=f"{base_url}/sentiment")
    app.mount("/sentiment", sentiment_agent_app.build())


def create_app() -> FastAPI:
    """Create and configure the main FastAPI application.

    Returns:
        Configured FastAPI application instance
    """
    app = FastAPI(
        title="Backend API",
        description="Backend server with FastAPI",
        version=API_VERSION,
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register health check endpoint
    @app.get("/health")
    async def health_check() -> JSONResponse:
        """Health check endpoint for monitoring and load balancers."""
        return JSONResponse(
            content={
                "status": "healthy",
                "service": SERVICE_NAME,
                "version": API_VERSION,
            }
        )

    # Register all agent applications
    register_agents(app)

    return app


# Create the application instance
app = create_app()
