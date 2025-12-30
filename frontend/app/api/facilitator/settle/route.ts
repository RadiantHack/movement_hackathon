/**
 * Facilitator Settle Endpoint - x402 Payment Settlement
 *
 * This endpoint handles payment settlement by submitting transactions to Movement Network.
 * It implements the x402 facilitator protocol for settling payment transactions.
 * The server signs transactions using a custom private key instead of Privy.
 */

import { NextRequest, NextResponse } from "next/server";
import { Aptos, AptosConfig, Network, ChainId } from "@aptos-labs/ts-sdk";
import {
  RawTransaction,
  AccountAuthenticatorEd25519,
  Deserializer,
  SignedTransaction,
  Ed25519PrivateKey,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
} from "@aptos-labs/ts-sdk";

// Get Movement Network configuration
const getMovementConfig = () => {
  const movementFullNode =
    process.env.NEXT_PUBLIC_MOVEMENT_FULL_NODE ||
    process.env.MOVEMENT_FULL_NODE ||
    "https://mainnet.movementnetwork.xyz/v1";
  const movementChainId = parseInt(
    process.env.NEXT_PUBLIC_MOVEMENT_CHAIN_ID ||
      process.env.MOVEMENT_CHAIN_ID ||
      "126"
  );
  return { movementFullNode, movementChainId };
};

// Get facilitator account from private key
const getFacilitatorAccount = () => {
  const privateKeyHex =
    process.env.FACILITATOR_PRIVATE_KEY ||
    process.env.NEXT_PUBLIC_FACILITATOR_PRIVATE_KEY;

  if (!privateKeyHex) {
    throw new Error(
      "FACILITATOR_PRIVATE_KEY environment variable is not set. " +
        "Please set it to a hex-encoded Ed25519 private key (64 hex characters)."
    );
  }

  // Remove 0x prefix if present
  const cleanKey = privateKeyHex.startsWith("0x")
    ? privateKeyHex.slice(2)
    : privateKeyHex;

  if (cleanKey.length !== 64) {
    throw new Error(
      `Invalid private key length: expected 64 hex characters (32 bytes), got ${cleanKey.length}`
    );
  }

  try {
    const privateKey = new Ed25519PrivateKey(cleanKey);
    const publicKey = privateKey.publicKey();
    const address = publicKey.authKey().derivedAddress();

    console.log(
      "[facilitator/settle] Facilitator address:",
      address.toString()
    );

    return {
      privateKey,
      publicKey,
      address: address.toString(),
    };
  } catch (error: any) {
    throw new Error(
      `Failed to create facilitator account from private key: ${error.message}`
    );
  }
};

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[facilitator/settle] Request received");
    console.log("[facilitator/settle] Request body keys:", Object.keys(body));
    console.log("[facilitator/settle] x402Version:", body.x402Version);
    console.log(
      "[facilitator/settle] paymentPayload keys:",
      body.paymentPayload ? Object.keys(body.paymentPayload) : "missing"
    );
    console.log(
      "[facilitator/settle] paymentRequirements keys:",
      body.paymentRequirements
        ? Object.keys(body.paymentRequirements)
        : "missing"
    );

    // Validate request body
    const { x402Version, paymentPayload, paymentRequirements } = body;

    if (!paymentPayload) {
      console.error("[facilitator/settle] Error: paymentPayload is missing");
      return NextResponse.json(
        { success: false, error: "paymentPayload is required" },
        { status: 400 }
      );
    }

    if (!paymentRequirements) {
      console.error(
        "[facilitator/settle] Error: paymentRequirements is missing"
      );
      return NextResponse.json(
        { success: false, error: "paymentRequirements is required" },
        { status: 400 }
      );
    }

    const { movementFullNode, movementChainId } = getMovementConfig();
    console.log("[facilitator/settle] Movement Full Node:", movementFullNode);
    console.log("[facilitator/settle] Movement Chain ID:", movementChainId);

    // Get facilitator account (server-side signing)
    let facilitatorAccount;
    try {
      facilitatorAccount = getFacilitatorAccount();
      console.log(
        "[facilitator/settle] Using facilitator account:",
        facilitatorAccount.address
      );
    } catch (error: any) {
      console.error(
        "[facilitator/settle] Error getting facilitator account:",
        error.message
      );
      return NextResponse.json(
        {
          success: false,
          error: `Facilitator account error: ${error.message}`,
        },
        { status: 500 }
      );
    }

    // Extract transaction and signature (for backward compatibility)
    const transactionBcs =
      paymentPayload.transaction || paymentPayload.transactionBcsBase64;
    const signatureBcs =
      paymentPayload.signature || paymentPayload.signatureBcsBase64;

    let signedTransactionBuffer: Buffer;

    // If both transaction and signature are provided, use pre-signed transaction (backward compatibility)
    if (transactionBcs && signatureBcs) {
      console.log(
        "[facilitator/settle] Using pre-signed transaction (backward compatibility mode)"
      );

      // Decode transaction and signature from base64
      console.log("[facilitator/settle] Decoding transaction and signature...");
      let transactionBytes: Buffer;
      let signatureBytes: Buffer;

      try {
        transactionBytes = Buffer.from(transactionBcs, "base64");
        console.log(
          "[facilitator/settle] Transaction bytes length:",
          transactionBytes.length
        );
      } catch (error: any) {
        console.error(
          "[facilitator/settle] Error decoding transaction:",
          error.message
        );
        return NextResponse.json(
          {
            success: false,
            error: `Failed to decode transaction: ${error.message}`,
          },
          { status: 400 }
        );
      }

      try {
        signatureBytes = Buffer.from(signatureBcs, "base64");
        console.log(
          "[facilitator/settle] Signature bytes length:",
          signatureBytes.length
        );
      } catch (error: any) {
        console.error(
          "[facilitator/settle] Error decoding signature:",
          error.message
        );
        return NextResponse.json(
          {
            success: false,
            error: `Failed to decode signature: ${error.message}`,
          },
          { status: 400 }
        );
      }

      // Reconstruct RawTransaction and AccountAuthenticator from BCS bytes
      console.log(
        "[facilitator/settle] Reconstructing transaction and authenticator from BCS..."
      );

      // Deserialize RawTransaction from BCS bytes
      const transactionDeserializer = new Deserializer(transactionBytes);
      const rawTransaction = RawTransaction.deserialize(
        transactionDeserializer
      );
      console.log(
        "[facilitator/settle] RawTransaction deserialized successfully"
      );

      // Deserialize AccountAuthenticatorEd25519 from BCS bytes
      const authenticatorDeserializer = new Deserializer(signatureBytes);
      const senderAuthenticator = AccountAuthenticatorEd25519.deserialize(
        authenticatorDeserializer
      );
      console.log(
        "[facilitator/settle] AccountAuthenticator deserialized successfully"
      );

      // Construct SignedTransaction object
      const signedTransaction = new SignedTransaction(
        rawTransaction,
        senderAuthenticator as any
      );
      console.log(
        "[facilitator/settle] SignedTransaction constructed successfully"
      );

      // Serialize SignedTransaction to BCS bytes
      const signedTransactionBcs = signedTransaction.bcsToBytes();
      console.log(
        "[facilitator/settle] SignedTransaction serialized to BCS, length:",
        signedTransactionBcs.length
      );

      // Convert Uint8Array to Buffer for fetch body
      signedTransactionBuffer = Buffer.from(signedTransactionBcs);
    } else if (transactionBcs) {
      // If only transaction is provided (unsigned), sign it with facilitator's private key
      console.log(
        "[facilitator/settle] Signing unsigned transaction with facilitator private key..."
      );

      // Decode unsigned transaction from base64
      let transactionBytes: Buffer;
      try {
        transactionBytes = Buffer.from(transactionBcs, "base64");
        console.log(
          "[facilitator/settle] Transaction bytes length:",
          transactionBytes.length
        );
      } catch (error: any) {
        console.error(
          "[facilitator/settle] Error decoding transaction:",
          error.message
        );
        return NextResponse.json(
          {
            success: false,
            error: `Failed to decode transaction: ${error.message}`,
          },
          { status: 400 }
        );
      }

      // Deserialize RawTransaction from BCS bytes
      const transactionDeserializer = new Deserializer(transactionBytes);
      const rawTransaction = RawTransaction.deserialize(
        transactionDeserializer
      );
      console.log(
        "[facilitator/settle] RawTransaction deserialized successfully"
      );

      // Sign the transaction with facilitator's private key
      console.log("[facilitator/settle] Signing transaction...");
      const message = generateSigningMessageForTransaction(
        rawTransaction as any
      );
      // generateSigningMessageForTransaction returns Uint8Array, sign() expects Uint8Array
      const signature = facilitatorAccount.privateKey.sign(message);

      // Create authenticator
      const senderAuthenticator = new AccountAuthenticatorEd25519(
        facilitatorAccount.publicKey,
        signature
      );
      console.log(
        "[facilitator/settle] Transaction signed with facilitator private key"
      );

      // Construct SignedTransaction
      const signedTransaction = new SignedTransaction(
        rawTransaction as any,
        senderAuthenticator as any
      );

      // Serialize SignedTransaction to BCS bytes
      const signedTransactionBcs = signedTransaction.bcsToBytes();
      signedTransactionBuffer = Buffer.from(signedTransactionBcs);
    } else {
      // Build transaction from payment requirements and sign with facilitator's key
      console.log(
        "[facilitator/settle] Building transaction from payment requirements..."
      );

      const aptosConfig = new AptosConfig({
        network: Network.CUSTOM,
        fullnode: movementFullNode,
      });
      const aptos = new Aptos(aptosConfig);

      // Build transfer transaction
      const rawTxn = await aptos.transaction.build.simple({
        sender: facilitatorAccount.address,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: [
            paymentRequirements.asset || "0x1::aptos_coin::AptosCoin",
          ],
          functionArguments: [
            paymentRequirements.payTo,
            paymentRequirements.maxAmountRequired,
          ],
        },
      });

      // Override chain ID to match Movement Network
      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        const chainIdObj = new ChainId(movementChainId);
        txnObj.rawTransaction.chain_id = chainIdObj;
      }

      // Sign the transaction with facilitator's private key
      console.log("[facilitator/settle] Signing transaction...");
      const message = generateSigningMessageForTransaction(rawTxn as any);
      // generateSigningMessageForTransaction returns Uint8Array, sign() expects Uint8Array
      const signature = facilitatorAccount.privateKey.sign(message);

      // Create authenticator
      const senderAuthenticator = new AccountAuthenticatorEd25519(
        facilitatorAccount.publicKey,
        signature
      );
      console.log(
        "[facilitator/settle] Transaction signed with facilitator private key"
      );

      // Construct SignedTransaction - need to extract rawTransaction from SimpleTransaction
      const rawTxnForSigning = (rawTxn as any).rawTransaction || rawTxn;
      const signedTransaction = new SignedTransaction(
        rawTxnForSigning as any,
        senderAuthenticator as any
      );

      // Serialize SignedTransaction to BCS bytes
      const signedTransactionBcs = signedTransaction.bcsToBytes();
      signedTransactionBuffer = Buffer.from(signedTransactionBcs);
    }

    // Submit signed transaction directly to Movement Network RPC
    // Use the /transactions endpoint with BCS content type
    console.log("[facilitator/settle] Submitting signed transaction to RPC...");
    try {
      const rpcResponse = await fetch(`${movementFullNode}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x.aptos.signed_transaction+bcs",
        },
        body: new Uint8Array(signedTransactionBuffer),
      });

      console.log(
        "[facilitator/settle] RPC response status:",
        rpcResponse.status
      );

      if (!rpcResponse.ok) {
        const errorText = await rpcResponse.text();
        console.error(
          "[facilitator/settle] RPC HTTP error:",
          rpcResponse.status,
          errorText
        );
        return NextResponse.json(
          {
            success: false,
            error: `RPC error: HTTP ${rpcResponse.status} - ${errorText.substring(0, 200)}`,
          },
          { status: 400 }
        );
      }

      const rpcResult = await rpcResponse.json();
      console.log(
        "[facilitator/settle] RPC result keys:",
        Object.keys(rpcResult)
      );
      console.log(
        "[facilitator/settle] RPC result:",
        JSON.stringify(rpcResult).substring(0, 200)
      );

      // Extract transaction hash from response
      const txHash =
        rpcResult.hash || rpcResult.transaction?.hash || rpcResult.result?.hash;

      if (!txHash) {
        console.error(
          "[facilitator/settle] No transaction hash in response:",
          JSON.stringify(rpcResult)
        );
        return NextResponse.json(
          {
            success: false,
            error: "Transaction submitted but no hash returned in response",
          },
          { status: 400 }
        );
      }

      console.log(
        "[facilitator/settle] Transaction submitted successfully, txHash:",
        txHash
      );

      return NextResponse.json({
        success: true,
        txHash: txHash,
        network: paymentRequirements.network || "movement",
      });
    } catch (error: any) {
      console.error(
        "[facilitator/settle] Transaction submission error:",
        error
      );
      console.error("[facilitator/settle] Error details:", error.message);
      console.error("[facilitator/settle] Error stack:", error.stack);

      return NextResponse.json(
        {
          success: false,
          error: `Transaction submission failed: ${error.message || "Unknown error"}`,
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[facilitator/settle] Unexpected error:", error);
    console.error("[facilitator/settle] Error stack:", error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
