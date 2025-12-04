"""
Main FastAPI application entry point.

This module creates and configures the main FastAPI application, registers
agent applications, and sets up middleware and health check endpoints.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.agents.balance import create_balance_agent_app
from app.agents.multichain_liquidity import create_multichain_liquidity_agent_app
from app.agents.orchestrator import create_orchestrator_agent_app
# from app.agents.token_research.agent_app import create_token_research_agent_app

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
    
    # Multi-Chain Liquidity Agent (A2A Protocol)
    liquidity_agent_app = create_multichain_liquidity_agent_app(card_url=f"{base_url}/liquidity")
    app.mount("/liquidity", liquidity_agent_app.build())
    
    # Token Research Agent (A2A Protocol)
    # token_research_agent_app = create_token_research_agent_app(card_url=f"{base_url}/token-research")
    # app.mount("/token-research", token_research_agent_app.build())
    
    # Orchestrator Agent (AG-UI ADK Protocol)
    orchestrator_agent_app = create_orchestrator_agent_app()
    app.mount("/orchestrator", orchestrator_agent_app)


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
