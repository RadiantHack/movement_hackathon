/**
 * Validation utilities for MovePosition lending protocol operations
 */

export interface MovePositionValidationResult {
  isValid: boolean;
  error?: string;
  parsedAmount?: number;
}

/**
 * Validates amount for MovePosition operations
 * @param amount - The amount string or number to validate
 * @param balance - Optional balance to check against
 * @param operation - Operation type for context
 * @returns Validation result with parsed amount if valid
 */
export function validateMovePositionAmount(
  amount: string | number,
  balance?: number | null,
  operation: "supply" | "withdraw" | "borrow" | "repay" = "supply"
): MovePositionValidationResult {
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
 * Validates wallet connection for MovePosition operations
 * @param movementWallet - The movement wallet object
 * @returns Validation result
 */
export function validateMovePositionWallet(
  movementWallet: any
): MovePositionValidationResult {
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
 * Validates asset information for MovePosition operations
 * @param asset - The asset object
 * @returns Validation result
 */
export function validateMovePositionAsset(
  asset: any
): MovePositionValidationResult {
  if (!asset || !asset.symbol) {
    return {
      isValid: false,
      error: "Invalid asset selection",
    };
  }

  // Token is optional for MovePosition - only symbol is required for execution
  // The execute functions (executeLendV2, executeRedeemV2, etc.) work with just the symbol

  return {
    isValid: true,
  };
}

/**
 * Validates borrowing power for borrow operations
 * @param amount - The amount to borrow
 * @param availableBalance - Available borrowing power
 * @param availableLiquidity - Available liquidity in broker
 * @returns Validation result
 */
export function validateMovePositionBorrowingPower(
  amount: number,
  availableBalance: number,
  availableLiquidity: number
): MovePositionValidationResult {
  if (availableBalance <= 0) {
    return {
      isValid: false,
      error:
        "Insufficient borrowing power. Please supply more assets or repay existing borrows.",
    };
  }

  if (amount > availableBalance) {
    return {
      isValid: false,
      error: `Insufficient borrowing power. You can borrow up to ${availableBalance.toFixed(6)} based on your collateral.`,
    };
  }

  if (amount > availableLiquidity) {
    return {
      isValid: false,
      error: `Amount exceeds available liquidity. Maximum: ${availableLiquidity.toFixed(6)}`,
    };
  }

  return {
    isValid: true,
  };
}
