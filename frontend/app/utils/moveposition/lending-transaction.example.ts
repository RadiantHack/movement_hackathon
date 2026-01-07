/**
 * Example usage of executeLendingTransaction for lending operations
 *
 * This file demonstrates how to use the lending transaction utility
 * based on the Redux thunk pattern from the reference code.
 */

import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import {
  executeLendingTransaction,
  SUPPLY_COLLATERAL,
  getBrokerName,
  type TxReqPayload,
} from "./lending-transaction";

/**
 * Example: Supply/Lend transaction using the utility
 *
 * This function can be called from a React component's submit handler
 */
export async function handleSupplyTransaction(
  amount: number,
  assetSymbol: string,
  walletAddress: string,
  publicKey: string,
  signRawHash: ReturnType<typeof useSignRawHash>["signRawHash"],
  callbacks: {
    onProgress?: (step: string) => void;
    onError?: (error: string) => void;
    onSuccess?: (txHash: string) => void;
  }
): Promise<void> {
  try {
    // Convert amount to smallest unit (octas) - adjust decimals based on asset
    const decimals = 8; // Example: MOVE has 8 decimals
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, decimals));

    // Get broker name from asset symbol
    const brokerName = getBrokerName(assetSymbol);

    // Prepare transaction payload
    const payload: TxReqPayload = {
      txType: SUPPLY_COLLATERAL,
      txAmount: amountInSmallestUnit,
      inputAmount: amount, // The user-facing amount
      brokerName,
      address: walletAddress,
      publicKey,
      signHash: async (hash: string) => {
        // Use Privy's signRawHash to sign the transaction hash
        const response = await signRawHash({
          address: walletAddress,
          chainType: "aptos",
          hash: hash as `0x${string}`,
        });
        return { signature: response.signature };
      },
      onProgress: callbacks.onProgress,
      onError: callbacks.onError,
      onSuccess: (txHash: string, action: string) => {
        console.log(`${action} transaction successful:`, txHash);
        if (callbacks.onSuccess) {
          callbacks.onSuccess(txHash);
        }
      },
    };

    // Execute the transaction
    const txHash = await executeLendingTransaction(payload);
    console.log("Transaction hash:", txHash);
  } catch (error: any) {
    console.error("Supply transaction failed:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message || "Transaction failed");
    }
    throw error;
  }
}

/**
 * Example: Withdraw transaction
 */
export async function handleWithdrawTransaction(
  amount: number,
  assetSymbol: string,
  walletAddress: string,
  publicKey: string,
  signRawHash: ReturnType<typeof useSignRawHash>["signRawHash"],
  callbacks: {
    onProgress?: (step: string) => void;
    onError?: (error: string) => void;
    onSuccess?: (txHash: string) => void;
  }
): Promise<void> {
  try {
    const decimals = 8;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, decimals));
    const brokerName = getBrokerName(assetSymbol);

    const payload: TxReqPayload = {
      txType: "withdraw",
      txAmount: amountInSmallestUnit,
      inputAmount: amount,
      brokerName,
      address: walletAddress,
      publicKey,
      signHash: async (hash: string) => {
        const response = await signRawHash({
          address: walletAddress,
          chainType: "aptos",
          hash: hash as `0x${string}`,
        });
        return { signature: response.signature };
      },
      onProgress: callbacks.onProgress,
      onError: callbacks.onError,
      onSuccess: (txHash: string, action: string) => {
        console.log(`${action} transaction successful:`, txHash);
        if (callbacks.onSuccess) {
          callbacks.onSuccess(txHash);
        }
      },
    };

    const txHash = await executeLendingTransaction(payload);
    console.log("Transaction hash:", txHash);
  } catch (error: any) {
    console.error("Withdraw transaction failed:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message || "Transaction failed");
    }
    throw error;
  }
}

/**
 * Example: Borrow transaction
 */
export async function handleBorrowTransaction(
  amount: number,
  assetSymbol: string,
  walletAddress: string,
  publicKey: string,
  signRawHash: ReturnType<typeof useSignRawHash>["signRawHash"],
  callbacks: {
    onProgress?: (step: string) => void;
    onError?: (error: string) => void;
    onSuccess?: (txHash: string) => void;
  }
): Promise<void> {
  try {
    const decimals = 8;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, decimals));
    const brokerName = getBrokerName(assetSymbol);

    const payload: TxReqPayload = {
      txType: "borrow",
      txAmount: amountInSmallestUnit,
      inputAmount: amount,
      brokerName,
      address: walletAddress,
      publicKey,
      signHash: async (hash: string) => {
        const response = await signRawHash({
          address: walletAddress,
          chainType: "aptos",
          hash: hash as `0x${string}`,
        });
        return { signature: response.signature };
      },
      onProgress: callbacks.onProgress,
      onError: callbacks.onError,
      onSuccess: (txHash: string, action: string) => {
        console.log(`${action} transaction successful:`, txHash);
        if (callbacks.onSuccess) {
          callbacks.onSuccess(txHash);
        }
      },
    };

    const txHash = await executeLendingTransaction(payload);
    console.log("Transaction hash:", txHash);
  } catch (error: any) {
    console.error("Borrow transaction failed:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message || "Transaction failed");
    }
    throw error;
  }
}

/**
 * Example: Repay transaction
 */
export async function handleRepayTransaction(
  amount: number,
  assetSymbol: string,
  walletAddress: string,
  publicKey: string,
  signRawHash: ReturnType<typeof useSignRawHash>["signRawHash"],
  callbacks: {
    onProgress?: (step: string) => void;
    onError?: (error: string) => void;
    onSuccess?: (txHash: string) => void;
  }
): Promise<void> {
  try {
    const decimals = 8;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, decimals));
    const brokerName = getBrokerName(assetSymbol);

    const payload: TxReqPayload = {
      txType: "repay",
      txAmount: amountInSmallestUnit,
      inputAmount: amount,
      brokerName,
      address: walletAddress,
      publicKey,
      signHash: async (hash: string) => {
        const response = await signRawHash({
          address: walletAddress,
          chainType: "aptos",
          hash: hash as `0x${string}`,
        });
        return { signature: response.signature };
      },
      onProgress: callbacks.onProgress,
      onError: callbacks.onError,
      onSuccess: (txHash: string, action: string) => {
        console.log(`${action} transaction successful:`, txHash);
        if (callbacks.onSuccess) {
          callbacks.onSuccess(txHash);
        }
      },
    };

    const txHash = await executeLendingTransaction(payload);
    console.log("Transaction hash:", txHash);
  } catch (error: any) {
    console.error("Repay transaction failed:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message || "Transaction failed");
    }
    throw error;
  }
}
