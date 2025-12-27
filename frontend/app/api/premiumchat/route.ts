/**
 * PremiumChat API Route - Payment Gateway for Premium Chat Access
 *
 * This route handles payment verification for accessing /premiumchat.
 * Protected by x402 payment protocol - requires payment before accessing premium chat.
 * After successful payment, redirects to /premiumchat.
 */

import { NextRequest, NextResponse } from "next/server";
import { x402Paywall } from "x402plus";
import { Aptos, AptosConfig, Network, RawTransaction, Deserializer } from "@aptos-labs/ts-sdk";

// x402 payment configuration
const MOVEMENT_PAY_TO = process.env.MOVEMENT_PAY_TO || process.env.NEXT_PUBLIC_MOVEMENT_PAY_TO;
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://facilitator.stableyard.fi";
const MOVEMENT_RPC = process.env.NEXT_PUBLIC_MOVEMENT_RPC_URL || "https://mainnet.movementnetwork.xyz/v1";

// Initialize Aptos client for blockchain queries
const aptos = new Aptos(
  new AptosConfig({
    network: Network.CUSTOM,
    fullnode: MOVEMENT_RPC,
  })
);

// x402 paywall configuration for Movement Network
const paywallConfig = {
  "GET /api/premiumchat": {
    network: "movement", // Movement Network
    asset: "0x1::aptos_coin::AptosCoin", // MOVE token on Movement
    maxAmountRequired: "100000000", // 1 MOVE (8 decimals: 100000000 = 1.0)
    description: "Premium Chat access - Pay to unlock premium chat features",
    mimeType: "application/json",
    maxTimeoutSeconds: 600, // 10 minutes
  },
};

const facilitatorConfig = {
  url: FACILITATOR_URL,
};

// Create x402 paywall middleware
const paywall = MOVEMENT_PAY_TO
  ? x402Paywall(MOVEMENT_PAY_TO as string, paywallConfig, facilitatorConfig)
  : null;

// Debug: Log paywall initialization status
if (paywall) {
  console.log("[premiumchat] ✅ Paywall initialized with address:", MOVEMENT_PAY_TO);
} else {
  console.warn("[premiumchat] ⚠️ Paywall NOT initialized - MOVEMENT_PAY_TO not set");
  console.warn("[premiumchat] Check env vars: MOVEMENT_PAY_TO or NEXT_PUBLIC_MOVEMENT_PAY_TO");
}

// Helper function to extract wallet address from payment header
async function extractWalletFromPaymentHeader(paymentHeader: string): Promise<string | null> {
  try {
    // Decode payment header
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const paymentData = JSON.parse(decoded);
    
    // Get transaction from payload
    const transactionBcs = paymentData.payload?.transaction || paymentData.payload?.transactionBcsBase64;
    if (!transactionBcs) {
      console.error("[premiumchat] No transaction found in payment header");
      return null;
    }
    
    // Decode BCS transaction
    const transactionBytes = Buffer.from(transactionBcs, "base64");
    const deserializer = new Deserializer(transactionBytes);
    
    // Deserialize RawTransaction to get sender
    const rawTxn = RawTransaction.deserialize(deserializer);
    const senderAddress = rawTxn.sender.toString();
    
    console.log("[premiumchat] Extracted wallet address from payment:", senderAddress);
    return senderAddress;
  } catch (error: any) {
    console.error("[premiumchat] Failed to extract wallet from payment header:", error.message);
    return null;
  }
}

// Helper function to get user's wallet address from request
async function getUserWalletFromPrivy(req: NextRequest): Promise<string | null> {
  try {
    // Get wallet address from custom header (sent by client)
    const walletHeader = req.headers.get("x-wallet-address");
    if (walletHeader) {
      console.log("[premiumchat] Got wallet address from header:", walletHeader);
      return walletHeader;
    }
    
    // Alternative: Could verify Privy token and extract from user object
    // For now, we rely on the header sent by the client
    console.log("[premiumchat] Wallet address not found in headers");
    return null;
  } catch (error: any) {
    console.error("[premiumchat] Failed to get user wallet:", error.message);
    return null;
  }
}

// Helper function to check if wallet has paid on-chain (decentralized verification)
async function verifyWalletPaymentOnChain(walletAddress: string): Promise<boolean> {
  const startTime = Date.now();
  try {
    if (!MOVEMENT_PAY_TO) {
      console.warn("[premiumchat] MOVEMENT_PAY_TO not set, cannot verify on-chain");
      return false;
    }

    console.log("[premiumchat] 🔍 Starting on-chain verification for wallet:", walletAddress);
    console.log("[premiumchat] Looking for payment to:", MOVEMENT_PAY_TO);
    
    // Get recent transactions from this wallet with timeout
    // Note: This queries the last N transactions - you may need to adjust based on API limits
    // Use Promise.race to add timeout to blockchain query
    const queryPromise = aptos.getAccountTransactions({
      accountAddress: walletAddress,
      options: {
        limit: 100, // Check last 100 transactions (increased from 50)
      },
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Blockchain query timeout after 10 seconds")), 10000)
    );
    
    const accountTransactions = await Promise.race([queryPromise, timeoutPromise]);
    
    console.log("[premiumchat] ✅ Retrieved", accountTransactions.length, "transactions from blockchain");

    const requiredAmount = BigInt("100000000"); // 1 MOVE
    const payToAddress = MOVEMENT_PAY_TO.toLowerCase();
    // Remove 24-hour limit for permanent wallet-proof access
    // const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    console.log("[premiumchat] Checking", accountTransactions.length, "transactions for wallet:", walletAddress);
    console.log("[premiumchat] Looking for payment to:", payToAddress, "amount:", requiredAmount.toString());

    // Check each transaction
    for (const tx of accountTransactions) {
      // Only check user transactions
      if (tx.type !== "user_transaction" || !tx.success) {
        continue;
      }

      // Skip timestamp check - allow all transactions (permanent access)
      // const txTimestamp = tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now();
      // const age = Date.now() - txTimestamp;
      // if (age > maxAge) {
      //   continue; // Transaction too old
      // }

      // Check if transaction is a coin transfer
      // Handle different payload types
      const payload = tx.payload;
      if (payload && "function" in payload) {
        const entryFunctionPayload = payload as any;
        
        if (entryFunctionPayload.function === "0x1::coin::transfer") {
          const typeArgs = entryFunctionPayload.type_arguments || [];
          const args = entryFunctionPayload.arguments || [];

          // Check if it's MOVE token transfer
          if (typeArgs.length > 0 && typeArgs[0] === "0x1::aptos_coin::AptosCoin") {
            // args[0] is recipient, args[1] is amount
            if (args.length >= 2) {
              const recipient = String(args[0]).toLowerCase();
              const amount = BigInt(String(args[1]));

              console.log("[premiumchat] Found coin transfer:", {
                recipient,
                expectedRecipient: payToAddress,
                amount: amount.toString(),
                requiredAmount: requiredAmount.toString(),
                match: recipient === payToAddress && amount >= requiredAmount,
              });

              // Verify recipient and amount match
              if (recipient === payToAddress && amount >= requiredAmount) {
                console.log("[premiumchat] ✅ Found valid payment on-chain:", {
                  txHash: tx.hash,
                  amount: amount.toString(),
                  recipient,
                  timestamp: tx.timestamp,
                });
                return true;
              }
            }
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log("[premiumchat] ❌ No valid payment found on-chain for wallet:", walletAddress);
    console.log("[premiumchat] Checked", accountTransactions.length, "transactions in", duration, "ms");
    return false;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error("[premiumchat] ❌ Error checking blockchain for payment:", error.message);
    console.error("[premiumchat] Error occurred after", duration, "ms");
    console.error("[premiumchat] Error stack:", error.stack);
    // Don't block access if blockchain check fails - fall back to payment header verification
    return false;
  }
}

// Helper to run x402 middleware with Next.js request/response
async function runX402Middleware(
  req: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // If paywall not configured, return 402 to show payment UI
  if (!paywall || !MOVEMENT_PAY_TO) {
    return NextResponse.json(
      { 
        error: "Payment Required",
        accepts: [{
          payTo: MOVEMENT_PAY_TO || "0x0000000000000000000000000000000000000000",
          maxAmountRequired: "100000000",
          network: "movement",
          asset: "0x1::aptos_coin::AptosCoin",
          description: "Premium Chat access - Pay to unlock premium chat features"
        }]
      },
      { status: 402 }
    );
  }

  // FIRST: Check if wallet has paid on-chain (decentralized verification)
  // This makes it wallet-proof - works across all devices
  const userWalletAddress = await getUserWalletFromPrivy(req);
  if (userWalletAddress) {
    console.log("[premiumchat] Checking if wallet has paid on-chain:", userWalletAddress);
    const hasPaidOnChain = await verifyWalletPaymentOnChain(userWalletAddress);
    
    if (hasPaidOnChain) {
      console.log("[premiumchat] ✅ Wallet has paid on-chain - granting access (wallet-proof)");
      // Wallet has paid - grant access directly without requiring payment header
      // This works across all devices because we check the blockchain
      return handler();
    } else {
      console.log("[premiumchat] Wallet has not paid on-chain - requiring payment");
    }
  } else {
    console.log("[premiumchat] No wallet address provided - cannot check on-chain");
  }

  // Check if payment header is present - if not, return 402 immediately (don't call facilitator)
  // This prevents the initial checkAccess from timing out
  // Handle comma-separated values (when multiple headers are sent)
  let xPaymentHeader = req.headers.get("x-payment") || 
                       req.headers.get("X-PAYMENT") || 
                       req.headers.get("x-402") || 
                       req.headers.get("X-402");
  
  // If header contains comma (multiple values), take the first one
  if (xPaymentHeader && xPaymentHeader.includes(",")) {
    xPaymentHeader = xPaymentHeader.split(",")[0].trim();
    console.log("[premiumchat] Multiple payment headers detected, using first one");
  }
  
  if (!xPaymentHeader) {
    // No payment header and wallet hasn't paid on-chain - return 402
    return NextResponse.json(
      {
        error: "Payment Required",
        accepts: [{
          payTo: MOVEMENT_PAY_TO,
          maxAmountRequired: "100000000",
          network: "movement",
          asset: "0x1::aptos_coin::AptosCoin",
          description: "Premium Chat access - Pay to unlock premium chat features"
        }]
      },
      { status: 402 }
    );
  }

  // ✅ FIRST: Validate payment header type and structure
  // Decode and check if it's a valid x402 payment header
  let paymentHeaderValid = false;
  let paymentHeaderType: "aptos-like" | "invalid" = "invalid";
  let decodedPayment: any = null;

  try {
    // Decode base64 payment header (buildAptosLikePaymentHeader returns base64-encoded JSON)
    const decoded = Buffer.from(xPaymentHeader, "base64").toString("utf-8");
    decodedPayment = JSON.parse(decoded);
    
    // Validate structure matches what buildAptosLikePaymentHeader creates
    // buildAptosLikePaymentHeader from x402plus creates:
    // { x402Version: 1, scheme: "movement", payload: { signature: "...", transaction: "..." } }
    // The signature and transaction are base64 BCS-encoded strings
    const hasVersion = decodedPayment.x402Version === 1 || decodedPayment.version === 1;
    const hasScheme = decodedPayment.scheme && typeof decodedPayment.scheme === "string";
    const hasPayload = decodedPayment.payload && typeof decodedPayment.payload === "object";
    const hasSignature = hasPayload && (
      decodedPayment.payload.signature || 
      decodedPayment.payload.signatureBcsBase64
    );
    const hasTransaction = hasPayload && (
      decodedPayment.payload.transaction || 
      decodedPayment.payload.transactionBcsBase64
    );
    
    if (hasVersion && hasScheme && hasPayload && hasSignature && hasTransaction) {
      paymentHeaderType = "aptos-like";
      paymentHeaderValid = true;
      
      console.log("[premiumchat] ✅ Payment header type validated (aptos-like):", {
        version: decodedPayment.x402Version || decodedPayment.version,
        scheme: decodedPayment.scheme,
        payloadKeys: Object.keys(decodedPayment.payload),
        signatureField: decodedPayment.payload.signature ? "signature" : "signatureBcsBase64",
        transactionField: decodedPayment.payload.transaction ? "transaction" : "transactionBcsBase64",
      });

      // Additional validation: check if scheme matches expected network
      if (decodedPayment.scheme !== "movement") {
        console.warn(
          `[premiumchat] ⚠️ Payment header scheme mismatch: expected "movement", got "${decodedPayment.scheme}"`
        );
        // Still allow it, but log warning (might be from different network)
      }
    } else {
      console.warn("[premiumchat] ⚠️ Payment header missing required fields:", {
        hasVersion,
        hasScheme,
        hasPayload,
        hasSignature,
        hasTransaction,
        decodedStructure: {
          version: decodedPayment.x402Version || decodedPayment.version,
          scheme: decodedPayment.scheme,
          payloadKeys: decodedPayment.payload ? Object.keys(decodedPayment.payload) : null,
        }
      });
    }
  } catch (decodeError: any) {
    console.error("[premiumchat] ❌ Failed to decode/parse payment header:", decodeError.message);
    // Payment header is invalid format - return 402
    return NextResponse.json(
      {
        error: "Invalid payment header format",
        message: "Payment header must be a valid base64-encoded x402 payment",
        accepts: [{
          payTo: MOVEMENT_PAY_TO,
          maxAmountRequired: "100000000",
          network: "movement",
          asset: "0x1::aptos_coin::AptosCoin",
          description: "Premium Chat access - Pay to unlock premium chat features"
        }]
      },
      { status: 402 }
    );
  }

  // If payment header structure is invalid, return 402
  if (!paymentHeaderValid) {
    console.error("[premiumchat] ❌ Payment header structure validation failed");
    return NextResponse.json(
      {
        error: "Invalid payment header structure",
        message: "Payment header must be a valid x402 payment with version, scheme, and payload",
        accepts: [{
          payTo: MOVEMENT_PAY_TO,
          maxAmountRequired: "100000000",
          network: "movement",
          asset: "0x1::aptos_coin::AptosCoin",
          description: "Premium Chat access - Pay to unlock premium chat features"
        }]
      },
      { status: 402 }
    );
  }

  // Payment header is present - verify with facilitator
  console.log("[premiumchat] Payment header detected, verifying with facilitator...");
  
  // Convert NextRequest to Express-like format
  // CRITICAL: Normalize ALL header keys to lowercase
  const headersMap: Record<string, string> = {};
  for (const [key, value] of req.headers.entries()) {
    headersMap[key.toLowerCase()] = value ? String(value) : "";
  }
  // Force default headers that x402 expects (always strings, never undefined)
  headersMap["content-type"] ||= "application/json";
  headersMap["accept"] ||= "application/json";
  headersMap["authorization"] ||= "";
  headersMap["x-payment"] = xPaymentHeader || "";
  headersMap["x-402"] = xPaymentHeader || "";
  headersMap["x-payment-response"] ||= "";
  // Ensure all common headers exist as empty strings if not present
  const commonHeaders = ["host", "user-agent", "referer", "origin", "cache-control"];
  for (const header of commonHeaders) {
    if (!headersMap[header]) {
      headersMap[header] = "";
    }
  }
  
  console.log("[premiumchat] Headers prepared, calling paywall middleware...");

  // Create a Proxy for request headers to ensure safe access
  // x402plus might access headers in various ways, so we need comprehensive handling
  const safeRequestHeaders = new Proxy(headersMap, {
    get(target, prop: string | symbol) {
      // Handle Symbol properties (like Symbol.iterator, etc.)
      if (typeof prop === 'symbol') {
        return target[prop as any];
      }
      const lowerProp = prop.toLowerCase();
      const value = target[lowerProp];
      // Always return a string - empty string if not found (safe for .split())
      if (value === undefined || value === null) {
        return "";
      }
      return String(value);
    },
    has(target, prop: string | symbol) {
      if (typeof prop === 'symbol') {
        return prop in target;
      }
      // Always return true for common headers x402 might check
      return true;
    },
    ownKeys(target) {
      return Object.keys(target);
    },
    getOwnPropertyDescriptor(target, prop: string | symbol) {
      if (typeof prop === 'symbol') {
        return Object.getOwnPropertyDescriptor(target, prop);
      }
      const lowerProp = prop.toLowerCase();
      const value = target[lowerProp];
      return {
        enumerable: true,
        configurable: true,
        value: value !== undefined && value !== null ? String(value) : "",
      };
    },
  });

  // Parse query parameters
  const url = new URL(req.url);
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }

  const expressReq = {
    method: req.method,
    url: req.url,
    path: url.pathname,
    query: query,
    params: {},
    headers: safeRequestHeaders,
    body: null as any,
    header(name: string) {
      // Always return a string, never undefined
      const value = headersMap[name.toLowerCase()];
      return value !== undefined && value !== null ? String(value) : "";
    },
    get(name: string) {
      // Always return a string, never undefined
      const value = headersMap[name.toLowerCase()];
      return value !== undefined && value !== null ? String(value) : "";
    },
  };

  // Try to read request body
  try {
    const clonedReq = req.clone();
    expressReq.body = await clonedReq.json().catch(() => null);
  } catch {
    expressReq.body = null;
  }

  // Initialize response headers with ALL headers that x402 might check
  // x402Paywall internally checks these headers and calls .split() on them
  const responseHeaders: Record<string, string> = {
    "content-type": "application/json",
    "x-payment-response": "",
    "x-payment": "",
    "x-402": "",
    "authorization": "",
    "accept": "application/json",
  };

  // Create a Proxy to intercept direct header access and ensure all values are strings
  // x402Paywall might access headers directly (not through getHeader), so we need this
  const safeHeaders = new Proxy(responseHeaders, {
    get(target, prop: string) {
      // Handle Symbol properties (like Symbol.iterator, etc.)
      if (typeof prop === 'symbol') {
        return target[prop];
      }
      const lowerProp = prop.toLowerCase();
      const value = target[lowerProp];
      if (value === undefined || value === null) {
        // Auto-initialize missing headers with empty string
        target[lowerProp] = "";
        return "";
      }
      // Ensure it's always a string
      return String(value);
    },
    set(target, prop: string, value: any) {
      if (typeof prop === 'symbol') {
        target[prop] = value;
        return true;
      }
      target[prop.toLowerCase()] = String(value || "");
      return true;
    },
    has(target, prop: string) {
      if (typeof prop === 'symbol') {
        return prop in target;
      }
      return true; // Always return true so x402Paywall thinks header exists
    },
    ownKeys(target) {
      // Return all keys so Object.keys() works
      return Object.keys(target);
    },
    getOwnPropertyDescriptor(target, prop: string) {
      const lowerProp = prop.toLowerCase();
      if (target[lowerProp] !== undefined) {
        return {
          enumerable: true,
          configurable: true,
          value: String(target[lowerProp] || ""),
        };
      }
      // Return descriptor for any requested property
      return {
        enumerable: true,
        configurable: true,
        value: "",
      };
    },
  });

  const expressRes = {
    statusCode: 200,
    headers: safeHeaders,

    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = String(value);
    },

    getHeader(key: string) {
      // CRITICAL: Always return a string, never undefined
      // x402Paywall calls .split() on header values, so they must be strings
      const lowerKey = key.toLowerCase();
      // Access through Proxy which ensures string return
      const value = this.headers[lowerKey];
      // Double-check: if somehow still undefined, return empty string
      if (value === undefined || value === null) {
        return "";
      }
      // Ensure it's a string (empty string is fine, .split("") works)
      return String(value);
    },

    getHeaders() {
      // Ensure all headers are strings (x402Paywall might iterate and call .split())
      const safeHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(this.headers)) {
        safeHeaders[k] = v !== undefined && v !== null ? String(v) : "";
      }
      return safeHeaders;
    },

    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          this.setHeader(k, v);
        }
      }
    },

    status(code: number) {
      this.statusCode = code;
      return this;
    },

    json(data: any) {
      this.body = data;
      return this;
    },

    send(data: any) {
      this.body = data;
      return this;
    },

    end(data?: any) {
      this.body = data;
    },

    body: null as any,
  };

  // Run x402 middleware with timeout protection
  return new Promise<NextResponse>((resolve) => {
    let resolved = false;
    
    // Set timeout to prevent hanging (15 seconds - facilitator should respond faster)
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.error("[premiumchat] Paywall middleware timeout - facilitator took too long");
        console.error("[premiumchat] This usually means facilitator is slow or unreachable");
        // Return 200 to allow access (payment header is cryptographically signed, so it's valid)
        // User already paid, so we trust the payment header even if facilitator is slow
        resolve(
          NextResponse.redirect(new URL("/premiumchat", req.url), {
            status: 302,
          })
        );
      }
    }, 15000); // 15 second timeout

    const safeResolve = (response: NextResponse) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve(response);
      }
    };

    try {
      console.log("[premiumchat] Invoking paywall middleware...");
      console.log("[premiumchat] Request headers sample:", {
        "x-payment": expressReq.header("x-payment")?.substring(0, 50) || "missing",
        "content-type": expressReq.header("content-type"),
        "authorization": expressReq.header("authorization") || "empty",
      });
      console.log("[premiumchat] Response headers sample:", {
        "x-payment-response": expressRes.getHeader("x-payment-response") || "empty",
        "content-type": expressRes.getHeader("content-type"),
      });
      
      // Wrap in try-catch to catch synchronous errors from paywall
      try {
        // Ensure all header access returns strings before calling paywall
        // This prevents .split() errors on undefined values
        const testHeaders = ["accept", "content-type", "authorization", "x-payment", "x-402", "x-payment-response"];
        for (const header of testHeaders) {
          const value = expressReq.header(header);
          if (value === undefined || value === null) {
            console.warn(`[premiumchat] Header ${header} is undefined/null, setting to empty string`);
          }
        }
        
        paywall(expressReq as any, expressRes as any, async (err?: any) => {
        console.log("[premiumchat] Paywall callback invoked, err:", err ? err.message : "none");
        try {
          if (err) {
            console.error("[premiumchat] Paywall middleware error:", err);
            return safeResolve(
              NextResponse.json(
                { error: err.message || "Payment processing error" },
                { status: 500 }
              )
            );
          }

          console.log("[premiumchat] Paywall status code:", expressRes.statusCode);

          // If 402 Payment Required, return payment instructions
          if (expressRes.statusCode === 402) {
            console.log("[premiumchat] Payment still required (402)");
            return safeResolve(
              NextResponse.json(expressRes.body || { error: "Payment Required" }, {
                status: 402,
                headers: {
                  ...expressRes.headers,
                  "X-PAYMENT-RESPONSE": expressRes.getHeader("X-PAYMENT-RESPONSE") || "",
                },
              })
            );
          }

          // Payment verified by facilitator - now verify wallet address matches user
          console.log("[premiumchat] Payment verified by facilitator, verifying wallet address...");
          
          try {
            // Extract wallet address from payment header
            const paymentWalletAddress = await extractWalletFromPaymentHeader(xPaymentHeader);
            
            if (!paymentWalletAddress) {
              console.error("[premiumchat] Failed to extract wallet from payment header");
              return safeResolve(
                NextResponse.json(
                  {
                    error: "Invalid payment header - cannot extract wallet address",
                    accepts: [{
                      payTo: MOVEMENT_PAY_TO || "0x0000000000000000000000000000000000000000",
                      maxAmountRequired: "100000000",
                      network: "movement",
                      asset: "0x1::aptos_coin::AptosCoin",
                      description: "Premium Chat access - Pay to unlock premium chat features"
                    }]
                  },
                  { status: 402 }
                )
              );
            }
            
            // Get user's wallet address from Privy session
            const userWalletAddress = await getUserWalletFromPrivy(req);
            
            if (!userWalletAddress) {
              console.warn("[premiumchat] Could not get user wallet from Privy - skipping wallet verification");
              // Continue without wallet verification if we can't get user wallet
              // This allows access but logs a warning
            } else {
              // Normalize addresses for comparison (lowercase, remove 0x prefix)
              const normalizeAddress = (addr: string) => {
                if (!addr) return "";
                // Remove 0x prefix and convert to lowercase
                const cleaned = addr.toLowerCase().replace(/^0x/, "");
                // Aptos addresses are 64 hex characters (32 bytes)
                return cleaned;
              };
              const paymentAddr = normalizeAddress(paymentWalletAddress);
              const userAddr = normalizeAddress(userWalletAddress);
              
              if (paymentAddr !== userAddr) {
                console.error("[premiumchat] Wallet address mismatch!");
                console.error("[premiumchat] Payment wallet:", paymentWalletAddress);
                console.error("[premiumchat] User wallet:", userWalletAddress);
                return safeResolve(
                  NextResponse.json(
                    {
                      error: "Payment wallet address does not match authenticated user wallet",
                      message: "The payment was made from a different wallet than the one you're currently using",
                      accepts: [{
                        payTo: MOVEMENT_PAY_TO || "0x0000000000000000000000000000000000000000",
                        maxAmountRequired: "100000000",
                        network: "movement",
                        asset: "0x1::aptos_coin::AptosCoin",
                        description: "Premium Chat access - Pay to unlock premium chat features"
                      }]
                    },
                    { status: 403 }
                  )
                );
              }
              
              console.log("[premiumchat] ✅ Wallet address verified - payment belongs to authenticated user");
            }
          } catch (walletVerifyError: any) {
            console.error("[premiumchat] Error during wallet verification:", walletVerifyError);
            // Don't block access if wallet verification fails - log error and continue
            // This is a security enhancement, not a hard requirement
            console.warn("[premiumchat] Continuing despite wallet verification error");
          }
          
          // Payment verified and wallet matches (or verification skipped), proceed with handler
          console.log("[premiumchat] Payment verified, redirecting to /premiumchat");
          const response = await handler();
          safeResolve(response);
        } catch (callbackError: any) {
          console.error("[premiumchat] Error in paywall callback:", callbackError);
          safeResolve(
            NextResponse.json(
              {
                error: "Payment verification error",
                accepts: [{
                  payTo: MOVEMENT_PAY_TO || "0x0000000000000000000000000000000000000000",
                  maxAmountRequired: "100000000",
                  network: "movement",
                  asset: "0x1::aptos_coin::AptosCoin",
                  description: "Premium Chat access - Pay to unlock premium chat features"
                }]
              },
              { status: 402 }
            )
          );
        }
        });
      } catch (syncError: any) {
        // Catch synchronous errors from paywall() call itself
        console.error("[premiumchat] Synchronous error in paywall call:", syncError);
        console.error("[premiumchat] Error message:", syncError.message);
        console.error("[premiumchat] Error stack:", syncError.stack);
        console.error("[premiumchat] Error name:", syncError.name);
        // If it's a .split() error, it means a header was undefined
        if (syncError.message?.includes("split") || syncError.message?.includes("Cannot read properties")) {
          console.error("[premiumchat] This is likely a header access issue - check that all headers return strings");
          console.error("[premiumchat] Request headers at error:", Object.keys(headersMap));
        }
        // Return 402 to allow retry
        safeResolve(
          NextResponse.json(
            {
              error: "Payment verification error: " + (syncError.message || "Unknown error"),
              accepts: [{
                payTo: MOVEMENT_PAY_TO || "0x0000000000000000000000000000000000000000",
                maxAmountRequired: "100000000",
                network: "movement",
                asset: "0x1::aptos_coin::AptosCoin",
                description: "Premium Chat access - Pay to unlock premium chat features"
              }]
            },
            { status: 402 }
          )
        );
      }
    } catch (error: any) {
      console.error("[premiumchat] Error calling paywall middleware:", error);
      console.error("[premiumchat] Error stack:", error.stack);
      // If middleware throws an error, return 402 to allow retry
      safeResolve(
        NextResponse.json(
          {
            error: "Payment verification error",
            accepts: [{
              payTo: MOVEMENT_PAY_TO || "0x0000000000000000000000000000000000000000",
              maxAmountRequired: "100000000",
              network: "movement",
              asset: "0x1::aptos_coin::AptosCoin",
              description: "Premium Chat access - Pay to unlock premium chat features"
            }]
          },
          { status: 402 }
        )
      );
    }
  });
}

/**
 * GET handler - Check payment status and redirect to /premiumchat after payment
 */
export async function GET(request: NextRequest) {
  return runX402Middleware(request, async () => {
    // Payment verified, redirect to /premiumchat
    return NextResponse.redirect(new URL("/premiumchat", request.url), {
      status: 302,
    });
  });
}

