/**
 * Facilitator Settle Endpoint - x402 Payment Settlement
 *
 * This endpoint handles payment settlement by submitting transactions to Movement Network.
 * It implements the x402 facilitator protocol for settling payment transactions.
 */

import { NextRequest, NextResponse } from "next/server";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import {
  RawTransaction,
  AccountAuthenticatorEd25519,
  Deserializer,
  SignedTransaction,
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

    // Extract transaction and signature
    const transactionBcs =
      paymentPayload.transaction || paymentPayload.transactionBcsBase64;
    const signatureBcs =
      paymentPayload.signature || paymentPayload.signatureBcsBase64;

    console.log(
      "[facilitator/settle] Transaction BCS present:",
      !!transactionBcs
    );
    console.log("[facilitator/settle] Signature BCS present:", !!signatureBcs);
    if (transactionBcs) {
      console.log(
        "[facilitator/settle] Transaction BCS length:",
        transactionBcs.length
      );
    }
    if (signatureBcs) {
      console.log(
        "[facilitator/settle] Signature BCS length:",
        signatureBcs.length
      );
    }

    if (!transactionBcs) {
      console.error(
        "[facilitator/settle] Error: Transaction not found in payment payload"
      );
      console.error(
        "[facilitator/settle] Available paymentPayload keys:",
        Object.keys(paymentPayload)
      );
      return NextResponse.json(
        { success: false, error: "Transaction not found in payment payload" },
        { status: 400 }
      );
    }

    if (!signatureBcs) {
      console.error(
        "[facilitator/settle] Error: Signature not found in payment payload"
      );
      console.error(
        "[facilitator/settle] Available paymentPayload keys:",
        Object.keys(paymentPayload)
      );
      return NextResponse.json(
        { success: false, error: "Signature not found in payment payload" },
        { status: 400 }
      );
    }

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
    // The transaction was already signed by Privy on the client side
    // We need to construct a SignedTransaction and submit it to RPC
    console.log(
      "[facilitator/settle] Reconstructing transaction and authenticator from BCS..."
    );

    const { movementFullNode } = getMovementConfig();
    console.log("[facilitator/settle] Movement Full Node:", movementFullNode);

    // Deserialize RawTransaction from BCS bytes
    const transactionDeserializer = new Deserializer(transactionBytes);
    const rawTransaction = RawTransaction.deserialize(transactionDeserializer);
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
    // SignedTransaction = { transaction: RawTransaction, authenticator: TransactionAuthenticator }
    // AccountAuthenticatorEd25519 is a type of TransactionAuthenticator
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
    const signedTransactionBuffer = Buffer.from(signedTransactionBcs);

    // Submit signed transaction directly to Movement Network RPC
    // Use the /transactions endpoint with BCS content type
    console.log("[facilitator/settle] Submitting signed transaction to RPC...");
    try {
      const rpcResponse = await fetch(`${movementFullNode}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x.aptos.signed_transaction+bcs",
        },
        body: signedTransactionBuffer,
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
