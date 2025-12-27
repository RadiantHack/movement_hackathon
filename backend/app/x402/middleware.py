"""
x402Paywall Middleware for FastAPI/Starlette

This middleware implements the x402 payment protocol for protecting API routes
with blockchain-based micropayments on Movement Network.
"""

import base64
import json
import os
from typing import Any, Dict, Optional, Callable

from dotenv import load_dotenv
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.facilitator.service import FacilitatorService
from app.x402.types import RouteConfig, RoutesMap, PaymentRequirements

load_dotenv()

# Default facilitator URL (can be overridden)
# Use frontend facilitator API by default (handles Movement Network properly)
# Frontend runs on port 3000, backend on 8000
# In Docker, use host.docker.internal to reach host machine
def get_default_facilitator_url() -> str:
    """Get default facilitator URL, handling Docker environments."""
    if os.getenv("FACILITATOR_URL"):
        return os.getenv("FACILITATOR_URL")
    if os.getenv("FRONTEND_URL"):
        return f"{os.getenv('FRONTEND_URL')}/api/facilitator"
    
    # Try to detect if running in Docker
    if os.path.exists("/.dockerenv"):
        # Running in Docker - use host.docker.internal (works on Mac/Windows)
        return "http://host.docker.internal:3000/api/facilitator"
    else:
        # Running locally
        return "http://localhost:3000/api/facilitator"

DEFAULT_FACILITATOR_URL = get_default_facilitator_url()


def absolute_resource_url(request: Request) -> str:
    """Get absolute URL for the resource being accessed.

    Args:
        request: FastAPI/Starlette request object

    Returns:
        Absolute URL string
    """
    scheme = request.headers.get("x-forwarded-proto", "http")
    host = request.headers.get("host", "localhost")
    path = str(request.url.path).split("?")[0]
    return f"{scheme}://{host}{path}"


def to_payment_requirements(
    resource_url: str, pay_to: str, config: RouteConfig
) -> PaymentRequirements:
    """Convert route config to payment requirements.

    Args:
        resource_url: Absolute URL of the resource
        pay_to: Payment recipient address
        config: Route configuration

    Returns:
        PaymentRequirements object
    """
    return PaymentRequirements(
        scheme="exact",
        network=config.network,
        max_amount_required=config.max_amount_required,
        resource=resource_url,
        description=config.description,
        mime_type=config.mime_type,
        pay_to=pay_to,
        max_timeout_seconds=config.max_timeout_seconds,
        asset=config.asset,
        output_schema=config.output_schema,
        extra=config.extra,
    )


class X402PaywallMiddleware(BaseHTTPMiddleware):
    """Middleware for x402 payment protocol protection.

    This middleware protects routes by requiring payment before allowing access.
    It integrates with the facilitator service to verify and settle payments.
    """

    def __init__(
        self,
        app: Any,
        pay_to: str,
        routes: RoutesMap,
        facilitator_service: Optional[FacilitatorService] = None,
        facilitator_url: Optional[str] = None,
        skip_paths: Optional[list[str]] = None,
    ):
        """Initialize x402Paywall middleware.

        Args:
            app: The ASGI application
            pay_to: Payment recipient address
            routes: Map of route keys to RouteConfig (e.g., {"POST /api/premium": RouteConfig(...)})
            facilitator_service: Optional facilitator service instance
            facilitator_url: Optional facilitator URL (if not using service instance)
            skip_paths: List of paths to skip payment check (e.g., ["/.well-known/agent.json"])
        """
        super().__init__(app)
        self.pay_to = pay_to
        self.routes = routes
        # Initialize facilitator service with remote URL by default
        facilitator_service_url = facilitator_url or DEFAULT_FACILITATOR_URL
        self.facilitator_service = facilitator_service or FacilitatorService(
            facilitator_url=facilitator_service_url
        )
        self.facilitator_url = facilitator_service_url
        self.skip_paths = skip_paths or [
            "/.well-known/agent.json",
            "/.well-known/agent-card.json",
        ]

    def _should_skip_payment(self, path: str) -> bool:
        """Check if path should skip payment verification.

        Args:
            path: Request path

        Returns:
            True if payment check should be skipped
        """
        for skip_path in self.skip_paths:
            if path.endswith(skip_path) or skip_path in path:
                return True
        return False

    def _get_route_config(self, method: str, path: str) -> Optional[RouteConfig]:
        """Get route configuration for the given method and path.

        Args:
            method: HTTP method
            path: Request path

        Returns:
            RouteConfig if route is protected, None otherwise
        """
        # Normalize path (remove trailing slash, ensure leading slash)
        normalized_path = path.rstrip("/") or "/"
        if not normalized_path.startswith("/"):
            normalized_path = "/" + normalized_path
        
        # Try exact match first
        route_key = f"{method.upper()} {normalized_path}"
        if route_key in self.routes:
            return self.routes[route_key]
        
        # Try with trailing slash
        route_key_slash = f"{method.upper()} {normalized_path}/"
        if route_key_slash in self.routes:
            return self.routes[route_key_slash]
        
        # Try root path for any POST request (catch-all for mounted apps)
        if method.upper() == "POST" and "POST /" in self.routes:
            return self.routes["POST /"]
        
        return None

    def _decode_payment_header(self, payment_header: str) -> Dict[str, Any]:
        """Decode base64-encoded payment header.

        Args:
            payment_header: Base64-encoded JSON payment header

        Returns:
            Decoded payment header dictionary

        Raises:
            ValueError: If header cannot be decoded
        """
        try:
            decoded_bytes = base64.b64decode(payment_header)
            decoded_str = decoded_bytes.decode("utf-8")
            return json.loads(decoded_str)
        except Exception as e:
            raise ValueError(f"Failed to decode payment header: {str(e)}")

    def _create_payment_required_response(
        self, requirements: PaymentRequirements, error: Optional[str] = None
    ) -> JSONResponse:
        """Create 402 Payment Required response.

        Args:
            requirements: Payment requirements
            error: Optional error message

        Returns:
            JSONResponse with 402 status
        """
        body = {
            "x402Version": 1,
            "accepts": [requirements.to_dict()],
        }
        if error:
            body["error"] = error
        return JSONResponse(status_code=402, content=body)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request through x402 payment middleware.

        Args:
            request: FastAPI/Starlette request
            call_next: Next middleware/handler in chain

        Returns:
            Response (either 402 or proceeds to handler)
        """
        path = request.url.path
        method = request.method

        # Debug logging - always enabled for now
        debug_mode = True   
        import logging
        logger = logging.getLogger(__name__)
        # Set logging level to DEBUG to show all logs
        logger.setLevel(logging.DEBUG)
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setLevel(logging.DEBUG)
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.debug(f"[x402] Request: {method} {path}, Routes: {list(self.routes.keys())}")

        # Skip payment check for excluded paths
        if self._should_skip_payment(path):
            logger.info(f"[x402] Skipping payment check for path: {path}")
            return await call_next(request)

        # Check if route is protected
        route_config = self._get_route_config(method, path)
        if not route_config:
            # Route not protected, proceed without payment check
            logger.info(f"[x402] Route not protected: {method} {path}")
            return await call_next(request)

        logger.info(f"[x402] Route protected: {method} {path}, Config: {route_config.description}")

        # Get payment requirements
        resource_url = absolute_resource_url(request)
        requirements = to_payment_requirements(resource_url, self.pay_to, route_config)

        # Check for payment header
        # Starlette/FastAPI headers are case-insensitive, use .get() method
        x_payment_header = request.headers.get("x-payment") or request.headers.get("x-402")
        
        if not x_payment_header:
            # No payment header, return 402
            logger.warning(f"[x402] No payment header found, returning 402 for {method} {path}")
            logger.info(f"[x402] Available headers: {list(request.headers.keys())}")
            # Log all headers for debugging
            all_headers = {}
            for key, value in request.headers.items():
                all_headers[key] = value
            logger.info(f"[x402] All header values: {all_headers}")
            return self._create_payment_required_response(requirements)
        
        logger.info(f"[x402] ✓ Payment header found, verifying payment for {method} {path}")
        logger.info(f"[x402] Payment header length: {len(x_payment_header)}")
        logger.info(f"[x402] Payment header preview (first 100 chars): {x_payment_header[:100]}...")

        # Decode and verify payment
        try:
            payment_payload = self._decode_payment_header(x_payment_header)
            logger.info(f"[x402] ✓ Payment payload decoded successfully")
            logger.info(f"[x402] Payment payload - scheme: {payment_payload.get('scheme')}, version: {payment_payload.get('x402Version')}, network: {payment_payload.get('network')}")
            logger.info(f"[x402] Payment payload keys: {list(payment_payload.keys())}")
            scheme = payment_payload.get("scheme", "exact").lower()

            # Verify payment with facilitator
            # Convert PaymentRequirements to dict format expected by facilitator
            payment_reqs_dict = requirements.to_dict()
            
            # Extract payload - it might be nested or at root level
            payment_data = payment_payload.get("payload", payment_payload)
            
            logger.info(f"[x402] Payment data keys: {list(payment_data.keys())}")
            logger.info(f"[x402] Payment data has transaction: {'transaction' in payment_data or 'transactionBcsBase64' in payment_data}")
            logger.info(f"[x402] Payment data has signature: {'signature' in payment_data or 'signatureBcsBase64' in payment_data}")
            if 'transaction' in payment_data:
                logger.info(f"[x402] Transaction BCS length: {len(payment_data.get('transaction', ''))}")
            if 'signature' in payment_data:
                logger.info(f"[x402] Signature BCS length: {len(payment_data.get('signature', ''))}")
            
            verify_result = self.facilitator_service.verify_payment(
                x402_version=payment_payload.get("x402Version", 1),
                payment_payload=payment_data,
                payment_requirements=payment_reqs_dict,
            )
            
            logger.info(f"[x402] ===== Verification result =====")
            logger.info(f"[x402] isValid: {verify_result.get('isValid')}")
            logger.info(f"[x402] invalidReason: {verify_result.get('invalidReason', 'N/A')}")
            logger.info(f"[x402] payer: {verify_result.get('payer', 'N/A')}")
            logger.info(f"[x402] Full verification result: {verify_result}")

            if not verify_result.get("isValid"):
                invalid_reason = verify_result.get("invalidReason", "Invalid payment")
                logger.error(f"[x402] ✗ Payment verification FAILED: {invalid_reason}")
                return self._create_payment_required_response(
                    requirements,
                    error=invalid_reason,
                )
            
            logger.info(f"[x402] ✓ Payment verified successfully, payer: {verify_result.get('payer')}")

            # Settle payment
            settle_result = self.facilitator_service.settle_payment(
                x402_version=payment_payload.get("x402Version", 1),
                payment_payload=payment_data,
                payment_requirements=payment_reqs_dict,
            )

            if not settle_result.get("success"):
                # Retry settlement once
                import asyncio
                await asyncio.sleep(1)
                settle_result = self.facilitator_service.settle_payment(
                    x402_version=payment_payload.get("x402Version", 1),
                    payment_payload=payment_data,
                    payment_requirements=payment_reqs_dict,
                )

            if not settle_result.get("success"):
                settle_error = settle_result.get("error", "Settlement failed")
                logger.error(f"[x402] ✗ Payment settlement FAILED: {settle_error}")
                logger.info(f"[x402] Full settlement result: {settle_result}")
                return self._create_payment_required_response(
                    requirements,
                    error=settle_error,
                )

            logger.info(f"[x402] ✓ Payment settled successfully")
            logger.info(f"[x402] Settlement result: {settle_result}")
            
            # Payment verified and settled, proceed to handler
            logger.info(f"[x402] Proceeding to handler for {method} {path}")
            response = await call_next(request)
            logger.info(f"[x402] Handler response status: {response.status_code if hasattr(response, 'status_code') else 'N/A'}")

            # Add X-PAYMENT-RESPONSE header with settlement result
            if hasattr(response, "headers"):
                import base64 as b64
                response.headers["X-PAYMENT-RESPONSE"] = b64.b64encode(
                    json.dumps(settle_result).encode("utf-8")
                ).decode("utf-8")

            return response

        except ValueError as e:
            # Invalid payment header format
            logger.error(f"[x402] ✗ Payment header decode error: {str(e)}", exc_info=True)
            return self._create_payment_required_response(
                requirements, error=f"Invalid payment header: {str(e)}"
            )
        except Exception as e:
            # Payment verification error
            logger.error(f"[x402] ✗ Payment verification error: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"[x402] Full traceback: {traceback.format_exc()}")
            # Return 402 with error details instead of 500
            return self._create_payment_required_response(
                requirements,
                error=f"Payment verification error: {str(e)}",
            )


def x402Paywall(
    pay_to: str,
    routes: RoutesMap,
    facilitator_service: Optional[FacilitatorService] = None,
    facilitator_url: Optional[str] = None,
    skip_paths: Optional[list[str]] = None,
) -> type[BaseHTTPMiddleware]:
    """Create x402Paywall middleware factory.

    This is a convenience function that returns a middleware class that can be
    added to FastAPI/Starlette applications.

    Args:
        pay_to: Payment recipient address
        routes: Map of route keys to RouteConfig
        facilitator_service: Optional facilitator service instance
        facilitator_url: Optional facilitator URL
        skip_paths: List of paths to skip payment check

    Returns:
        Middleware class that can be used with app.add_middleware()

    Example:
        ```python
        from app.x402 import x402Paywall, RouteConfig

        routes = {
            "POST /api/premium": RouteConfig(
                network="movement",
                asset="0x1::aptos_coin::AptosCoin",
                max_amount_required="100000000",
                description="Premium Chat access",
            )
        }

        app.add_middleware(
            x402Paywall,
            pay_to="0x...",
            routes=routes,
        )
        ```
    """
    # Capture the parameters in closure
    _pay_to = pay_to
    _routes = routes
    _facilitator_service = facilitator_service
    _facilitator_url = facilitator_url
    _skip_paths = skip_paths

    class PaywallMiddleware(X402PaywallMiddleware):
        def __init__(self, app: Any, **kwargs):
            # Starlette passes app as first arg, ignore any duplicate kwargs
            super().__init__(
                app=app,
                pay_to=_pay_to,
                routes=_routes,
                facilitator_service=_facilitator_service,
                facilitator_url=_facilitator_url,
                skip_paths=_skip_paths,
            )

    return PaywallMiddleware

