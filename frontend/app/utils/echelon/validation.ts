/**
 * Validation utilities for Echelon lending protocol operations
 */

export interface EchelonValidationResult {
  isValid: boolean;
  error?: string;
  parsedAmount?: number;
}

/**
 * Validates amount for Echelon operations
 * @param amount - The amount string or number to validate
 * @param balance - Optional balance to check against
 * @param operation - Operation type for context
 * @returns Validation result with parsed amount if valid
 */
export function validateEchelonAmount(
  amount: string | number,
  balance?: number | null,
  operation: "supply" | "withdraw" | "borrow" | "repay" = "supply"
): EchelonValidationResult {
  const numericAmount =
    typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(numericAmount) || numericAmount <= 0) {
    return {
      isValid: false,
      error: `Please enter a valid amount to ${operation}`,
    };
  }

  // Check against balance if provided
  if (balance !== undefined && balance !== null) {
    if (numericAmount > balance) {
      const operationText =
        operation === "borrow" ? "borrowing power" : "balance";
      return {
        isValid: false,
        error: `Insufficient ${operationText}. Available: ${balance.toFixed(6)}`,
      };
    }
  }

  return {
    isValid: true,
    parsedAmount: numericAmount,
  };
}

/**
 * Validates wallet connection for Echelon operations
 * @param movementWallet - The movement wallet object
 * @returns Validation result
 */
export function validateEchelonWallet(
  movementWallet: any
): EchelonValidationResult {
  if (!movementWallet?.address) {
    return {
      isValid: false,
      error: "Please connect a Movement wallet",
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Validates asset information for Echelon operations
 * @param asset - The asset object
 * @returns Validation result
 */
export function validateEchelonAsset(asset: any): EchelonValidationResult {
  if (!asset || !asset.symbol) {
    return {
      isValid: false,
      error: "Invalid asset selection",
    };
  }

  if (!asset.marketAddress) {
    return {
      isValid: false,
      error: `Market address not found for ${asset.symbol}`,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Validates borrowing power for borrow operations
 * @param amount - The amount to borrow
 * @param availableBalance - Available borrowing power
 * @param hasCollateral - Whether user has collateral
 * @param totalSupplyBalance - Total collateral value
 * @param totalBorrowBalance - Total borrowed value
 * @returns Validation result
 */
export function validateBorrowingPower(
  amount: number,
  availableBalance: number,
  hasCollateral: boolean,
  totalSupplyBalance: number,
  totalBorrowBalance: number
): EchelonValidationResult {
  if (!hasCollateral && totalSupplyBalance <= 0) {
    return {
      isValid: false,
      error:
        "You need to supply collateral before you can borrow. Please supply assets first.",
    };
  }

  if (availableBalance <= 0) {
    let errorMsg;
    if (hasCollateral) {
      errorMsg = `Insufficient borrowing power. ${totalBorrowBalance > 0 ? `You have ${totalBorrowBalance.toFixed(2)} USD borrowed. ` : ""}${totalSupplyBalance > 0 ? `Your collateral is worth ${totalSupplyBalance.toFixed(2)} USD. ` : "Your collateral value is being calculated. "}Please supply more assets or repay existing borrows to increase your borrowing power.`;
    } else {
      errorMsg = `Insufficient borrowing power. You have ${totalBorrowBalance.toFixed(2)} USD borrowed against ${totalSupplyBalance.toFixed(2)} USD collateral. Please supply more assets or repay existing borrows.`;
    }
    return {
      isValid: false,
      error: errorMsg,
    };
  }

  // Add small tolerance for floating point precision (0.000001 = 1e-6)
  // This handles cases where the amount is set to the exact max but floating point
  // precision causes a tiny difference (e.g., 0.120169 vs 0.120168999999)
  const TOLERANCE = 0.000001;
  if (amount > availableBalance + TOLERANCE) {
    return {
      isValid: false,
      error: `Insufficient borrowing power. You can borrow up to ${availableBalance.toFixed(6)} based on your collateral.`,
    };
  }

  return {
    isValid: true,
  };
}
