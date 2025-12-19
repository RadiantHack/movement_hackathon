/**
 * Lend V2 utilities using the same approach as scripts
 * Uses SuperpositionAptosSDK and SuperClient API
 */

import * as superSDK from "../../lib/super-aptos-sdk/src";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";
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
import {
  MOVEPOSITION_ADDRESS,
  getCoinType,
  getBrokerAddress,
} from "./token-utils";
import {
  requireMovementChainId,
  requireMovementApiBase,
  requireMovementRpc,
} from "@/lib/super-aptos-sdk/src/globals";

// Lazy initialization of Aptos instances
let aptosInstance: Aptos | null = null;

function getAptosInstance(): Aptos {
  if (!aptosInstance) {
    const movementRpc = requireMovementRpc();
    aptosInstance = new Aptos(
      new AptosConfig({
        network: Network.MAINNET,
        fullnode: movementRpc,
      })
    );
  }
  return aptosInstance;
}

export interface LendV2Params {
  amount: string; // Raw amount as string
  coinSymbol: string;
  walletAddress: string;
  publicKey: string;
  signHash: (hash: string) => Promise<{ signature: string }>;
  onProgress?: (step: string) => void;
}

export interface PortfolioState {
  collaterals: Array<{ instrumentId: string; amount: string }>;
  liabilities: Array<{ instrumentId: string; amount: string }>;
}

async function getBrokerNameFromAPI(
  superClient: superJsonApiClient.SuperClient,
  brokerAddress: string
): Promise<string> {
  const brokers = await superClient.default.getBrokers();
  const broker = brokers.find((b) => b.networkAddress === brokerAddress);
  if (!broker) {
    throw new Error(`Broker not found for address: ${brokerAddress}`);
  }
  return broker.underlyingAsset.name;
}

async function getPortfolioStateFromAPI(
  superClient: superJsonApiClient.SuperClient,
  address: string
): Promise<PortfolioState> {
  const portfolio = await superClient.default.getPortfolio(address);
  const collaterals = portfolio.collaterals.map((c) => {
    return { instrumentId: c.instrument.name, amount: c.amount };
  });
  const liabilities = portfolio.liabilities.map((l) => {
    return { instrumentId: l.instrument.name, amount: l.amount };
  });
  return {
    collaterals,
    liabilities,
  };
}

export async function executeLendV2(params: LendV2Params): Promise<string> {
  const { amount, coinSymbol, walletAddress, publicKey, signHash, onProgress } =
    params;

  if (onProgress) {
    onProgress("Initializing SDK...");
  }

  const movementApiBase = requireMovementApiBase();
  const movementChainId = requireMovementChainId();

  const MOVEMENT_CHAIN_ID = movementChainId;
  const API_BASE = movementApiBase;

  const aptos = getAptosInstance();

  const coinType = getCoinType(coinSymbol);
  const brokerAddress = getBrokerAddress(coinType);

  const sdk = new superSDK.SuperpositionAptosSDK(MOVEPOSITION_ADDRESS);
  const superClient = new superJsonApiClient.SuperClient({
    BASE: API_BASE,
  });

  if (onProgress) {
    onProgress("Fetching broker information...");
  }
  const brokerName = await getBrokerNameFromAPI(superClient, brokerAddress);

  if (onProgress) {
    onProgress("Fetching portfolio state...");
  }
  const currentPortfolioState = await getPortfolioStateFromAPI(
    superClient,
    walletAddress
  );

  const signerPubkey = walletAddress;
  const network = "aptos";

  if (onProgress) {
    onProgress("Requesting lend ticket...");
  }
  const lendTicket = await superClient.default.lendV2({
    amount,
    signerPubkey,
    network,
    brokerName,
    currentPortfolioState,
  });

  if (onProgress) {
    onProgress("Decoding transaction packet...");
  }

  // Convert hex string to Uint8Array (same as scripts)
  const ticketHex = lendTicket.packet.startsWith("0x")
    ? lendTicket.packet
    : `0x${lendTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  const lendIX = sdk.lendV2Ix(ticketUintArray, coinType);

  if (onProgress) {
    onProgress("Building transaction...");
  }

  // Build transaction using Aptos SDK
  const rawTxn = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: lendIX.function as `${string}::${string}::${string}`,
      typeArguments: lendIX.type_arguments || [],
      functionArguments: lendIX.arguments || [],
    },
  });

  // Override chain ID to match Movement Network
  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
  }

  // Generate signing message and hash
  const message = generateSigningMessageForTransaction(rawTxn);
  const hash = toHex(message);

  if (onProgress) {
    onProgress("Waiting for wallet signature...");
  }

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

  if (onProgress) {
    onProgress("Creating transaction authenticator...");
  }

  // Privy public key format: "004a4b8e35..." or "0x004a4b8e35..."
  // We need to drop the "00" prefix to get the actual 32-byte key
  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
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
  const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(
    publicKeyObj,
    sig
  );

  if (onProgress) {
    onProgress("Submitting transaction to network...");
  }

  const pending = await aptos.transaction.submit.simple({
    transaction: rawTxn,
    senderAuthenticator,
  });

  if (onProgress) {
    onProgress("Waiting for transaction confirmation...");
  }

  const executed = await aptos.waitForTransaction({
    transactionHash: pending.hash,
  });

  if (onProgress) {
    onProgress("Transaction confirmed!");
  }

  return executed.hash;
}

export async function executeRedeemV2(params: LendV2Params): Promise<string> {
  const { amount, coinSymbol, walletAddress, publicKey, signHash, onProgress } =
    params;

  if (onProgress) {
    onProgress("Initializing SDK...");
  }

  // Load config at function call time, not module load time
  const movementApiBase = requireMovementApiBase();
  const movementChainId = requireMovementChainId();

  const MOVEMENT_CHAIN_ID = movementChainId;
  const API_BASE = movementApiBase;

  const aptos = getAptosInstance();

  const coinType = getCoinType(coinSymbol);
  const brokerAddress = getBrokerAddress(coinType);

  const sdk = new superSDK.SuperpositionAptosSDK(MOVEPOSITION_ADDRESS);
  const superClient = new superJsonApiClient.SuperClient({
    BASE: API_BASE,
  });

  if (onProgress) {
    onProgress("Fetching broker information...");
  }
  const brokerName = await getBrokerNameFromAPI(superClient, brokerAddress);

  if (onProgress) {
    onProgress("Fetching portfolio state...");
  }
  const currentPortfolioState = await getPortfolioStateFromAPI(
    superClient,
    walletAddress
  );

  const signerPubkey = walletAddress;
  const network = "aptos";

  if (onProgress) {
    onProgress("Requesting redeem ticket...");
  }
  const redeemTicket = await superClient.default.redeemV2({
    amount,
    signerPubkey,
    network,
    brokerName,
    currentPortfolioState,
  });

  if (onProgress) {
    onProgress("Decoding transaction packet...");
  }

  // Convert hex string to Uint8Array (same as scripts)
  const ticketHex = redeemTicket.packet.startsWith("0x")
    ? redeemTicket.packet
    : `0x${redeemTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  const redeemIX = sdk.redeemV2Ix(ticketUintArray, coinType);

  if (onProgress) {
    onProgress("Building transaction...");
  }

  // Build transaction using Aptos SDK
  const rawTxn = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: redeemIX.function as `${string}::${string}::${string}`,
      typeArguments: redeemIX.type_arguments || [],
      functionArguments: redeemIX.arguments || [],
    },
  });

  // Override chain ID to match Movement Network
  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
  }

  // Generate signing message and hash
  const message = generateSigningMessageForTransaction(rawTxn);
  const hash = toHex(message);

  if (onProgress) {
    onProgress("Waiting for wallet signature...");
  }

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

  if (onProgress) {
    onProgress("Creating transaction authenticator...");
  }

  // Privy public key format: "004a4b8e35..." or "0x004a4b8e35..."
  // We need to drop the "00" prefix to get the actual 32-byte key
  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
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
  const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(
    publicKeyObj,
    sig
  );

  if (onProgress) {
    onProgress("Submitting transaction to network...");
  }

  const pending = await aptos.transaction.submit.simple({
    transaction: rawTxn,
    senderAuthenticator,
  });

  if (onProgress) {
    onProgress("Waiting for transaction confirmation...");
  }

  const executed = await aptos.waitForTransaction({
    transactionHash: pending.hash,
  });

  if (onProgress) {
    onProgress("Transaction confirmed!");
  }

  return executed.hash;
}
