"use client";

/**
 * TransferCard Component
 *
 * Displays transfer information and allows user to execute the transfer.
 * Uses server-side API route to handle Movement Network token transfers.
 *
 * Based on Privy Movement Network documentation:
 * https://docs.privy.io/recipes/use-tier-2#movement
 */

import React, { useState, useMemo } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { TransferData } from "../../types";
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
import { useMovementConfig } from "../../../hooks/useMovementConfig";

interface TransferCardProps {
  data: TransferData;
  onTransferInitiate?: () => void;
}

export const TransferCard: React.FC<TransferCardProps> = ({
  data,
  onTransferInitiate,
}) => {
  const { signRawHash } = useSignRawHash();
  const { amount, token, tokenSymbol, toAddress, fromAddress, network, error } =
    data;
  const { user, ready, authenticated } = usePrivy();
  const config = useMovementConfig();

  // Create Aptos instance with config from Redux store
  // Use testnet network since TransferCard is for testnet operations
  const aptos = useMemo(() => {
    if (!config.movementFullNode) return null;
    return new Aptos(
      new AptosConfig({
        network: Network.TESTNET,
        fullnode: config.movementFullNode,
      })
    );
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    // Use testnet chain ID from config
    return config.movementTestNetChainId || 250;
  }, [config.movementTestNetChainId]);

  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

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

  const handleTransfer = async () => {
    if (!movementWallet) {
      setTransferError(
        "Movement wallet not found. Please create a Movement wallet first."
      );
      return;
    }

    if (!ready || !authenticated) {
      setTransferError("Please authenticate first.");
      return;
    }

    setTransferring(true);
    setTransferError(null);
    setTxHash(null);

    try {
      if (!aptos) {
        throw new Error("Aptos client not initialized");
      }

      // Get Aptos wallet from user's linked accounts
      const aptosWallet = user?.linkedAccounts?.find((a: unknown) => {
        const account = a as Record<string, unknown>;
        return account.type === "wallet" && account.chainType === "aptos";
      }) as WalletWithMetadata | undefined;

      if (!aptosWallet) {
        throw new Error("Aptos wallet not found");
      }

      const senderAddress = aptosWallet.address as string;
      const senderPubKeyWithScheme = aptosWallet.publicKey as string; // "004a4b8e35..."

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }

      const pubKeyNoScheme = senderPubKeyWithScheme.slice(2); // drop leading "00"

      // Validate recipient address
      if (
        !toAddress ||
        !toAddress.startsWith("0x") ||
        toAddress.length !== 66
      ) {
        throw new Error(
          "Invalid recipient address. Must be 66 characters and start with 0x."
        );
      }

      // Convert amount to Octas (Aptos uses 8 decimals)
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Invalid amount. Please enter a positive number.");
      }
      const amountInOctas = Math.floor(parsedAmount * 100000000);

      // Build the raw transaction
      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [toAddress, amountInOctas],
        },
      });

      // Override chain ID to match Movement Network testnet
      // Create a proper ChainId instance and replace the chain_id in rawTransaction
      const txnObj = rawTxn as unknown as Record<
        string,
        Record<string, unknown>
      >;
      if (txnObj.rawTransaction) {
        // Use the chain ID from config
        const chainIdObj = new ChainId(movementChainId);
        (txnObj.rawTransaction as Record<string, unknown>).chain_id =
          chainIdObj;
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

      console.log("Transaction executed:", executed.hash);
      setTxHash(executed.hash);
      onTransferInitiate?.();
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

  const DetailRow = ({
    label,
    value,
    mono,
  }: {
    label: string;
    value: string;
    mono?: boolean;
  }) => (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-gray-700">{label}:</span>
      <span
        className={`text-sm font-semibold text-gray-900 ${
          mono ? "font-mono text-gray-700" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="rounded-2xl p-6 my-4 backdrop-blur-xl bg-white/40 border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.08)] animate-fade-in-up">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-200 to-purple-300 flex items-center justify-center shadow-inner">
          <span className="text-2xl">💸</span>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 tracking-tight">
            Transfer Tokens
          </h3>
          <p className="text-sm text-gray-600">Movement Network</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100/60 border border-red-200 rounded-lg text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Details */}
      <div className="space-y-4 mb-6">
        <DetailRow
          label="Amount"
          value={`${amount} ${tokenSymbol || token}`}
          mono
        />
        <DetailRow
          label="From"
          value={`${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)}`}
          mono
        />
        <DetailRow
          label="To"
          value={`${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`}
          mono
        />
        <DetailRow label="Network" value={network} mono />
      </div>

      {txHash && (
        <div className="mb-5 p-4 bg-green-100/60 border border-green-200 rounded-lg shadow-sm">
          <p className="text-xs text-green-800 font-medium">Transaction Hash</p>
          <p className="text-xs text-green-900 font-mono break-all mt-1 mb-2">
            {txHash}
          </p>
          <a
            href={`${config.movementExplorerUrl || "https://explorer.movementlabs.xyz"}/txn/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-green-700 hover:text-green-900 underline"
          >
            View on Movement Explorer →
          </a>
        </div>
      )}

      {transferError && (
        <div className="mb-5 p-4 bg-red-100/60 border border-red-200 rounded-lg shadow-sm text-sm text-red-700">
          {transferError}
        </div>
      )}

      <button
        onClick={handleTransfer}
        disabled={transferring || !!txHash}
        className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-300 shadow-md
            ${
              transferring || txHash
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg active:scale-95"
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
