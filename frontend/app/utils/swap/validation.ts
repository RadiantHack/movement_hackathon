/**
 * Validation utilities for swap operations
 */

export interface SwapValidationResult {
  isValid: boolean;
  error?: string;
  parsedAmount?: number;
}

/**
 * Validates swap amount input
 * @param amount - The amount string to validate
 * @param balance - Optional balance to check against
 * @returns Validation result with parsed amount if valid
 */
export function validateSwapAmount(
  amount: string,
  balance?: string | null
): SwapValidationResult {
  if (!amount || amount.trim() === "") {
    return {
      isValid: false,
      error: "Please enter an amount",
    };
  }

  // Remove any non-numeric characters except decimal point
  const numericValue = amount.replace(/[^0-9.]/g, "");

  if (numericValue === "" || numericValue === ".") {
    return {
      isValid: false,
      error: "Please enter a valid amount",
    };
  }

  // Check for multiple decimal points
  const parts = numericValue.split(".");
  if (parts.length > 2) {
    return {
      isValid: false,
      error: "Invalid amount format",
    };
  }

  const parsedAmount = parseFloat(numericValue);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return {
      isValid: false,
      error: "Amount must be greater than 0",
    };
  }

  // Check against balance if provided
  if (balance) {
    const balanceAmount = parseFloat(balance);
    if (!isNaN(balanceAmount) && parsedAmount > balanceAmount) {
      return {
        isValid: false,
        error: "Insufficient balance",
      };
    }
  }

  return {
    isValid: true,
    parsedAmount,
  };
}

/**
 * Validates that two tokens are different
 * @param fromToken - The token to swap from
 * @param toToken - The token to swap to
 * @returns Validation result
 */
export function validateTokenPair(
  fromToken: string,
  toToken: string
): SwapValidationResult {
  if (!fromToken || !toToken) {
    return {
      isValid: false,
      error: "Please select both tokens",
    };
  }

  if (fromToken === toToken) {
    return {
      isValid: false,
      error: "Please select different tokens",
    };
  }

  return {
    isValid: true,
  };
}
