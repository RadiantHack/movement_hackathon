# Testing with Docker - Balance, Orchestrator, and Multichain Liquidity Agents

This guide explains how to test your agents (balance, orchestrator, multichain_liquidity) using Docker.

## Prerequisites

1. **Docker and Docker Compose** installed
2. **Environment Variables** (optional for basic tests):
   - `OPENAI_API_KEY` - For balance and liquidity agents
   - `GOOGLE_API_KEY` - For orchestrator agent

## Quick Start

### Run All Tests

```bash
cd backend
make docker-test
```

This runs all tests including health checks and agent tests.

### Run Only Agent Tests

```bash
make docker-test-agents
```

This runs tests specifically for:
- Balance Agent
- Orchestrator Agent  
- Multichain Liquidity Agent

### Run Tests with Coverage

```bash
make docker-test-coverage
```

## Test Structure

### Balance Agent Tests

Tests in `tests/test_agents.py` cover:

1. **Agent Card Endpoint**
   ```bash
   GET /balance/.well-known/agent-card.json
   ```
   - Verifies agent metadata
   - Checks capabilities
   - Validates structure

2. **Execute Endpoint - Query Balance**
   ```bash
   POST /balance/execute
   {
     "action": "query_balance",
     "parameters": {
       "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
       "network": "ethereum"
     }
   }
   ```

3. **Execute Endpoint - Token Balance**
   ```bash
   POST /balance/execute
   {
     "action": "query_balance",
     "parameters": {
       "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
       "token": "USDC",
       "network": "ethereum"
     }
   }
   ```

4. **Cancel Endpoint**
   ```bash
   POST /balance/cancel
   {
     "task_id": "test-task-123"
   }
   ```

### Multichain Liquidity Agent Tests

1. **Agent Card Endpoint**
   ```bash
   GET /liquidity/.well-known/agent-card.json
   ```

2. **Execute Endpoint - Get Liquidity Pool**
   ```bash
   POST /liquidity/execute
   {
     "action": "get_liquidity_pool",
     "parameters": {
       "token_a": "USDC",
       "token_b": "ETH",
       "network": "ethereum"
     }
   }
   ```

3. **Execute Endpoint - Get Pool APY**
   ```bash
   POST /liquidity/execute
   {
     "action": "get_pool_apy",
     "parameters": {
       "token_a": "USDC",
       "token_b": "ETH",
       "network": "ethereum"
     }
   }
   ```

4. **Execute Endpoint - Get Pool TVL**
   ```bash
   POST /liquidity/execute
   {
     "action": "get_pool_tvl",
     "parameters": {
       "token_a": "USDC",
       "token_b": "ETH",
       "network": "ethereum"
     }
   }
   ```

### Orchestrator Agent Tests

1. **Endpoint Mounting**
   - Verifies orchestrator is mounted at `/orchestrator/`
   - Tests endpoint accessibility

## Manual Testing with Docker

### Step 1: Start the Backend in Docker

```bash
make docker-up-detached
```

### Step 2: Test Balance Agent

```bash
# Get agent card
curl http://localhost:8000/balance/.well-known/agent-card.json

# Execute balance query
curl -X POST http://localhost:8000/balance/execute \
  -H "Content-Type: application/json" \
  -d '{
    "action": "query_balance",
    "parameters": {
      "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "network": "ethereum"
    }
  }'
```

### Step 3: Test Liquidity Agent

```bash
# Get agent card
curl http://localhost:8000/liquidity/.well-known/agent-card.json

# Execute liquidity pool query
curl -X POST http://localhost:8000/liquidity/execute \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get_liquidity_pool",
    "parameters": {
      "token_a": "USDC",
      "token_b": "ETH",
      "network": "ethereum"
    }
  }'
```

### Step 4: Test Orchestrator

```bash
# Check orchestrator endpoint
curl http://localhost:8000/orchestrator/
```

## Running Specific Test Files

### Test Only Balance Agent

```bash
docker-compose --profile test run --rm test pytest tests/test_agents.py::TestBalanceAgent -v
```

### Test Only Liquidity Agent

```bash
docker-compose --profile test run --rm test pytest tests/test_agents.py::TestMultichainLiquidityAgent -v
```

### Test Only Orchestrator

```bash
docker-compose --profile test run --rm test pytest tests/test_agents.py::TestOrchestratorAgent -v
```

## View Test Logs

```bash
# View logs from test container
docker-compose --profile test logs test

# Follow logs in real-time
docker-compose --profile test logs -f test
```

## Troubleshooting

### Issue: Tests Fail with Import Errors

**Solution**: Make sure the Docker container has all dependencies:
```bash
docker-compose --profile test run --rm test pip list
```

### Issue: Agent Endpoints Return 404

**Solution**: Verify agents are mounted in `app/main.py`:
- Balance agent should be at `/balance`
- Liquidity agent should be at `/liquidity`
- Orchestrator should be at `/orchestrator`

### Issue: Environment Variables Not Set

**Solution**: Set environment variables in `.env` file or pass them to docker-compose:
```bash
OPENAI_API_KEY=your-key GOOGLE_API_KEY=your-key make docker-test-agents
```

### Issue: Port Already in Use

**Solution**: The test container doesn't expose ports, but if backend is running:
```bash
make docker-down
make docker-test-agents
```

## Test Coverage

To see which parts of your code are tested:

```bash
make docker-test-coverage
```

This generates:
- Terminal output with coverage summary
- HTML report in `htmlcov/` directory

Open `htmlcov/index.html` in a browser to see detailed coverage.

## Continuous Integration

For CI/CD pipelines, use:

```bash
# Run tests and fail on any error
docker-compose --profile test run --rm test pytest -v --tb=short || exit 1
```

## Next Steps

1. Add more test cases for edge cases
2. Test error handling scenarios
3. Test agent-to-agent communication
4. Add performance/load tests
5. Test with real API keys (in staging environment)

