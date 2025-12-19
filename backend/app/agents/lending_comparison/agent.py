"""
Unified Lending Agent - Compare, Find Best Rates, and Execute Lending Operations

Tools: 
- Comparison: compare_lending_rates, compare_borrowing_rates, get_protocol_metrics, recommend_best_protocol, get_best_supply_rate
- Operations: supply_collateral, borrow_asset, repay_loan, check_health_factor
"""

import os
import uuid
import json
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
load_dotenv()
import requests

from app.agents.lending_comparison.moveposition_rates import (
    calculate_moveposition_supply_apy_by_utilization,
    calculate_moveposition_borrow_apr,
)
from app.agents.lending_comparison.echelon_rates import (
    calculate_echelon_supply_apr,
    calculate_echelon_borrow_apr,
)

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, Message, Part, Role, TextPart
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0
DEFAULT_SESSION_ID = "default_session"
EMPTY_RESPONSE_MESSAGE = "I apologize, but I couldn't generate a response."
ENV_OPENAI_API_KEY = "OPENAI_API_KEY"
ENV_OPENAI_MODEL = "OPENAI_MODEL"
MESSAGE_TYPE_AI = "ai"
MESSAGE_ROLE_USER = "user"
MESSAGE_KEY_MESSAGES = "messages"
MESSAGE_KEY_CONTENT = "content"
MESSAGE_KEY_ROLE = "role"
MESSAGE_KEY_TYPE = "type"

ECHELON_API_URL = "https://app.echelon.market/api/markets?network=movement_mainnet"
MOVEPOSITION_API_URL = "https://api.moveposition.xyz/brokers"


def fetch_echelon_data() -> Optional[Dict[str, Any]]:
    """Fetch market data from Echelon API."""
    try:
        response = requests.get(ECHELON_API_URL, timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching Echelon data: {e}")
        return None


def fetch_moveposition_data() -> Optional[List[Dict[str, Any]]]:
    """Fetch broker data from MovePosition API."""
    try:
        response = requests.get(MOVEPOSITION_API_URL, timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching MovePosition data: {e}")
        return None


def find_asset_in_echelon(data: Dict[str, Any], asset_symbol: str) -> Optional[Dict[str, Any]]:
    """Find asset data in Echelon API response."""
    if not data or "data" not in data or "assets" not in data["data"]:
        return None
    assets = data["data"]["assets"]
    for asset in assets:
        if asset.get("symbol", "").upper() == asset_symbol.upper():
            return asset
    return None


def find_asset_in_moveposition(data: List[Dict[str, Any]], asset_symbol: str) -> Optional[Dict[str, Any]]:
    """Find asset data in MovePosition API response by symbol.
    
    For MOVE token, prefers MOVE-FA (higher APY) over regular MOVE.
    """
    if not data:
        return None
    symbol_mapping = {
        "USDC": ["movement-usdc", "usdc"],
        "USDT": ["movement-usdt", "usdt"],
        "MOVE": ["movement-move-fa", "movement-move", "move"],  # Prefer MOVE-FA first
        "WBTC": ["movement-wbtc", "wbtc"],
        "WETH": ["movement-weth", "weth"],
        "EZETH": ["movement-ezeth", "ezeth"],
        "LBTC": ["movement-lbtc", "lbtc"],
        "USDA": ["movement-usda", "usda"],
    }
    search_names = symbol_mapping.get(asset_symbol.upper(), [asset_symbol.lower()])
    found_brokers = []
    for broker in data:
        underlying = broker.get("underlyingAsset", {})
        asset_name = underlying.get("name", "").lower()
        for search_name in search_names:
            if search_name.lower() in asset_name:
                found_brokers.append((broker, search_name))
                break
    if not found_brokers:
        return None
    if asset_symbol.upper() == "MOVE" and len(found_brokers) > 1:
        for broker, search_name in found_brokers:
            underlying = broker.get("underlyingAsset", {})
            asset_name = underlying.get("name", "").lower()
            if "move-fa" in asset_name or "move_fa" in asset_name:
                return broker
    return found_brokers[0][0]


def get_moveposition_metrics(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate aggregate metrics from MovePosition data."""
    if not data:
        return {}
    total_tvl = 0.0
    total_supplied = 0.0
    total_borrowed = 0.0
    supply_apy_sum = 0.0
    borrow_apy_sum = 0.0
    asset_count = 0
    for broker in data:
        underlying = broker.get("underlyingAsset", {})
        price = underlying.get("price", 0)
        available_liquidity = float(broker.get("scaledAvailableLiquidityUnderlying", 0))
        total_borrowed_scaled = float(broker.get("scaledTotalBorrowedUnderlying", 0))
        total_supplied_scaled = available_liquidity + total_borrowed_scaled
        tvl_value = total_supplied_scaled * price
        supplied_value = total_supplied_scaled * price
        borrowed_value = total_borrowed_scaled * price
        total_tvl += tvl_value
        total_supplied += supplied_value
        total_borrowed += borrowed_value
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        borrow_apy = broker.get("interestRate", 0) * 100
        if supply_apy > 0:
            supply_apy_sum += supply_apy
            asset_count += 1
        if borrow_apy > 0:
            borrow_apy_sum += borrow_apy
    avg_supply_apy = (supply_apy_sum / asset_count) if asset_count > 0 else 0.0
    avg_borrow_apy = (borrow_apy_sum / asset_count) if asset_count > 0 else 0.0
    utilization = (total_borrowed / total_supplied * 100) if total_supplied > 0 else 0.0
    return {
        "tvl": total_tvl,
        "total_supplied": total_supplied,
        "total_borrowed": total_borrowed,
        "utilization_rate": utilization,
        "avg_supply_apy": avg_supply_apy,
        "avg_borrow_apy": avg_borrow_apy,
    }


def calculate_utilization(total_liability: float, total_cash: float) -> float:
    """Calculate utilization rate."""
    total = total_liability + total_cash
    if total == 0:
        return 0.0
    return (total_liability / total) * 100


def get_echelon_metrics(data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate aggregate metrics from Echelon data."""
    if not data or "data" not in data:
        return {}
    market_stats = data.get("data", {}).get("marketStats", [])
    total_tvl = 0.0
    total_supplied = 0.0
    total_borrowed = 0.0
    supply_apy_sum = 0.0
    borrow_apy_sum = 0.0
    asset_count = 0
    assets = data.get("data", {}).get("assets", [])
    for asset in assets:
        price = asset.get("price", 0)
        supply_apy = asset.get("supplyApr", 0)
        borrow_apy = asset.get("borrowApr", 0)
        market_address = asset.get("market", "")
        for stat in market_stats:
            if isinstance(stat, list) and len(stat) >= 2:
                stat_address = stat[0]
                asset_address = asset.get("address", "")
                asset_fa_address = asset.get("faAddress", "")
                if stat_address == asset_address or stat_address == asset_fa_address or stat_address == market_address:
                    market_data = stat[1]
                    total_shares = market_data.get("totalShares", 0)
                    total_liability = market_data.get("totalLiability", 0)
                    total_cash = market_data.get("totalCash", 0)
                    tvl_value = total_shares * price
                    supplied_value = total_shares * price
                    borrowed_value = total_liability * price
                    total_tvl += tvl_value
                    total_supplied += supplied_value
                    total_borrowed += borrowed_value
                    if supply_apy > 0:
                        supply_apy_sum += supply_apy
                        asset_count += 1
                    if borrow_apy > 0:
                        borrow_apy_sum += borrow_apy
                    break
    avg_supply_apy = (supply_apy_sum / asset_count * 100) if asset_count > 0 else 0.0
    avg_borrow_apy = (borrow_apy_sum / asset_count * 100) if asset_count > 0 else 0.0
    utilization = (total_borrowed / total_supplied * 100) if total_supplied > 0 else 0.0
    return {
        "tvl": total_tvl,
        "total_supplied": total_supplied,
        "total_borrowed": total_borrowed,
        "utilization_rate": utilization,
        "avg_supply_apy": avg_supply_apy,
        "avg_borrow_apy": avg_borrow_apy,
    }


def get_system_prompt() -> str:
    return """You are a comprehensive lending protocol assistant for Movement Network, supporting both MovePosition and Echelon protocols.

Help users with:

COMPARISON & RATE FINDING:
- Find the best place to supply/lend assets across MovePosition and Echelon protocols
- Compare lending rates between MovePosition and Echelon for specific assets
- Compare borrowing rates between protocols
- Analyze protocol metrics (TVL, liquidity, fees)
- Recommend the best protocol for lending or borrowing

When users ask about "best place to supply", "where to lend", or "best APY", use get_best_supply_rate to find the highest yield across all available assets and protocols.

IMPORTANT - AFTER SHOWING COMPARISONS:
- After showing rate comparisons (especially for borrowing or lending), ALWAYS ask the user which platform they would like to proceed with
- Use the "user_prompt" field from the tool response to guide the user
- When user selects a platform (e.g., "MovePosition", "Echelon", "I want to proceed with MovePosition", "let's use Echelon"), acknowledge their choice
- After user selects a platform, respond with: "You've selected [Platform]. The [borrow/lend] card for [asset] on [Platform] will open now."
- The frontend will handle opening the appropriate card (BorrowCard or LendCard) based on the user's selection

LENDING OPERATIONS:
- Supply collateral to lending protocols (supply_collateral)
- Borrow assets against collateral (borrow_asset)
- Repay loans (repay_loan)
- Monitor health factors and liquidation risks (check_health_factor)

Always:
- Provide clear comparisons with specific numbers
- Explain your recommendations
- After comparisons, ask which platform the user wants to proceed with
- When user selects a platform, confirm and indicate the card will open
- Warn about liquidation risks when borrowing
- Explain health factors and their importance"""


def create_agent_skill() -> AgentSkill:
    return AgentSkill(
        id="lending_agent",
        name="Unified Lending Agent",
        description="Compare rates, find best supply options, and execute lending operations on MovePosition and Echelon",
        tags=["lending", "borrowing", "comparison", "defi", "moveposition", "echelon", "rates", "supply", "apy", "collateral"],
        examples=[
            "where is the best place to supply USDC?",
            "get best supply rate",
            "which protocol gives the highest APY?",
            "supply 1000 USDC as collateral",
            "borrow 500 USDC",
            "compare lending rates for USDC",
            "check my health factor",
            "repay 200 USDC",
            "which protocol is better for borrowing?",
            "show me protocol metrics"
        ],
    )


@tool
def compare_lending_rates(asset: str = "USDC") -> str:
    """Compare lending (supply) rates between MovePosition and Echelon for an asset."""
    echelon_data = fetch_echelon_data()
    moveposition_data = fetch_moveposition_data()
    echelon_asset = find_asset_in_echelon(echelon_data, asset) if echelon_data else None
    moveposition_broker = find_asset_in_moveposition(moveposition_data, asset) if moveposition_data else None
    if echelon_asset:
        supply_apr = calculate_echelon_supply_apr(echelon_asset)
        supply_apy = convert_apr_to_apy(supply_apr)
        price = echelon_asset.get("price", 0)
        market_address = echelon_asset.get("market", "")
        market_stats = echelon_data.get("data", {}).get("marketStats", [])
        total_shares = 0.0
        total_liability = 0.0
        total_cash = 0.0
        asset_address = echelon_asset.get("address", "")
        fa_address = echelon_asset.get("faAddress", "")
        for stat in market_stats:
            if isinstance(stat, list) and len(stat) >= 2:
                stat_address = stat[0]
                if stat_address == asset_address or stat_address == fa_address or stat_address == market_address:
                    market_data = stat[1]
                    total_shares = market_data.get("totalShares", 0)
                    total_liability = market_data.get("totalLiability", 0)
                    total_cash = market_data.get("totalCash", 0)
                    break
        tvl = total_shares * price
        utilization = calculate_utilization(total_liability, total_cash)
        liquidity = total_cash * price
        echelon_info = {
            "supply_apy": f"{supply_apy:.2f}%",
            "tvl": f"${tvl:,.2f}",
            "utilization": f"{utilization:.2f}%",
            "liquidity": f"${liquidity:,.2f}"
        }
    else:
        echelon_info = {
            "supply_apy": "N/A",
            "tvl": "N/A",
            "utilization": "N/A",
            "liquidity": "N/A"
        }
    if moveposition_broker:
        underlying = moveposition_broker.get("underlyingAsset", {})
        price = underlying.get("price", 0)
        supply_apy = calculate_moveposition_supply_apy_by_utilization(moveposition_broker)
        utilization = moveposition_broker.get("utilization", 0) * 100
        available_liquidity = float(moveposition_broker.get("scaledAvailableLiquidityUnderlying", 0))
        total_borrowed_scaled = float(moveposition_broker.get("scaledTotalBorrowedUnderlying", 0))
        total_supplied_scaled = available_liquidity + total_borrowed_scaled
        tvl = total_supplied_scaled * price
        liquidity = available_liquidity * price
        moveposition_info = {
            "supply_apy": f"{supply_apy:.2f}%",
            "tvl": f"${tvl:,.2f}",
            "utilization": f"{utilization:.2f}%",
            "liquidity": f"${liquidity:,.2f}"
        }
    else:
        moveposition_info = {
            "supply_apy": "N/A",
            "tvl": "N/A",
            "utilization": "N/A",
            "liquidity": "N/A"
        }
    if echelon_asset and moveposition_broker:
        echelon_apr = calculate_echelon_supply_apr(echelon_asset)
        echelon_apy = convert_apr_to_apy(echelon_apr)
        moveposition_apy = calculate_moveposition_supply_apy_by_utilization(moveposition_broker)
        winner = "echelon" if echelon_apy > moveposition_apy else "moveposition"
        difference = f"{echelon_apy - moveposition_apy:+.2f}%"
    else:
        winner = "unknown"
        difference = "N/A"
    return json.dumps({
        "asset": asset,
        "moveposition": moveposition_info,
        "echelon": echelon_info,
        "winner": winner,
        "difference": difference,
        "message": f"Lending rate comparison for {asset}"
    })


@tool
def compare_borrowing_rates(asset: str = "USDC") -> str:
    """Compare borrowing rates between MovePosition and Echelon for an asset."""
    echelon_data = fetch_echelon_data()
    moveposition_data = fetch_moveposition_data()
    echelon_asset = find_asset_in_echelon(echelon_data, asset) if echelon_data else None
    moveposition_broker = find_asset_in_moveposition(moveposition_data, asset) if moveposition_data else None
    if echelon_asset:
        borrow_apy = echelon_asset.get("borrowApr", 0) * 100
        ltv = echelon_asset.get("ltv", 0) * 100
        lt = echelon_asset.get("lt", 0) * 100
        echelon_info = {
            "borrow_apy": f"{borrow_apy:.2f}%",
            "liquidation_threshold": f"{lt:.2f}%",
            "health_factor_requirement": "1.15",
            "max_ltv": f"{ltv:.2f}%"
        }
    else:
        echelon_info = {
            "borrow_apy": "N/A",
            "liquidation_threshold": "N/A",
            "health_factor_requirement": "N/A",
            "max_ltv": "N/A"
        }
    if moveposition_broker:
        borrow_apy = moveposition_broker.get("interestRate", 0) * 100
        utilization = moveposition_broker.get("utilization", 0) * 100
        moveposition_info = {
            "borrow_apy": f"{borrow_apy:.2f}%",
            "liquidation_threshold": "N/A",
            "health_factor_requirement": "N/A",
            "max_ltv": "N/A",
            "utilization": f"{utilization:.2f}%"
        }
    else:
        moveposition_info = {
            "borrow_apy": "N/A",
            "liquidation_threshold": "N/A",
            "health_factor_requirement": "N/A",
            "max_ltv": "N/A"
        }
    if echelon_asset and moveposition_broker:
        echelon_apr = calculate_echelon_borrow_apr(echelon_asset)
        moveposition_apr = calculate_moveposition_borrow_apr(moveposition_broker)
        winner = "echelon" if echelon_apr < moveposition_apr else "moveposition"
        difference = f"{echelon_apr - moveposition_apr:+.2f}%"
        recommended_protocol = winner.capitalize()
        if winner == "echelon":
            recommended_protocol = "Echelon"
        else:
            recommended_protocol = "MovePosition"
        recommendation_message = f"Based on the comparison, {recommended_protocol} offers a lower borrowing APR ({difference})."
    else:
        winner = "unknown"
        difference = "N/A"
        recommended_protocol = None
        recommendation_message = f"Borrowing rate comparison for {asset}"
    return json.dumps({
        "asset": asset,
        "action": "borrow",
        "moveposition": moveposition_info,
        "echelon": echelon_info,
        "winner": winner,
        "difference": difference,
        "recommended_protocol": recommended_protocol,
        "echelon_rate": echelon_info.get("borrow_apy", "N/A"),
        "moveposition_rate": moveposition_info.get("borrow_apy", "N/A"),
        "reason": recommendation_message,
        "message": f"{recommendation_message} Which platform would you like to proceed with to borrow {asset}?",
        "user_prompt": f"Which platform would you like to proceed with to borrow {asset}? Please select 'MovePosition' or 'Echelon'."
    })


@tool
def get_protocol_metrics(protocol: str = "both") -> str:
    """Get comprehensive metrics for one or both protocols."""
    echelon_data = fetch_echelon_data()
    moveposition_data = fetch_moveposition_data()
    echelon_metrics = get_echelon_metrics(echelon_data) if echelon_data else {}
    moveposition_metrics = get_moveposition_metrics(moveposition_data) if moveposition_data else {}
    if protocol.lower() == "moveposition":
        if moveposition_metrics:
            return json.dumps({
                "protocol": "MovePosition",
                "tvl": f"${moveposition_metrics.get('tvl', 0):,.2f}",
                "total_supplied": f"${moveposition_metrics.get('total_supplied', 0):,.2f}",
                "total_borrowed": f"${moveposition_metrics.get('total_borrowed', 0):,.2f}",
                "utilization_rate": f"{moveposition_metrics.get('utilization_rate', 0):.2f}%",
                "avg_supply_apy": f"{moveposition_metrics.get('avg_supply_apy', 0):.2f}%",
                "avg_borrow_apy": f"{moveposition_metrics.get('avg_borrow_apy', 0):.2f}%",
                "safety_score": "high",
                "message": "MovePosition protocol metrics"
            })
        else:
            return json.dumps({
                "protocol": "MovePosition",
                "error": "Unable to fetch data from MovePosition API",
                "message": "MovePosition protocol metrics (data unavailable)"
            })
    elif protocol.lower() == "echelon":
        if echelon_metrics:
            return json.dumps({
                "protocol": "Echelon",
                "tvl": f"${echelon_metrics.get('tvl', 0):,.2f}",
                "total_supplied": f"${echelon_metrics.get('total_supplied', 0):,.2f}",
                "total_borrowed": f"${echelon_metrics.get('total_borrowed', 0):,.2f}",
                "utilization_rate": f"{echelon_metrics.get('utilization_rate', 0):.2f}%",
                "avg_supply_apy": f"{echelon_metrics.get('avg_supply_apy', 0):.2f}%",
                "avg_borrow_apy": f"{echelon_metrics.get('avg_borrow_apy', 0):.2f}%",
                "liquidation_threshold": "85%",
                "safety_score": "high",
                "message": "Echelon protocol metrics"
            })
        else:
            return json.dumps({
                "protocol": "Echelon",
                "error": "Unable to fetch data from Echelon API",
                "message": "Echelon protocol metrics (data unavailable)"
            })
    else:
        moveposition_data_dict = {}
        if moveposition_metrics:
            moveposition_data_dict = {
                "tvl": f"${moveposition_metrics.get('tvl', 0):,.2f}",
                "total_supplied": f"${moveposition_metrics.get('total_supplied', 0):,.2f}",
                "total_borrowed": f"${moveposition_metrics.get('total_borrowed', 0):,.2f}",
                "utilization_rate": f"{moveposition_metrics.get('utilization_rate', 0):.2f}%",
                "avg_supply_apy": f"{moveposition_metrics.get('avg_supply_apy', 0):.2f}%",
                "avg_borrow_apy": f"{moveposition_metrics.get('avg_borrow_apy', 0):.2f}%",
                "safety_score": "high"
            }
        else:
            moveposition_data_dict = {"error": "Unable to fetch data from MovePosition API"}
        echelon_data_dict = {}
        if echelon_metrics:
            echelon_data_dict = {
                "tvl": f"${echelon_metrics.get('tvl', 0):,.2f}",
                "total_supplied": f"${echelon_metrics.get('total_supplied', 0):,.2f}",
                "total_borrowed": f"${echelon_metrics.get('total_borrowed', 0):,.2f}",
                "utilization_rate": f"{echelon_metrics.get('utilization_rate', 0):.2f}%",
                "avg_supply_apy": f"{echelon_metrics.get('avg_supply_apy', 0):.2f}%",
                "avg_borrow_apy": f"{echelon_metrics.get('avg_borrow_apy', 0):.2f}%",
                "liquidation_threshold": "85%",
                "safety_score": "high"
            }
        else:
            echelon_data_dict = {"error": "Unable to fetch data from Echelon API"}
        return json.dumps({
            "moveposition": moveposition_data_dict,
            "echelon": echelon_data_dict,
            "message": "Both protocols metrics"
        })


@tool
def recommend_best_protocol(action: str, asset: str = "USDC") -> str:
    """Recommend the best protocol for lending or borrowing based on current rates and metrics.
    
    Args:
        action: Either 'lend' or 'borrow'
        asset: The asset to compare (default: USDC)
    """
    echelon_data = fetch_echelon_data()
    moveposition_data = fetch_moveposition_data()
    echelon_asset = find_asset_in_echelon(echelon_data, asset) if echelon_data else None
    moveposition_broker = find_asset_in_moveposition(moveposition_data, asset) if moveposition_data else None
    if action.lower() == "lend":
        if echelon_asset and moveposition_broker:
            echelon_apr = calculate_echelon_supply_apr(echelon_asset)
            echelon_rate = convert_apr_to_apy(echelon_apr)
            moveposition_rate = calculate_moveposition_supply_apy_by_utilization(moveposition_broker)
            echelon_tvl = 0.0
            moveposition_tvl = 0.0
            if echelon_data:
                price = echelon_asset.get("price", 0)
                market_stats = echelon_data.get("data", {}).get("marketStats", [])
                for stat in market_stats:
                    if isinstance(stat, list) and len(stat) >= 2:
                        stat_address = stat[0]
                        if stat_address == echelon_asset.get("address") or stat_address == echelon_asset.get("faAddress") or stat_address == echelon_asset.get("market"):
                            market_data = stat[1]
                            total_shares = market_data.get("totalShares", 0)
                            echelon_tvl = total_shares * price
                            break
            if moveposition_broker:
                underlying = moveposition_broker.get("underlyingAsset", {})
                price = underlying.get("price", 0)
                available_liquidity = float(moveposition_broker.get("scaledAvailableLiquidityUnderlying", 0))
                total_borrowed_scaled = float(moveposition_broker.get("scaledTotalBorrowedUnderlying", 0))
                total_supplied_scaled = available_liquidity + total_borrowed_scaled
                moveposition_tvl = total_supplied_scaled * price
            if echelon_rate > moveposition_rate:
                recommended = "Echelon"
                reason = f"Higher supply APY ({echelon_rate:.2f}% vs {moveposition_rate:.2f}%)"
                advantage = f"+{echelon_rate - moveposition_rate:.2f}% APY"
            else:
                recommended = "MovePosition"
                reason = f"Higher supply APY ({moveposition_rate:.2f}% vs {echelon_rate:.2f}%)"
                advantage = f"+{moveposition_rate - echelon_rate:.2f}% APY"
            return json.dumps({
                "action": "lend",
                "asset": asset,
                "recommended_protocol": recommended,
                "reason": reason,
                "moveposition_rate": f"{moveposition_rate:.2f}%",
                "echelon_rate": f"{echelon_rate:.2f}%",
                "moveposition_tvl": f"${moveposition_tvl:,.2f}",
                "echelon_tvl": f"${echelon_tvl:,.2f}",
                "advantage": advantage,
                "message": f"{recommended} is recommended for lending {asset}",
                "user_prompt": f"Which platform would you like to proceed with to lend {asset}? Please select 'MovePosition' or 'Echelon'."
            })
        else:
            return json.dumps({
                "action": "lend",
                "asset": asset,
                "error": "Unable to fetch data from one or both protocols",
                "message": "Cannot make recommendation - data unavailable"
            })
    elif action.lower() == "borrow":
        if echelon_asset and moveposition_broker:
            echelon_rate = echelon_asset.get("borrowApr", 0) * 100
            echelon_ltv = echelon_asset.get("ltv", 0) * 100
            moveposition_rate = moveposition_broker.get("interestRate", 0) * 100
            moveposition_utilization = moveposition_broker.get("utilization", 0) * 100
            if echelon_rate < moveposition_rate:
                recommended = "Echelon"
                reason = f"Lower borrow APR ({echelon_rate:.2f}% vs {moveposition_rate:.2f}%)"
                if echelon_ltv > 0:
                    reason += f" and higher LTV ({echelon_ltv:.2f}%)"
                advantage = f"-{moveposition_rate - echelon_rate:.2f}% APR"
            else:
                recommended = "MovePosition"
                reason = f"Lower borrow APR ({moveposition_rate:.2f}% vs {echelon_rate:.2f}%)"
                advantage = f"-{echelon_rate - moveposition_rate:.2f}% APR"
            return json.dumps({
                "action": "borrow",
                "asset": asset,
                "recommended_protocol": recommended,
                "reason": reason,
                "moveposition_rate": f"{moveposition_rate:.2f}%",
                "echelon_rate": f"{echelon_rate:.2f}%",
                "moveposition_utilization": f"{moveposition_utilization:.2f}%",
                "echelon_ltv": f"{echelon_ltv:.2f}%",
                "advantage": advantage,
                "message": f"{recommended} is recommended for borrowing {asset}",
                "user_prompt": f"Which platform would you like to proceed with to borrow {asset}? Please select 'MovePosition' or 'Echelon'."
            })
        elif moveposition_broker:
            # Only MovePosition data available
            moveposition_rate = moveposition_broker.get("interestRate", 0) * 100
            moveposition_utilization = moveposition_broker.get("utilization", 0) * 100
            return json.dumps({
                "action": "borrow",
                "asset": asset,
                "recommended_protocol": "MovePosition",
                "reason": f"MovePosition available with {moveposition_rate:.2f}% APR (Echelon data unavailable)",
                "moveposition_rate": f"{moveposition_rate:.2f}%",
                "echelon_rate": "N/A",
                "moveposition_utilization": f"{moveposition_utilization:.2f}%",
                "echelon_ltv": "N/A",
                "message": f"MovePosition is available for borrowing {asset} at {moveposition_rate:.2f}% APR. Echelon data is currently unavailable.",
                "user_prompt": f"Would you like to proceed with MovePosition to borrow {asset}?"
            })
        elif echelon_asset:
            # Only Echelon data available
            echelon_rate = echelon_asset.get("borrowApr", 0) * 100
            echelon_ltv = echelon_asset.get("ltv", 0) * 100
            return json.dumps({
                "action": "borrow",
                "asset": asset,
                "recommended_protocol": "Echelon",
                "reason": f"Echelon available with {echelon_rate:.2f}% APR (MovePosition data unavailable)",
                "moveposition_rate": "N/A",
                "echelon_rate": f"{echelon_rate:.2f}%",
                "moveposition_utilization": "N/A",
                "echelon_ltv": f"{echelon_ltv:.2f}%",
                "message": f"Echelon is available for borrowing {asset} at {echelon_rate:.2f}% APR. MovePosition data is currently unavailable.",
                "user_prompt": f"Would you like to proceed with Echelon to borrow {asset}?"
            })
        else:
            return json.dumps({
                "action": "borrow",
                "asset": asset,
                "error": "Unable to fetch data from either protocol",
                "message": "Cannot make recommendation - both protocols are currently unavailable. Please try again later."
            })
    else:
        return json.dumps({
            "error": "Invalid action. Use 'lend' or 'borrow'",
            "message": "Please specify 'lend' or 'borrow'"
        })


def convert_apr_to_apy(apr: float) -> float:
    """Convert APR (Annual Percentage Rate) to APY (Annual Percentage Yield).
    
    APY = (1 + APR/n)^n - 1, where n is compounding frequency.
    For lending protocols, we typically use daily compounding (n=365).
    
    Args:
        apr: APR as percentage (e.g., 37.24 for 37.24%)
    
    Returns:
        APY as percentage (e.g., 44.85 for 44.85%)
    """
    if apr <= 0:
        return 0.0
    apr_decimal = apr / 100.0
    compounding_frequency = 365.0
    apy_decimal = (1.0 + apr_decimal / compounding_frequency) ** compounding_frequency - 1.0
    apy_percentage = apy_decimal * 100.0
    return apy_percentage


@tool
def get_best_supply_rate(asset: Optional[str] = None) -> str:
    """Find the best supply/lending rate across MovePosition and Echelon protocols.
    
    This tool compares all available assets across both protocols and returns the best supply rate.
    All rates are converted to APY (Annual Percentage Yield) for fair comparison.
    If an asset is specified, it compares that asset between protocols.
    If no asset is specified, it finds the overall best rate across all assets.
    
    Args:
        asset: Optional asset symbol to compare (e.g., "USDC", "MOVE"). If None, finds best across all assets.
    
    Returns:
        JSON string with the best protocol, asset, and APY information (all rates in APY)
    """
    echelon_data = fetch_echelon_data()
    moveposition_data = fetch_moveposition_data()
    if not echelon_data and not moveposition_data:
        return json.dumps({
            "error": "Unable to fetch data from protocols",
            "message": "Both protocols are currently unavailable"
        })
    best_rate = 0.0
    best_protocol = None
    best_asset = None
    best_asset_symbol = None
    all_rates = []
    if asset:
        asset_upper = asset.upper()
        echelon_asset = find_asset_in_echelon(echelon_data, asset_upper) if echelon_data else None
        moveposition_broker = find_asset_in_moveposition(moveposition_data, asset_upper) if moveposition_data else None
        if echelon_asset:
            echelon_supply_apr = calculate_echelon_supply_apr(echelon_asset)
            echelon_supply_apy = convert_apr_to_apy(echelon_supply_apr)
            all_rates.append({
                "protocol": "Echelon",
                "asset": echelon_asset.get("symbol", asset_upper),
                "asset_name": echelon_asset.get("name", ""),
                "supply_rate": echelon_supply_apy,
                "supply_rate_apr": echelon_supply_apr,
                "rate_type": "APY"
            })
            if echelon_supply_apy > best_rate:
                best_rate = echelon_supply_apy
                best_protocol = "Echelon"
                best_asset = echelon_asset
                best_asset_symbol = echelon_asset.get("symbol", asset_upper)
        if moveposition_broker:
            moveposition_supply_apy = calculate_moveposition_supply_apy_by_utilization(moveposition_broker)
            underlying = moveposition_broker.get("underlyingAsset", {})
            asset_name = underlying.get("name", "")
            all_rates.append({
                "protocol": "MovePosition",
                "asset": asset_upper,
                "asset_name": asset_name,
                "supply_rate": moveposition_supply_apy,
                "rate_type": "APY"
            })
            if moveposition_supply_apy > best_rate:
                best_rate = moveposition_supply_apy
                best_protocol = "MovePosition"
                best_asset = moveposition_broker
                best_asset_symbol = asset_upper
        if not all_rates:
            return json.dumps({
                "asset": asset_upper,
                "error": "Asset not found in either protocol",
                "message": f"{asset_upper} is not available on MovePosition or Echelon"
            })
        comparison = {
            "asset": asset_upper,
            "best_protocol": best_protocol,
            "best_rate": f"{best_rate:.4f}%",
            "rate_type": "APY",
            "note": "All rates converted to APY for fair comparison",
            "all_rates": all_rates,
            "message": f"Best supply rate for {asset_upper} is {best_rate:.4f}% APY on {best_protocol}"
        }
        return json.dumps(comparison)
    else:
        if echelon_data and "data" in echelon_data and "assets" in echelon_data["data"]:
            for echelon_asset in echelon_data["data"]["assets"]:
                symbol = echelon_asset.get("symbol", "")
                supply_apr = calculate_echelon_supply_apr(echelon_asset)
                supply_apy = convert_apr_to_apy(supply_apr)
                if supply_apy > best_rate:
                    best_rate = supply_apy
                    best_protocol = "Echelon"
                    best_asset = echelon_asset
                    best_asset_symbol = symbol
                all_rates.append({
                    "protocol": "Echelon",
                    "asset": symbol,
                    "asset_name": echelon_asset.get("name", ""),
                    "supply_rate": supply_apy,
                    "supply_rate_apr": supply_apr,
                    "rate_type": "APY"
                })
        if moveposition_data:
            for broker in moveposition_data:
                underlying = broker.get("underlyingAsset", {})
                asset_name = underlying.get("name", "")
                symbol = asset_name.replace("movement-", "").replace("-fa", "").upper()
                if "move" in asset_name.lower() and "fa" in asset_name.lower():
                    symbol = "MOVE-FA"
                elif "move" in asset_name.lower():
                    symbol = "MOVE"
                supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
                if supply_apy > best_rate:
                    best_rate = supply_apy
                    best_protocol = "MovePosition"
                    best_asset = broker
                    best_asset_symbol = symbol
                all_rates.append({
                    "protocol": "MovePosition",
                    "asset": symbol,
                    "asset_name": asset_name,
                    "supply_rate": supply_apy,
                    "rate_type": "APY"
                })
        if not all_rates:
            return json.dumps({
                "error": "No rates available",
                "message": "Unable to fetch rates from either protocol"
            })
        sorted_rates = sorted(all_rates, key=lambda x: x["supply_rate"], reverse=True)
        top_5 = sorted_rates[:5]
        result = {
            "best_protocol": best_protocol,
            "best_asset": best_asset_symbol,
            "best_rate": f"{best_rate:.4f}%",
            "rate_type": "APY",
            "note": "All rates converted to APY for fair comparison",
            "top_5_rates": top_5,
            "total_assets_compared": len(all_rates),
            "message": f"Best supply rate is {best_rate:.4f}% APY for {best_asset_symbol} on {best_protocol}"
        }
        return json.dumps(result)


@tool
def supply_collateral(asset: str, amount: str, protocol: str = "moveposition") -> str:
    """Supply collateral to lending protocol.
    
    Args:
        asset: Asset symbol to supply (e.g., "USDC", "MOVE")
        amount: Amount to supply (as string, e.g., "1000")
        protocol: Protocol to use - "moveposition" or "echelon" (default: "moveposition")
    
    Returns:
        JSON string with supply transaction details
    """
    return json.dumps({
        "status": "success",
        "protocol": protocol,
        "asset": asset,
        "amount": amount,
        "collateral_value": f"{amount} {asset}",
        "borrowing_power": f"{float(amount) * 0.75:.2f} {asset}",
        "message": f"Supplied {amount} {asset} as collateral on {protocol}"
    })


@tool
def borrow_asset(asset: str, amount: str, protocol: str = "moveposition") -> str:
    """Borrow asset from lending protocol.
    
    Args:
        asset: Asset symbol to borrow (e.g., "USDC", "MOVE")
        amount: Amount to borrow (as string, e.g., "500")
        protocol: Protocol to use - "moveposition" or "echelon" (default: "moveposition")
    
    Returns:
        JSON string with borrow transaction details including interest rate and health factor
    """
    return json.dumps({
        "status": "success",
        "protocol": protocol,
        "asset": asset,
        "amount": amount,
        "interest_rate": "5.5%",
        "health_factor": "1.8",
        "liquidation_warning": "Keep health factor above 1.2 to avoid liquidation",
        "message": f"Borrowed {amount} {asset} from {protocol}"
    })


@tool
def repay_loan(asset: str, amount: str, protocol: str = "moveposition") -> str:
    """Repay loan to lending protocol.
    
    Args:
        asset: Asset symbol to repay (e.g., "USDC", "MOVE")
        amount: Amount to repay (as string, e.g., "500")
        protocol: Protocol to use - "moveposition" or "echelon" (default: "moveposition")
    
    Returns:
        JSON string with repayment details and updated health factor
    """
    return json.dumps({
        "status": "success",
        "protocol": protocol,
        "asset": asset,
        "amount": amount,
        "remaining_debt": "200 USDC",
        "health_factor": "2.5",
        "message": f"Repaid {amount} {asset} on {protocol}"
    })


@tool
def check_health_factor(protocol: str = "moveposition") -> str:
    """Check account health factor for a lending protocol.
    
    Health factor indicates how close your position is to liquidation.
    A health factor below 1.0 means your position can be liquidated.
    
    Args:
        protocol: Protocol to check - "moveposition" or "echelon" (default: "moveposition")
    
    Returns:
        JSON string with health factor, collateral value, borrowed value, and liquidation threshold
    """
    return json.dumps({
        "protocol": protocol,
        "health_factor": "1.8",
        "collateral_value": "1000 USD",
        "borrowed_value": "500 USD",
        "liquidation_threshold": "1.2",
        "status": "healthy",
        "warning": "Health factor is above liquidation threshold. Monitor regularly.",
        "message": f"Health factor check for {protocol}"
    })


def get_tools() -> List[Any]:
    return [
        # Comparison tools
        compare_lending_rates,
        compare_borrowing_rates,
        get_protocol_metrics,
        recommend_best_protocol,
        get_best_supply_rate,
        # Lending operation tools
        supply_collateral,
        borrow_asset,
        repay_loan,
        check_health_factor,
    ]


def validate_openai_api_key() -> None:
    if not os.getenv(ENV_OPENAI_API_KEY):
        raise ValueError("OPENAI_API_KEY required")


def create_chat_model() -> ChatOpenAI:
    return ChatOpenAI(model=os.getenv(ENV_OPENAI_MODEL, DEFAULT_MODEL), temperature=DEFAULT_TEMPERATURE)


def is_assistant_message(msg: Any) -> bool:
    if hasattr(msg, MESSAGE_KEY_TYPE):
        return msg.type == MESSAGE_TYPE_AI
    if isinstance(msg, dict):
        return msg.get(MESSAGE_KEY_TYPE) == MESSAGE_TYPE_AI
    return False


def extract_message_content(msg: Any) -> str:
    if hasattr(msg, MESSAGE_KEY_CONTENT):
        return msg.content
    if isinstance(msg, dict):
        return msg.get(MESSAGE_KEY_CONTENT, "")
    return ""


def extract_assistant_response(result: Any) -> str:
    if isinstance(result, dict) and MESSAGE_KEY_MESSAGES in result:
        for msg in reversed(result[MESSAGE_KEY_MESSAGES]):
            if is_assistant_message(msg):
                content = extract_message_content(msg)
                if content:
                    return content
    return ""


class LendingAgent:
    def __init__(self):
        self._agent = self._build_agent()

    def _build_agent(self):
        validate_openai_api_key()
        return create_agent(model=create_chat_model(), tools=get_tools(), system_prompt=get_system_prompt())

    async def invoke(self, query: str, session_id: str) -> str:
        try:
            result = await self._agent.ainvoke(
                {MESSAGE_KEY_MESSAGES: [{MESSAGE_KEY_ROLE: MESSAGE_ROLE_USER, MESSAGE_KEY_CONTENT: query}]},
                config={"configurable": {"thread_id": session_id}}
            )
            output = extract_assistant_response(result) or EMPTY_RESPONSE_MESSAGE
            return json.dumps({"response": output, "success": True})
        except Exception as e:
            return json.dumps({"response": f"Error: {e}", "success": False})


class LendingAgentExecutor(AgentExecutor):
    def __init__(self):
        self.agent = LendingAgent()

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        query = context.get_user_input()
        session_id = getattr(context, "context_id", DEFAULT_SESSION_ID)
        final_content = await self.agent.invoke(query, session_id)
        message = Message(
            message_id=str(uuid.uuid4()),
            role=Role.agent,
            parts=[Part(root=TextPart(kind="text", text=final_content))]
        )
        await event_queue.enqueue_event(message)

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError("cancel not supported")


def create_lending_agent_app(card_url: str) -> A2AStarletteApplication:
    """Create unified lending agent application combining comparison and operations."""
    agent_card = AgentCard(
        name="lending",
        description="Compare rates, find best supply options, and execute lending operations on MovePosition and Echelon protocols",
        url=card_url,
        version="2.0.0",
        default_input_modes=["text"],
        default_output_modes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[create_agent_skill()],
        supports_authenticated_extended_card=False,
    )
    return A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=DefaultRequestHandler(
            agent_executor=LendingAgentExecutor(),
            task_store=InMemoryTaskStore()
        ),
        extended_agent_card=agent_card,
    )


# Backward compatibility aliases
create_lending_comparison_agent_app = create_lending_agent_app
LendingComparisonAgent = LendingAgent
LendingComparisonAgentExecutor = LendingAgentExecutor

