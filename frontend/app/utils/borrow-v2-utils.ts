/**
 * Borrow V2 utilities using the same approach as scripts
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

export interface BorrowV2Params {
  amount: string;
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

export async function executeBorrowV2(params: BorrowV2Params): Promise<string> {
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
    onProgress("Requesting borrow ticket...");
  }
  const borrowTicket = await superClient.default.borrowV2({
    amount,
    signerPubkey,
    network,
    brokerName,
    currentPortfolioState,
  });

  if (onProgress) {
    onProgress("Decoding transaction packet...");
  }

  const ticketHex = borrowTicket.packet.startsWith("0x")
    ? borrowTicket.packet
    : `0x${borrowTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  const borrowIX = sdk.borrowV2Ix(ticketUintArray, coinType);

  if (onProgress) {
    onProgress("Building transaction...");
  }

  const rawTxn = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: borrowIX.function as `${string}::${string}::${string}`,
      typeArguments: borrowIX.type_arguments || [],
      functionArguments: borrowIX.arguments || [],
    },
  });

  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainId = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainId;
  }

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

  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
  if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
    pubKeyNoScheme = pubKeyNoScheme.slice(2);
  }
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

export async function executeRepayV2(params: BorrowV2Params): Promise<string> {
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
    onProgress("Requesting repay ticket...");
  }
  const repayTicket = await superClient.default.repayV2({
    amount,
    signerPubkey,
    network,
    brokerName,
    currentPortfolioState,
  });

  if (onProgress) {
    onProgress("Decoding transaction packet...");
  }

  const ticketHex = repayTicket.packet.startsWith("0x")
    ? repayTicket.packet
    : `0x${repayTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  const repayIX = sdk.repayV2Ix(ticketUintArray, coinType);

  if (onProgress) {
    onProgress("Building transaction...");
  }

  const rawTxn = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: repayIX.function as `${string}::${string}::${string}`,
      typeArguments: repayIX.type_arguments || [],
      functionArguments: repayIX.arguments || [],
    },
  });

  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
  }

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

  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
  if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
    pubKeyNoScheme = pubKeyNoScheme.slice(2);
  }
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
