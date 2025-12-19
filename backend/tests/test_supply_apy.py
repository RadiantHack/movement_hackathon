"""Unit tests for moveposition_rates.py

Tests the calculate_moveposition_supply_apy_by_utilization and calculate_moveposition_borrow_apr
functions with real broker data from MovePosition protocol.
"""

import os
import sys
import pytest

# Add parent directory to path to import moveposition_rates
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.lending_comparison.moveposition_rates import (
    calculate_moveposition_supply_apy_by_utilization,
    calculate_moveposition_borrow_apr,
)


# Test data: All brokers from MovePosition protocol
BROKER_DATA = [
    {
        "utilization": 0.051149345685365666,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0x1::aptos_coin::AptosCoin>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0x1::aptos_coin::AptosCoin",
            "name": "movement-move",
            "decimals": 8,
            "price": 0.03303292
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0x1::aptos_coin::AptosCoin>",
            "name": "movement-move-super-aptos-loan-note",
            "decimals": 8,
            "price": 0.033886280381
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0x1::aptos_coin::AptosCoin>",
            "name": "movement-move-super-aptos-deposit-note",
            "decimals": 8,
            "price": 0.033500119661
        },
        "availableLiquidityUnderlying": "942565534",
        "totalBorrowedUnderlying": "50810536",
        "scaledAvailableLiquidityUnderlying": "9.42565534",
        "scaledTotalBorrowedUnderlying": "0.50810536",
        "interestRate": 0.002841630315853648,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "49530971",
        "depositNoteSupply": "979522240",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.05,
            "r2": 1,
            "r3": 1
        },
        "maxDeposit": "1000000000",
        "maxBorrow": "1000000000",
        "maxBorrowScaled": "10",
        "maxDepositScaled": "10",
        "depositNoteExchangeRate": 1.0141434563037588,
        "loanNoteExchangeRate": 1.0258336344748824
    },
    {
        "utilization": 0.5626705836928665,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDC>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDC",
            "name": "movement-usdc",
            "decimals": 6,
            "price": 1.000065423333
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDC>",
            "name": "movement-usdc-super-aptos-loan-note",
            "decimals": 6,
            "price": 1.174159001535
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDC>",
            "name": "movement-usdc-super-aptos-deposit-note",
            "decimals": 6,
            "price": 1.113328949464
        },
        "availableLiquidityUnderlying": "229779626619",
        "totalBorrowedUnderlying": "295635810923",
        "scaledAvailableLiquidityUnderlying": "229779.626619",
        "scaledTotalBorrowedUnderlying": "295635.810923",
        "interestRate": 0.12503790748730367,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "251801631650",
        "depositNoteSupply": "471962767360",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "100000000000000",
        "maxBorrow": "100000000000000",
        "maxBorrowScaled": "100000000",
        "maxDepositScaled": "100000000",
        "depositNoteExchangeRate": 1.1132561165385908,
        "loanNoteExchangeRate": 1.1740821891651947
    },
    {
        "utilization": 0.45116183262694587,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDt>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDt",
            "name": "movement-usdt",
            "decimals": 6,
            "price": 0.999381475
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDt>",
            "name": "movement-usdt-super-aptos-loan-note",
            "decimals": 6,
            "price": 1.154260310015
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDt>",
            "name": "movement-usdt-super-aptos-deposit-note",
            "decimals": 6,
            "price": 1.097064573368
        },
        "availableLiquidityUnderlying": "381280691056",
        "totalBorrowedUnderlying": "313424440114",
        "scaledAvailableLiquidityUnderlying": "381280.691056",
        "scaledTotalBorrowedUnderlying": "313424.440114",
        "interestRate": 0.10025818502821018,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "271369098066",
        "depositNoteSupply": "632848289456",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "100000000000000",
        "maxBorrow": "100000000000000",
        "maxBorrowScaled": "100000000",
        "maxDepositScaled": "100000000",
        "depositNoteExchangeRate": 1.0977435552005244,
        "loanNoteExchangeRate": 1.1549746907356846
    },
    {
        "utilization": 0.5724671393639761,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WETH>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WETH",
            "name": "movement-weth",
            "decimals": 8,
            "price": 2957.54650255
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WETH>",
            "name": "movement-weth-super-aptos-loan-note",
            "decimals": 8,
            "price": 3302.254568855097
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WETH>",
            "name": "movement-weth-super-aptos-deposit-note",
            "decimals": 8,
            "price": 3147.791061241722
        },
        "availableLiquidityUnderlying": "10355602581",
        "totalBorrowedUnderlying": "13866167333",
        "scaledAvailableLiquidityUnderlying": "103.55602581",
        "scaledTotalBorrowedUnderlying": "138.66167333",
        "interestRate": 0.12721491985866135,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "12418738121",
        "depositNoteSupply": "22757867184",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "180000000000",
        "maxBorrow": "180000000000",
        "maxBorrowScaled": "1800",
        "maxDepositScaled": "1800",
        "depositNoteExchangeRate": 1.0643251284562028,
        "loanNoteExchangeRate": 1.1165520359554413
    },
    {
        "utilization": 0.2697929314407008,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WBTC>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WBTC",
            "name": "movement-wbtc",
            "decimals": 8,
            "price": 87710.41666855
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WBTC>",
            "name": "movement-wbtc-super-aptos-loan-note",
            "decimals": 8,
            "price": 97276.80760261301
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WBTC>",
            "name": "movement-wbtc-super-aptos-deposit-note",
            "decimals": 8,
            "price": 92947.3557477767
        },
        "availableLiquidityUnderlying": "87966461",
        "totalBorrowedUnderlying": "32501369",
        "scaledAvailableLiquidityUnderlying": "0.87966461",
        "scaledTotalBorrowedUnderlying": "0.32501369",
        "interestRate": 0.05995398476460018,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "29305121",
        "depositNoteSupply": "113680303",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "5500000000",
        "maxBorrow": "5500000000",
        "maxBorrowScaled": "55",
        "maxDepositScaled": "55",
        "depositNoteExchangeRate": 1.0597071508509261,
        "loanNoteExchangeRate": 1.1090678997708285
    },
    {
        "utilization": 0.9058979793886733,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::MOVE>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::MOVE",
            "name": "movement-move-fa",
            "decimals": 8,
            "price": 0.03303292
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::MOVE>",
            "name": "movement-move-fa-super-aptos-loan-note",
            "decimals": 8,
            "price": 0.039588713504
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::MOVE>",
            "name": "movement-move-fa-super-aptos-deposit-note",
            "decimals": 8,
            "price": 0.037246417538
        },
        "availableLiquidityUnderlying": "44337528882574",
        "totalBorrowedUnderlying": "426826943405466",
        "scaledAvailableLiquidityUnderlying": "443375.28882574",
        "scaledTotalBorrowedUnderlying": "4268269.43405466",
        "interestRate": 0.3061636289961197,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "356145452263285",
        "depositNoteSupply": "417864034954363",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "10000000000000000",
        "maxBorrow": "10000000000000000",
        "maxBorrowScaled": "100000000",
        "maxDepositScaled": "100000000",
        "depositNoteExchangeRate": 1.1275544982939205,
        "loanNoteExchangeRate": 1.1984624279013083
    },
    {
        "utilization": 0.1897394481910349,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::EZETH>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::EZETH",
            "name": "movement-ezeth",
            "decimals": 8,
            "price": 2957.58293121
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::EZETH>",
            "name": "movement-ezeth-super-aptos-loan-note",
            "decimals": 8,
            "price": 3107.335930936518
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::EZETH>",
            "name": "movement-ezeth-super-aptos-deposit-note",
            "decimals": 8,
            "price": 3018.384710442004
        },
        "availableLiquidityUnderlying": "435811542",
        "totalBorrowedUnderlying": "102054384",
        "scaledAvailableLiquidityUnderlying": "4.35811542",
        "scaledTotalBorrowedUnderlying": "1.02054384",
        "interestRate": 0.04216432182022997,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "97136039",
        "depositNoteSupply": "527031255",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "180000000000",
        "maxBorrow": "180000000000",
        "maxBorrowScaled": "1800",
        "maxDepositScaled": "1800",
        "depositNoteExchangeRate": 1.0205579287702775,
        "loanNoteExchangeRate": 1.050633575865699
    },
    {
        "utilization": 0.0011474902425582993,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::STBTC>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::STBTC",
            "name": "movement-stbtc",
            "decimals": 8,
            "price": 87714.150720185
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::STBTC>",
            "name": "movement-stbtc-super-aptos-loan-note",
            "decimals": 8,
            "price": 92587.15909352862
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::STBTC>",
            "name": "movement-stbtc-super-aptos-deposit-note",
            "decimals": 8,
            "price": 90119.1327473308
        },
        "availableLiquidityUnderlying": "132311",
        "totalBorrowedUnderlying": "152",
        "scaledAvailableLiquidityUnderlying": "0.00132311",
        "scaledTotalBorrowedUnderlying": "0.00000152",
        "interestRate": 0.000254997831679622,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "144",
        "depositNoteSupply": "128928",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "0",
        "maxBorrow": "0",
        "maxBorrowScaled": "0",
        "maxDepositScaled": "0",
        "depositNoteExchangeRate": 1.027418404070489,
        "loanNoteExchangeRate": 1.0555555555555556
    },
    {
        "utilization": 0.11536101190750293,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::RSETH>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::RSETH",
            "name": "movement-rseth",
            "decimals": 8,
            "price": 3124.97197185
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::RSETH>",
            "name": "movement-rseth-super-aptos-loan-note",
            "decimals": 8,
            "price": 3242.039219574107
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::RSETH>",
            "name": "movement-rseth-super-aptos-deposit-note",
            "decimals": 8,
            "price": 3159.384590606479
        },
        "availableLiquidityUnderlying": "33108419349",
        "totalBorrowedUnderlying": "4317490875",
        "scaledAvailableLiquidityUnderlying": "331.08419349",
        "scaledTotalBorrowedUnderlying": "43.17490875",
        "interestRate": 0.025635780423889542,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "4161589993",
        "depositNoteSupply": "37018260081",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "180000000000",
        "maxBorrow": "180000000000",
        "maxBorrowScaled": "1800",
        "maxDepositScaled": "1800",
        "depositNoteExchangeRate": 1.0110121367700162,
        "loanNoteExchangeRate": 1.0374618552673938
    },
    {
        "utilization": 0.24445873083823313,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WEETH>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WEETH",
            "name": "movement-weeth",
            "decimals": 8,
            "price": 3205.54189402
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WEETH>",
            "name": "movement-weeth-super-aptos-loan-note",
            "decimals": 8,
            "price": 3390.728705991047
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WEETH>",
            "name": "movement-weeth-super-aptos-deposit-note",
            "decimals": 8,
            "price": 3280.724292345272
        },
        "availableLiquidityUnderlying": "7843064223",
        "totalBorrowedUnderlying": "2537658238",
        "scaledAvailableLiquidityUnderlying": "78.43064223",
        "scaledTotalBorrowedUnderlying": "25.37658238",
        "interestRate": 0.05432416240849625,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "2399062414",
        "depositNoteSupply": "10142833647",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "180000000000",
        "maxBorrow": "180000000000",
        "maxBorrowScaled": "1800",
        "maxDepositScaled": "1800",
        "depositNoteExchangeRate": 1.0234538810631446,
        "loanNoteExchangeRate": 1.0577708288001215
    },
    {
        "utilization": 0.6289459633714726,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::LBTC>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::LBTC",
            "name": "movement-lbtc",
            "decimals": 8,
            "price": 87998.32039166501
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::LBTC>",
            "name": "movement-lbtc-super-aptos-loan-note",
            "decimals": 8,
            "price": 106331.70792835021
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::LBTC>",
            "name": "movement-lbtc-super-aptos-deposit-note",
            "decimals": 8,
            "price": 100616.31455283944
        },
        "availableLiquidityUnderlying": "569175",
        "totalBorrowedUnderlying": "964766",
        "scaledAvailableLiquidityUnderlying": "0.00569175",
        "scaledTotalBorrowedUnderlying": "0.00964766",
        "interestRate": 0.13976576963810503,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "798424",
        "depositNoteSupply": "1341574",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "5500000000",
        "maxBorrow": "5500000000",
        "maxBorrowScaled": "55",
        "maxDepositScaled": "55",
        "depositNoteExchangeRate": 1.1433890340749,
        "loanNoteExchangeRate": 1.208337925713656
    },
    {
        "utilization": 0.3660582603832144,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDa>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDa",
            "name": "movement-usda",
            "decimals": 8,
            "price": 0.99225332
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDa>",
            "name": "movement-usda-super-aptos-loan-note",
            "decimals": 8,
            "price": 1.069438231721
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDa>",
            "name": "movement-usda-super-aptos-deposit-note",
            "decimals": 8,
            "price": 1.044457813241
        },
        "availableLiquidityUnderlying": "11457137417837",
        "totalBorrowedUnderlying": "6615718022732",
        "scaledAvailableLiquidityUnderlying": "114571.37417837",
        "scaledTotalBorrowedUnderlying": "66157.18022732",
        "interestRate": 0.02033657002128969,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "6138239664083",
        "depositNoteSupply": "17169531009712",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.05,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "1000000000000000",
        "maxBorrow": "910000000000000",
        "maxBorrowScaled": "9100000",
        "maxDepositScaled": "10000000",
        "depositNoteExchangeRate": 1.05261206205027,
        "loanNoteExchangeRate": 1.077787506643459
    },
    {
        "utilization": 3.36184e-15,
        "network": "Aptos",
        "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::broker::Broker<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::SUSDa>",
        "underlyingAsset": {
            "network": "aptos",
            "networkAddress": "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::SUSDa",
            "name": "movement-susda",
            "decimals": 8,
            "price": 1.0866769076
        },
        "loanNote": {
            "network": "aptos",
            "networkAddress": "LoanNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::SUSDa>",
            "name": "movement-susda-super-aptos-loan-note",
            "decimals": 8,
            "price": 2.1733538152
        },
        "depositNote": {
            "network": "aptos",
            "networkAddress": "DepositNote<0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::SUSDa>",
            "name": "movement-susda-super-aptos-deposit-note",
            "decimals": 8,
            "price": 1.086676921611
        },
        "availableLiquidityUnderlying": "594907334815722",
        "totalBorrowedUnderlying": "2",
        "scaledAvailableLiquidityUnderlying": "5949073.34815722",
        "scaledTotalBorrowedUnderlying": "2e-8",
        "interestRate": 7.4707e-16,
        "interestFeeRate": 0.22,
        "loanNoteSupply": "1",
        "depositNoteSupply": "594907327145062",
        "interestRateCurve": {
            "u1": 0.9,
            "u2": 1,
            "r0": 0,
            "r1": 0.2,
            "r2": 2,
            "r3": 2
        },
        "maxDeposit": "1500000000000000",
        "maxBorrow": "0",
        "maxBorrowScaled": "0",
        "maxDepositScaled": "15000000",
        "depositNoteExchangeRate": 1.000000012893877,
        "loanNoteExchangeRate": 2
    }
]


class TestCalculateSupplyAPY:
    """Tests for calculate_moveposition_supply_apy_by_utilization function with real broker data."""

    def test_calculate_moveposition_supply_apy_by_utilization_movement_move(self) -> None:
        """Test APY calculation for movement-move (AptosCoin)."""
        broker = BROKER_DATA[0]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.051149345685365666 * 0.002841630315853648 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"movement-move: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_usdc(self) -> None:
        """Test APY calculation for USDC."""
        broker = BROKER_DATA[1]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.5626705836928665 * 0.12503790748730367 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"USDC: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_usdt(self) -> None:
        """Test APY calculation for USDT."""
        broker = BROKER_DATA[2]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.45116183262694587 * 0.10025818502821018 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"USDT: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_weth(self) -> None:
        """Test APY calculation for WETH."""
        broker = BROKER_DATA[3]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.5724671393639761 * 0.12721491985866135 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"WETH: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_wbtc(self) -> None:
        """Test APY calculation for WBTC."""
        broker = BROKER_DATA[4]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.2697929314407008 * 0.05995398476460018 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"WBTC: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_move_fa(self) -> None:
        """Test APY calculation for MOVE-FA (high utilization example)."""
        broker = BROKER_DATA[5]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.9058979793886733 * 0.3061636289961197 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"MOVE-FA: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_ezeth(self) -> None:
        """Test APY calculation for EZETH."""
        broker = BROKER_DATA[6]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.1897394481910349 * 0.04216432182022997 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"EZETH: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_stbtc(self) -> None:
        """Test APY calculation for STBTC (very low utilization)."""
        broker = BROKER_DATA[7]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.0011474902425582993 * 0.000254997831679622 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"STBTC: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_rseth(self) -> None:
        """Test APY calculation for RSETH."""
        broker = BROKER_DATA[8]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.11536101190750293 * 0.025635780423889542 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"RSETH: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_weeth(self) -> None:
        """Test APY calculation for WEETH."""
        broker = BROKER_DATA[9]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.24445873083823313 * 0.05432416240849625 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"WEETH: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_lbtc(self) -> None:
        """Test APY calculation for LBTC."""
        broker = BROKER_DATA[10]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.6289459633714726 * 0.13976576963810503 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"LBTC: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_usda(self) -> None:
        """Test APY calculation for USDA."""
        broker = BROKER_DATA[11]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 0.3660582603832144 * 0.02033657002128969 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 0.0001
        assert supply_apy >= 0
        print(f"USDA: {supply_apy:.4f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_susda(self) -> None:
        """Test APY calculation for SUSDA (near-zero utilization)."""
        broker = BROKER_DATA[12]
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        expected_apy = 3.36184e-15 * 7.4707e-16 * (1 - 0.22) * 100
        assert abs(supply_apy - expected_apy) < 1e-20
        assert supply_apy >= 0
        print(f"SUSDA: {supply_apy:.20f}%")

    def test_calculate_moveposition_supply_apy_by_utilization_all_brokers(self) -> None:
        """Test APY calculation for all brokers in the dataset."""
        asset_names = [
            "movement-move",
            "USDC",
            "USDT",
            "WETH",
            "WBTC",
            "MOVE-FA",
            "EZETH",
            "STBTC",
            "RSETH",
            "WEETH",
            "LBTC",
            "USDA",
            "SUSDA"
        ]
        print("\n=== Supply APY for All Brokers ===")
        for idx, broker in enumerate(BROKER_DATA):
            supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
            asset_name = broker.get("underlyingAsset", {}).get("name", "unknown")
            utilization = broker.get("utilization", 0) * 100
            borrow_rate = broker.get("interestRate", 0) * 100
            print(f"{asset_names[idx]:15} | Utilization: {utilization:6.2f}% | "
                  f"Borrow APY: {borrow_rate:6.2f}% | Supply APY: {supply_apy:6.4f}%")
            assert supply_apy >= 0
            assert isinstance(supply_apy, float)

    def test_calculate_moveposition_supply_apy_by_utilization_edge_cases(self) -> None:
        """Test edge cases for calculate_moveposition_supply_apy_by_utilization function."""
        # Test with missing fields
        broker_missing_utilization = {"interestRate": 0.1, "interestFeeRate": 0.22}
        assert calculate_moveposition_supply_apy_by_utilization(broker_missing_utilization) == 0.0
        # Test with negative values
        broker_negative = {"utilization": -0.1, "interestRate": 0.1, "interestFeeRate": 0.22}
        assert calculate_moveposition_supply_apy_by_utilization(broker_negative) == 0.0
        # Test with fee rate >= 1.0
        broker_high_fee = {"utilization": 0.5, "interestRate": 0.1, "interestFeeRate": 1.0}
        assert calculate_moveposition_supply_apy_by_utilization(broker_high_fee) == 0.0
        # Test with zero utilization
        broker_zero_util = {"utilization": 0.0, "interestRate": 0.1, "interestFeeRate": 0.22}
        assert calculate_moveposition_supply_apy_by_utilization(broker_zero_util) == 0.0
        # Test with zero interest rate
        broker_zero_rate = {"utilization": 0.5, "interestRate": 0.0, "interestFeeRate": 0.22}
        assert calculate_moveposition_supply_apy_by_utilization(broker_zero_rate) == 0.0


class TestCalculateBorrowAPR:
    """Tests for calculate_moveposition_borrow_apr function with real broker data."""

    def test_calculate_moveposition_borrow_apr_movement_move(self) -> None:
        """Test borrow APR calculation for movement-move (AptosCoin)."""
        broker = BROKER_DATA[0]
        borrow_apr = calculate_moveposition_borrow_apr(broker)
        expected_apr = 0.002841630315853648 * 100
        assert abs(borrow_apr - expected_apr) < 0.0001
        assert borrow_apr >= 0
        print(f"movement-move Borrow APR: {borrow_apr:.4f}%")

    def test_calculate_moveposition_borrow_apr_usdc(self) -> None:
        """Test borrow APR calculation for USDC."""
        broker = BROKER_DATA[1]
        borrow_apr = calculate_moveposition_borrow_apr(broker)
        expected_apr = 0.12503790748730367 * 100
        assert abs(borrow_apr - expected_apr) < 0.0001
        assert borrow_apr >= 0
        print(f"USDC Borrow APR: {borrow_apr:.4f}%")

    def test_calculate_moveposition_borrow_apr_move_fa(self) -> None:
        """Test borrow APR calculation for MOVE-FA (high utilization example)."""
        broker = BROKER_DATA[5]
        borrow_apr = calculate_moveposition_borrow_apr(broker)
        expected_apr = 0.3061636289961197 * 100
        assert abs(borrow_apr - expected_apr) < 0.0001
        assert borrow_apr >= 0
        print(f"MOVE-FA Borrow APR: {borrow_apr:.4f}%")

    def test_calculate_moveposition_borrow_apr_all_brokers(self) -> None:
        """Test borrow APR calculation for all brokers in the dataset."""
        asset_names = [
            "movement-move",
            "USDC",
            "USDT",
            "WETH",
            "WBTC",
            "MOVE-FA",
            "EZETH",
            "STBTC",
            "RSETH",
            "WEETH",
            "LBTC",
            "USDA",
            "SUSDA"
        ]
        print("\n=== Borrow APR for All Brokers ===")
        for idx, broker in enumerate(BROKER_DATA):
            borrow_apr = calculate_moveposition_borrow_apr(broker)
            asset_name = broker.get("underlyingAsset", {}).get("name", "unknown")
            utilization = broker.get("utilization", 0) * 100
            print(f"{asset_names[idx]:15} | Utilization: {utilization:6.2f}% | "
                  f"Borrow APR: {borrow_apr:7.4f}%")
            assert borrow_apr >= 0
            assert isinstance(borrow_apr, float)

    def test_calculate_moveposition_borrow_apr_edge_cases(self) -> None:
        """Test edge cases for calculate_moveposition_borrow_apr function."""
        # Test with missing interestRate field
        broker_missing = {}
        assert calculate_moveposition_borrow_apr(broker_missing) == 0.0
        # Test with negative interest rate
        broker_negative = {"interestRate": -0.1}
        assert calculate_moveposition_borrow_apr(broker_negative) == 0.0
        # Test with zero interest rate
        broker_zero = {"interestRate": 0.0}
        assert calculate_moveposition_borrow_apr(broker_zero) == 0.0
        # Test with high interest rate
        broker_high = {"interestRate": 2.5}
        result = calculate_moveposition_borrow_apr(broker_high)
        assert result == 250.0
        assert result >= 0

    def test_calculate_moveposition_borrow_apr_and_supply_apy_relationship(self) -> None:
        """Test that borrow APR and supply APY are calculated correctly together."""
        broker = BROKER_DATA[5]  # MOVE-FA with high utilization
        borrow_apr = calculate_moveposition_borrow_apr(broker)
        supply_apy = calculate_moveposition_supply_apy_by_utilization(broker)
        utilization = broker.get("utilization", 0)
        interest_fee_rate = broker.get("interestFeeRate", 0)
        # Verify the relationship: Supply APY = Utilization × Borrow APR × (1 - Fee Rate)
        expected_supply_apy = utilization * (borrow_apr / 100.0) * (1.0 - interest_fee_rate) * 100.0
        assert abs(supply_apy - expected_supply_apy) < 0.0001
        print(f"\nMOVE-FA Relationship Check:")
        print(f"  Borrow APR: {borrow_apr:.4f}%")
        print(f"  Supply APY: {supply_apy:.4f}%")
        print(f"  Utilization: {utilization * 100:.2f}%")
        print(f"  Fee Rate: {interest_fee_rate * 100:.2f}%")

