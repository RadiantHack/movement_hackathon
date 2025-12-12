"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import {
  MOVEMENT_TOKENS,
  getTokenInfo,
  type TokenInfo,
} from "../../../utils/tokens";
import {
  Aptos,
  AptosConfig,
  Network,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";

interface SwapCardProps {
  walletAddress: string | null;
}

interface TokenBalance {
  assetType: string;
  amount: string;
  formattedAmount: string;
  metadata: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isNative: boolean;
}

// Movement Network configuration - Mainnet
const MOVEMENT_NETWORK = Network.MAINNET;
const MOVEMENT_FULLNODE = "https://full.mainnet.movementinfra.xyz/v1";
const MOVEMENT_CHAIN_ID = 126; // Mainnet chain ID

// Swap contract address
const SWAP_CONTRACT_ADDRESS =
  "0x46566b4a16a1261ab400ab5b9067de84ba152b5eb4016b217187f2a2ca980c5a";

// Example route for MOVE -> USDC (from the transaction example)
// In production, you'd fetch this from a router/quoter service
const DEFAULT_ROUTES: Record<string, string[]> = {
  "MOVE-USDC": [
    "0x57457d31d3a8badc09fe46ac3f429acbeab163b080c6c2ff6edd251e55eaeba5",
    "0x70fb1f546f1593ba50408a05266723ce5fd19a6df6ba7e5e5bd805f969cfb07e",
  ],
};

const aptos = new Aptos(
  new AptosConfig({
    network: MOVEMENT_NETWORK,
    fullnode: MOVEMENT_FULLNODE,
  })
);

export const SwapCard: React.FC<SwapCardProps> = ({ walletAddress }) => {
  const { ready, authenticated, user } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const [fromToken, setFromToken] = useState<string>("MOVE");
  const [toToken, setToToken] = useState<string>("USDC");
  const [fromAmount, setFromAmount] = useState<string>("");
  const [toAmount, setToAmount] = useState<string>("");
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [slippage, setSlippage] = useState<number>(1.0);
  const [fromBalance, setFromBalance] = useState<string | null>(null);
  const [toBalance, setToBalance] = useState<string | null>(null);
  const [loadingFromBalance, setLoadingFromBalance] = useState(false);
  const [loadingToBalance, setLoadingToBalance] = useState(false);

  const availableTokens = useMemo(() => {
    return Object.keys(MOVEMENT_TOKENS);
  }, []);

  const fromTokenInfo = useMemo(() => {
    return getTokenInfo(fromToken);
  }, [fromToken]);

  const toTokenInfo = useMemo(() => {
    return getTokenInfo(toToken);
  }, [toToken]);

  // Get Movement wallet from user's linked accounts
  const movementWallet = useMemo(() => {
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

  // Fetch balance for fromToken
  useEffect(() => {
    if (!walletAddress || !fromToken) {
      setFromBalance(null);
      return;
    }

    const fetchFromBalance = async () => {
      setLoadingFromBalance(true);
      try {
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}&token=${encodeURIComponent(fromToken)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();
        if (data.success && data.balances && data.balances.length > 0) {
          // Find the matching token balance
          const tokenBalance = data.balances.find(
            (b: TokenBalance) =>
              b.metadata.symbol.toUpperCase() === fromToken.toUpperCase()
          );
          if (tokenBalance) {
            setFromBalance(tokenBalance.formattedAmount);
          } else {
            setFromBalance("0.000000");
          }
        } else {
          setFromBalance("0.000000");
        }
      } catch (error) {
        console.error("Error fetching from balance:", error);
        setFromBalance(null);
      } finally {
        setLoadingFromBalance(false);
      }
    };

    fetchFromBalance();
  }, [walletAddress, fromToken]);

  // Fetch balance for toToken
  useEffect(() => {
    if (!walletAddress || !toToken) {
      setToBalance(null);
      return;
    }

    const fetchToBalance = async () => {
      setLoadingToBalance(true);
      try {
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}&token=${encodeURIComponent(toToken)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();
        if (data.success && data.balances && data.balances.length > 0) {
          // Find the matching token balance
          const tokenBalance = data.balances.find(
            (b: TokenBalance) =>
              b.metadata.symbol.toUpperCase() === toToken.toUpperCase()
          );
          if (tokenBalance) {
            setToBalance(tokenBalance.formattedAmount);
          } else {
            setToBalance("0.000000");
          }
        } else {
          setToBalance("0.000000");
        }
      } catch (error) {
        console.error("Error fetching to balance:", error);
        setToBalance(null);
      } finally {
        setLoadingToBalance(false);
      }
    };

    fetchToBalance();
  }, [walletAddress, toToken]);

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    // TODO: Calculate estimated output based on exchange rate
    // For now, just show placeholder
    if (value && !isNaN(parseFloat(value))) {
      // Placeholder calculation - replace with actual quote from DEX
      const estimated = parseFloat(value) * 0.99; // Assuming 1:1 with 1% slippage
      setToAmount(estimated.toFixed(6));
    } else {
      setToAmount("");
    }
  };

  const handleSwap = async () => {
    if (!movementWallet) {
      setSwapError(
        "Movement wallet not found. Please create a Movement wallet first."
      );
      return;
    }

    if (!ready || !authenticated) {
      setSwapError("Please authenticate first.");
      return;
    }

    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setSwapError("Please enter a valid amount.");
      return;
    }

    if (fromToken === toToken) {
      setSwapError("Please select different tokens.");
      return;
    }

    // Only support MOVE -> USDC for now (can be extended)
    if (fromToken !== "MOVE" || toToken !== "USDC") {
      setSwapError("Currently only MOVE -> USDC swaps are supported.");
      return;
    }

    setSwapping(true);
    setSwapError(null);
    setTxHash(null);

    try {
      // Get Aptos wallet from user's linked accounts
      const aptosWallet = user?.linkedAccounts?.find(
        (a) => a.type === "wallet" && a.chainType === "aptos"
      ) as any;

      if (!aptosWallet) {
        throw new Error("Aptos wallet not found");
      }

      const senderAddress = aptosWallet.address as string;
      const senderPubKeyWithScheme = aptosWallet.publicKey as string;

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }

      const pubKeyNoScheme = senderPubKeyWithScheme.slice(2); // drop leading "00"

      // Get token info
      const fromTokenInfo = getTokenInfo(fromToken);
      const toTokenInfo = getTokenInfo(toToken);

      if (!fromTokenInfo || !toTokenInfo) {
        throw new Error("Invalid token selection");
      }

      // Convert amount to smallest unit (octas for MOVE = 8 decimals)
      const parsedAmount = parseFloat(fromAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Invalid amount. Please enter a positive number.");
      }
      const amountIn = Math.floor(
        parsedAmount * Math.pow(10, fromTokenInfo.decimals)
      );

      // Calculate minimum amount out with slippage
      // For now, use a simple calculation - in production, get quote from DEX
      const estimatedOut = parseFloat(toAmount || "0");
      // const minAmountOut = Math.floor(
      //   estimatedOut * (1 - slippage / 100) * Math.pow(10, toTokenInfo.decimals)
      // );
      const minAmountOut = 0;

      // Get route for the swap pair
      const routeKey = `${fromToken}-${toToken}`;
      const route = DEFAULT_ROUTES[routeKey];

      if (!route || route.length === 0) {
        throw new Error(`Route not found for ${fromToken} -> ${toToken}`);
      }

      // Build the swap transaction
      // Function: scripts::swap_exact_coin_for_fa_multi_hops
      // Type args: [0x1::aptos_coin::AptosCoin] (input token type)
      // Args: [route (array of pool addresses), amount_in, amount_out_min, recipient]
      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: {
          function: `${SWAP_CONTRACT_ADDRESS}::scripts::swap_exact_coin_for_fa_multi_hops`,
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [
            route, // Array of pool addresses (route)
            amountIn.toString(), // Amount in
            minAmountOut.toString(), // Minimum amount out
            senderAddress, // Recipient (same as sender)
          ],
        },
      });

      // Override chain ID to match Movement Network mainnet
      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        const movementChainId = new ChainId(MOVEMENT_CHAIN_ID);
        txnObj.rawTransaction.chain_id = movementChainId;
      }

      // Generate signing message and hash
      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      // Sign the hash using Privy's signRawHash
      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash,
      });

      // Create authenticator from signature
      const publicKey = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
      const sig = new Ed25519Signature(signatureResponse.signature.slice(2)); // drop 0x from sig
      const senderAuthenticator = new AccountAuthenticatorEd25519(
        publicKey,
        sig
      );

      // Submit transaction
      const pending = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator,
      });

      // Wait for transaction to be executed
      const executed = await aptos.waitForTransaction({
        transactionHash: pending.hash,
      });

      console.log("Swap transaction executed:", executed.hash);
      setTxHash(executed.hash);

      // Refresh balances after successful swap
      if (fromTokenInfo) {
        const fromResponse = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress || senderAddress)}&token=${encodeURIComponent(fromToken)}`
        );
        if (fromResponse.ok) {
          const fromData = await fromResponse.json();
          if (
            fromData.success &&
            fromData.balances &&
            fromData.balances.length > 0
          ) {
            const tokenBalance = fromData.balances.find(
              (b: TokenBalance) =>
                b.metadata.symbol.toUpperCase() === fromToken.toUpperCase()
            );
            if (tokenBalance) {
              setFromBalance(tokenBalance.formattedAmount);
            }
          }
        }
      }

      if (toTokenInfo) {
        const toResponse = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress || senderAddress)}&token=${encodeURIComponent(toToken)}`
        );
        if (toResponse.ok) {
          const toData = await toResponse.json();
          if (toData.success && toData.balances && toData.balances.length > 0) {
            const tokenBalance = toData.balances.find(
              (b: TokenBalance) =>
                b.metadata.symbol.toUpperCase() === toToken.toUpperCase()
            );
            if (tokenBalance) {
              setToBalance(tokenBalance.formattedAmount);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Swap error:", err);
      setSwapError(
        err.message ||
          "Swap failed. Please check your connection and try again."
      );
    } finally {
      setSwapping(false);
    }
  };

  const canSwap = useMemo(() => {
    return (
      ready &&
      authenticated &&
      walletAddress &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      fromToken !== toToken &&
      !swapping
    );
  }, [
    ready,
    authenticated,
    walletAddress,
    fromAmount,
    fromToken,
    toToken,
    swapping,
  ]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-2xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Swap Tokens
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Exchange tokens on Movement Network
            </p>
          </div>
        </div>

        {/* From Token */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            From
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={swapping}
              />
            </div>
            <select
              value={fromToken}
              onChange={(e) => setFromToken(e.target.value)}
              className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer"
              disabled={swapping}
            >
              {availableTokens.map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
          </div>
          {fromTokenInfo && (
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Balance:{" "}
                {loadingFromBalance ? (
                  <span className="inline-block animate-pulse">Loading...</span>
                ) : fromBalance !== null ? (
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {parseFloat(fromBalance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{" "}
                    {fromTokenInfo.symbol}
                  </span>
                ) : (
                  <span>-- {fromTokenInfo.symbol}</span>
                )}
              </p>
              {fromBalance !== null && parseFloat(fromBalance) > 0 && (
                <button
                  onClick={() => setFromAmount(fromBalance)}
                  className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                  disabled={swapping}
                >
                  Max
                </button>
              )}
            </div>
          )}
        </div>

        {/* Swap Button */}
        <div className="flex justify-center my-2">
          <button
            onClick={handleSwapTokens}
            disabled={swapping}
            className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors disabled:opacity-50"
            aria-label="Swap tokens"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </button>
        </div>

        {/* To Token */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            To
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={toAmount}
                readOnly
                placeholder="0.0"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none"
              />
            </div>
            <select
              value={toToken}
              onChange={(e) => setToToken(e.target.value)}
              className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer"
              disabled={swapping}
            >
              {availableTokens.map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
          </div>
          {toTokenInfo && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Balance:{" "}
              {loadingToBalance ? (
                <span className="inline-block animate-pulse">Loading...</span>
              ) : toBalance !== null ? (
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {parseFloat(toBalance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })}{" "}
                  {toTokenInfo.symbol}
                </span>
              ) : (
                <span>-- {toTokenInfo.symbol}</span>
              )}
            </p>
          )}
        </div>

        {/* Slippage Tolerance */}
        <div className="mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Slippage Tolerance
            </label>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {slippage}%
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={slippage}
            onChange={(e) => setSlippage(parseFloat(e.target.value))}
            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            disabled={swapping}
          />
          <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            <span>0.1%</span>
            <span>5%</span>
          </div>
        </div>

        {/* Error Message */}
        {swapError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {swapError}
          </div>
        )}

        {/* Transaction Hash */}
        {txHash && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
              Transaction Hash
            </p>
            <p className="text-xs font-mono text-green-700 dark:text-green-400 break-all mb-2">
              {txHash}
            </p>
            <a
              href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
            >
              View on Explorer →
            </a>
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={!canSwap}
          className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-md ${
            canSwap
              ? "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg active:scale-[0.98]"
              : "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
          }`}
        >
          {swapping ? "Swapping..." : txHash ? "Swap Complete" : "Swap"}
        </button>

        {!walletAddress && (
          <p className="mt-3 text-xs text-center text-zinc-500 dark:text-zinc-400">
            Please connect your Movement wallet to swap tokens
          </p>
        )}
      </div>
    </div>
  );
};
