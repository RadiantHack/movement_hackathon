"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
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
import { useMovementConfig } from "../hooks/useMovementConfig";

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

interface TransferFormProps {
  walletAddress: string;
  balances: TokenBalance[];
  initialToken?: TokenBalance | null;
  onTransferComplete?: () => void;
}

export const TransferForm: React.FC<TransferFormProps> = ({
  walletAddress,
  balances,
  initialToken,
  onTransferComplete,
}) => {
  const { signRawHash } = useSignRawHash();
  const { user, ready, authenticated } = usePrivy();
  const config = useMovementConfig();

  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasManuallySelectedToken = useRef(false);

  const aptos = useMemo(() => {
    if (!config.movementFullNode) return null;
    return new Aptos(
      new AptosConfig({
        network: Network.CUSTOM,
        fullnode: config.movementFullNode,
      })
    );
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

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

  // Initialize token selection - only set if not already selected or when initialToken changes
  useEffect(() => {
    if (initialToken) {
      setSelectedToken(initialToken);
      hasManuallySelectedToken.current = false;
    } else if (balances.length > 0 && !hasManuallySelectedToken.current) {
      setSelectedToken((current) => {
        // Only set if no token is currently selected
        if (!current) {
          const nativeToken = balances.find((b) => b.isNative);
          return nativeToken || balances[0];
        }
        return current;
      });
    }
  }, [balances, initialToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setTokenDropdownOpen(false);
      }
    };

    if (tokenDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [tokenDropdownOpen]);

  const handleAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    const parts = numericValue.split(".");
    const formattedValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : numericValue;
    setAmount(formattedValue);
  };

  const handleMax = () => {
    if (selectedToken) {
      setAmount(selectedToken.formattedAmount);
    }
  };

  const handleTransfer = async () => {
    if (!movementWallet || !selectedToken) {
      setTransferError("Please select a token and ensure wallet is connected.");
      return;
    }

    if (!ready || !authenticated) {
      setTransferError("Please authenticate first.");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setTransferError("Please enter a valid amount.");
      return;
    }

    if (!toAddress || !toAddress.startsWith("0x") || toAddress.length !== 66) {
      setTransferError(
        "Please enter a valid recipient address (66 characters, starting with 0x)."
      );
      return;
    }

    setTransferring(true);
    setTransferError(null);
    setTxHash(null);

    try {
      if (!aptos) {
        throw new Error("Aptos client not initialized");
      }

      const aptosWallet = user?.linkedAccounts?.find((a: unknown) => {
        const account = a as Record<string, unknown>;
        return account.type === "wallet" && account.chainType === "aptos";
      }) as WalletWithMetadata | undefined;

      if (!aptosWallet) {
        throw new Error("Aptos wallet not found");
      }

      const senderAddress = aptosWallet.address as string;
      const senderPubKeyWithScheme = aptosWallet.publicKey as string;

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }

      const pubKeyNoScheme = senderPubKeyWithScheme.slice(2);

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Invalid amount.");
      }

      const decimals = selectedToken.metadata.decimals || 8;
      const amountInSmallestUnit = Math.floor(
        parsedAmount * Math.pow(10, decimals)
      );

      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [toAddress, amountInSmallestUnit],
        },
      });

      const txnObj = rawTxn as unknown as Record<
        string,
        Record<string, unknown>
      >;
      if (txnObj.rawTransaction) {
        const chainIdObj = new ChainId(movementChainId);
        (txnObj.rawTransaction as Record<string, unknown>).chain_id =
          chainIdObj;
      }

      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash,
      });

      const publicKey = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
      const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
      const senderAuthenticator = new AccountAuthenticatorEd25519(
        publicKey,
        sig
      );

      const pending = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator,
      });

      const executed = await aptos.waitForTransaction({
        transactionHash: pending.hash,
      });

      setTxHash(executed.hash);
      onTransferComplete?.();
    } catch (err: unknown) {
      console.error("Transfer error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Transfer failed. Please try again.";
      setTransferError(errorMessage);
    } finally {
      setTransferring(false);
    }
  };

  const canTransfer =
    selectedToken &&
    amount &&
    parseFloat(amount) > 0 &&
    toAddress &&
    toAddress.startsWith("0x") &&
    toAddress.length === 66 &&
    !transferring &&
    !txHash;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30">
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Transfer Tokens
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Movement Network
          </p>
        </div>
      </div>

      {/* Token Selection */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Select Token
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setTokenDropdownOpen(!tokenDropdownOpen)}
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all cursor-pointer font-medium text-left flex items-center gap-3"
          >
            {selectedToken ? (
              <>
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedToken.isNative
                      ? "bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30"
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`text-sm font-bold ${
                      selectedToken.isNative
                        ? "text-purple-700 dark:text-purple-300"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {selectedToken.metadata.symbol.length <= 4
                      ? selectedToken.metadata.symbol
                      : selectedToken.metadata.symbol.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold">
                    {selectedToken.metadata.symbol}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Balance:{" "}
                    {parseFloat(selectedToken.formattedAmount).toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      }
                    )}
                  </div>
                </div>
              </>
            ) : (
              <span className="text-zinc-500 dark:text-zinc-400">
                Select a token
              </span>
            )}
            <svg
              className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ml-auto ${
                tokenDropdownOpen ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {tokenDropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute z-20 mt-2 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden max-h-60 overflow-y-auto"
            >
              {balances.map((balance) => {
                const balanceAmount = parseFloat(balance.formattedAmount);
                return (
                  <button
                    key={balance.assetType}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      hasManuallySelectedToken.current = true;
                      setSelectedToken(balance);
                      setTokenDropdownOpen(false);
                      setAmount("");
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                      selectedToken?.assetType === balance.assetType
                        ? "bg-purple-50 dark:bg-purple-900/20"
                        : ""
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        balance.isNative
                          ? "bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30"
                          : "bg-zinc-200 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${
                          balance.isNative
                            ? "text-purple-700 dark:text-purple-300"
                            : "text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {balance.metadata.symbol.length <= 4
                          ? balance.metadata.symbol
                          : balance.metadata.symbol.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {balance.metadata.symbol}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {balanceAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Amount Input */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Amount
        </label>
        <div className="relative">
          <input
            type="text"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.0"
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-lg font-semibold"
            disabled={!selectedToken || transferring || !!txHash}
          />
          {selectedToken && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleMax}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                disabled={transferring || !!txHash}
              >
                MAX
              </button>
            </div>
          )}
        </div>
        {selectedToken && (
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Balance:{" "}
            {parseFloat(selectedToken.formattedAmount).toLocaleString(
              undefined,
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6,
              }
            )}{" "}
            {selectedToken.metadata.symbol}
          </div>
        )}
      </div>

      {/* Recipient Address */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Recipient Address
        </label>
        <input
          type="text"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="0x..."
          className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono text-sm"
          disabled={transferring || !!txHash}
        />
        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Movement Network address (66 characters)
        </div>
      </div>

      {/* Error Message */}
      {transferError && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          {transferError}
        </div>
      )}

      {/* Success Message */}
      {txHash && (
        <div className="p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-sm text-green-700 dark:text-green-400">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-medium">Transfer successful!</span>
            <a
              href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-green-600 dark:text-green-400 hover:underline font-semibold"
            >
              View →
            </a>
          </div>
        </div>
      )}

      {/* Transfer Button */}
      <button
        onClick={handleTransfer}
        disabled={!canTransfer}
        className={`w-full py-3.5 rounded-lg font-semibold transition-all duration-300 ${
          canTransfer
            ? "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg active:scale-95"
            : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
        }`}
      >
        {transferring
          ? "Transferring..."
          : txHash
            ? "Transfer Complete"
            : "Transfer"}
      </button>
    </div>
  );
};
