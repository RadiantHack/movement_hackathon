"""
Combined Sentiment + Trading Agent using Google ADK SequentialAgent

This agent orchestrates sentiment analysis and trading recommendations using:
- SequentialAgent: Fetches data (sentiment + price), then performs trading analysis
"""

from __future__ import annotations

from google.adk.agents.llm_agent import LlmAgent
from google.adk.agents.sequential_agent import SequentialAgent

from .tools.santiment import (
    get_active_addresses,
    get_price_usd,
    get_sentiment_balance,
    get_social_dominance,
    get_social_volume,
    get_trending_words,
    get_volume_usd,
)
from .trading_tools.technical_analysis import calculate_technical_indicators

# Data Fetcher Agent: Fetches both sentiment and price data
# Tools can execute in parallel when called together
data_fetcher_agent = LlmAgent(
    name="DataFetcherAgent",
    model="gemini-2.0-flash-exp",
    instruction="""
    You are a Data Fetcher Agent. Your role is to fetch both sentiment and price data for trading analysis.

    AVAILABLE TOOLS:
    - get_sentiment_balance(asset, days) - Get sentiment balance for an asset
    - get_social_volume(asset, days) - Get social volume mentions
    - get_social_dominance(asset, days) - Get social dominance percentage
    - get_price_usd(asset, days) - Get USD price data with historical prices
    - get_volume_usd(asset, days) - Get trading volume data

    WORKFLOW:
    1. Parse the user query to extract:
       - Asset name (bitcoin, ethereum, BTC, ETH)
       - Number of days (default: 30 for price, 7 for sentiment)

    2. Call ALL relevant tools to fetch comprehensive data:
       - get_sentiment_balance(asset, 7)
       - get_social_volume(asset, 7)
       - get_price_usd(asset, 30) - for historical price array
       - get_volume_usd(asset, 30) - for historical volume array

    3. Store results in session state for next agent:
       - Store sentiment data: sentiment_balance, social_volume, social_dominance
       - Store price data: prices array, volumes array, current_price

    4. Return summary:
       {
         "asset": "bitcoin",
         "sentiment_data": {
           "sentiment_balance": 15.5,
           "social_volume": 12345,
           "social_dominance": 25.3
         },
         "price_data": {
           "current_price": 45000.00,
           "prices": [45000, 45100, ...],
           "volumes": [1234567890, ...]
         },
         "success": true
       }

    CRITICAL RULES:
    - Always fetch BOTH sentiment and price data
    - Use 30 days for price/volume data (needed for technical analysis)
    - Use 7 days for sentiment data (standard period)
    - Store all data in session state for trading analysis agent
    """,
    tools=[
        get_sentiment_balance,
        get_social_volume,
        get_social_dominance,
        get_price_usd,
        get_volume_usd,
    ],
)

# Trading Analysis Agent
trading_analysis_agent = LlmAgent(
    name="TradingAnalysisAgent",
    model="gemini-2.0-flash-exp",
    instruction="""
    You are a Trading Analysis Agent. Your role is to provide buy/sell/hold recommendations
    based on sentiment data and price/technical analysis.

    You receive data from previous agents:
    - Sentiment data: sentiment_balance, social_volume, social_dominance
    - Price data: prices array, volumes array, current_price

    AVAILABLE TOOLS:
    - calculate_technical_indicators(prices, volumes) - Calculate RSI, MACD, moving averages, etc.

    WORKFLOW:
    1. Extract sentiment data from session state (from SentimentFetcherAgent)
    2. Extract price/volume data from session state (from PriceFetcherAgent)
    3. Call calculate_technical_indicators with prices and volumes
    4. Analyze:
       - Technical indicators (RSI, MACD, market phase)
       - Sentiment indicators (sentiment balance, social volume)
       - Price trends and volatility
    5. Generate recommendation (BUY/SELL/HOLD) with:
       - Confidence level (0-100)
       - Entry price, stop loss, targets
       - Risk level
       - Reasons for recommendation

    Return JSON format:
    {
      "type": "trading_recommendation",
      "asset": "bitcoin",
      "recommendation": "BUY" | "SELL" | "HOLD",
      "confidence": 75.5,
      "current_price": 45000.00,
      "entry_price": 44800.00,
      "stop_loss": 44000.00,
      "targets": {
        "target_1": 46000.00,
        "target_2": 47000.00,
        "target_3": 48000.00
      },
      "technical_indicators": {
        "rsi": 45.5,
        "macd": {...},
        "market_phase": "Bull Market"
      },
      "sentiment_indicators": {
        "sentiment_balance": 15.5,
        "social_volume": 12345
      },
      "reasons": ["RSI is oversold", "Positive sentiment", "Bull market phase"],
      "risk_level": "Medium",
      "timeframe": "Short-term (1-7 days)",
      "success": true
    }

    CRITICAL RULES:
    - Always use calculate_technical_indicators for technical analysis
    - Combine sentiment and technical analysis for recommendation
    - Provide clear reasons for the recommendation
    - Set appropriate stop loss and targets based on support/resistance
    """,
    tools=[calculate_technical_indicators],
)

# Sequential Agent: Fetch data, then analyze
combined_sentiment_trading_agent = SequentialAgent(
    name="CombinedSentimentTradingAgent",
    sub_agents=[data_fetcher_agent, trading_analysis_agent],
    description="Combines sentiment analysis and trading recommendations: fetches data, then analyzes",
)

# Root agent for ADK compatibility
root_agent = combined_sentiment_trading_agent
