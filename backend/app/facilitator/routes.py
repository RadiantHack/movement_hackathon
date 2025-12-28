"""
Facilitator API Routes for x402 Payment Protocol

These routes implement the facilitator endpoints for verifying and settling payments.
"""

import base64
import json
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.facilitator.service import FacilitatorService

router = APIRouter(prefix="/facilitator", tags=["facilitator"])

# Initialize facilitator service
facilitator_service = FacilitatorService()


@router.post("/verify")
async def verify_payment(request: Request) -> JSONResponse:
    """Verify a payment transaction.

    Request body:
        {
            "x402Version": 1,
            "paymentPayload": {
                "transaction": "base64...",
                "signature": "base64..."
            },
            "paymentRequirements": {
                "payTo": "0x...",
                "maxAmountRequired": "100000000",
                "network": "movement",
                "asset": "0x1::aptos_coin::AptosCoin"
            }
        }

    Returns:
        {
            "isValid": true/false,
            "payer": "0x...",
            "invalidReason": "..."
        }
    """
    try:
        body = await request.json()

        x402_version = body.get("x402Version", 1)
        payment_payload = body.get("paymentPayload", {})
        payment_requirements = body.get("paymentRequirements", {})

        if not payment_payload:
            raise HTTPException(status_code=400, detail="paymentPayload is required")
        if not payment_requirements:
            raise HTTPException(status_code=400, detail="paymentRequirements is required")

        # Verify payment
        result = facilitator_service.verify_payment(
            x402_version, payment_payload, payment_requirements
        )

        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(
            content={
                "isValid": False,
                "invalidReason": f"Verification error: {str(e)}",
            },
            status_code=500,
        )


@router.post("/settle")
async def settle_payment(request: Request) -> JSONResponse:
    """Settle a payment transaction (submit to network).

    Request body:
        {
            "x402Version": 1,
            "paymentPayload": {
                "transaction": "base64...",
                "signature": "base64..."
            },
            "paymentRequirements": {
                "payTo": "0x...",
                "maxAmountRequired": "100000000",
                "network": "movement",
                "asset": "0x1::aptos_coin::AptosCoin"
            }
        }

    Returns:
        {
            "success": true/false,
            "txHash": "0x...",
            "network": "movement",
            "error": "..."
        }
    """
    try:
        body = await request.json()

        x402_version = body.get("x402Version", 1)
        payment_payload = body.get("paymentPayload", {})
        payment_requirements = body.get("paymentRequirements", {})

        if not payment_payload:
            raise HTTPException(status_code=400, detail="paymentPayload is required")
        if not payment_requirements:
            raise HTTPException(status_code=400, detail="paymentRequirements is required")

        # Settle payment
        result = facilitator_service.settle_payment(
            x402_version, payment_payload, payment_requirements
        )

        status_code = 200 if result.get("success") else 400
        return JSONResponse(content=result, status_code=status_code)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(
            content={
                "success": False,
                "error": f"Settlement error: {str(e)}",
            },
            status_code=500,
        )


@router.post("/supported")
async def get_supported() -> JSONResponse:
    """Get supported networks and schemes.

    Returns:
        {
            "networks": ["movement"],
            "schemes": ["exact"]
        }
    """
    try:
        supported = facilitator_service.get_supported_networks()
        return JSONResponse(content=supported)
    except Exception as e:
        return JSONResponse(
            content={
                "networks": ["movement"],
                "schemes": ["exact"],
                "error": str(e),
            },
            status_code=200,
        )

