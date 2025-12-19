"""
Lending Comparison Agent - Compare MovePosition and Echelon Lending Protocols

Tools: compare_lending_rates, compare_borrowing_rates, get_protocol_metrics, recommend_best_protocol
"""

import os
import uuid
import json
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
load_dotenv()
import requests

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
        response = requests.get(ECHELON_API_URL, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return None


def fetch_moveposition_data() -> Optional[List[Dict[str, Any]]]:
    """Fetch broker data from MovePosition API."""
    try:
        response = requests.get(MOVEPOSITION_API_URL, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
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
    """Find asset data in MovePosition API response by symbol."""
    if not data:
        return None
    symbol_mapping = {
        "USDC": ["movement-usdc", "usdc"],
        "USDT": ["movement-usdt", "usdt"],
        "MOVE": ["movement-move", "movement-move-fa", "move"],
        "WBTC": ["movement-wbtc", "wbtc"],
        "WETH": ["movement-weth", "weth"],
        "EZETH": ["movement-ezeth", "ezeth"],
        "LBTC": ["movement-lbtc", "lbtc"],
        "USDA": ["movement-usda", "usda"],
    }
    search_names = symbol_mapping.get(asset_symbol.upper(), [asset_symbol.lower()])
    for broker in data:
        underlying = broker.get("underlyingAsset", {})
        asset_name = underlying.get("name", "").lower()
        for search_name in search_names:
            if search_name.lower() in asset_name:
                return broker
    return None


def calculate_moveposition_supply_apy(broker: Dict[str, Any]) -> float:
    """Calculate supply APY from MovePosition deposit note exchange rate."""
    exchange_rate = broker.get("depositNoteExchangeRate", 1.0)
    if exchange_rate <= 1.0:
        return 0.0
    apy = (exchange_rate - 1.0) * 100
    return apy


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
        decimals = underlying.get("decimals", 8)
        available_liquidity = float(broker.get("scaledAvailableLiquidityUnderlying", 0))
        total_borrowed_scaled = float(broker.get("scaledTotalBorrowedUnderlying", 0))
        total_supplied_scaled = available_liquidity + total_borrowed_scaled
        tvl_value = total_supplied_scaled * price
        supplied_value = total_supplied_scaled * price
        borrowed_value = total_borrowed_scaled * price
        total_tvl += tvl_value
        total_supplied += supplied_value
        total_borrowed += borrowed_value
        supply_apy = calculate_moveposition_supply_apy(broker)
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
    return """You are a lending protocol comparison assistant for Movement Network.

Help users:
- Compare lending rates between MovePosition and Echelon
- Compare borrowing rates between protocols
- Analyze protocol metrics (TVL, liquidity, fees)
- Recommend the best protocol for lending
- Recommend the best protocol for borrowing

Always provide clear comparisons with specific numbers and explain your recommendations."""


def create_agent_skill() -> AgentSkill:
    return AgentSkill(
        id="lending_comparison_agent",
        name="Lending Comparison Agent",
        description="Compare MovePosition and Echelon lending protocols",
        tags=["lending", "comparison", "defi", "moveposition", "echelon", "rates"],
        examples=["compare lending rates for USDC", "which protocol is better for borrowing?", "show me protocol metrics"],
    )


@tool
def compare_lending_rates(asset: str = "USDC") -> str:
    """Compare lending (supply) rates between MovePosition and Echelon for an asset."""
    echelon_data = fetch_echelon_data()
    moveposition_data = fetch_moveposition_data()
    echelon_asset = find_asset_in_echelon(echelon_data, asset) if echelon_data else None
    moveposition_broker = find_asset_in_moveposition(moveposition_data, asset) if moveposition_data else None
    if echelon_asset:
        supply_apy = echelon_asset.get("supplyApr", 0) * 100
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
        supply_apy = calculate_moveposition_supply_apy(moveposition_broker)
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
        echelon_apy = echelon_asset.get("supplyApr", 0) * 100
        moveposition_apy = calculate_moveposition_supply_apy(moveposition_broker)
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
        echelon_apy = echelon_asset.get("borrowApr", 0) * 100
        moveposition_apy = moveposition_broker.get("interestRate", 0) * 100
        winner = "echelon" if echelon_apy < moveposition_apy else "moveposition"
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
        "message": f"Borrowing rate comparison for {asset}"
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
            echelon_rate = echelon_asset.get("supplyApr", 0) * 100
            moveposition_rate = calculate_moveposition_supply_apy(moveposition_broker)
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
                "message": f"{recommended} is recommended for lending {asset}"
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
                reason = f"Lower borrow APY ({echelon_rate:.2f}% vs {moveposition_rate:.2f}%)"
                if echelon_ltv > 0:
                    reason += f" and higher LTV ({echelon_ltv:.2f}%)"
                advantage = f"-{moveposition_rate - echelon_rate:.2f}% APY"
            else:
                recommended = "MovePosition"
                reason = f"Lower borrow APY ({moveposition_rate:.2f}% vs {echelon_rate:.2f}%)"
                advantage = f"-{echelon_rate - moveposition_rate:.2f}% APY"
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
                "message": f"{recommended} is recommended for borrowing {asset}"
            })
        else:
            return json.dumps({
                "action": "borrow",
                "asset": asset,
                "error": "Unable to fetch data from one or both protocols",
                "message": "Cannot make recommendation - data unavailable"
            })
    else:
        return json.dumps({
            "error": "Invalid action. Use 'lend' or 'borrow'",
            "message": "Please specify 'lend' or 'borrow'"
        })


def get_tools() -> List[Any]:
    return [compare_lending_rates, compare_borrowing_rates, get_protocol_metrics, recommend_best_protocol]


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


class LendingComparisonAgent:
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


class LendingComparisonAgentExecutor(AgentExecutor):
    def __init__(self):
        self.agent = LendingComparisonAgent()

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


def create_lending_comparison_agent_app(card_url: str) -> A2AStarletteApplication:
    agent_card = AgentCard(
        name="Lending Comparison Agent",
        description="Compare MovePosition and Echelon lending protocols to find the best rates",
        url=card_url,
        version="1.0.0",
        default_input_modes=["text"],
        default_output_modes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[create_agent_skill()],
        supports_authenticated_extended_card=False,
    )
    return A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=DefaultRequestHandler(
            agent_executor=LendingComparisonAgentExecutor(),
            task_store=InMemoryTaskStore()
        ),
        extended_agent_card=agent_card,
    )

