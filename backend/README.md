# Movement Nexus - Backend

**AI-Powered Multi-Agent Backend for Movement Network DeFi**

FastAPI backend orchestrating 9 specialized AI agents using LangGraph, A2A Protocol, AG-UI Protocol, and Google ADK SequentialAgent.

## Agents

The backend includes the following specialized agents:

1. **Balance Agent** (`/balance`) - Check cryptocurrency balances across multiple networks
2. **Bridge Agent** (`/bridge`) - Bridge tokens between different blockchain networks
3. **Lending Agent** (`/lending`, `/lending_comparison`) - Compare and manage lending operations
4. **Swap Agent** (`/swap`) - Execute token swaps on Movement Network
5. **Transfer Agent** (`/transfer`) - Transfer tokens between addresses
6. **Orchestrator Agent** (`/orchestrator`) - Coordinates multiple agents using AG-UI Protocol
7. **Premium Lending Agent** (`/premium_lending_agent`) - Advanced lending operations with premium features
8. **Sentiment & Trading Agent** (`/sentiment`) - Combined sentiment analysis and trading recommendations using Google ADK SequentialAgent

### Sentiment & Trading Agent

The Sentiment & Trading Agent combines cryptocurrency sentiment analysis with trading recommendations using **Google ADK SequentialAgent orchestration**. It uses a two-stage pipeline:

1. **Data Fetcher Agent**: Fetches sentiment data (sentiment balance, social volume, social dominance) and price data (historical prices, volumes) in parallel
2. **Trading Analysis Agent**: Analyzes technical indicators (RSI, MACD, moving averages) combined with sentiment data to generate buy/sell/hold recommendations

**Architecture:**
- Uses **Google ADK SequentialAgent** to orchestrate the analysis pipeline
- **Data Fetcher Agent** (LlmAgent): Fetches comprehensive market data
- **Trading Analysis Agent** (LlmAgent): Performs technical analysis and generates recommendations
- Tools execute in parallel when possible for optimal performance

**Features:**
- **Sentiment Analysis**: Get sentiment balance, social volume, and social dominance for any cryptocurrency
- **Technical Analysis**: RSI, MACD, moving averages (MA20, MA50, MA200), volatility, market phase detection
- **Trading Recommendations**: BUY/SELL/HOLD recommendations with:
  - Confidence level (0-100%)
  - Entry price, stop loss, and target prices
  - Risk level assessment
  - Detailed reasoning based on sentiment + technical indicators
- **Price Data**: USD price information with historical data
- **Volume Metrics**: Trading volume analysis
- **On-Chain Data**: Active addresses tracking
- **Trending Words**: Discover trending words in the crypto space

**Example Queries:**
- "Get sentiment balance for Bitcoin over the last week"
- "Should I buy or sell Bitcoin? Analyze sentiment and price trends"
- "What's the trading recommendation for Ethereum based on sentiment and technical analysis?"
- "Get Bitcoin price analysis with sentiment data"
- "Analyze Ethereum: sentiment, price trends, and trading recommendation"
- "How many times has Ethereum been mentioned on social media in the past 5 days?"
- "Tell me if there's been a big change in Bitcoin's social volume recently, with a 30% threshold"
- "What are the top 3 trending words in crypto over the past 3 days?"

**Response Format:**
```json
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
```

**Environment Variables:**
- `SANTIMENT_API_KEY` (Optional): Santiment API key for premium metrics. Some metrics (price, volume, active addresses) work without a key.
- `GOOGLE_API_KEY` (Required): Google AI Studio API key for Gemini model access (used by SequentialAgent orchestration)

**Configuration:**
The agent supports two modes (configurable in `create_sentiment_agent_app()`):
- **Orchestrated mode** (default): Uses SequentialAgent for combined sentiment+trading analysis
- **Simple mode**: Sentiment-only analysis (backward compatible)

## Setup

### Prerequisites

- Python 3.11 or higher
- pip or uv

### Installation

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -e ".[dev]"
   ```

3. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your configuration values.

### Running the Server

#### Local Development

Development server with auto-reload:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the Makefile:
```bash
make dev
```

#### Docker Development

Build and run with Docker:
```bash
docker build -t movement-backend .
docker run -p 8000:8000 --env-file .env movement-backend
```

Or use Docker Compose (recommended):
```bash
docker-compose up --build
```

To run in detached mode:
```bash
docker-compose up -d
```

To view logs:
```bash
docker-compose logs -f
```

To stop:
```bash
docker-compose down
```

### API Documentation

Once the server is running, access the interactive API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### API Endpoints

All agents are accessible via A2A Protocol (except Orchestrator which uses AG-UI Protocol):

- `GET /health` - Health check endpoint
- `POST /balance` - Balance Agent
- `POST /bridge` - Bridge Agent
- `POST /lending` - Lending Agent (unified)
- `POST /lending_comparison` - Lending Comparison Agent (backward compatibility)
- `POST /swap` - Swap Agent
- `POST /transfer` - Transfer Agent
- `POST /orchestrator` - Orchestrator Agent (AG-UI Protocol)
- `POST /premium_lending_agent` - Premium Lending Agent
- `POST /sentiment` - Sentiment & Trading Agent (uses Google ADK SequentialAgent)

Each agent endpoint supports A2A Protocol requests and provides an agent card at `{endpoint}/card` for discovery.

**Note:** The Sentiment Agent uses Google ADK SequentialAgent for orchestration, combining sentiment analysis with trading recommendations in a two-stage pipeline.

## Agent Orchestration

### Google ADK SequentialAgent

The Sentiment & Trading Agent uses **Google ADK SequentialAgent** for multi-stage agent orchestration:

**Architecture:**
```
User Query
    ↓
SequentialAgent
    ├─→ Data Fetcher Agent (Stage 1)
    │   ├─→ Fetch Sentiment Data (parallel tools)
    │   └─→ Fetch Price Data (parallel tools)
    │
    └─→ Trading Analysis Agent (Stage 2)
        ├─→ Calculate Technical Indicators
        ├─→ Combine Sentiment + Technical Analysis
        └─→ Generate Trading Recommendation
```

**Benefits:**
- **Sequential Processing**: Ensures data is fetched before analysis
- **Parallel Tool Execution**: Tools within each agent can execute in parallel
- **Session State Management**: Data flows between agents via session state
- **Error Handling**: Each stage can handle errors independently
- **Scalability**: Easy to add more analysis stages

**Implementation:**
- Uses `google.adk.agents.SequentialAgent` to chain sub-agents
- Each sub-agent is an `LlmAgent` with specific tools and instructions
- Session state (`session.state`) is used to pass data between agents
- Runner (`InMemoryRunner`) executes the agent pipeline

## Development

### Code Formatting

#### Local Formatting

Format code with Black:
```bash
make format
```

#### Docker Formatting

Format code in Docker:
```bash
make docker-format
```

Or directly:
```bash
docker-compose --profile format run --rm format
```

### Linting

#### Local Linting

Lint code with Ruff:
```bash
make lint
```

#### Docker Linting

Lint code in Docker:
```bash
make docker-lint
```

Or directly:
```bash
docker-compose --profile lint run --rm lint
```

### Testing

#### Local Testing

Run tests:
```bash
make test
```

#### Docker Testing

Run tests in Docker:
```bash
make docker-test
```

Or directly:
```bash
docker-compose --profile test run --rm test
```

Run tests with coverage:
```bash
make docker-test-coverage
```

Or directly:
```bash
docker-compose --profile test run --rm test pytest --cov=app --cov-report=html --cov-report=term
```

The coverage report will be generated in `htmlcov/` directory.

## Project Structure

```
backend/
├── app/
│   ├── agents/
│   │   ├── balance/
│   │   │   └── agent.py
│   │   ├── bridge/
│   │   │   └── agent.py
│   │   ├── lending_comparison/
│   │   │   ├── agent.py
│   │   │   ├── echelon_rates.py
│   │   │   └── moveposition_rates.py
│   │   ├── orchestrator/
│   │   │   └── agent.py
│   │   ├── premium_lending/
│   │   │   ├── agent.py
│   │   │   ├── echelon_rates.py
│   │   │   └── moveposition_rates.py
│   │   ├── sentiment/
│   │   │   ├── agent.py
│   │   │   ├── executor.py
│   │   │   ├── orchestrated_agent.py
│   │   │   ├── orchestrated_executor.py
│   │   │   ├── core/
│   │   │   │   ├── constants.py
│   │   │   │   └── response_validator.py
│   │   │   ├── services/
│   │   │   │   ├── executor_validator.py
│   │   │   │   ├── query_parser.py
│   │   │   │   └── response_builder.py
│   │   │   ├── tools/
│   │   │   │   └── santiment.py
│   │   │   └── trading_tools/
│   │   │       └── technical_analysis.py
│   │   ├── swap/
│   │   │   └── agent.py
│   │   └── transfer/
│   │       └── agent.py
│   └── main.py
├── tests/
├── .env.example
├── .gitignore
├── pyproject.toml
└── README.md
```

