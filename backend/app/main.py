"""
Main FastAPI application entry point.

This module creates and configures the main FastAPI application, registers
agent applications, and sets up middleware and health check endpoints.
"""

import os
import logging

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
from app.facilitator.routes import router as facilitator_router

# Configuration constants
DEFAULT_AGENTS_PORT = 8000
API_VERSION = "0.1.0"
SERVICE_NAME = "backend-api"

# Environment variable keys
ENV_AGENTS_PORT = "AGENTS_PORT"
ENV_RENDER_EXTERNAL_URL = "RENDER_EXTERNAL_URL"


def get_base_url() -> str:
    """Get the base URL for agent card endpoints.

    Checks for Railway deployment first (RAILWAY_PUBLIC_DOMAIN), then Render (RENDER_EXTERNAL_URL),
    then falls back to localhost for local development.

    Returns:
        Base URL from environment or constructed from port
    """
    logger = logging.getLogger(__name__)
    
    # Railway deployment - check for RAILWAY_PUBLIC_DOMAIN first
    railway_url = os.getenv("RAILWAY_PUBLIC_DOMAIN")
    if railway_url:
        # Railway URLs are typically just the domain, add https:// if not present
        base_url = f"https://{railway_url}" if not railway_url.startswith("http") else railway_url
        logger.info(f"[get_base_url] Using Railway URL: {base_url}")
        return base_url
    
    # Render deployment - check for RENDER_EXTERNAL_URL
    render_url = os.getenv(ENV_RENDER_EXTERNAL_URL)
    if render_url:
        logger.info(f"[get_base_url] Using Render URL: {render_url}")
        return render_url
    
    # Local development - default to localhost
    port = int(os.getenv(ENV_AGENTS_PORT, str(DEFAULT_AGENTS_PORT)))
    base_url = f"http://localhost:{port}"
    logger.info(f"[get_base_url] Using localhost URL: {base_url}")
    return base_url


def register_agents(app: FastAPI) -> None:
    """Register all agent applications with the main FastAPI app.

    Args:
        app: The FastAPI application instance to mount agents on
    """
    base_url = get_base_url()

    # Balance Agent (A2A Protocol)
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    balance_agent_app = create_balance_agent_app(card_url=f"{base_url}/balance/")
    app.mount("/balance", balance_agent_app.build())

    # Bridge Agent (A2A Protocol)
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    bridge_agent_app = create_bridge_agent_app(card_url=f"{base_url}/bridge/")
    app.mount("/bridge", bridge_agent_app.build())

    # Unified Lending Agent (A2A Protocol) - Combines comparison and operations
    # Both endpoints point to the same unified agent for backward compatibility
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    lending_agent_app = create_lending_agent_app(card_url=f"{base_url}/lending/")
    app.mount("/lending", lending_agent_app.build())

    # Lending Comparison endpoint (same unified agent, different route for backward compatibility)
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    lending_comparison_agent_app = create_lending_comparison_agent_app(
        card_url=f"{base_url}/lending_comparison/"
    )
    app.mount("/lending_comparison", lending_comparison_agent_app.build())

    # Swap Agent (A2A Protocol)
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    swap_agent_app = create_swap_agent_app(card_url=f"{base_url}/swap/")
    app.mount("/swap", swap_agent_app.build())

    # Transfer Agent (A2A Protocol)
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    transfer_agent_app = create_transfer_agent_app(card_url=f"{base_url}/transfer/")
    app.mount("/transfer", transfer_agent_app.build())

    # Orchestrator Agent (AG-UI ADK Protocol)
    orchestrator_agent_app = create_orchestrator_agent_app()
    app.mount("/orchestrator", orchestrator_agent_app)

    # Premium Lending Agent (A2A Protocol)
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    premium_lending_agent_app = create_premium_lending_agent_app(
        card_url=f"{base_url}/premium_lending_agent/"
    )
    app.mount("/premium_lending_agent", premium_lending_agent_app.build())

    # Sentiment Agent (A2A Protocol)
    # CRITICAL: Add trailing slash to card_url to avoid 307 redirect (POST -> GET conversion)
    sentiment_agent_app = create_sentiment_agent_app(card_url=f"{base_url}/sentiment/")
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

    # Register facilitator routes (x402 payment protocol)
    app.include_router(facilitator_router)

    # Register all agent applications
    register_agents(app)

    return app


# Create the application instance
app = create_app()
