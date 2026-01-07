/**
 * Custom hook to extract Movement Network wallet from Privy user accounts
 * Consolidates wallet extraction logic used across multiple components
 */

import { useMemo } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";

/**
 * Returns the Movement Network (Aptos) wallet from user's linked accounts
 * @returns Movement wallet or null if not found/authenticated
 */
export function useMovementWallet(): WalletWithMetadata | null {
  const { user, ready, authenticated } = usePrivy();

  return useMemo(() => {
    if (!ready || !authenticated || !user?.linkedAccounts) {
      return null;
    }

    return (
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          account.type === "wallet" && account.chainType === "aptos"
      ) || null
    );
  }, [user, ready, authenticated]);
}
