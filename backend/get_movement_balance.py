#!/usr/bin/env python3
"""
Script to get balance on Movement blockchain using the Movement Indexer API.

This script uses the Movement Network Indexer GraphQL API to retrieve balances
for a given wallet address. It supports all fungible asset balances including
native MOV token and ERC-20 tokens.

Reference: https://docs.movementnetwork.xyz/devs/indexing#defi-queries

Usage:
    python get_movement_balance.py <address> [--network NETWORK] [--indexer-url URL]
    
Examples:
    # Get all token balances on mainnet
    python get_movement_balance.py 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
    
    # Get all token balances on testnet
    python get_movement_balance.py 0x02d969ad6f7cca2c08226eda6ad8971ca99357ba9f192faed1c4186200b789fa --network testnet
    
    # Get balances with custom indexer URL
    python3 get_movement_balance.py 0x02d969ad6f7cca2c08226eda6ad8971ca99357ba9f192faed1c4186200b789fa --indexer-url https://indexer.mainnet.movementnetwork.xyz/v1/graphql
"""

import argparse
import json
import os
import sys
from typing import Dict, List, Optional

try:
    import requests
except ImportError:
    print(
        "Error: 'requests' module not found. Please install dependencies:\n"
        "  python3 -m venv venv\n"
        "  source venv/bin/activate\n"
        "  pip install -e .\n"
        "Or install requests directly:\n"
        "  pip install requests"
    )
    sys.exit(1)

# Constants
DEFAULT_NETWORK = "mainnet"
ENV_INDEXER_URL = "MOVEMENT_INDEXER_URL"
ENV_NETWORK = "MOVEMENT_NETWORK"

# Indexer Provider URLs (Mainnet only)
# Add new providers here as needed
INDEXER_PROVIDERS = {
    "sentio": "https://rpc.sentio.xyz/movement-indexer/v1/graphql",
    "official": "https://indexer.mainnet.movementnetwork.xyz/v1/graphql",
    # Add more providers here in the future:
    # "goldsky": "https://goldsky-indexer-url/graphql",
    # "ankr": "https://ankr-indexer-url/graphql",
    # etc.
}

# Default indexer provider
DEFAULT_INDEXER_PROVIDER = "sentio"  # Change this to switch default provider

# Native token asset type (MOVE coin)
NATIVE_TOKEN_ASSET_TYPE = "0x000000000000000000000000000000000000000000000000000000000000000a"

# GraphQL query to get user token balances with pagination
# Note: amount: {_gt: 0} filters out zero balances - only tokens with balance > 0
GET_USER_BALANCES_QUERY = """
query GetUserTokenBalances($ownerAddress: String!, $limit: Int, $offset: Int) {
  current_fungible_asset_balances(
    where: {
      owner_address: {_eq: $ownerAddress},
      amount: {_gt: 0}
    }
    order_by: {amount: desc}
    limit: $limit
    offset: $offset
  ) {
    asset_type
    amount
    last_transaction_timestamp
    metadata {
      name
      symbol
      decimals
    }
  }
}
"""


def get_indexer_url_by_provider(provider: str = "sentio") -> str:
    """Get Movement Indexer URL by provider name (mainnet only).
    
    To switch indexer providers, just change the 'provider' parameter.
    To add a new provider, add it to the INDEXER_PROVIDERS dictionary above.
    
    Args:
        provider: Indexer provider name (e.g., "sentio", "official", etc.)
        
    Returns:
        Movement Network Indexer GraphQL URL (mainnet)
        
    Examples:
        # Use Sentio (default, public access)
        url = get_indexer_url_by_provider("sentio")
        
        # Use official Movement indexer (may require auth)
        url = get_indexer_url_by_provider("official")
        
        # Use any provider from INDEXER_PROVIDERS dictionary
        url = get_indexer_url_by_provider("goldsky")  # If added to dictionary
        
    Note:
        To add a new provider in the future:
        1. Add entry to INDEXER_PROVIDERS dictionary above
        2. Use the provider name as parameter - no code changes needed!
    """
    provider = provider.lower()
    
    # Get URL from dictionary, default to sentio if not found
    return INDEXER_PROVIDERS.get(provider, INDEXER_PROVIDERS[DEFAULT_INDEXER_PROVIDER])


def get_indexer_url(custom_url: Optional[str] = None) -> str:
    """Get Movement Indexer URL from environment, custom URL, or default (mainnet only).
    
    Args:
        custom_url: Optional custom indexer URL
        
    Returns:
        Movement Network Indexer GraphQL URL (mainnet)
    """
    if custom_url:
        return custom_url
    env_url = os.getenv(ENV_INDEXER_URL)
    if env_url:
        return env_url
    # Use default provider (sentio)
    return get_indexer_url_by_provider(DEFAULT_INDEXER_PROVIDER)


def validate_address(address: str) -> bool:
    """Validate Ethereum/Movement address format.
    
    Args:
        address: Address to validate
        
    Returns:
        True if address is valid, False otherwise
    """
    if not address.startswith("0x"):
        return False
    if len(address) < 3:
        return False
    hex_part = address[2:]
    if not all(c in "0123456789abcdefABCDEF" for c in hex_part):
        return False
    return True


def format_balance(amount: str, decimals: int = 18) -> str:
    """Format balance from string amount to human-readable format.
    
    Args:
        amount: Balance as string (from GraphQL response)
        decimals: Number of decimals (default: 18)
        
    Returns:
        Formatted balance string
    """
    try:
        amount_int = int(amount)
        balance = amount_int / (10 ** decimals)
        return f"{balance:.6f}"
    except (ValueError, TypeError):
        return amount


def parse_metadata(metadata: Optional[Dict]) -> Dict[str, str]:
    """Parse metadata from GraphQL response.
    
    Args:
        metadata: Metadata dictionary from GraphQL response
        
    Returns:
        Dictionary with parsed metadata fields
    """
    if not metadata:
        return {}
    result = {}
    if isinstance(metadata, dict):
        result["name"] = metadata.get("name", "Unknown")
        result["symbol"] = metadata.get("symbol", "Unknown")
        result["decimals"] = metadata.get("decimals", "18")
    return result


def get_balances(indexer_url: str, address: str) -> Dict:
    """Get all token balances for an address using Movement Indexer API with pagination.
    
    Fetches all tokens with balance > 0 by paginating through results.
    Zero balance tokens are excluded.
    
    Args:
        indexer_url: Movement Indexer GraphQL endpoint URL
        address: Wallet address to check
        
    Returns:
        Dictionary with balance information
    """
    try:
        all_balances = []
        offset = 0
        batch_size = 1000  # Hasura default limit is usually 1000
        
        while True:
            variables = {
                "ownerAddress": address,
                "limit": batch_size,
                "offset": offset
            }
            payload = {
                "query": GET_USER_BALANCES_QUERY,
                "variables": variables,
            }
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Movement-Balance-Checker/1.0",
                "Origin": "https://movementnetwork.xyz",
                "Referer": "https://movementnetwork.xyz/",
            }
            response = requests.post(
                indexer_url,
                json=payload,
                headers=headers,
                timeout=30,
            )
            if response.status_code == 403:
                error_detail = "Forbidden - The indexer endpoint may require authentication or have access restrictions."
                try:
                    error_data = response.json()
                    if "errors" in error_data:
                        error_detail += f" Details: {json.dumps(error_data['errors'])}"
                except:
                    error_detail += f" Response: {response.text[:200]}"
                return {
                    "address": address,
                    "error": error_detail,
                    "success": False,
                }
            response.raise_for_status()
            data = response.json()
            if "errors" in data:
                return {
                    "address": address,
                    "error": f"GraphQL errors: {json.dumps(data['errors'])}",
                    "success": False,
                }
            batch_balances = data.get("data", {}).get("current_fungible_asset_balances", [])
            all_balances.extend(batch_balances)
            
            # If we got fewer results than requested, we've reached the end
            if len(batch_balances) < batch_size:
                break
            
            offset += batch_size
        
        # Filter out test tokens (tokens with "test" in name or symbol starting with "t" followed by token name)
        # This matches what the explorer does - it filters out test tokens
        def is_test_token(balance: Dict) -> bool:
            """Check if a token is a test token."""
            metadata = balance.get("metadata", {})
            name = metadata.get("name", "").lower()
            symbol = metadata.get("symbol", "").lower()
            # Test tokens typically have "test" in name or symbol like "tBTC", "tUSDT"
            return "test" in name or (symbol.startswith("t") and len(symbol) > 1 and symbol[1:].isupper())
        
        # Filter out test tokens to match explorer behavior
        filtered_balances = [b for b in all_balances if not is_test_token(b)]
        
        # Sort balances to show native token first
        def sort_key(balance: Dict) -> tuple:
            """Sort key: native token first, then by amount descending."""
            asset_type = balance.get("asset_type", "")
            is_native = asset_type.lower() == NATIVE_TOKEN_ASSET_TYPE.lower()
            amount = int(balance.get("amount", "0"))
            # Return (is_native=False first, then by amount desc)
            # So native token (True) comes before others (False)
            return (not is_native, -amount)
        
        filtered_balances.sort(key=sort_key)
        
        return {
            "address": address,
            "balances": filtered_balances,
            "success": True,
            "total_fetched": len(filtered_balances),
            "filtered_out": len(all_balances) - len(filtered_balances),
        }
    except requests.exceptions.RequestException as e:
        return {
            "address": address,
            "error": f"Request error: {str(e)}",
            "success": False,
        }
    except Exception as e:
        return {
            "address": address,
            "error": str(e),
            "success": False,
        }


def print_balance_result(result: Dict) -> None:
    """Print balance result in a formatted way.
    
    Args:
        result: Dictionary with balance information
    """
    if not result.get("success", False):
        print(f"Error: {result.get('error', 'Unknown error')}")
        sys.exit(1)
    balances = result.get("balances", [])
    total_fetched = result.get("total_fetched", len(balances))
    if not balances:
        print(f"Address: {result['address']}")
        print("No balances found (all balances are 0)")
        return
    print(f"Address: {result['address']}")
    print(f"Found {len(balances)} token balance(s) (non-zero balances only)")
    filtered_out = result.get("filtered_out", 0)
    if filtered_out > 0:
        print(f"Note: {filtered_out} test token(s) filtered out (matching explorer behavior)")
    if total_fetched != len(balances) and filtered_out == 0:
        print(f"Total fetched: {total_fetched}")
    print()
    for idx, balance in enumerate(balances, 1):
        asset_type = balance.get("asset_type", "Unknown")
        amount = balance.get("amount", "0")
        metadata = balance.get("metadata", {})
        parsed_metadata = parse_metadata(metadata)
        decimals = int(parsed_metadata.get("decimals", 18))
        symbol = parsed_metadata.get("symbol", "Unknown")
        name = parsed_metadata.get("name", "Unknown")
        formatted_balance = format_balance(amount, decimals)
        last_tx_timestamp = balance.get("last_transaction_timestamp")
        print(f"{idx}. {name} ({symbol})")
        print(f"   Asset Type: {asset_type}")
        print(f"   Balance: {formatted_balance} {symbol}")
        print(f"   Amount (raw): {amount}")
        if last_tx_timestamp:
            print(f"   Last Transaction: {last_tx_timestamp}")
        print()


def main() -> None:
    """Main function to get balance on Movement blockchain."""
    parser = argparse.ArgumentParser(
        description="Get balance on Movement blockchain using Indexer API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "address",
        type=str,
        help="Wallet address to check (0x format)",
    )
    parser.add_argument(
        "--network",
        type=str,
        choices=["mainnet", "testnet"],
        default=None,
        help=f"Network to use (default: {DEFAULT_NETWORK} or from {ENV_NETWORK})",
    )
    parser.add_argument(
        "--indexer-url",
        type=str,
        default=None,
        help="Custom Movement Indexer GraphQL URL (overrides network setting)",
    )
    parser.add_argument(
        "--use-sentio",
        action="store_true",
        help="Use Sentio third-party indexer instead of main indexer",
    )
    parser.add_argument(
        "--force-main-indexer",
        action="store_true",
        help="Force use of main Movement indexer (DEFAULT_INDEXER_MAINNET) even if it fails",
    )
    args = parser.parse_args()
    if not validate_address(args.address):
        print(f"Error: Invalid address format: {args.address}")
        print("Address must start with 0x and contain valid hexadecimal characters")
        sys.exit(1)
    network = args.network or os.getenv(ENV_NETWORK, DEFAULT_NETWORK)
    
    # Determine which indexer to use
    if args.indexer_url:
        # Custom URL provided
        indexer_url = args.indexer_url
        print(f"Using Custom Indexer: {indexer_url}")
    elif args.use_sentio:
        # Use Sentio (deprecated flag, but still supported)
        indexer_url = get_indexer_url_by_provider("sentio")
        print(f"Using Sentio Indexer: {indexer_url}")
    elif args.force_main_indexer:
        # Use official indexer (deprecated flag, but still supported)
        indexer_url = get_indexer_url_by_provider("official")
        print(f"Using Official Movement Indexer: {indexer_url}")
    else:
        # Use default provider (sentio)
        indexer_url = get_indexer_url()
        provider_name = DEFAULT_INDEXER_PROVIDER
        print(f"Using {provider_name.upper()} Indexer (default): {indexer_url}")
    
    print(f"Network: {network}")
    print()
    result = get_balances(indexer_url, args.address)
    
    # If main indexer failed and not forcing, suggest Sentio
    if not result.get("success") and not args.use_sentio and not args.force_main_indexer:
        print("\n" + "="*60)
        print("Main indexer failed. You can try:")
        print(f"  python get_movement_balance.py {args.address} --use-sentio")
        print("="*60 + "\n")
    
    print_balance_result(result)


if __name__ == "__main__":
    main()
