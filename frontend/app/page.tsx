"use client";

import { usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

export default function Home() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);

  const handleEmailLogin = () => {
    login();
  };

  // Create Movement wallet when user authenticates
  // Note: Privy automatically creates Ethereum wallets on login (via createOnLogin config)
  // Since Movement is EVM-compatible, the Ethereum wallet address works on Movement
  useEffect(() => {
    const createMovementWallet = async () => {
      if (!ready || !authenticated || isCreatingWallet) {
        return;
      }

      // Wait a bit for automatic wallet creation from Privy
      if (wallets.length === 0) {
        return;
      }

      // Check if user already has a wallet (EVM wallets work on Movement)
      const hasWallet = wallets.length > 0;

      // If wallet exists, we're good (EVM-compatible address works on Movement)
      // The wallet is automatically created by Privy's createOnLogin config
      if (!hasWallet) {
        try {
          setIsCreatingWallet(true);
          await createWallet();
          // Wallet will be created on Ethereum by default, but address works on Movement
        } catch (error) {
          console.error("Failed to create wallet:", error);
        } finally {
          setIsCreatingWallet(false);
        }
      }
    };

    createMovementWallet();
  }, [ready, authenticated, wallets.length, createWallet, isCreatingWallet]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-center">
          <div className="text-lg text-zinc-600 dark:text-zinc-400">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // Find Movement blockchain wallet (chain ID 2024 or 0x7e8)
  const movementWallet = wallets.find((wallet) => {
    const chainIdStr = String(wallet.chainId).toLowerCase();
    return (
      chainIdStr === "2024" ||
      chainIdStr === "0x7e8" ||
      parseInt(chainIdStr, 10) === 2024
    );
  });

  if (authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col items-center gap-8 py-32 px-16 bg-white dark:bg-black">
          <div className="flex flex-col items-center gap-6 text-center">
            <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
              Welcome back!
            </h1>
            <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              You are logged in as{" "}
              <span className="font-medium text-zinc-950 dark:text-zinc-50">
                {user?.email?.address || user?.id}
              </span>
            </p>
            {movementWallet && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Movement Wallet Address:
                </p>
                <p className="font-mono text-base text-zinc-950 dark:text-zinc-50">
                  {movementWallet.address}
                </p>
              </div>
            )}
            {isCreatingWallet && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Creating Movement wallet...
                </p>
              </div>
            )}
            {!movementWallet && wallets.length > 0 && !isCreatingWallet && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Movement Wallet Address:
                </p>
                <p className="font-mono text-base text-zinc-950 dark:text-zinc-50">
                  {wallets[0].address}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  (EVM-compatible address, works on Movement blockchain)
                </p>
              </div>
            )}
            <button
              onClick={logout}
              className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[200px]"
            >
              Logout
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-8 py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-md text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Welcome to Movement
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Please sign in with your email to continue.
          </p>
          <button
            onClick={handleEmailLogin}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-8 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[250px]"
          >
            Login with Email
          </button>
        </div>
      </main>
    </div>
  );
}
