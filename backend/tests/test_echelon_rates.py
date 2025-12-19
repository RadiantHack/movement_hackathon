"""Unit tests for echelon_rates.py

Tests the calculate_echelon_supply_apr and calculate_echelon_borrow_apr
functions with real asset data from Echelon protocol.
"""

import os
import sys
import pytest

# Add parent directory to path to import echelon_rates
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.lending_comparison.echelon_rates import (
    calculate_echelon_supply_apr,
    calculate_echelon_borrow_apr,
)


# Test data: Assets from Echelon protocol
ECHELON_ASSETS = [
    {
        "address": "0x1::aptos_coin::AptosCoin",
        "faAddress": "0xa",
        "symbol": "MOVE",
        "name": "Move Coin",
        "coinGeckoName": "movement",
        "decimals": 8,
        "icon": "/assets/icons/TokenMove.svg",
        "price": 0.03297556983307,
        "market": "0x568f96c4ed010869d810abcf348f4ff6b66d14ff09672fb7b5872e4881a25db7",
        "isFaMarket": False,
        "supplyApr": 0.37239241739735,
        "borrowApr": 0.619999999878928,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 25000000,
        "borrowCap": 10000000,
        "ltv": 0.7,
        "lt": 0.74
    },
    {
        "faAddress": "0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39",
        "symbol": "USDC",
        "name": "USD Coin",
        "coinGeckoName": "usd-coin",
        "decimals": 6,
        "icon": "https://cdn.jsdelivr.net/gh/PanoraExchange/Aptos-Tokens@main/logos/USDC.svg",
        "price": 0.999821779783815,
        "market": "0x789d7711b7979d47a1622692559ccd221ef7c35bb04f8762dadb5cc70222a0a0",
        "isFaMarket": True,
        "supplyApr": 0.0522766585927457,
        "borrowApr": 0.100262499880046,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 100000000,
        "borrowCap": 50000000,
        "ltv": 0.8,
        "lt": 0.82,
        "emodeLtv": 0.93,
        "emodeLt": 0.95
    },
    {
        "faAddress": "0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d",
        "symbol": "USDT",
        "name": "Tether",
        "coinGeckoName": "tether",
        "decimals": 6,
        "icon": "https://cdn.jsdelivr.net/gh/PanoraExchange/Aptos-Tokens@main/logos/USDT.svg",
        "price": 0.999435869976878,
        "market": "0x8191d4b8c0fc0af511b3c56c555528a3e74b7f3cfab3047df9ebda803f3bc3d2",
        "isFaMarket": True,
        "supplyApr": 0.047939202748239,
        "borrowApr": 0.0960124998819083,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 100000000,
        "borrowCap": 50000000,
        "ltv": 0.8,
        "lt": 0.82,
        "emodeLtv": 0.93,
        "emodeLt": 0.95
    },
    {
        "faAddress": "0xb06f29f24dde9c6daeec1f930f14a441a8d6c0fbea590725e88b340af3e1939c",
        "symbol": "WBTC",
        "name": "Wrapped BTC",
        "coinGeckoName": "wrapped-bitcoin",
        "decimals": 8,
        "icon": "https://assets.coingecko.com/coins/images/7598/standard/wrapped_bitcoin_wbtc.png",
        "price": 87760.0831323899,
        "market": "0xa24e2eaacf9603538af362f44dfcf9d411363923b9206260474abfaa8abebee4",
        "isFaMarket": True,
        "supplyApr": 0.000430642860010266,
        "borrowApr": 0.00575499981641769,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 50,
        "borrowCap": 10,
        "ltv": 0.76,
        "lt": 0.8
    },
    {
        "faAddress": "0x908828f4fb0213d4034c3ded1630bbd904e8a3a6bf3c63270887f0b06653a376",
        "symbol": "WETH",
        "name": "Wrapped Ether",
        "coinGeckoName": "ethereum",
        "decimals": 8,
        "icon": "https://cdn.jsdelivr.net/gh/PanoraExchange/Aptos-Tokens@main/logos/WETH.svg",
        "price": 2960.75764678,
        "market": "0x6889932d2ff09c9d299e72b23a62a7f07af807789c98141d08475701e7b21b7c",
        "isFaMarket": True,
        "supplyApr": 0,
        "borrowApr": 0,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 1000,
        "borrowCap": 0,
        "ltv": 0.7,
        "lt": 0.72
    },
    {
        "faAddress": "0x658f4ef6f76c8eeffdc06a30946f3f06723a7f9532e2413312b2a612183759c",
        "symbol": "LBTC",
        "name": "Lombard BTC",
        "coinGeckoName": "lombard-staked-btc",
        "decimals": 8,
        "icon": "https://assets.coingecko.com/coins/images/39969/standard/LBTC_Logo.png",
        "price": 87940.1096323899,
        "market": "0x62cb5f64b5a9891c57ff12d38fbab141e18c3d63e859a595ff6525b4221eaf23",
        "isFaMarket": True,
        "supplyApr": 0,
        "borrowApr": 0,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 50,
        "borrowCap": 0,
        "ltv": 0.7,
        "lt": 0.74
    },
    {
        "faAddress": "0x527c43638a6c389a9ad702e7085f31c48223624d5102a5207dfab861f482c46d",
        "symbol": "SolvBTC",
        "name": "Solv Protocol BTC",
        "coinGeckoName": "solv-btc",
        "decimals": 8,
        "icon": "https://assets.coingecko.com/coins/images/36800/standard/solvBTC.png",
        "price": 87803.1745799126,
        "market": "0x185f42070ab2ca5910ebfdea83c9f26f4015ad2c0f5c8e6ca1566d07c6c60aca",
        "isFaMarket": True,
        "supplyApr": 0,
        "borrowApr": 0,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 50,
        "borrowCap": 0,
        "ltv": 0.7,
        "lt": 0.74
    },
    {
        "faAddress": "0x2f6af255328fe11b88d840d1e367e946ccd16bd7ebddd6ee7e2ef9f7ae0c53ef",
        "symbol": "ezETH",
        "name": "Renzo Restaked ETH",
        "coinGeckoName": "renzo-restaked-eth",
        "decimals": 8,
        "icon": "https://assets.coingecko.com/coins/images/34753/standard/Ezeth_logo_circle.png?1713496404",
        "price": 3148.69729689998,
        "market": "0x8dd513b2bb41f0180f807ecaa1e0d2ddfacd57bf739534201247deca13f3542",
        "isFaMarket": True,
        "supplyApr": 0.0000069469679147,
        "borrowApr": 0.000688888831064105,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 1000,
        "borrowCap": 500,
        "ltv": 0.7,
        "lt": 0.72
    },
    {
        "faAddress": "0x74f0c7504507f7357f8a218cc70ce3fc0f4b4e9eb8474e53ca778cb1e0c6dcc5",
        "symbol": "sUSDe",
        "name": "Staked USDe",
        "coinGeckoName": "ethena-staked-usde",
        "decimals": 6,
        "icon": "https://cdn.jsdelivr.net/gh/PanoraExchange/Aptos-Tokens@main/logos/sUSDe.png",
        "price": 1.20996532985009,
        "market": "0x481fe68db505bc15973d0014c35217726efd6ee353d91a2a9faaac201f3423d",
        "isFaMarket": True,
        "supplyApr": 0,
        "borrowApr": 0,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 7500000000,
        "borrowCap": 0,
        "ltv": 0.8,
        "lt": 0.82,
        "emodeLtv": 0.93,
        "emodeLt": 0.95,
        "stakingApr": 0.0427571428571429
    },
    {
        "faAddress": "0x51ffc9885233adf3dd411078cad57535ed1982013dc82d9d6c433a55f2e0035d",
        "symbol": "rsETH",
        "name": "KelpDao Restaked ETH",
        "coinGeckoName": "kelp-dao-restaked-eth",
        "decimals": 8,
        "icon": "https://coin-images.coingecko.com/coins/images/37919/large/rseth.png?1715936438",
        "price": 3121.29088926991,
        "market": "0x4cbeca747528f340ef9065c93dea0cc1ac8a46b759e31fc8b8d04bc52a86614b",
        "isFaMarket": True,
        "supplyApr": 0,
        "borrowApr": 0,
        "farmingApr": {
            "supply": [],
            "borrow": []
        },
        "supplyCap": 3000,
        "borrowCap": 0,
        "ltv": 0.7,
        "lt": 0.72
    }
]


class TestCalculateEchelonSupplyAPR:
    """Tests for calculate_echelon_supply_apr function with real asset data."""

    def test_calculate_echelon_supply_apr_move(self) -> None:
        """Test supply APR calculation for MOVE."""
        asset = ECHELON_ASSETS[0]
        supply_apr = calculate_echelon_supply_apr(asset)
        expected_apr = 0.37239241739735 * 100
        assert abs(supply_apr - expected_apr) < 0.0001
        assert supply_apr >= 0
        print(f"MOVE Supply APR: {supply_apr:.4f}%")

    def test_calculate_echelon_supply_apr_usdc(self) -> None:
        """Test supply APR calculation for USDC."""
        asset = ECHELON_ASSETS[1]
        supply_apr = calculate_echelon_supply_apr(asset)
        expected_apr = 0.0522766585927457 * 100
        assert abs(supply_apr - expected_apr) < 0.0001
        assert supply_apr >= 0
        print(f"USDC Supply APR: {supply_apr:.4f}%")

    def test_calculate_echelon_supply_apr_usdt(self) -> None:
        """Test supply APR calculation for USDT."""
        asset = ECHELON_ASSETS[2]
        supply_apr = calculate_echelon_supply_apr(asset)
        expected_apr = 0.047939202748239 * 100
        assert abs(supply_apr - expected_apr) < 0.0001
        assert supply_apr >= 0
        print(f"USDT Supply APR: {supply_apr:.4f}%")

    def test_calculate_echelon_supply_apr_all_assets(self) -> None:
        """Test supply APR calculation for all assets in the dataset."""
        asset_names = ["MOVE", "USDC", "USDT", "WBTC", "WETH", "LBTC", "SolvBTC", "ezETH", "sUSDe", "rsETH"]
        print("\n=== Echelon Supply APR for All Assets ===")
        for idx, asset in enumerate(ECHELON_ASSETS):
            supply_apr = calculate_echelon_supply_apr(asset)
            symbol = asset.get("symbol", "unknown")
            print(f"{asset_names[idx]:10} | Supply APR: {supply_apr:8.4f}%")
            assert supply_apr >= 0
            assert isinstance(supply_apr, float)

    def test_calculate_echelon_supply_apr_edge_cases(self) -> None:
        """Test edge cases for calculate_echelon_supply_apr function."""
        # Test with missing supplyApr field
        asset_missing = {}
        assert calculate_echelon_supply_apr(asset_missing) == 0.0
        # Test with negative supply APR
        asset_negative = {"supplyApr": -0.1}
        assert calculate_echelon_supply_apr(asset_negative) == 0.0
        # Test with zero supply APR
        asset_zero = {"supplyApr": 0.0}
        assert calculate_echelon_supply_apr(asset_zero) == 0.0


class TestCalculateEchelonBorrowAPR:
    """Tests for calculate_echelon_borrow_apr function with real asset data."""

    def test_calculate_echelon_borrow_apr_move(self) -> None:
        """Test borrow APR calculation for MOVE."""
        asset = ECHELON_ASSETS[0]
        borrow_apr = calculate_echelon_borrow_apr(asset)
        expected_apr = 0.619999999878928 * 100
        assert abs(borrow_apr - expected_apr) < 0.0001
        assert borrow_apr >= 0
        print(f"MOVE Borrow APR: {borrow_apr:.4f}%")

    def test_calculate_echelon_borrow_apr_usdc(self) -> None:
        """Test borrow APR calculation for USDC."""
        asset = ECHELON_ASSETS[1]
        borrow_apr = calculate_echelon_borrow_apr(asset)
        expected_apr = 0.100262499880046 * 100
        assert abs(borrow_apr - expected_apr) < 0.0001
        assert borrow_apr >= 0
        print(f"USDC Borrow APR: {borrow_apr:.4f}%")

    def test_calculate_echelon_borrow_apr_usdt(self) -> None:
        """Test borrow APR calculation for USDT."""
        asset = ECHELON_ASSETS[2]
        borrow_apr = calculate_echelon_borrow_apr(asset)
        expected_apr = 0.0960124998819083 * 100
        assert abs(borrow_apr - expected_apr) < 0.0001
        assert borrow_apr >= 0
        print(f"USDT Borrow APR: {borrow_apr:.4f}%")

    def test_calculate_echelon_borrow_apr_all_assets(self) -> None:
        """Test borrow APR calculation for all assets in the dataset."""
        asset_names = ["MOVE", "USDC", "USDT", "WBTC", "WETH", "LBTC", "SolvBTC", "ezETH", "sUSDe", "rsETH"]
        print("\n=== Echelon Borrow APR for All Assets ===")
        for idx, asset in enumerate(ECHELON_ASSETS):
            borrow_apr = calculate_echelon_borrow_apr(asset)
            symbol = asset.get("symbol", "unknown")
            print(f"{asset_names[idx]:10} | Borrow APR: {borrow_apr:8.4f}%")
            assert borrow_apr >= 0
            assert isinstance(borrow_apr, float)

    def test_calculate_echelon_borrow_apr_edge_cases(self) -> None:
        """Test edge cases for calculate_echelon_borrow_apr function."""
        # Test with missing borrowApr field
        asset_missing = {}
        assert calculate_echelon_borrow_apr(asset_missing) == 0.0
        # Test with negative borrow APR
        asset_negative = {"borrowApr": -0.1}
        assert calculate_echelon_borrow_apr(asset_negative) == 0.0
        # Test with zero borrow APR
        asset_zero = {"borrowApr": 0.0}
        assert calculate_echelon_borrow_apr(asset_zero) == 0.0

    def test_calculate_echelon_supply_and_borrow_apr_together(self) -> None:
        """Test that supply and borrow APR are calculated correctly together."""
        asset = ECHELON_ASSETS[0]  # MOVE with high rates
        supply_apr = calculate_echelon_supply_apr(asset)
        borrow_apr = calculate_echelon_borrow_apr(asset)
        print(f"\nMOVE Asset Rates:")
        print(f"  Supply APR: {supply_apr:.4f}%")
        print(f"  Borrow APR: {borrow_apr:.4f}%")
        assert supply_apr >= 0
        assert borrow_apr >= 0
        assert borrow_apr > supply_apr  # Borrow rate should be higher than supply rate

