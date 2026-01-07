/**
 * Transaction Service - Unified transaction flow matching MovePosition
 * Handles transaction building, signing, and submission with Privy
 */

import { requireSDKContext } from "../context/sdk-context";
import {
  Ed25519PublicKey,
  Ed25519Signature,
  AccountAuthenticatorEd25519,
  generateSigningMessageForTransaction,
  ChainId,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import * as Gen from "../../lib/super-json-api-client/src";
import { PortfolioState } from "./portfolio-service";
import { requireMovementChainId } from "@/lib/super-aptos-sdk/src/globals";

/**
 * Transaction arguments matching MovePosition's TransactionArgs
 */
export interface TransactionArgs {
  brokerName: string;
  amount: string;
  network: string;
  signerPubkey: string;
  currentPortfolioState: PortfolioState;
}

/**
 * Transaction types matching MovePosition
 */
export type TxType = "supply" | "withdraw" | "borrow" | "repay";

/**
 * Sign hash function type (Privy's signRawHash)
 */
export type SignHashFunction = (hash: string) => Promise<{ signature: string }>;

/**
 * Progress callback for transaction steps
 */
export type ProgressCallback = (step: string) => void;

/**
 * Transaction request payload
 */
export interface TxRequestPayload {
  txType: TxType;
  txAmount: string; // Raw amount as string
  broker: Gen.Broker;
  address: string;
  publicKey: string;
  signHash: SignHashFunction;
  currentPortfolioState: PortfolioState;
  onProgress?: ProgressCallback;
}

/**
 * Fetch transaction packet from API
 * Matches MovePosition's fetchPacket logic
 */
async function fetchPacket({
  txType,
  txArgs,
  onProgress,
}: {
  txType: TxType;
  txArgs: TransactionArgs;
  onProgress?: ProgressCallback;
}): Promise<Gen.PacketResponse> {
  const { superClient } = requireSDKContext();

  onProgress?.(`Fetching ${txType} packet...`);

  try {
    let packet: Gen.PacketResponse;

    switch (txType) {
      case "supply":
        packet = await superClient.default.lendV2(txArgs);
        break;
      case "withdraw":
        packet = await superClient.default.redeemV2(txArgs);
        break;
      case "borrow":
        packet = await superClient.default.borrowV2(txArgs);
        break;
      case "repay":
        packet = await superClient.default.repayV2(txArgs);
        break;
      default:
        throw new Error(`Invalid transaction type: ${txType}`);
    }

    return packet;
  } catch (e: any) {
    console.error(`[TransactionService] ❌ Failed to fetch ${txType} packet:`, {
      error: e.message,
      errorStack: e.stack,
      response: e.body || e.response?.data || e.response?.body,
      status: e.status || e.response?.status,
      statusText: e.statusText || e.response?.statusText,
    });

    // Provide more helpful error messages
    if (e.status === 500 || e.response?.status === 500) {
      throw new Error(
        `API Server Error: The MovePosition API returned a 500 error. This may be due to invalid request parameters or server issues. Please check: 1) Your balance is sufficient, 2) The broker name is correct, 3) The portfolio state is valid. Original error: ${e.message || "Internal Server Error"}`
      );
    }

    throw new Error(
      `Network error: Unable to fetch transaction packet. ${e.message || "Unknown error"}`
    );
  }
}

/**
 * Build transaction instruction from packet
 * Matches MovePosition's transaction building logic exactly
 * Uses SDK methods: superLendV2Ix, superRedeemV2Ix, superBorrowV2Ix, superRepayV2Ix
 */
function buildTransactionIx(
  txType: TxType,
  packet: Gen.PacketResponse,
  broker: Gen.Broker,
  address: string
): any {
  const { superAptosSDK } = requireSDKContext();

  // Convert hex string to Uint8Array (matching MovePosition approach)
  // MovePosition uses: const packetHex = Hex.fromHexString(packet.packet)
  // const ar = packetHex.toUint8Array()
  const packetHex = packet.packet.startsWith("0x")
    ? packet.packet
    : `0x${packet.packet}`;

  const hexBytes = packetHex.slice(2).match(/.{1,2}/g) || [];
  const packetUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  // Note: SDK methods (super*V2Ix) convert Uint8Array to Array internally
  // This matches MovePosition's behavior - they pass Uint8Array directly

  const coinType = broker.underlyingAsset.networkAddress;

  // Build instruction based on transaction type using SDK methods
  // These match MovePosition's doTx.ts implementation exactly
  let ix;

  switch (txType) {
    case "supply":
      // MovePosition: ix = superAptosSDK.superLendV2Ix(ar, broker.underlyingAsset.networkAddress, address)
      ix = superAptosSDK.superLendV2Ix(packetUintArray, coinType, address);
      break;
    case "withdraw":
      // MovePosition: ix = superAptosSDK.superRedeemV2Ix(ar, broker.underlyingAsset.networkAddress, address)
      ix = superAptosSDK.superRedeemV2Ix(packetUintArray, coinType, address);
      break;
    case "borrow":
      // MovePosition: ix = superAptosSDK.superBorrowV2Ix(ar, broker.underlyingAsset.networkAddress, address)
      ix = superAptosSDK.superBorrowV2Ix(packetUintArray, coinType, address);
      break;
    case "repay":
      // MovePosition: ix = superAptosSDK.superRepayV2Ix(ar, broker.underlyingAsset.networkAddress, address)
      ix = superAptosSDK.superRepayV2Ix(packetUintArray, coinType, address);
      break;
    default:
      throw new Error(`Invalid transaction type: ${txType}`);
  }

  console.log(
    `[TransactionService] ✅ Built ${txType} transaction instruction:`,
    {
      txType,
      coinType,
      sender: address,
      packetLength: packetUintArray.length,
    }
  );

  return ix;
}

/**
 * Sign and submit transaction using Privy
 * Adapts MovePosition's signAndSubmitter for Privy
 */
async function signAndSubmitTransaction({
  txIx,
  address,
  publicKey,
  signHash,
  onProgress,
}: {
  txIx: any;
  address: string;
  publicKey: string;
  signHash: SignHashFunction;
  onProgress?: ProgressCallback;
}): Promise<string> {
  const { aptos, network } = requireSDKContext();

  onProgress?.("Building transaction...");

  // Extract transaction data from instruction
  const txData = txIx.data as any;
  const txFunction = txData.function as `${string}::${string}::${string}`;
  const txTypeArguments: string[] = txData.typeArguments || [];
  const txFunctionArguments: any[] = txData.functionArguments || [];

  // Build transaction using Aptos SDK
  const rawTxn = await aptos.transaction.build.simple({
    sender: txIx.sender!,
    data: {
      function: txFunction as `${string}::${string}::${string}`,
      typeArguments: txTypeArguments,
      functionArguments: txFunctionArguments,
    },
  });

  // Override chain ID to match Movement Network
  // IMPORTANT: Chain ID must be set BEFORE generating the signing message
  const movementChainId = requireMovementChainId();
  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(movementChainId);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
    console.log(
      `[TransactionService] Set chain ID to ${movementChainId} for Movement Network`
    );
  }

  onProgress?.("Waiting for signature...");

  // Generate signing message and hash (chain ID is now set in rawTxn)
  const message = generateSigningMessageForTransaction(rawTxn);
  const hash = toHex(message);

  // Sign with Privy (with timeout)
  const timeoutMilliseconds = 60000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Transaction signing timed out")),
      timeoutMilliseconds
    )
  );

  const signatureResponse = await Promise.race([
    signHash(hash),
    timeoutPromise,
  ]);

  onProgress?.("Signature received, submitting...");

  // Process Privy public key format (remove "00" prefix if present)
  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;

  if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
    pubKeyNoScheme = pubKeyNoScheme.slice(2);
  }

  if (pubKeyNoScheme.length !== 64) {
    throw new Error(
      `Invalid public key length: expected 64 hex chars, got ${pubKeyNoScheme.length}`
    );
  }

  const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(
    publicKeyObj,
    sig
  );

  // Submit transaction
  const pending = await aptos.transaction.submit.simple({
    transaction: rawTxn,
    senderAuthenticator,
  });

  onProgress?.(`Transaction submitted: ${pending.hash}`);

  return pending.hash;
}

/**
 * Wait for transaction finality
 * Matches MovePosition's updateSuccessStateAndWait
 */
async function waitForTransaction(
  hash: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const { aptos } = requireSDKContext();

  onProgress?.("Awaiting finality...");

  try {
    const result = await aptos.waitForTransaction({
      transactionHash: hash,
      options: {
        checkSuccess: true,
      },
    });

    console.log("Transaction completed:", result);
    onProgress?.("Transaction completed successfully!");
  } catch (e: any) {
    console.error("Transaction failed:", e);
    throw new Error(`Transaction failed: ${e.message || "Unknown error"}`);
  }
}

/**
 * Check APT/MOVE balance before transaction
 * Checks both FA balance (asset type 0xa) and coin store balance (0x1::aptos_coin::AptosCoin)
 * Both are treated as valid balances for gas
 */
async function checkGasBalance(
  address: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const { aptos } = requireSDKContext();
  const { checkGasBalanceWithFA } = require("@/app/utils/shared/balance-utils");

  try {
    await checkGasBalanceWithFA(aptos, address, onProgress);
  } catch (e: any) {
    // If it's our custom error, throw it as-is
    if (
      e.message.includes("MOVE") ||
      e.message.includes("gas") ||
      e.message.includes("balance")
    ) {
      throw e;
    }
    // Otherwise, wrap in a user-friendly error
    throw new Error(
      `Failed to check gas balance: ${e.message || "Unknown error"}. Please ensure you have MOVE tokens (coin store or fungible asset) in your wallet for transaction fees.`
    );
  }
}

/**
 * Check underlying asset balance before submit (client-side guard)
 */
async function checkUnderlyingBalance(
  address: string,
  coinType: string,
  requiredRawAmount: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const { aptos } = requireSDKContext();

  onProgress?.("Checking asset balance...");

  const required = BigInt(requiredRawAmount);
  try {
    const faType = `0x1::fungible_asset::Balance<${coinType}>`;
    const coinStoreType = `0x1::coin::CoinStore<${coinType}>`;

    let faBalance = BigInt(0);
    let coinStoreBalance = BigInt(0);

    // Try fungible asset (FA) balance
    try {
      const faRes: any = await aptos.getAccountResource({
        accountAddress: address,
        resourceType: faType as `${string}::${string}::${string}`,
      });
      const val = faRes?.data?.balance ?? faRes?.data?.value;
      if (val != null) {
        faBalance = BigInt(val);
      }
    } catch (_) {
      // ignore
    }

    // Try CoinStore balance
    try {
      const csRes: any = await aptos.getAccountResource({
        accountAddress: address,
        resourceType: coinStoreType as `${string}::${string}::${string}`,
      });
      const val = csRes?.data?.coin?.value ?? csRes?.data?.balance;
      if (val != null) {
        coinStoreBalance = BigInt(val);
      }
    } catch (_) {
      // ignore
    }

    // Accept either FA balance or coin store balance (both are valid)
    const totalBalance = faBalance + coinStoreBalance;

    if (totalBalance >= required) {
      console.log(
        `[BalanceCheck] ✅ Sufficient balance: ${totalBalance.toString()} (FA: ${faBalance.toString()}, CoinStore: ${coinStoreBalance.toString()})`
      );
      return;
    }

    throw new Error(
      `Insufficient balance of underlying asset. Needed ${requiredRawAmount}, found total=${totalBalance} (FA=${faBalance}, CoinStore=${coinStoreBalance}).`
    );
  } catch (e: any) {
    const msg = e?.message || "Asset balance check failed";
    throw new Error(msg);
  }
}

/**
 * Execute transaction - main entry point
 */
export async function executeTransaction(
  payload: TxRequestPayload
): Promise<string> {
  const {
    txType,
    txAmount,
    broker,
    address,
    publicKey,
    signHash,
    currentPortfolioState,
    onProgress,
  } = payload;

  try {
    // Check gas balance
    await checkGasBalance(address, onProgress);

    // Format signerPubkey for API
    // MovePosition uses walletAddress as signerPubkey (see lend-v2-utils.ts line 465)
    // The API expects the address without 0x prefix
    let formattedSignerPubkey = address.startsWith("0x")
      ? address.slice(2)
      : address;

    // Ensure it's a valid address format (66 chars with 0x, 64 without)
    if (formattedSignerPubkey.length !== 64) {
      throw new Error(
        `Invalid address length for signerPubkey: expected 64 hex characters, got ${formattedSignerPubkey.length}. Address: ${address}`
      );
    }

    // Build transaction arguments
    const txArgs: TransactionArgs = {
      brokerName: broker.underlyingAsset.name,
      amount: txAmount,
      network: "aptos",
      // IMPORTANT: MovePosition uses walletAddress as signerPubkey (not publicKey)
      // API expects address without 0x prefix
      signerPubkey: formattedSignerPubkey,
      currentPortfolioState,
    };

    // Validate request before sending
    if (!txArgs.brokerName || !txArgs.amount || !txArgs.signerPubkey) {
      throw new Error(
        `Invalid transaction arguments: brokerName=${txArgs.brokerName}, amount=${txArgs.amount}, signerPubkey=${txArgs.signerPubkey ? "present" : "missing"}`
      );
    }

    // Validate amount is a valid integer string
    const amountBigInt = BigInt(txArgs.amount);
    if (amountBigInt <= BigInt(0)) {
      throw new Error(
        `Invalid amount: ${txArgs.amount}. Amount must be a positive integer string in raw token units.`
      );
    }

    // Validate portfolio state structure
    if (
      !txArgs.currentPortfolioState ||
      !Array.isArray(txArgs.currentPortfolioState.collaterals) ||
      !Array.isArray(txArgs.currentPortfolioState.liabilities)
    ) {
      throw new Error(
        `Invalid portfolio state: collaterals and liabilities must be arrays`
      );
    }

    // Ensure all portfolio state amounts are strings (API requirement)
    const validatedPortfolioState: PortfolioState = {
      collaterals: txArgs.currentPortfolioState.collaterals.map((c) => ({
        instrumentId: c.instrumentId,
        amount: String(c.amount), // Ensure amount is a string
      })),
      liabilities: txArgs.currentPortfolioState.liabilities.map((l) => ({
        instrumentId: l.instrumentId,
        amount: String(l.amount), // Ensure amount is a string
      })),
    };

    // Use validated portfolio state
    txArgs.currentPortfolioState = validatedPortfolioState;

    // Log request for debugging (full details for API debugging)
    console.log(`[TransactionService] 📤 ${txType} request:`, {
      brokerName: txArgs.brokerName,
      amount: txArgs.amount,
      network: txArgs.network,
      signerPubkey: txArgs.signerPubkey, // Full address for debugging
      signerPubkeyLength: txArgs.signerPubkey.length,
      originalAddress: address,
      portfolioState: {
        collateralsCount: txArgs.currentPortfolioState.collaterals.length,
        liabilitiesCount: txArgs.currentPortfolioState.liabilities.length,
        collaterals: txArgs.currentPortfolioState.collaterals.map((c) => ({
          instrumentId: c.instrumentId,
          amount: c.amount,
        })),
        liabilities: txArgs.currentPortfolioState.liabilities.map((l) => ({
          instrumentId: l.instrumentId,
          amount: l.amount,
        })),
      },
    });

    // NOTE: Removed client-side balance check - backend API will validate balance
    // The check was failing because it was checking the wrong coin type format
    // MovePosition's backend API handles balance validation correctly

    // Fetch packet from API
    const packet = await fetchPacket({ txType, txArgs, onProgress });

    // Build transaction instruction
    onProgress?.("Building transaction instruction...");
    const txIx = buildTransactionIx(txType, packet, broker, address);

    // Sign and submit
    const hash = await signAndSubmitTransaction({
      txIx,
      address,
      publicKey,
      signHash,
      onProgress,
    });

    // Wait for finality
    await waitForTransaction(hash, onProgress);

    return hash;
  } catch (error: any) {
    console.error(`Transaction failed:`, error);
    throw error;
  }
}

/**
 * Export transaction service
 */
export const TransactionService = {
  executeTransaction,
  checkGasBalance,
};
