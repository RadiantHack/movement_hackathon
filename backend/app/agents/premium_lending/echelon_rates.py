"""Calculate Supply APR and Borrow APR for Echelon lending protocol.

Echelon protocol provides supply and borrow APR values directly in the asset data.
These values are stored as decimals and need to be converted to percentages.

Note: Echelon uses APR (Annual Percentage Rate) which is the simple interest rate,
unlike MovePosition which uses APY (Annual Percentage Yield) with compound interest.
"""

from typing import Dict, Any


def calculate_echelon_supply_apr(asset: Dict[str, Any]) -> float:
    """Calculate Echelon supply APR from asset data.

    Echelon provides the supply APR directly in the asset data as a decimal value.
    This function extracts it and converts to percentage.

    Args:
        asset: Dictionary containing Echelon asset data with the following key:
            - supplyApr: Supply APR (decimal, e.g., 0.3724 for 37.24%)

    Returns:
        Supply APR as a percentage (float, e.g., 37.24 for 37.24%)

    Example:
        >>> asset = {
        ...     "supplyApr": 0.37239241739735
        ... }
        >>> calculate_echelon_supply_apr(asset)
        37.2392...
    """
    supply_apr = asset.get("supplyApr", 0.0)
    if supply_apr < 0:
        return 0.0
    supply_apr_percentage = supply_apr * 100.0
    return supply_apr_percentage


def calculate_echelon_borrow_apr(asset: Dict[str, Any]) -> float:
    """Calculate Echelon borrow APR from asset data.

    Echelon provides the borrow APR directly in the asset data as a decimal value.
    This function extracts it and converts to percentage.

    Args:
        asset: Dictionary containing Echelon asset data with the following key:
            - borrowApr: Borrow APR (decimal, e.g., 0.6200 for 62.00%)

    Returns:
        Borrow APR as a percentage (float, e.g., 62.00 for 62.00%)

    Example:
        >>> asset = {
        ...     "borrowApr": 0.619999999878928
        ... }
        >>> calculate_echelon_borrow_apr(asset)
        62.0000...
    """
    borrow_apr = asset.get("borrowApr", 0.0)
    if borrow_apr < 0:
        return 0.0
    borrow_apr_percentage = borrow_apr * 100.0
    return borrow_apr_percentage
