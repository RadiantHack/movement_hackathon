# Movement Nexus

**Your AI-Powered Gateway to Movement Network DeFi**

Multi-agent AI platform orchestrating 9 specialized agents for seamless DeFi operations on Movement Network. Built for the Movement M1 Hackathon.

## Features

- 🤖 **9 Specialized AI Agents**: Balance, Bridge, Lending, Swap, Transfer, Orchestrator, Premium Lending, Sentiment & Trading
- 🎯 **Intelligent Orchestration**: Gemini 2.5 Pro-powered orchestrator coordinates all agents seamlessly
- 🔗 **Multi-Protocol Architecture**: AG-UI Protocol (frontend ↔ orchestrator) + A2A Protocol (orchestrator ↔ agents)
- ⚡ **LangGraph-Powered**: Each agent uses LangGraph for sophisticated reasoning
- 🎮 **Interactive Quest System**: Onboarding quests guide beginners through DeFi operations step-by-step
- 🌐 **Full-Stack Integration**: Next.js 15 frontend + FastAPI backend
- 🔐 **Privy Authentication**: Secure wallet connection and user management
- 📊 **Advanced Analytics**: Sentiment analysis + trading recommendations using Google ADK SequentialAgent
- 💎 **Premium Features**: Advanced lending operations and premium chat interface

## How to Run

### Quick Start

#### Option 1: Local Development

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Frontend will be available at http://localhost:3000

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
cd ..
make backend-dev
```
Backend will be available at http://localhost:8000

#### Option 2: Docker (Backend)

```bash
# From project root
cp backend/.env.example backend/.env
make docker-up
```
Backend will be available at http://localhost:8000

### Detailed Setup

## Setup

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Set up Privy authentication:**
   - Create a `.env.local` file in the `frontend` directory
   - Copy the example file: `cp .env.example .env.local`
   - Get your Privy credentials from [Privy Dashboard](https://dashboard.privy.io):
     - **App ID**: From your app settings
     - **Client ID**: Optional, for multi-environment setup
     - **App Secret**: Required for server-side operations (transfers, wallet operations)
       - Get this from Settings → API Keys in Privy Dashboard
   - Update `.env.local` with your actual values:
     ```
     NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
     NEXT_PUBLIC_PRIVY_CLIENT_ID=your-privy-client-id  # Optional
     PRIVY_APP_SECRET=your-privy-app-secret  # Required for transfers
     ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Open [http://localhost:3000](http://localhost:3000) in your browser

### Backend Setup (Local)

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -e ".[dev]"
   ```
   Or from project root:
   ```bash
   make backend-install
   ```

4. **Create a `.env` file:**
   ```bash
   cp .env.example .env
   ```

5. **Update `.env` with your configuration values (if needed).**

6. **Run the development server:**
   From project root:
   ```bash
   make backend-dev
   ```
   Or from backend directory:
   ```bash
   make dev
   ```
   Or directly:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

7. **Access the API documentation:**
   - Swagger UI: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc
   - Health Check: http://localhost:8000/health

### Backend Setup (Docker)

1. **Create a `.env` file (from project root):**
   ```bash
   cp backend/.env.example backend/.env
   ```

2. **Build and run with Docker Compose (from project root):**
   ```bash
   make docker-up
   ```
   Or from backend directory:
   ```bash
   cd backend
   docker-compose up --build
   ```

3. **The API will be available at:**
   - API: http://localhost:8000
   - Swagger UI: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc
   - Health Check: http://localhost:8000/health

4. **Useful Docker commands (from project root):**
   ```bash
   # Stop containers
   make docker-down
   
   # View logs
   make docker-logs
   
   # Run in background
   make docker-up-detached
   
   # Open shell in container
   make docker-shell
   
   # Run tests
   make docker-test
   
   # Format code
   make docker-format
   
   # Lint code
   make docker-lint
   ```

### Privy Authentication

This project uses [Privy](https://privy.io) for authentication and wallet management. The setup includes:

- **PrivyProvider**: Wraps the app in `app/providers.tsx`
- **Embedded Wallets**: Automatically created for users without wallets
- **Ready State**: Use `usePrivy` hook to check when Privy is ready

Example usage:
```typescript
import { usePrivy } from '@privy-io/react-auth';

const { ready, authenticated, user, login, logout } = usePrivy();
```

See `app/components/privy-example.tsx` for a complete example.

For more information, visit the [Privy React Documentation](https://docs.privy.io/basics/react/setup).

## Running Both Services

To run both frontend and backend simultaneously:

**Terminal 1 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 2 - Backend (Local):**
```bash
# From project root
make backend-dev
```

**Terminal 2 - Backend (Docker):**
```bash
# From project root
make docker-up
```

Both services will be available:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Agent Ecosystem

### Core Infrastructure Agents

1. **Balance Agent** (`/balance`)
   - Check cryptocurrency balances on Movement Network
   - Supports native MOVE token and all ERC-20 tokens
   - Fetches popular/trending tokens with balances
   - Uses Movement Network indexer API

2. **Bridge Agent** (`/bridge`)
   - Cross-chain asset bridging via Movement Bridge
   - Bridges between Ethereum, BNB, Polygon, and Movement Network
   - Supports native tokens (ETH, BNB, MATIC) and ERC-20 tokens (USDC, USDT, DAI)
   - Transaction status tracking and fee estimation

3. **Transfer Agent** (`/transfer`)
   - Transfer tokens between addresses on Movement Network
   - Supports all Movement Network tokens
   - Automatic wallet address detection

4. **Swap Agent** (`/swap`)
   - Execute token swaps on Movement Network
   - Integrates with Mosaic API for quotes
   - Supports verified tokens (MOVE, USDC.e, USDT.e, WBTC.e, WETH.e, etc.)

### DeFi Agents

5. **Lending Agent** (`/lending`)
   - Unified lending operations for MovePosition & Echelon protocols
   - Supply collateral and borrow assets
   - Compare lending/borrowing rates between protocols
   - Repay loans and check health factors
   - Platform selection recommendations

6. **Premium Lending Agent** (`/premium_lending_agent`)
   - Advanced lending operations with premium features
   - Enhanced rate comparisons and analytics
   - Advanced risk assessment

### Orchestration & Analytics

7. **Orchestrator Agent** (`/orchestrator`)
   - Coordinates multiple specialized agents using AG-UI Protocol
   - Powered by Google Gemini 2.5 Pro
   - Intelligent routing of user queries to appropriate agents
   - Sequential agent execution for optimal performance

8. **Sentiment & Trading Agent** (`/sentiment`)
   - Combined sentiment analysis and trading recommendations
   - Uses Google ADK SequentialAgent for multi-stage orchestration
   - **Data Fetcher Agent**: Fetches sentiment data (sentiment balance, social volume, social dominance) and price data
   - **Trading Analysis Agent**: Analyzes technical indicators (RSI, MACD, moving averages) and generates buy/sell/hold recommendations
   - Features:
     - Sentiment balance, social volume, and social dominance tracking
     - Technical analysis (RSI, MACD, MA20/50/200, volatility)
     - Trading recommendations with confidence levels, entry/exit prices, stop loss, and target prices
     - Risk level assessment and detailed reasoning

### Agent Communication

- **A2A Protocol**: Agent-to-Agent communication between orchestrator and specialized agents
- **AG-UI Protocol**: Frontend-to-Orchestrator communication via CopilotKit
- **A2A Middleware**: Transparent agent routing and tool injection

## Tech Stack

### Frontend
- ✅ **Next.js 15** with App Router
- ✅ **TypeScript** for type safety
- ✅ **Tailwind CSS** for styling with dark mode support
- ✅ **CopilotKit** for AI chat interface and agent integration
- ✅ **Privy** for authentication and wallet management
- ✅ **PWA Support** with service workers
- ✅ **Quest System** for interactive onboarding
- ✅ **Redux Toolkit** for state management
- ✅ **Aptos SDK** for Movement Network integration

### Backend
- ✅ **FastAPI** with async support
- ✅ **LangGraph** for agent orchestration and reasoning
- ✅ **OpenAI GPT-4** for specialized agents (Balance, Bridge, Lending, Swap, Transfer)
- ✅ **Google Gemini 2.5 Pro** for orchestrator agent
- ✅ **Google ADK SequentialAgent** for multi-stage agent pipelines (Sentiment & Trading Agent)
- ✅ **A2A Protocol** for agent-to-agent communication
- ✅ **AG-UI Protocol** for frontend integration
- ✅ **Docker** support with docker-compose
- ✅ **Movement Network Indexer** for blockchain data
- ✅ **Mosaic API** for token swap quotes
- ✅ **Santiment API** for sentiment data (optional)

## Architecture

### Communication Flow

```
Frontend (CopilotKit)
    ↓ AG-UI Protocol
Orchestrator Agent (Gemini 2.5 Pro)
    ↓ A2A Protocol
Specialized Agents (LangGraph + GPT-4)
    ↓ Tools & APIs
Movement Network / External APIs
```

### Key Components

1. **Frontend Middleware** (`frontend/app/api/copilotkit/route.ts`)
   - A2A Middleware Agent wraps orchestrator
   - Injects `send_message_to_a2a_agent` tool
   - Handles wallet address extraction from readable context
   - Beginner detection and quest system integration

2. **Orchestrator Agent** (`backend/app/agents/orchestrator/agent.py`)
   - Uses Google ADK LlmAgent with Gemini 2.5 Pro
   - Routes queries to appropriate specialized agents
   - Enforces sequential agent execution
   - Validates wallet addresses and network parameters

3. **Specialized Agents** (`backend/app/agents/*/agent.py`)
   - Each agent uses LangGraph for reasoning
   - Implements A2A Protocol AgentExecutor interface
   - Provides agent cards for discovery
   - Tools execute blockchain operations and API calls

4. **Quest System** (`frontend/app/components/quest/`)
   - Interactive onboarding for beginners
   - Detects beginner keywords in chat
   - Guides users through 5 core DeFi operations
   - Auto-detects quest step completion

## Frontend Pages

- **`/`** - Landing page with authentication
- **`/chat`** - Main AI chat interface with orchestrator
- **`/premiumchat`** - Premium chat with access to premium agents
- **`/overview`** - Portfolio overview with token balances
- **`/positions`** - MovePosition lending positions
- **`/echelon`** - Echelon lending interface
- **`/swap`** - Token swap interface
- **`/transfer`** - Token transfer interface
- **`/bridge`** - Cross-chain bridge interface

## Environment Variables

### Frontend (`.env.local`)
```bash
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_PRIVY_CLIENT_ID=your-privy-client-id  # Optional
PRIVY_APP_SECRET=your-privy-app-secret  # Required for transfers
```

### Backend (`.env`)
```bash
# Required
OPENAI_API_KEY=your-openai-api-key
GOOGLE_API_KEY=your-google-api-key

# Optional
OPENAI_MODEL=gpt-4o-mini  # Default model for agents
MOVEMENT_INDEXER_URL=...  # Movement Network indexer endpoint
MOVEMENT_RPC_URL=...      # Movement Network RPC endpoint
SANTIMENT_API_KEY=...     # Optional, for premium sentiment metrics

# Deployment
RAILWAY_PUBLIC_DOMAIN=...  # For Railway deployments
RENDER_EXTERNAL_URL=...    # For Render deployments
AGENTS_PORT=8000           # Backend port
```

## Development

### Code Formatting

**Frontend:**
```bash
cd frontend
npm run format
```

**Backend:**
```bash
make format-backend
# or
make docker-format
```

### Linting

**Frontend:**
```bash
cd frontend
npm run format:check
```

**Backend:**
```bash
make lint-backend
# or
make docker-lint
```

### Testing

**Backend:**
```bash
make test-backend
# or
make docker-test
```

## Project Structure

```
movement/
├── frontend/
│   ├── app/
│   │   ├── api/              # API routes (CopilotKit, agents)
│   │   ├── components/       # React components
│   │   │   ├── chat/         # Chat interface components
│   │   │   ├── quest/        # Quest system components
│   │   │   └── features/     # Feature-specific components
│   │   ├── [pages]/         # Next.js pages
│   │   └── utils/            # Utility functions
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── agents/           # All agent implementations
│   │   │   ├── balance/
│   │   │   ├── bridge/
│   │   │   ├── lending_comparison/
│   │   │   ├── orchestrator/
│   │   │   ├── premium_lending/
│   │   │   ├── sentiment/
│   │   │   ├── swap/
│   │   │   └── transfer/
│   │   ├── facilitator/      # x402 payment protocol
│   │   └── main.py           # FastAPI app entry point
│   └── pyproject.toml
└── Makefile                  # Development commands
```

## Learn More

- [Movement Network](https://movementlabs.xyz)
- [CopilotKit Documentation](https://docs.copilotkit.ai)
- [Privy Documentation](https://docs.privy.io)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Google ADK Documentation](https://ai.google.dev/adk)
- [A2A Protocol](https://github.com/ag-ui/a2a-sdk)
- [AG-UI Protocol](https://github.com/ag-ui/ag-ui-adk)
