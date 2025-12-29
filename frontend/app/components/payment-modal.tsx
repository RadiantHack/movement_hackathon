"use client";

import { useState, useEffect } from "react";
import { X, CreditCard, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { Aptos, AptosConfig, ChainId, Network } from "@aptos-labs/ts-sdk";
import { generateSigningMessageForTransaction } from "@aptos-labs/ts-sdk";
import {
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import { buildAptosLikePaymentHeader } from "x402plus";
import { useMovementConfig } from "@/app/hooks/useMovementConfig";

// Movement Network Mainnet Configuration
const MOVEMENT_RPC = "https://mainnet.movementnetwork.xyz/v1";
const MOVEMENT_CHAIN_ID = 126; // Movement mainnet chain ID

interface PaymentRequirements {
  payTo: string;
  maxAmountRequired: string;
  network?: string;
  asset?: string;
  description?: string;
  resource?: string;
  scheme?: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (paymentHeader: string) => void;
  paymentRequirements?: PaymentRequirements;
  walletAddress?: string | null;
}

/**
 * Payment Modal Component for x402 Payment Protocol
 * Opens when a 402 Payment Required error is encountered.
 * Uses Movement Network wallet to sign and pay with MOVE tokens.
 */
export function PaymentModal({
  isOpen,
  onClose,
  onPaymentComplete,
  paymentRequirements,
  walletAddress,
}: PaymentModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const config = useMovementConfig();

  // Get Movement wallet from Privy
  const movementWallet = user?.linkedAccounts.find(
    (account): account is WalletWithMetadata =>
      account.type === "wallet" && account.chainType === "aptos"
  );

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  // Calculate amount in MOVE (8 decimals)
  const amountInMove = paymentRequirements
    ? (parseInt(paymentRequirements.maxAmountRequired, 10) / 100000000).toFixed(
        8
      )
    : "1.0";

  const handlePayment = async () => {
    if (!paymentRequirements) {
      setError("Payment requirements not provided");
      return;
    }

    if (!ready || !authenticated || !movementWallet || !walletAddress) {
      setError("Please connect your Movement Network wallet first");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Ensure config is loaded
      if (!config.loaded) {
        throw new Error(
          "Movement Network configuration not loaded. Please wait and try again."
        );
      }

      // Initialize Aptos SDK for Movement Network Mainnet
      // Custom endpoints require Network.CUSTOM to be specified
      const fullnodeUrl = config.movementFullNode || MOVEMENT_RPC;
      const aptosConfig = new AptosConfig({
        network: Network.CUSTOM,
        fullnode: fullnodeUrl,
      });
      const aptos = new Aptos(aptosConfig);

      // Get sender address and public key from Privy wallet
      if (!movementWallet || !walletAddress) {
        throw new Error("Movement wallet not connected");
      }

      const senderAddress = walletAddress;
      // Privy wallet public key is accessed via the wallet object
      const senderPubKeyWithScheme = (movementWallet as any)
        .publicKey as string;

      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format from Privy wallet");
      }

      // Privy public key format: "004a4b8e35..." (starts with "00", not "0x")
      let pubKeyNoScheme = senderPubKeyWithScheme.startsWith("0x")
        ? senderPubKeyWithScheme.slice(2)
        : senderPubKeyWithScheme;
      // Remove leading "00" if present (Privy adds this prefix)
      if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
        pubKeyNoScheme = pubKeyNoScheme.slice(2);
      }
      // Ensure we have exactly 64 hex characters (32 bytes)
      if (pubKeyNoScheme.length !== 64) {
        throw new Error(
          `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`
        );
      }

      // Build transfer transaction using coin::transfer (not aptos_account::transfer)
      // coin::transfer requires a type argument for the coin type
      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [
            paymentRequirements.payTo,
            paymentRequirements.maxAmountRequired,
          ],
        },
      });

      // Override chain ID to match Movement Network Mainnet (chain ID: 126)
      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        const movementChainId = config.movementChainId || MOVEMENT_CHAIN_ID;
        const movementChainIdObj = new ChainId(movementChainId);
        txnObj.rawTransaction.chain_id = movementChainIdObj;
      }

      // Generate signing message and hash
      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      // Sign the hash using Privy wallet (NOT Aptos wallet)
      // Privy handles the wallet connection and signing UI
      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash as `0x${string}`,
      });

      // Create authenticator from signature
      const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
      const sig = new Ed25519Signature(signatureResponse.signature.slice(2)); // drop 0x from sig
      const senderAuthenticator = new AccountAuthenticatorEd25519(
        publicKeyObj,
        sig
      );

      // Get BCS-encoded bytes
      const transactionBcsBase64 = Buffer.from(rawTxn.bcsToBytes()).toString(
        "base64"
      );
      const signatureBcsBase64 = Buffer.from(
        senderAuthenticator.bcsToBytes()
      ).toString("base64");

      // Build x402 payment header using x402plus
      const accepts = {
        scheme: (paymentRequirements.scheme || "exact") as "exact",
        network: paymentRequirements.network || "movement",
        maxAmountRequired: paymentRequirements.maxAmountRequired,
        resource: paymentRequirements.resource || "",
        description: paymentRequirements.description || "",
        mimeType: "application/json",
        payTo: paymentRequirements.payTo,
        maxTimeoutSeconds: 600,
        asset: paymentRequirements.asset || "0x1::aptos_coin::AptosCoin",
      };

      const paymentHeader = buildAptosLikePaymentHeader(accepts, {
        signatureBcsBase64,
        transactionBcsBase64,
      });

      // Call the completion handler with the payment header
      onPaymentComplete(paymentHeader);
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "Failed to process payment. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-yellow-500">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Payment Required
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                x402 Payment Protocol - Movement Network
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            disabled={isProcessing}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Premium Content Access</span>
              <br />
              {paymentRequirements?.description ||
                "This agent requires payment to access premium features. Complete the payment to continue."}
            </p>
          </div>

          {/* Payment Amount */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Amount
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                One-time payment
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {amountInMove} MOVE
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Movement Network
              </p>
            </div>
          </div>

          {/* Wallet Status */}
          {!walletAddress || !ready || !authenticated ? (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                ⚠️ Please connect your Movement Network wallet to proceed with
                payment.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 p-4">
              <Wallet className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Wallet Connected
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 font-mono">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Info Note */}
          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              💡 Payment is processed on Movement Network using MOVE tokens.
              You'll be asked to sign the transaction in your wallet.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-zinc-200 dark:border-zinc-800">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={
              isProcessing || !walletAddress || !ready || !authenticated
            }
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay {amountInMove} MOVE
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
