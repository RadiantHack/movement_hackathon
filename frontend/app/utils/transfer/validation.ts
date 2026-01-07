/**
 * Validation utilities for Movement Network transfer operations
 */

/**
 * Validates a Movement Network address
 * @param address - Address to validate
 * @returns Object with isValid flag and error message if invalid
 */
export function validateMovementAddress(address: string): {
  isValid: boolean;
  error?: string;
} {
  if (!address) {
    return {
      isValid: false,
      error: "Address is required",
    };
  }

  if (!address.startsWith("0x")) {
    return {
      isValid: false,
      error: "Address must start with 0x",
    };
  }

  if (address.length !== 66) {
    return {
      isValid: false,
      error:
        "Movement Network addresses must be 66 characters (0x + 64 hex characters)",
    };
  }

  // Validate hex characters
  const hexPattern = /^0x[0-9a-fA-F]{64}$/;
  if (!hexPattern.test(address)) {
    return {
      isValid: false,
      error: "Address contains invalid characters. Must be hexadecimal.",
    };
  }

  return { isValid: true };
}

/**
 * Validates a transfer amount
 * @param amount - Amount string to validate
 * @param maxAmount - Maximum allowed amount (optional, for balance checking)
 * @returns Object with isValid flag and error message if invalid
 */
export function validateTransferAmount(
  amount: string,
  maxAmount?: string
): {
  isValid: boolean;
  error?: string;
  parsedAmount?: number;
} {
  if (!amount || amount.trim() === "") {
    return {
      isValid: false,
      error: "Amount is required",
    };
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) {
    return {
      isValid: false,
      error: "Amount must be a valid number",
    };
  }

  if (parsedAmount <= 0) {
    return {
      isValid: false,
      error: "Amount must be greater than 0",
    };
  }

  if (maxAmount) {
    const maxParsed = parseFloat(maxAmount);
    if (!isNaN(maxParsed) && parsedAmount > maxParsed) {
      return {
        isValid: false,
        error: `Amount exceeds available balance (${maxAmount})`,
      };
    }
  }

  return {
    isValid: true,
    parsedAmount,
  };
}
