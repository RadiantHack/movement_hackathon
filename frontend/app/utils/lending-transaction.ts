import {
  Aptos,
  AptosConfig,
  Network,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
  Hex,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import * as superJsonApiClient from "../../lib/super-json-api-client/src";
import { store } from "../../store";

// Movement Network configuration via runtime Redux config
const MOVEMENT_NETWORK = Network.MAINNET;

function getRuntimeConfig() {
  const state = store.getState() as any;
  const cfg = state.config || {};
  if (!cfg.loaded) throw new Error("Runtime config not loaded");
  return cfg as {
    movementApiBase: string;
    movementRpc: string;
    movementChainId: number;
  };
}

function getAptos() {
  const { movementRpc } = getRuntimeConfig();
  const aptos = new Aptos(
    new AptosConfig({
      network: MOVEMENT_NETWORK,
      fullnode: movementRpc,
    })
  );
  return aptos;
}

// Transaction types
export const DEPOSIT_TAB = "Supply";
export const WITHDRAW_TAB = "Withdraw";
export const BORROW_TAB = "Borrow";
export const REPAY_TAB = "Repay";

export const WITHDRAW = "withdraw";
export const SUPPLY_COLLATERAL = "supply_collateral";
export const BORROW = "borrow";
export const REPAY = "repay";

export type TxType =
  | typeof WITHDRAW
  | typeof SUPPLY_COLLATERAL
  | typeof BORROW
  | typeof REPAY;

export const tabToType: { [key: string]: TxType } = {
  [WITHDRAW_TAB]: WITHDRAW,
  [DEPOSIT_TAB]: SUPPLY_COLLATERAL,
  [BORROW_TAB]: BORROW,
  [REPAY_TAB]: REPAY,
};

export const typeToTab: { [key in TxType]: string } = {
  [WITHDRAW]: WITHDRAW_TAB,
  [SUPPLY_COLLATERAL]: DEPOSIT_TAB,
  [BORROW]: BORROW_TAB,
  [REPAY]: REPAY_TAB,
};

// Portfolio state types
export interface BasicPosition {
  instrumentId: string;
  amount: string;
}

export interface PortfolioState {
  collaterals: BasicPosition[];
  liabilities: BasicPosition[];
}

export interface PortfolioResponse {
  id: string;
  collaterals: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: string;
  }>;
  liabilities: Array<{
    instrument: {
      network: string;
      networkAddress: string;
      name: string;
      decimals: number;
    };
    amount: string;
    scaledAmount: string;
  }>;
  risk: {
    requiredEquity: number;
  };
  evaluation: {
    mm: number;
    health_ratio: number;
    total_collateral: number;
    total_liability: number;
    ltv: number;
  };
}

// Transaction request payload
export interface TxReqPayload {
  txType: TxType;
  txAmount: number;
  inputAmount: number;
  brokerName: string;
  address: string;
  signHash: (hash: string) => Promise<{ signature: string }>;
  publicKey: string;
  onProgress?: (step: string) => void;
  onError?: (error: string, txHash?: string) => void;
  onSuccess?: (txHash: string, action: string) => void;
}

// Wait for transaction args
export interface WaitArgs {
  transactionHash: string;
  options: {
    checkSuccess: boolean;
  };
}

// Account args
export interface AccountArgs {
  accountAddress: string;
  options?: any;
}

/**
 * Build current portfolio basic state from portfolio response
 */
export function buildCurrentPortfolioBasicState(
  freshPortfolioState: PortfolioResponse
): PortfolioState {
  if (!freshPortfolioState) {
    return { collaterals: [], liabilities: [] };
  }

  return {
    collaterals: freshPortfolioState.collaterals.map((c) => ({
      instrumentId: c.instrument.name,
      amount: c.amount,
    })),
    liabilities: freshPortfolioState.liabilities.map((l) => ({
      instrumentId: l.instrument.name,
      amount: l.amount,
    })),
  };
}

/**
 * Check APT balance for gas
 */
async function checkAPTBalance(
  accountAddress: string,
  onProgress?: (step: string) => void
): Promise<void> {
  if (onProgress) {
    onProgress("Checking gas balance...");
  }

  try {
    const aptResource = "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>";
    const accountArgs: AccountArgs = {
      accountAddress,
    };

    const resources = await getAptos().getAccountResources(accountArgs);
    const gasToken: any = resources.find((t: any) => t.type === aptResource);
    const gasBal = gasToken?.data?.coin?.value || 0;
    const hasGas = gasBal > 0;

    if (!hasGas) {
      throw new Error(
        "Use the faucet in your wallet to get Testnet APT tokens. If you have, try refreshing the page."
      );
    }
  } catch (e: any) {
    console.error(e);
    throw new Error(`APT not found: ${e.message || "Unknown error"}`);
  }
}

/**
 * Fetch portfolio state from API
 */
async function fetchPortfolioState(
  address: string
): Promise<PortfolioResponse> {
  const { movementApiBase } = getRuntimeConfig();
  const superClient = new superJsonApiClient.SuperClient({
    BASE: movementApiBase,
  });
  const data = await superClient.default.getPortfolio(address);
  return data as unknown as PortfolioResponse;
}

/**
 * Fetch transaction packet from MovePosition API
 */
async function fetchPacket(
  txType: TxType,
  brokerName: string,
  amount: string,
  signerPubkey: string,
  currentPortfolioState: PortfolioState,
  onProgress?: (step: string) => void
): Promise<any> {
  if (onProgress) {
    onProgress(`Fetching ${txType} packet...`);
  }

  let endpoint: string;
  switch (txType) {
    case SUPPLY_COLLATERAL:
      endpoint = `${getRuntimeConfig().movementApiBase}/brokers/lend/v2`;
      break;
    case WITHDRAW:
      endpoint = `${getRuntimeConfig().movementApiBase}/brokers/redeem/v2`;
      break;
    case BORROW:
      endpoint = `${getRuntimeConfig().movementApiBase}/brokers/borrow/v2`;
      break;
    case REPAY:
      endpoint = `${getRuntimeConfig().movementApiBase}/brokers/repay/v2`;
      break;
    default:
      throw new Error(`Invalid transaction type: ${txType}`);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brokerName,
        amount,
        network: "aptos",
        signerPubkey,
        currentPortfolioState,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message ||
          `Network Overload! We're currently unable to load the portfolio data due to the immense amount of traffic occurring on the Movement network at this time. This increased load can lead to temporary limitations, which is why some requests aren't going through as expected. Please refresh or try again later.`
      );
    }

    return response.json();
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Network Overload! We're currently unable to load the portfolio data due to the immense amount of traffic occurring on the Movement network at this time. This increased load can lead to temporary limitations, which is why some requests aren't going through as expected. Please refresh or try again later.`
    );
  }
}

/**
 * Sign and submit transaction
 */
async function signAndSubmitTransaction(
  packet: any,
  txType: TxType,
  brokerNetworkAddress: string,
  address: string,
  publicKey: string,
  signHash: (hash: string) => Promise<{ signature: string }>,
  onProgress?: (step: string) => void
): Promise<string> {
  if (onProgress) {
    onProgress("Signing transaction...");
  }

  try {
    // Extract transaction details from packet
    // The API returns: { function, type_arguments, arguments, type: "entry_function_payload" }
    const functionName =
      packet.function || `${brokerNetworkAddress}::entry_public::lend_v2`;
    const typeArguments = packet.type_arguments || [];
    const functionArguments = packet.arguments || [];

    // Build transaction
    const rawTxn = await getAptos().transaction.build.simple({
      sender: address,
      data: {
        function: functionName as `${string}::${string}::${string}`,
        typeArguments: typeArguments,
        functionArguments: functionArguments,
      },
    });

    // Override chain ID to match Movement Network
    const txnObj = rawTxn as any;
    if (txnObj.rawTransaction) {
      const movementChainId = new ChainId(getRuntimeConfig().movementChainId);
      txnObj.rawTransaction.chain_id = movementChainId;
    }

    // Generate signing message and hash
    const message = generateSigningMessageForTransaction(rawTxn);
    const hash = toHex(message);

    // Sign the hash
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

    // Create authenticator from signature
    if (onProgress) {
      onProgress("Creating transaction authenticator...");
    }

    const pubKeyNoScheme = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
    const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
    const senderAuthenticator = new AccountAuthenticatorEd25519(
      publicKeyObj,
      sig
    );

    // Submit transaction
    if (onProgress) {
      onProgress("Submitting transaction to network...");
    }

    const pending = await getAptos().transaction.submit.simple({
      transaction: rawTxn,
      senderAuthenticator,
    });

    return pending.hash;
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Transaction Not Submitted: ${e.message || "Unknown error"}`
    );
  }
}

/**
 * Wait for transaction finality
 */
async function waitForTransactionFinality(
  hash: string,
  onProgress?: (step: string) => void
): Promise<any> {
  if (onProgress) {
    onProgress("Awaiting finality...");
  }

  try {
    const args: WaitArgs = {
      transactionHash: hash,
      options: {
        checkSuccess: true,
      },
    };
    const result = await aptos.waitForTransaction(args);
    return result;
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Transaction Not Completed: ${e.message || "Unknown error"}`
    );
  }
}

/**
 * Execute lending transaction
 * This is the main function that orchestrates the entire transaction flow
 */
export async function executeLendingTransaction(
  payload: TxReqPayload
): Promise<string> {
  const {
    txType,
    txAmount,
    inputAmount,
    brokerName,
    address,
    publicKey,
    signHash,
    onProgress,
    onError,
    onSuccess,
  } = payload;

  try {
    // Step 1: Validate inputs
    if (!brokerName || !txAmount || !address) {
      throw new Error(
        "Missing arguments: The transaction request is missing required arguments, please try again"
      );
    }

    if (onProgress) {
      onProgress("Building transaction...");
    }

    // Step 2: Check APT balance for gas
    await checkAPTBalance(address, onProgress);

    // Step 3: Fetch fresh portfolio state
    if (onProgress) {
      onProgress("Fetching portfolio state...");
    }
    const freshPortfolioState = await fetchPortfolioState(address);
    if (!freshPortfolioState) {
      throw new Error(
        "Network Overload! We're currently unable to load the portfolio data due to the immense amount of traffic occurring on the Movement network at this time. This increased load can lead to temporary limitations, which is why some requests aren't going through as expected. Please refresh or try again later."
      );
    }

    const currentPortfolioState =
      buildCurrentPortfolioBasicState(freshPortfolioState);
    const amountValue = txAmount.toString();

    // Step 4: Fetch transaction packet
    const packet = await fetchPacket(
      txType,
      brokerName,
      amountValue,
      address,
      currentPortfolioState,
      onProgress
    );

    // Step 5: Sign and submit transaction
    // Note: brokerNetworkAddress should be extracted from packet or passed separately
    // For now, we'll use a default contract address
    const LEND_CONTRACT =
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf";
    const hash = await signAndSubmitTransaction(
      packet,
      txType,
      LEND_CONTRACT,
      address,
      publicKey,
      signHash,
      onProgress
    );

    // Step 6: Wait for transaction finality
    const result = await waitForTransactionFinality(hash, onProgress);

    // Step 7: Success callback
    if (onSuccess) {
      const action = typeToTab[txType];
      onSuccess(hash, action);
    }

    return hash;
  } catch (error: any) {
    console.error("Transaction error:", error);
    const errorMessage =
      error.message ||
      "Transaction failed. Please check your connection and try again.";

    if (onError) {
      onError(errorMessage);
    }

    throw error;
  }
}

/**
 * Helper to get broker name from asset symbol
 */
export function getBrokerName(symbol: string): string {
  const upperSymbol = symbol.toUpperCase().replace(/\./g, "");
  const brokerMap: Record<string, string> = {
    MOVE: "movement-move-fa",
    USDC: "movement-usdc",
    USDCE: "movement-usdc",
    USDT: "movement-usdt",
    USDTE: "movement-usdt",
    WETH: "movement-weth",
    WETHE: "movement-weth",
    WBTC: "movement-wbtc",
    WBTCE: "movement-wbtc",
    USDA: "movement-usda",
    SUSDA: "movement-susda",
    EZETH: "movement-ezeth",
    RSETH: "movement-rseth",
    WEETH: "movement-weeth",
    LBTC: "movement-lbtc",
    STBTC: "movement-stbtc",
  };
  return brokerMap[upperSymbol] || `movement-${upperSymbol.toLowerCase()}`;
}

/**
 * Helper to get coin type from symbol
 */
export function getCoinType(symbol: string, contractAddress?: string): string {
  const LEND_CONTRACT =
    contractAddress ||
    "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf";
  const upperSymbol = symbol.toUpperCase().replace(/\./g, "");
  const coinTypeMap: Record<string, string> = {
    MOVE: `${LEND_CONTRACT}::coins::MOVE`,
    USDC: `${LEND_CONTRACT}::coins::USDC`,
    USDCE: `${LEND_CONTRACT}::coins::USDC`,
    USDT: `${LEND_CONTRACT}::coins::USDT`,
    USDTE: `${LEND_CONTRACT}::coins::USDT`,
    WETH: `${LEND_CONTRACT}::coins::WETH`,
    WETHE: `${LEND_CONTRACT}::coins::WETH`,
    WBTC: `${LEND_CONTRACT}::coins::WBTC`,
    WBTCE: `${LEND_CONTRACT}::coins::WBTC`,
  };
  return coinTypeMap[upperSymbol] || `${LEND_CONTRACT}::coins::${upperSymbol}`;
}
