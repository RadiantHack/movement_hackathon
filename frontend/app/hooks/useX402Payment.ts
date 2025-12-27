"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
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
import { buildAptosLikePaymentHeader } from "x402plus";
import { toHex } from "viem";
import { useMemo } from "react";

const MOVEMENT_RPC = process.env.NEXT_PUBLIC_MOVEMENT_RPC_URL || "https://mainnet.movementnetwork.xyz/v1";
const MOVEMENT_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_MOVEMENT_CHAIN_ID || "126");

// Convert wallet's {0: byte, 1: byte, ...} object to Uint8Array
const toBytes = (obj: Record<string, number>) =>
  new Uint8Array(Object.keys(obj).map(Number).sort((a, b) => a - b).map((k) => obj[k]));

export interface PaymentRequirements {
  payTo: string;
  maxAmountRequired: string;
  network?: string;
  asset?: string;
  description?: string;
}

export function useX402Payment() {
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();

  // Get Movement wallet
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

  // Initialize Aptos client
  const aptos = useMemo(
    () =>
      new Aptos(
        new AptosConfig({
          network: Network.CUSTOM,
          fullnode: MOVEMENT_RPC,
        })
      ),
    []
  );

  const payForAccess = async (paymentRequirements: PaymentRequirements): Promise<string> => {
    if (!movementWallet) {
      throw new Error("Movement wallet not connected");
    }

    if (!ready || !authenticated) {
      throw new Error("Wallet not authenticated");
    }

    const walletAddress = movementWallet.address as string;
    const publicKey = (movementWallet as any).publicKey as string;

    if (!walletAddress || !publicKey) {
      throw new Error("Wallet address or public key not found");
    }

    // Parse amount (paymentRequirements.maxAmountRequired is in smallest units, e.g., "100000000" = 1 MOVE)
    const amount = BigInt(paymentRequirements.maxAmountRequired);

    // Build transfer transaction
    // For Movement Network, use coin::transfer for native MOVE
    const rawTxn = await aptos.transaction.build.simple({
      sender: walletAddress,
      data: {
        function: "0x1::coin::transfer",
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [paymentRequirements.payTo, amount.toString()],
      },
    });

    // Set chain ID for Movement Network
    const txnObj = rawTxn as any;
    if (txnObj.rawTransaction) {
      txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
    }

    // Generate signing message
    const message = generateSigningMessageForTransaction(rawTxn);
    const hash = toHex(message);

    // Sign with Privy
    const signatureResponse = await signRawHash({
      address: walletAddress,
      chainType: "aptos",
      hash: hash as `0x${string}`,
    });

    // Prepare authenticator
    let pubKeyNoScheme = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
    if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
      pubKeyNoScheme = pubKeyNoScheme.slice(2);
    }
    if (pubKeyNoScheme.length !== 64) {
      throw new Error(
        `Invalid public key length: expected 64 hex characters, got ${pubKeyNoScheme.length}`
      );
    }

    const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
    const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
    const authenticator = new AccountAuthenticatorEd25519(publicKeyObj, sig);

    // Build payment header using x402plus
    // x402plus expects payment requirements in a specific format with scheme, resource, etc.
    const paymentHeader = buildAptosLikePaymentHeader(
      {
        scheme: paymentRequirements.network || "movement",
        resource: paymentRequirements.payTo,
        mimeType: "application/json",
        maxAmountRequired: paymentRequirements.maxAmountRequired,
        maxTimeoutSeconds: 600,
        description: paymentRequirements.description,
      } as any, // Type assertion needed as x402plus types may not match exactly
      {
        signatureBcsBase64: Buffer.from(authenticator.bcsToBytes()).toString("base64"),
        transactionBcsBase64: Buffer.from(rawTxn.bcsToBytes()).toString("base64"),
      }
    );

    // Submit the signed transaction to the blockchain
    console.log("[useX402Payment] Submitting payment transaction to Movement network...");
    try {
      // Submit the transaction using the raw transaction and authenticator
      const pendingTxn = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator: authenticator,
      });

      const txHash = pendingTxn.hash;
      console.log("[useX402Payment] ✅ Transaction submitted successfully!");
      console.log("[useX402Payment] Transaction hash:", txHash);
      console.log("[useX402Payment] View on explorer:", `https://explorer.movementnetwork.xyz/txn/${txHash}`);
      
      // Store transaction hash in localStorage for verification
      if (typeof window !== "undefined") {
        localStorage.setItem("premiumchat_last_tx_hash", txHash);
        localStorage.setItem("premiumchat_last_tx_time", new Date().toISOString());
      }
      
      // Wait for transaction to be confirmed (optional, but recommended)
      try {
        const result = await aptos.waitForTransaction({ transactionHash: txHash });
        console.log("[useX402Payment] ✅ Transaction confirmed on blockchain!");
        console.log("[useX402Payment] Confirmed transaction hash:", result.hash);
        
        // Store confirmation status
        if (typeof window !== "undefined") {
          localStorage.setItem("premiumchat_last_tx_confirmed", "true");
        }
      } catch (waitError) {
        console.warn("[useX402Payment] ⚠️ Transaction submitted but confirmation check failed:", waitError);
        console.warn("[useX402Payment] Transaction may still be processing. Hash:", txHash);
        // Continue anyway - transaction might still be processing
        if (typeof window !== "undefined") {
          localStorage.setItem("premiumchat_last_tx_confirmed", "false");
        }
      }
    } catch (submitError: any) {
      console.error("[useX402Payment] Failed to submit transaction:", submitError);
      // If submission fails, we still return the payment header
      // The facilitator can verify the signature even if transaction isn't submitted yet
      // But ideally, the transaction should be submitted
      throw new Error(`Failed to submit payment transaction: ${submitError.message || "Unknown error"}`);
    }

    return paymentHeader;
  };

  return {
    payForAccess,
    isConnected: !!movementWallet && ready && authenticated,
    walletAddress: movementWallet?.address as string | undefined,
  };
}

