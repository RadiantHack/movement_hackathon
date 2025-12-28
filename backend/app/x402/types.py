"""
Type definitions for x402 payment protocol.
"""

from typing import Dict, Optional, Any


class PaymentRequirements:
    """Payment requirements for a protected route."""

    def __init__(
        self,
        scheme: str,
        network: str,
        max_amount_required: str,
        resource: str,
        description: str,
        mime_type: str,
        pay_to: str,
        max_timeout_seconds: int,
        asset: str,
        output_schema: Optional[Dict[str, Any]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ):
        self.scheme = scheme
        self.network = network
        self.max_amount_required = max_amount_required
        self.resource = resource
        self.description = description
        self.mime_type = mime_type
        self.pay_to = pay_to
        self.max_timeout_seconds = max_timeout_seconds
        self.asset = asset
        self.output_schema = output_schema
        self.extra = extra or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "scheme": self.scheme,
            "network": self.network,
            "maxAmountRequired": self.max_amount_required,
            "resource": self.resource,
            "description": self.description,
            "mimeType": self.mime_type,
            "payTo": self.pay_to,
            "maxTimeoutSeconds": self.max_timeout_seconds,
            "asset": self.asset,
        }
        if self.output_schema:
            result["outputSchema"] = self.output_schema
        if self.extra:
            result["extra"] = self.extra
        return result


class RouteConfig:
    """Configuration for a protected route."""

    def __init__(
        self,
        network: str,
        asset: str,
        max_amount_required: str,
        description: str = "",
        mime_type: str = "application/json",
        max_timeout_seconds: int = 600,
        output_schema: Optional[Dict[str, Any]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ):
        self.network = network
        self.asset = asset
        self.max_amount_required = max_amount_required
        self.description = description
        self.mime_type = mime_type
        self.max_timeout_seconds = max_timeout_seconds
        self.output_schema = output_schema
        self.extra = extra or {}


# Type alias for routes map
RoutesMap = Dict[str, RouteConfig]

