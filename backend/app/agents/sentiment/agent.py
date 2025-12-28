"""
Sentiment Agent Definition

Defines the SentimentAgent class that handles sentiment analysis queries.
Adapted for Movement repository pattern with create_sentiment_agent_app() function.
"""

import os
import logging
from typing import Any

from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from app.x402 import X402PaywallMiddleware, RouteConfig

from .core.constants import (
    ERROR_VALIDATION_FAILED,
)
from .core.response_validator import (
    build_error_response,
    log_response_info,
    validate_and_serialize_response,
    validate_json,
)

# Import executors inside function to avoid circular import
from .services.query_parser import (
    parse_sentiment_query,
    parse_social_dominance_query,
    parse_social_shift_query,
    parse_social_volume_query,
    parse_trending_words_query,
)
from .services.response_builder import (
    build_active_addresses_response,
    build_price_response,
    build_sentiment_balance_response,
    build_social_dominance_response,
    build_social_shift_response,
    build_social_volume_response,
    build_trending_words_response,
    build_volume_response,
)
from .tools.santiment import (
    alert_social_shift,
    get_active_addresses,
    get_price_btc,
    get_price_usd,
    get_sentiment_balance,
    get_social_dominance,
    get_social_volume,
    get_transaction_volume,
    get_trending_words,
    get_volume_btc,
    get_volume_usd,
)


class SentimentAgent:
    """Agent that provides cryptocurrency sentiment analysis using Santiment API."""

    async def invoke(self, query: str, session_id: str) -> str:
        """Invoke the agent with a query."""
        print(f"🔍 Sentiment Agent received query: {query}")
        query_lower = query.lower()

        try:
            # Determine which metric to fetch based on query
            if "trending" in query_lower or "trending words" in query_lower:
                days, top_n = parse_trending_words_query(query)
                result = get_trending_words(days, top_n)
                response = build_trending_words_response(days, top_n, result)

            elif "social shift" in query_lower or "spike" in query_lower or "drop" in query_lower:
                asset, threshold, days = parse_social_shift_query(query)
                result = alert_social_shift(asset, threshold, days)
                response = build_social_shift_response(asset, threshold, days, result)

            elif "social dominance" in query_lower or "dominance" in query_lower:
                asset, days = parse_social_dominance_query(query)
                result = get_social_dominance(asset, days)
                response = build_social_dominance_response(asset, days, result)

            elif "social volume" in query_lower or "mentions" in query_lower:
                asset, days = parse_social_volume_query(query)
                result = get_social_volume(asset, days)
                response = build_social_volume_response(asset, days, result)

            elif "sentiment" in query_lower or "sentiment balance" in query_lower:
                asset, days = parse_sentiment_query(query)
                result = get_sentiment_balance(asset, days)
                response = build_sentiment_balance_response(asset, days, result)

            elif "price" in query_lower and "btc" in query_lower:
                asset, days = parse_sentiment_query(query)
                result = get_price_btc(asset, days)
                response = build_price_response("price_btc", asset, days, result)

            elif "price" in query_lower or "usd price" in query_lower:
                asset, days = parse_sentiment_query(query)
                result = get_price_usd(asset, days)
                response = build_price_response("price_usd", asset, days, result)

            elif (
                "volume" in query_lower
                and "btc" in query_lower
                and "transaction" not in query_lower
            ):
                asset, days = parse_sentiment_query(query)
                result = get_volume_btc(asset, days)
                response = build_volume_response("volume_btc", asset, days, result)

            elif "volume" in query_lower and "transaction" in query_lower:
                asset, days = parse_sentiment_query(query)
                result = get_transaction_volume(asset, days)
                response = build_volume_response("transaction_volume", asset, days, result)

            elif "volume" in query_lower or "trading volume" in query_lower:
                asset, days = parse_sentiment_query(query)
                result = get_volume_usd(asset, days)
                response = build_volume_response("volume_usd", asset, days, result)

            elif "active addresses" in query_lower or "active address" in query_lower:
                asset, days = parse_sentiment_query(query)
                result = get_active_addresses(asset, days)
                response = build_active_addresses_response(asset, days, result)

            else:
                # Default to sentiment balance if unclear
                asset, days = parse_sentiment_query(query)
                result = get_sentiment_balance(asset, days)
                response = build_sentiment_balance_response(asset, days, result)

            validated_response = validate_and_serialize_response(response)
            log_response_info(query, validated_response)
            validate_json(validated_response)
            return validated_response

        except Exception as e:
            print(f"❌ Error in sentiment agent: {e}")
            import traceback

            traceback.print_exc()
            error_msg = f"{ERROR_VALIDATION_FAILED}: {str(e)}"
            return build_error_response("unknown", error_msg)


def create_sentiment_agent_app(
    card_url: str | None = None, use_orchestrated: bool = True
) -> A2AStarletteApplication:
    """Create and configure the Sentiment Agent A2A application.

    Args:
        card_url: Base URL for the agent card endpoint. If None, uses environment variable
                 or defaults to localhost:8000/sentiment
        use_orchestrated: If True, uses combined sentiment+trading agent with SequentialAgent.
                         If False, uses simple sentiment-only agent.

    Returns:
        Configured A2AStarletteApplication instance
    """
    if card_url is None:
        port = int(os.getenv("PORT", os.getenv("AGENTS_PORT", 8000)))
        card_url = os.getenv("RENDER_EXTERNAL_URL", f"http://localhost:{port}/sentiment")

    if use_orchestrated:
        skill = AgentSkill(
            id="sentiment_trading_agent",
            name="Combined Sentiment & Trading Analysis Agent",
            description="Provides cryptocurrency sentiment analysis AND trading recommendations using Santiment API and technical analysis. Combines sentiment data (sentiment balance, social volume, social dominance) with price data and technical indicators (RSI, MACD, moving averages) to generate buy/sell/hold recommendations.",
            tags=[
                "sentiment",
                "trading",
                "crypto",
                "social",
                "analysis",
                "santiment",
                "price",
                "volume",
                "technical-analysis",
                "trading-recommendations",
            ],
            examples=[
                "Get sentiment balance for Bitcoin over the last week",
                "Should I buy or sell Bitcoin? Analyze sentiment and price trends",
                "What's the trading recommendation for Ethereum based on sentiment and technical analysis?",
                "Get Bitcoin price analysis with sentiment data",
                "Analyze Ethereum: sentiment, price trends, and trading recommendation",
            ],
        )
        agent_name = "Sentiment & Trading Agent"
        agent_description = "Combined agent that provides cryptocurrency sentiment analysis AND trading recommendations using Google ADK SequentialAgent orchestration"
    else:
        skill = AgentSkill(
            id="sentiment_agent",
            name="Cryptocurrency Sentiment Analysis Agent",
            description="Provides cryptocurrency sentiment analysis using Santiment API, including sentiment balance, social volume, social dominance, trending words, social shifts, price data (USD/BTC), trading volume, transaction volume, and active addresses",
            tags=[
                "sentiment",
                "crypto",
                "social",
                "analysis",
                "santiment",
                "price",
                "volume",
                "on-chain",
            ],
            examples=[
                "Get sentiment balance for Bitcoin over the last week",
                "How many times has Ethereum been mentioned on social media in the past 5 days?",
                "Tell me if there's been a big change in Bitcoin's social volume recently, with a 30% threshold",
                "What are the top 3 trending words in crypto over the past 3 days?",
                "How dominant is Ethereum in social media discussions this week?",
                "Get Bitcoin price in USD for the last 7 days",
                "What's Ethereum's trading volume in USD over the past week?",
                "Show me Bitcoin's active addresses for the last 30 days",
                "Get transaction volume for Ethereum over the past 7 days",
            ],
        )
        agent_name = "Sentiment Agent"
        agent_description = "Agent that provides cryptocurrency sentiment analysis, price data, volume metrics, and on-chain data using Santiment API (includes free metrics)"

    public_agent_card = AgentCard(
        name=agent_name,
        description=agent_description,
        url=card_url,
        version="1.0.0",
        defaultInputModes=["text"],
        defaultOutputModes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[skill],
        supportsAuthenticatedExtendedCard=False,
    )

    # Import executors here to avoid circular import
    from .executor import SentimentExecutor
    from .orchestrated_executor import OrchestratedSentimentExecutor

    # Use orchestrated executor if enabled, otherwise use simple executor
    executor = OrchestratedSentimentExecutor() if use_orchestrated else SentimentExecutor()

    request_handler = DefaultRequestHandler(
        agent_executor=executor,
        task_store=InMemoryTaskStore(),
    )

    server = A2AStarletteApplication(
        agent_card=public_agent_card,
        http_handler=request_handler,
        extended_agent_card=public_agent_card,
    )

    return SentimentAgentAppWithMiddleware(server)


class SentimentAgentAppWithMiddleware:
    """Wrapper for A2AStarletteApplication with x402 payment middleware."""

    def __init__(self, a2a_app: A2AStarletteApplication):
        self._a2a_app = a2a_app

    def build(self) -> Any:
        """Build the Starlette app and apply x402 payment middleware."""
        app = self._a2a_app.build()

        # Get payment configuration from environment - REQUIRED
        movement_pay_to = os.getenv("MOVEMENT_PAY_TO") or os.getenv("NEXT_PUBLIC_MOVEMENT_PAY_TO")

        # MOVEMENT_PAY_TO is required - throw error if not configured
        if not movement_pay_to:
            error_msg = (
                "MOVEMENT_PAY_TO environment variable is required for sentiment/trading agent. "
                "Please set MOVEMENT_PAY_TO to your payment recipient address."
            )
            logger = logging.getLogger(__name__)
            logger.error(error_msg)
            raise ValueError(error_msg)

        # Define protected routes for sentiment/trading agent
        # Note: Route keys should match the path when mounted (e.g., "/sentiment" when mounted at /sentiment)
        routes = {
            # Protect all POST requests to the agent
            "POST /": RouteConfig(
                network="movement",
                asset="0x1::aptos_coin::AptosCoin",
                max_amount_required="100000000",  # 1 MOVE (8 decimals)
                description="Sentiment & Trading Agent access - Pay to unlock sentiment analysis and trading recommendations",
                mime_type="application/json",
                max_timeout_seconds=600,
            ),
        }

        # Always add x402Paywall middleware to require payment
        app.add_middleware(
            X402PaywallMiddleware,
            pay_to=movement_pay_to,
            routes=routes,
            skip_paths=[
                "/.well-known/agent.json",
                "/.well-known/agent-card.json",
            ],
        )

        return app
