"""Calculate Supply APY and Borrow APR for MovePosition lending protocol.

The Supply APY (what lenders/suppliers earn) is calculated using:
Supply APY = Utilization Ratio × Borrow APY × (1 - Protocol Fee Rate)

The Borrow APR is the interest rate that borrowers pay, stored in the interestRate field.

Note: This module provides utilization-based calculations for MovePosition protocol.
For exchange rate-based calculations, see calculate_moveposition_supply_apy in agent.py.
"""

from typing import Dict, Any


def calculate_moveposition_supply_apy_by_utilization(broker: Dict[str, Any]) -> float:
    """Calculate MovePosition supply APY from broker data using utilization-based formula.

    This function calculates supply APY using the utilization ratio method, which is
    the standard formula for MovePosition protocol:
    Supply APY = Utilization Ratio × Borrow APY × (1 - Protocol Fee Rate)

    Args:
        broker: Dictionary containing MovePosition broker data with the following keys:
            - utilization: Utilization ratio (decimal, e.g., 0.9059 for 90.59%)
            - interestRate: Borrow APY (decimal, e.g., 0.3062 for 30.62%)
            - interestFeeRate: Protocol fee rate (decimal, e.g., 0.22 for 22%)

    Returns:
        Supply APY as a percentage (float, e.g., 17.70 for 17.70%)

    Example:
        >>> broker = {
        ...     "utilization": 0.9058979793886733,
        ...     "interestRate": 0.3061636289961197,
        ...     "interestFeeRate": 0.22
        ... }
        >>> calculate_moveposition_supply_apy_by_utilization(broker)
        17.7020...
    """
    utilization = broker.get("utilization", 0.0)
    interest_rate = broker.get("interestRate", 0.0)
    interest_fee_rate = broker.get("interestFeeRate", 0.0)
    if utilization < 0 or interest_rate < 0 or interest_fee_rate < 0:
        return 0.0
    if interest_fee_rate >= 1.0:
        return 0.0
    supply_apy_decimal = utilization * interest_rate * (1.0 - interest_fee_rate)
    supply_apy_percentage = supply_apy_decimal * 100.0
    return supply_apy_percentage


def calculate_moveposition_borrow_apr(broker: Dict[str, Any]) -> float:
    """Calculate MovePosition borrow APR from broker data.

    The borrow APR is the interest rate that borrowers pay on MovePosition protocol,
    which is stored directly in the interestRate field of the broker data.

    Args:
        broker: Dictionary containing MovePosition broker data with the following key:
            - interestRate: Borrow APR (decimal, e.g., 0.3062 for 30.62%)

    Returns:
        Borrow APR as a percentage (float, e.g., 30.62 for 30.62%)

    Example:
        >>> broker = {
        ...     "interestRate": 0.3061636289961197
        ... }
        >>> calculate_moveposition_borrow_apr(broker)
        30.6164...
    """
    interest_rate = broker.get("interestRate", 0.0)
    if interest_rate < 0:
        return 0.0
    borrow_apr_percentage = interest_rate * 100.0
    return borrow_apr_percentage
