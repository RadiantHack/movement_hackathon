# x402 Payment Protocol Middleware

Python implementation of x402Paywall middleware for Movement Network, similar to the JavaScript `x402plus` package.

## Overview

This package provides middleware to protect FastAPI/Starlette routes with x402 payment protocol, requiring blockchain-based micropayments before allowing access.

## Installation

The package is part of the backend application. No separate installation needed.

## Usage

### Basic Example

```python
from fastapi import FastAPI
from app.x402 import x402Paywall, RouteConfig

app = FastAPI()

# Define protected routes
routes = {
    "POST /api/premium": RouteConfig(
        network="movement",
        asset="0x1::aptos_coin::AptosCoin",
        max_amount_required="100000000",  # 1 MOVE (8 decimals)
        description="Premium Chat access - Pay to unlock premium chat features",
        mime_type="application/json",
        max_timeout_seconds=600,
    )
}

# Add middleware
app.add_middleware(
    x402Paywall,
    pay_to="0x...",  # Your payment recipient address
    routes=routes,
)
```

### With Custom Facilitator

```python
from app.x402 import x402Paywall, RouteConfig
from app.facilitator.service import FacilitatorService

# Create custom facilitator service
facilitator = FacilitatorService(rpc_url="https://mainnet.movementnetwork.xyz/v1")

routes = {
    "POST /api/premium": RouteConfig(
        network="movement",
        asset="0x1::aptos_coin::AptosCoin",
        max_amount_required="100000000",
        description="Premium access",
    )
}

app.add_middleware(
    x402Paywall,
    pay_to="0x...",
    routes=routes,
    facilitator_service=facilitator,
)
```

### Skip Specific Paths

```python
app.add_middleware(
    x402Paywall,
    pay_to="0x...",
    routes=routes,
    skip_paths=[
        "/.well-known/agent.json",
        "/.well-known/agent-card.json",
        "/health",
    ],
)
```

## Route Configuration

### RouteConfig Parameters

- `network` (str): Blockchain network identifier (e.g., "movement")
- `asset` (str): Token/coin identifier (e.g., "0x1::aptos_coin::AptosCoin")
- `max_amount_required` (str): Amount in smallest unit (e.g., "100000000" for 1 MOVE with 8 decimals)
- `description` (str): Human-readable description
- `mime_type` (str): Expected response content type (default: "application/json")
- `max_timeout_seconds` (int): Payment validity window (default: 600)
- `output_schema` (dict, optional): JSON schema for response
- `extra` (dict, optional): Additional metadata

### Route Key Format

Route keys must match exactly: `"METHOD /path"`

Examples:
- `"POST /api/premium"`
- `"GET /api/premium-image"`
- `"POST /api/premium_lending_agent"`

## How It Works

1. **Request arrives** → Middleware checks if route is protected
2. **No payment header** → Returns 402 with payment requirements
3. **Has payment header** → Decodes and verifies with facilitator
4. **Verification succeeds** → Settles payment via facilitator
5. **Settlement succeeds** → Sets X-PAYMENT-RESPONSE header and proceeds
6. **Any step fails** → Returns 402 with error message

## Payment Flow

```
Client Request (no X-PAYMENT header)
    ↓
Middleware: Return 402 with Payment Requirements
    ↓
Client: Builds and signs transaction
    ↓
Client Request (with X-PAYMENT header)
    ↓
Middleware: Decode payment header
    ↓
Middleware: Call facilitator.verify()
    ↓
Facilitator: Verify transaction on-chain
    ↓
Middleware: Call facilitator.settle()
    ↓
Facilitator: Submit transaction to network
    ↓
Middleware: Set X-PAYMENT-RESPONSE header
    ↓
Proceed to route handler
```

## Response Format

### 402 Payment Required

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "movement",
      "maxAmountRequired": "100000000",
      "resource": "https://your-domain.com/api/premium",
      "description": "Premium Chat access",
      "mimeType": "application/json",
      "payTo": "0x...",
      "maxTimeoutSeconds": 600,
      "asset": "0x1::aptos_coin::AptosCoin"
    }
  ]
}
```

### With Error

```json
{
  "x402Version": 1,
  "accepts": [...],
  "error": "Invalid payment: Transaction verification failed"
}
```

## Integration with Agents

### Example: Premium Lending Agent

```python
from app.x402 import x402Paywall, RouteConfig
from app.agents.premium_lending.agent import create_lending_agent_app

# Create agent app
agent_app = create_lending_agent_app(card_url="...")

# Define protected routes
routes = {
    "POST /premium_lending_agent": RouteConfig(
        network="movement",
        asset="0x1::aptos_coin::AptosCoin",
        max_amount_required="100000000",
        description="Premium Lending Agent access",
    )
}

# Add middleware to agent app
app = agent_app.build()
app.add_middleware(
    x402Paywall,
    pay_to=os.getenv("MOVEMENT_PAY_TO"),
    routes=routes,
    skip_paths=["/.well-known/agent.json", "/.well-known/agent-card.json"],
)

# Mount to main app
main_app.mount("/premium_lending_agent", app)
```

## Environment Variables

- `MOVEMENT_PAY_TO`: Payment recipient address (required)
- `FACILITATOR_URL`: Facilitator service URL (default: `http://localhost:8000/facilitator`)
- `MOVEMENT_RPC_URL`: Movement Network RPC URL (default: mainnet)

## Error Handling

The middleware handles various error cases:

- **Invalid payment header**: Returns 402 with error message
- **Verification failure**: Returns 402 with `invalidReason`
- **Settlement failure**: Retries once, then returns 402 with error
- **Facilitator error**: Returns 500 with error message

## Testing

```python
import pytest
from fastapi.testclient import TestClient
from app.x402 import x402Paywall, RouteConfig

def test_payment_required():
    app = FastAPI()
    routes = {
        "POST /test": RouteConfig(
            network="movement",
            asset="0x1::aptos_coin::AptosCoin",
            max_amount_required="100000000",
            description="Test route",
        )
    }
    app.add_middleware(x402Paywall, pay_to="0x...", routes=routes)
    
    @app.post("/test")
    def test_handler():
        return {"status": "ok"}
    
    client = TestClient(app)
    response = client.post("/test")
    assert response.status_code == 402
    assert "accepts" in response.json()
```

## Comparison with JavaScript x402plus

| Feature | JavaScript (x402plus) | Python (this package) |
|---------|----------------------|------------------------|
| Express middleware | ✅ | ❌ (FastAPI/Starlette) |
| Route configuration | ✅ | ✅ |
| Facilitator integration | ✅ | ✅ |
| Payment verification | ✅ | ✅ |
| Settlement | ✅ | ✅ |
| Skip paths | ❌ | ✅ |
| Type safety | ✅ | ✅ |

## Notes

- Middleware uses the facilitator service for verification and settlement
- Supports Movement Network (Aptos-compatible) transactions
- Automatically retries settlement once if first attempt fails
- Sets `X-PAYMENT-RESPONSE` header on successful payment
- Compatible with FastAPI and Starlette applications

