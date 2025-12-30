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

async function getBrokerFromAPI(
  superClient: superJsonApiClient.SuperClient,
  brokerAddress: string
): Promise<{ name: string; networkAddress: string }> {
  const brokers = await superClient.default.getBrokers();
  const broker = brokers.find((b) => b.networkAddress === brokerAddress);
  if (!broker) {
    throw new Error(`Broker not found for address: ${brokerAddress}`);
  }
  return {
    name: broker.underlyingAsset.name,
    networkAddress: broker.underlyingAsset.networkAddress,
  };
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
  // Get broker data to use the exact networkAddress (coinType) from API
  // This matches MovePosition's approach: broker.underlyingAsset.networkAddress
  const broker = await getBrokerFromAPI(superClient, brokerAddress);
  const brokerName = broker.name;
  // Use the networkAddress from the broker API response (matches MovePosition)
  const coinTypeFromBroker = broker.networkAddress;

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

  // Convert hex string to Uint8Array (matching MovePosition approach)
  // MovePosition uses: const packetHex = Hex.fromHexString(packet.packet)
  // const ar = packetHex.toUint8Array()
  const ticketHex = borrowTicket.packet.startsWith("0x")
    ? borrowTicket.packet
    : `0x${borrowTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  // Convert Uint8Array to Array (like MovePosition's super* methods do)
  // MovePosition's superBorrowV2Ix converts Uint8Array to Array internally
  // This is required because wallets prefer Array over Uint8Array
  const packetArray = Array.from(ticketUintArray);

  // Use the coinType from broker API response (matches MovePosition's broker.underlyingAsset.networkAddress)
  const borrowIX = sdk.borrowV2Ix(ticketUintArray, coinTypeFromBroker);

  if (onProgress) {
    onProgress("Building transaction...");
  }

  // Build transaction using Aptos SDK
  // Convert arguments to Array format (matching MovePosition's super* approach)
  const rawTxn = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: borrowIX.function as `${string}::${string}::${string}`,
      typeArguments: borrowIX.type_arguments || [],
      functionArguments: [packetArray], // Use Array instead of Uint8Array
    },
  });

  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainId = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainId;
  }

  // SIMULATE TRANSACTION BEFORE SIGNING (like MovePosition does)
  // This catches errors like ERR_MAX_DEPOSIT_EXCEEDED before the user signs
  if (onProgress) {
    onProgress("Simulating transaction...");
  }

  try {
    console.log(`[BorrowV2] 🔍 Simulating transaction before signing...`);

    // Create a simulation transaction (unsigned)
    const simulationTxn = await aptos.transaction.build.simple({
      sender: walletAddress,
      data: {
        function: borrowIX.function as `${string}::${string}::${string}`,
        typeArguments: borrowIX.type_arguments || [],
        functionArguments: [packetArray],
      },
    });

    // Override chain ID for simulation too
    const simTxnObj = simulationTxn as any;
    if (simTxnObj.rawTransaction) {
      const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
      simTxnObj.rawTransaction.chain_id = movementChainIdObj;
    }

    // Prepare public key for simulation
    let pubKeyForSim = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    if (pubKeyForSim.startsWith("00") && pubKeyForSim.length > 64) {
      pubKeyForSim = pubKeyForSim.slice(2);
    }

    // Simulate the transaction
    const simulationResult = await aptos.transaction.simulate.simple({
      signerPublicKey: pubKeyForSim,
      transaction: simulationTxn,
    });

    console.log(`[BorrowV2] 📊 Simulation result:`, {
      success: simulationResult[0]?.success,
      vmStatus: simulationResult[0]?.vm_status,
      gasUsed: simulationResult[0]?.gas_used,
    });

    // Check if simulation failed
    if (!simulationResult[0]?.success) {
      const vmStatus = simulationResult[0]?.vm_status || "";
      let userFriendlyError = vmStatus;

      if (vmStatus.includes("ERR_MAX_DEPOSIT_EXCEEDED")) {
        userFriendlyError = `Maximum deposit limit exceeded. The amount you're trying to borrow exceeds the broker's limits. Please try a smaller amount.`;
      } else if (vmStatus.includes("ERR_INSUFFICIENT_BALANCE")) {
        userFriendlyError = `Insufficient balance. You don't have enough collateral to complete this transaction.`;
      } else if (vmStatus.includes("Move abort")) {
        const abortMatch = vmStatus.match(
          /Move abort in [^:]+: ([^(]+)\([^)]+\): (.+)/
        );
        if (abortMatch) {
          userFriendlyError = `${abortMatch[1]}: ${abortMatch[2]}`;
        }
      }

      throw new Error(
        `Transaction simulation failed: ${userFriendlyError}. Broker used: ${brokerName}, CoinType: ${coinTypeFromBroker}`
      );
    }

    console.log(`[BorrowV2] ✅ Simulation passed - transaction will succeed`);
  } catch (simError: any) {
    if (
      simError.message.includes("simulation failed") ||
      simError.message.includes("ERR_") ||
      simError.message.includes("Maximum deposit") ||
      simError.message.includes("Insufficient balance")
    ) {
      throw simError;
    }
    console.warn(
      `[BorrowV2] ⚠️ Simulation warning (continuing anyway):`,
      simError.message
    );
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
  // Get broker data to use the exact networkAddress (coinType) from API
  // This matches MovePosition's approach: broker.underlyingAsset.networkAddress
  const broker = await getBrokerFromAPI(superClient, brokerAddress);
  const brokerName = broker.name;
  // Use the networkAddress from the broker API response (matches MovePosition)
  const coinTypeFromBroker = broker.networkAddress;

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

  // Convert hex string to Uint8Array (matching MovePosition approach)
  // MovePosition uses: const packetHex = Hex.fromHexString(packet.packet)
  // const ar = packetHex.toUint8Array()
  const ticketHex = repayTicket.packet.startsWith("0x")
    ? repayTicket.packet
    : `0x${repayTicket.packet}`;
  const hexBytes = ticketHex.slice(2).match(/.{1,2}/g) || [];
  const ticketUintArray = new Uint8Array(
    hexBytes.map((byte) => parseInt(byte, 16))
  );

  // Convert Uint8Array to Array (like MovePosition's super* methods do)
  // MovePosition's superRepayV2Ix converts Uint8Array to Array internally
  // This is required because wallets prefer Array over Uint8Array
  const packetArray = Array.from(ticketUintArray);

  // Use the coinType from broker API response (matches MovePosition's broker.underlyingAsset.networkAddress)
  const repayIX = sdk.repayV2Ix(ticketUintArray, coinTypeFromBroker);

  if (onProgress) {
    onProgress("Building transaction...");
  }

  // Build transaction using Aptos SDK
  // Convert arguments to Array format (matching MovePosition's super* approach)
  const rawTxn = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: repayIX.function as `${string}::${string}::${string}`,
      typeArguments: repayIX.type_arguments || [],
      functionArguments: [packetArray], // Use Array instead of Uint8Array
    },
  });

  const txnObj = rawTxn as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
  }

  // SIMULATE TRANSACTION BEFORE SIGNING (like MovePosition does)
  // This catches errors like ERR_MAX_DEPOSIT_EXCEEDED before the user signs
  if (onProgress) {
    onProgress("Simulating transaction...");
  }

  try {
    console.log(`[RepayV2] 🔍 Simulating transaction before signing...`);

    // Create a simulation transaction (unsigned)
    const simulationTxn = await aptos.transaction.build.simple({
      sender: walletAddress,
      data: {
        function: repayIX.function as `${string}::${string}::${string}`,
        typeArguments: repayIX.type_arguments || [],
        functionArguments: [packetArray],
      },
    });

    // Override chain ID for simulation too
    const simTxnObj = simulationTxn as any;
    if (simTxnObj.rawTransaction) {
      const movementChainIdObj = new ChainId(MOVEMENT_CHAIN_ID);
      simTxnObj.rawTransaction.chain_id = movementChainIdObj;
    }

    // Prepare public key for simulation
    let pubKeyForSim = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    if (pubKeyForSim.startsWith("00") && pubKeyForSim.length > 64) {
      pubKeyForSim = pubKeyForSim.slice(2);
    }

    // Simulate the transaction
    const simulationResult = await aptos.transaction.simulate.simple({
      signerPublicKey: pubKeyForSim,
      transaction: simulationTxn,
    });

    console.log(`[RepayV2] 📊 Simulation result:`, {
      success: simulationResult[0]?.success,
      vmStatus: simulationResult[0]?.vm_status,
      gasUsed: simulationResult[0]?.gas_used,
    });

    // Check if simulation failed
    if (!simulationResult[0]?.success) {
      const vmStatus = simulationResult[0]?.vm_status || "";
      let userFriendlyError = vmStatus;

      if (vmStatus.includes("ERR_MAX_DEPOSIT_EXCEEDED")) {
        userFriendlyError = `Maximum deposit limit exceeded. The amount you're trying to repay exceeds the broker's limits. Please try a smaller amount.`;
      } else if (vmStatus.includes("ERR_INSUFFICIENT_BALANCE")) {
        userFriendlyError = `Insufficient balance. You don't have enough ${coinSymbol} to complete this transaction.`;
      } else if (vmStatus.includes("Move abort")) {
        const abortMatch = vmStatus.match(
          /Move abort in [^:]+: ([^(]+)\([^)]+\): (.+)/
        );
        if (abortMatch) {
          userFriendlyError = `${abortMatch[1]}: ${abortMatch[2]}`;
        }
      }

      throw new Error(
        `Transaction simulation failed: ${userFriendlyError}. Broker used: ${brokerName}, CoinType: ${coinTypeFromBroker}`
      );
    }

    console.log(`[RepayV2] ✅ Simulation passed - transaction will succeed`);
  } catch (simError: any) {
    if (
      simError.message.includes("simulation failed") ||
      simError.message.includes("ERR_") ||
      simError.message.includes("Maximum deposit") ||
      simError.message.includes("Insufficient balance")
    ) {
      throw simError;
    }
    console.warn(
      `[RepayV2] ⚠️ Simulation warning (continuing anyway):`,
      simError.message
    );
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
