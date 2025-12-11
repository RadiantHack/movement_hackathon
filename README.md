# Movement Nexus

**Your AI-Powered Gateway to Movement Network DeFi**

Multi-agent AI platform orchestrating 9 specialized agents for seamless DeFi operations on Movement Network. Built for the Movement M1 Hackathon.

## Features

- 🤖 **9 Specialized AI Agents**: Bridge, OrderBook, Prediction, Liquidity, Yield Optimizer, Lending, Bitcoin DeFi, Stablecoin, Analytics
- 🎯 **Intelligent Orchestration**: Gemini-powered orchestrator coordinates all agents seamlessly
- 🔗 **Multi-Protocol Architecture**: AG-UI Protocol (frontend ↔ orchestrator) + A2A Protocol (orchestrator ↔ agents)
- ⚡ **LangGraph-Powered**: Each agent uses LangGraph for sophisticated reasoning
- 🌐 **Full-Stack Integration**: Next.js frontend + FastAPI backend
- 🔐 **Privy Authentication**: Secure wallet connection and user management

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

### Infrastructure
- **Balance Agent** - Multi-chain cryptocurrency balance checking
- **Bridge Agent** - Cross-chain asset bridging via Movement Bridge

### Trading
- **OrderBook Agent** - ClobX DEX trading (limit/market orders)
- **Prediction Agent** - BRKT prediction markets

### DeFi
- **Liquidity Agent** - Meridian & Coral Finance pool management
- **Yield Optimizer Agent** - Canopy yield marketplace optimization
- **Lending Agent** - MovePosition & Echelon lending/borrowing
- **Bitcoin DeFi Agent** - Avalon Labs Bitcoin DeFi operations
- **Stablecoin Agent** - Ethena stablecoin protocol

### Analytics
- **Analytics Agent** - Flipside protocol analytics and reporting

## Tech Stack

### Frontend
- ✅ Next.js 15 with App Router
- ✅ TypeScript
- ✅ Tailwind CSS
- ✅ CopilotKit for AI chat interface
- ✅ Privy Authentication
- ✅ PWA Support

### Backend
- ✅ FastAPI with async support
- ✅ LangGraph for agent orchestration
- ✅ OpenAI GPT-4 for specialized agents
- ✅ Google Gemini 2.5 Pro for orchestrator
- ✅ A2A Protocol for agent-to-agent communication
- ✅ AG-UI Protocol for frontend integration
- ✅ Docker support
