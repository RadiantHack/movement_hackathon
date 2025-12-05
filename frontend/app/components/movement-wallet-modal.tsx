"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useCreateWallet as useCreateExtendedWallet } from "@privy-io/react-auth/extended-chains";
import { useState, useEffect } from "react";

export function MovementWalletModal() {
  const { user, ready, authenticated } = usePrivy();
  const { createWallet: createExtendedWallet } = useCreateExtendedWallet();
  const [isCreating, setIsCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);

  /**
   * Get Movement wallet from user's linked accounts
   * Backend returns chainType as "aptos" for Movement wallets
   */
  const movementWallet = user?.linkedAccounts.find(
    (account): account is WalletWithMetadata =>
      account.type === "wallet" && account.chainType === "aptos"
  );

  /**
   * Handle pending wallet creation actions after user/guest account is ready
   */
  useEffect(() => {
    if (pendingAction && user) {
      createExtendedWallet({ chainType: "movement" })
        .then(() => {
          setIsCreating(false);
          setPendingAction(false);
        })
        .catch((error) => {
          console.error("Failed to create Movement wallet:", error);
          setIsCreating(false);
          setPendingAction(false);
        });
    }
  }, [user, createExtendedWallet, pendingAction]);

  /**
   * Create Movement wallet
   * Only allowed when user is authenticated
   */
  const createMovementWallet = async () => {
    if (!ready || !authenticated) {
      console.warn("User must be authenticated to create a wallet");
      return;
    }

    setIsCreating(true);
    setPendingAction(true);
  };

  // Show modal if user is authenticated but doesn't have a Movement wallet
  const shouldShowModal = ready && authenticated && !movementWallet;

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (shouldShowModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [shouldShowModal]);

  if (!shouldShowModal) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-zinc-900">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <svg
              className="h-8 w-8 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="mb-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Create Your Movement Wallet
          </h2>
          <p className="mb-8 text-zinc-600 dark:text-zinc-400">
            To get started, you need to create a Movement wallet. This will
            allow you to interact with the Movement Network and use all features
            of the platform.
          </p>
          <button
            onClick={createMovementWallet}
            disabled={isCreating || !authenticated}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Creating Wallet...
              </span>
            ) : (
              "Create Movement Wallet"
            )}
          </button>
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Your wallet will be securely created and stored
          </p>
        </div>
      </div>
    </div>
  );
}
