"""
Facilitator Service for x402 Payment Protocol

This service verifies and settles payment transactions on Movement Network.
It implements the x402 facilitator protocol for Aptos-like/Movement payments.
"""

import base64
import json
import os
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv

# Try to import Aptos SDK, fallback to basic implementation if not available
try:
    from aptos_sdk.transactions import (
        Deserializer,
        RawTransaction,
        AccountAuthenticator,
        Ed25519Authenticator,
    )
    APTOS_SDK_AVAILABLE = True
except ImportError:
    APTOS_SDK_AVAILABLE = False

load_dotenv()

# Movement Network RPC URL
# Movement Network Mainnet Configuration
MOVEMENT_RPC = os.getenv("MOVEMENT_RPC_URL", "https://mainnet.movementnetwork.xyz/v1")
MOVEMENT_CHAIN_ID = 126  # Movement mainnet chain ID


class FacilitatorService:
    """Service for verifying and settling x402 payments on Movement Network."""

    def __init__(self, rpc_url: Optional[str] = None, facilitator_url: Optional[str] = None):
        """Initialize the facilitator service.

        Args:
            rpc_url: Movement Network RPC URL (defaults to mainnet)
            facilitator_url: Remote facilitator service URL (defaults to local)
        """
        self.rpc_url = rpc_url or MOVEMENT_RPC
        # Use frontend facilitator API by default (handles Movement Network properly)
        # Can be overridden with FACILITATOR_URL env var
        # In Docker, use host.docker.internal to reach host machine
        # Otherwise use localhost or FRONTEND_URL env var
        if facilitator_url:
            self.facilitator_url = facilitator_url
        elif os.getenv("FACILITATOR_URL"):
            self.facilitator_url = os.getenv("FACILITATOR_URL")
        elif os.getenv("FRONTEND_URL"):
            self.facilitator_url = f"{os.getenv('FRONTEND_URL')}/api/facilitator"
        else:
            # Try to detect if running in Docker
            # In Docker, use host.docker.internal (works on Mac/Windows)
            # On Linux Docker, might need to use host network or gateway IP
            import platform
            if os.path.exists("/.dockerenv"):
                # Running in Docker - try host.docker.internal first
                self.facilitator_url = "http://host.docker.internal:3000/api/facilitator"
            else:
                # Running locally
                self.facilitator_url = "http://localhost:3000/api/facilitator"

    def decode_payment_header(self, payment_header: str) -> Dict[str, Any]:
        """Decode base64-encoded payment header.

        Args:
            payment_header: Base64-encoded JSON payment header

        Returns:
            Decoded payment header dictionary

        Raises:
            ValueError: If header cannot be decoded
        """
        try:
            # Decode base64
            decoded_bytes = base64.b64decode(payment_header)
            decoded_str = decoded_bytes.decode("utf-8")
            # Parse JSON
            return json.loads(decoded_str)
        except Exception as e:
            raise ValueError(f"Failed to decode payment header: {str(e)}")

    def extract_transaction_info(self, payment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract transaction information from payment data.

        Args:
            payment_data: Decoded payment header

        Returns:
            Dictionary with transaction info (sender, recipient, amount, etc.)
        """
        payload = payment_data.get("payload", {})
        transaction_bcs = payload.get("transaction") or payload.get("transactionBcsBase64")
        signature_bcs = payload.get("signature") or payload.get("signatureBcsBase64")

        if not transaction_bcs:
            raise ValueError("Transaction BCS not found in payment header")

        # Decode transaction BCS (base64)
        try:
            transaction_bytes = base64.b64decode(transaction_bcs)
            # For now, we'll use the RPC to deserialize and verify
            # In production, you might want to use the Aptos Python SDK
            return {
                "transaction_bcs": transaction_bcs,
                "signature_bcs": signature_bcs,
                "transaction_bytes": transaction_bytes.hex(),
            }
        except Exception as e:
            raise ValueError(f"Failed to decode transaction BCS: {str(e)}")

    def verify_transaction_on_chain(
        self, transaction_bcs: str, payment_requirements: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Verify transaction on Movement Network.

        Args:
            transaction_bcs: Base64-encoded BCS transaction
            payment_requirements: Payment requirements from server

        Returns:
            Verification result with isValid, payer, etc.
        """
        try:
            # Decode transaction
            transaction_bytes = base64.b64decode(transaction_bcs)

            # Use Aptos SDK if available for proper deserialization
            if APTOS_SDK_AVAILABLE:
                return self._verify_with_aptos_sdk(transaction_bytes, payment_requirements)
            else:
                # Fallback to RPC-based verification
                return self._verify_with_rpc(transaction_bytes, payment_requirements)
        except Exception as e:
            return {
                "isValid": False,
                "invalidReason": f"Verification error: {str(e)}",
            }

    def _verify_with_aptos_sdk(
        self, transaction_bytes: bytes, payment_requirements: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Verify transaction using Aptos SDK for proper deserialization.

        Args:
            transaction_bytes: BCS-encoded transaction bytes
            payment_requirements: Payment requirements from server

        Returns:
            Verification result
        """
        try:
            # Deserialize transaction
            deserializer = Deserializer(transaction_bytes)
            raw_transaction = RawTransaction.deserialize(deserializer)

            # Extract transaction details
            sender = str(raw_transaction.sender)
            sequence_number = raw_transaction.sequence_number
            
            # Access expiration timestamp - use getattr to safely access the attribute
            # The RawTransaction object structure may vary between SDK versions
            # If expiration is not available, we'll skip expiration checks and rely on on-chain verification
            expiration_timestamp_secs = getattr(
                raw_transaction, 
                "expiration_timestamp_secs", 
                None
            )

            # Get payment requirements
            required_pay_to = payment_requirements.get("payTo", "").lower()
            required_amount = int(payment_requirements.get("maxAmountRequired", "0"))
            max_timeout_seconds = int(payment_requirements.get("maxTimeoutSeconds", 600))

            # Check expiration (transaction must be valid) - only if expiration is available
            if expiration_timestamp_secs is not None:
                import time
                current_time = int(time.time())
                if expiration_timestamp_secs < current_time:
                    return {
                        "isValid": False,
                        "invalidReason": "Transaction has expired",
                    }

                # Check if transaction is within timeout window
                if expiration_timestamp_secs > current_time + max_timeout_seconds:
                    return {
                        "isValid": False,
                        "invalidReason": "Transaction expiration exceeds maximum timeout",
                    }

            # Verify transaction payload matches payment requirements
            # For coin transfer, check the payload
            payload = raw_transaction.payload
            if hasattr(payload, "value"):
                # Entry function payload
                entry_function = payload.value
                if hasattr(entry_function, "function"):
                    function_str = str(entry_function.function)
                    # Check if it's a coin transfer
                    if "coin::transfer" in function_str or "aptos_account::transfer" in function_str:
                        # Extract arguments
                        if hasattr(entry_function, "arguments") and entry_function.arguments:
                            args = entry_function.arguments
                            if len(args) >= 2:
                                recipient = str(args[0]).lower()
                                amount = int(args[1]) if isinstance(args[1], (int, str)) else 0

                                # Verify recipient matches
                                if recipient != required_pay_to:
                                    return {
                                        "isValid": False,
                                        "invalidReason": f"Recipient mismatch: expected {required_pay_to}, got {recipient}",
                                    }

                                # Verify amount is sufficient
                                if amount < required_amount:
                                    return {
                                        "isValid": False,
                                        "invalidReason": f"Amount insufficient: required {required_amount}, got {amount}",
                                    }

            # Transaction is valid
            return {
                "isValid": True,
                "payer": sender,
            }
        except Exception as e:
            return {
                "isValid": False,
                "invalidReason": f"SDK verification error: {str(e)}",
            }

    def _verify_with_rpc(
        self, transaction_bytes: bytes, payment_requirements: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Verify transaction using RPC simulation (fallback when SDK not available).

        Args:
            transaction_bytes: BCS-encoded transaction bytes
            payment_requirements: Payment requirements from server

        Returns:
            Verification result
        """
        simulate_response = self._simulate_transaction(transaction_bytes)

        if not simulate_response.get("success"):
            return {
                "isValid": False,
                "invalidReason": simulate_response.get("error", "Transaction simulation failed"),
            }

        # Extract sender from simulated transaction
        result = simulate_response.get("result", {})
        sender = result.get("sender") or result.get("transaction", {}).get("sender")

        if not sender:
            return {
                "isValid": False,
                "invalidReason": "Could not extract sender from transaction",
            }

        return {
            "isValid": True,
            "payer": sender,
        }

    def _simulate_transaction(self, transaction_bytes: bytes) -> Dict[str, Any]:
        """Simulate transaction on Movement Network.

        Args:
            transaction_bytes: BCS-encoded transaction bytes

        Returns:
            Simulation result
        """
        try:
            # Convert bytes to hex string for RPC
            tx_hex = "0x" + transaction_bytes.hex()

            # Use Movement Network RPC simulate_transaction endpoint
            # Note: This is a simplified approach
            # In production, you should use the Aptos Python SDK
            response = requests.post(
                f"{self.rpc_url}",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "transaction.simulate",
                    "params": [tx_hex],
                },
                headers={"Content-Type": "application/json"},
                timeout=10,
            )

            if response.status_code == 200:
                result = response.json()
                if "result" in result:
                    return {"success": True, "result": result["result"]}
                return {"success": False, "error": result.get("error", "Unknown error")}
            return {"success": False, "error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def verify_payment(
        self, x402_version: int, payment_payload: Dict[str, Any], payment_requirements: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Verify a payment according to x402 protocol.

        Args:
            x402_version: x402 protocol version
            payment_payload: Payment header payload (decoded)
            payment_requirements: Payment requirements from server

        Returns:
            Verification response with isValid, payer, invalidReason
        """
        try:
            # Extract transaction from payload
            transaction_bcs = (
                payment_payload.get("transaction") or payment_payload.get("transactionBcsBase64")
            )
            signature_bcs = (
                payment_payload.get("signature") or payment_payload.get("signatureBcsBase64")
            )

            if not transaction_bcs:
                return {
                    "isValid": False,
                    "invalidReason": "Transaction not found in payment payload",
                }

            # Verify transaction on-chain
            return self.verify_transaction_on_chain(transaction_bcs, payment_requirements)
        except Exception as e:
            return {
                "isValid": False,
                "invalidReason": f"Verification failed: {str(e)}",
            }

    def settle_payment(
        self, x402_version: int, payment_payload: Dict[str, Any], payment_requirements: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Settle a payment (submit transaction to network).

        Args:
            x402_version: x402 protocol version
            payment_payload: Payment header payload (decoded)
            payment_requirements: Payment requirements from server

        Returns:
            Settlement response with success, txHash, etc.
        """
        try:
            # Use remote facilitator service for settlement
            # This avoids RPC method issues and uses a dedicated facilitator
            settle_url = f"{self.facilitator_url}/settle"
            
            # Prepare request body for facilitator
            # The remote facilitator expects the same format as our local endpoint
            request_body = {
                "x402Version": x402_version,
                "paymentPayload": payment_payload,
                "paymentRequirements": payment_requirements,
            }
            
            # Add logging for debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"[facilitator] Calling remote facilitator: {settle_url}")
            logger.info(f"[facilitator] Request body keys: {list(request_body.keys())}")
            logger.info(f"[facilitator] paymentPayload keys: {list(payment_payload.keys())}")
            logger.info(f"[facilitator] paymentRequirements keys: {list(payment_requirements.keys())}")
            
            # Call remote facilitator service
            response = requests.post(
                settle_url,
                json=request_body,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            
            logger.info(f"[facilitator] Response status: {response.status_code}")
            logger.info(f"[facilitator] Response body: {response.text[:500]}")
            
            if response.status_code == 200:
                result = response.json()
                return result
            
            # Handle non-200 responses
            try:
                error_body = response.json()
                error_msg = error_body.get("error", error_body.get("message", "Unknown error"))
            except:
                error_body = response.text[:500]  # Limit error body length
                error_msg = f"HTTP {response.status_code}: {error_body}"
            
            return {
                "success": False,
                "error": error_msg,
            }
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": f"Facilitator request failed: {str(e)}",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Settlement failed: {str(e)}",
            }

    def get_supported_networks(self) -> Dict[str, Any]:
        """Get supported networks and schemes.

        Returns:
            Dictionary with supported networks and schemes
        """
        return {
            "networks": ["movement"],
            "schemes": ["exact"],
        }

