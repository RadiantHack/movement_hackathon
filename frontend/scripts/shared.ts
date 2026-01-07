import * as superJsonApiClient from "../lib/super-json-api-client/src";
import * as aptos from "aptos";
import * as superSDK from "../lib/super-aptos-sdk/src";

export const MOVEPOSITION_ADDRESS =
  "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf";
export const RPC_URL = "https://mainnet.movementnetwork.xyz/v1";
export const API_BASE = "https://api.moveposition.xyz";

export interface EntryFunctionPayload {
  type: string;
  function: string;
  type_arguments: string[];
  arguments: (string | number | Uint8Array | number[])[];
}

export class TransactionError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "TransactionError";
  }
}

export function getWalletAccount(): aptos.AptosAccount {
  if (!process.env.WALLET_PRIVATE_KEY) {
    throw new Error("WALLET_PRIVATE_KEY is not set");
  }
  const keyString = process.env.WALLET_PRIVATE_KEY;
  const keyHex = new aptos.HexString(keyString);
  const keyUint8Array = keyHex.toUint8Array();
  const account = new aptos.AptosAccount(keyUint8Array);
  console.log("Wallet address:", account.address().hex());
  return account;
}

export async function signSubmitWait(
  client: aptos.AptosClient,
  account: aptos.AptosAccount,
  payload: EntryFunctionPayload,
  checkSuccess = false
): Promise<any> {
  const rawtx = await client.generateTransaction(account.address(), payload);
  const signed = await client.signTransaction(account, rawtx);
  // @ts-ignore - aptos library types are incorrect, but runtime works correctly
  const tx = await client.submitTransaction(signed);
  console.log("Submitted tx:", tx.hash);
  try {
    const res: any = await client.waitForTransactionWithResult(tx.hash, {
      checkSuccess,
    });
    if (!res.success) {
      const msg = res.vm_status.split(": ")[1];
      throw new TransactionError(msg);
    }
    console.log("Transaction success:", res);
    return res;
  } catch (e) {
    console.log("error", e);
    throw e;
  }
}

export async function getBrokerName(
  superClient: superJsonApiClient.SuperClient,
  brokerAddress: string
): Promise<string> {
  const brokers = await superClient.default.getBrokers();
  const broker = brokers.find((b) => b.networkAddress === brokerAddress);
  if (!broker) {
    throw new Error(`Broker not found for address: ${brokerAddress}`);
  }
  console.log("Broker name:", broker.underlyingAsset.name);
  console.log("Broker interest rate from risk oracle:", broker?.interestRate);
  return broker.underlyingAsset.name;
}

export async function getPortfolioState(
  superClient: superJsonApiClient.SuperClient,
  address: string
): Promise<superJsonApiClient.PortfolioState> {
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

// Re-export from shared token utils (scripts use CommonJS, so we keep a copy here)
// For consistency, these functions match app/utils/token-utils.ts
export function getCoinType(coinSymbol: string = "APT"): string {
  const coinTypes: Record<string, string> = {
    APT: "0x1::aptos_coin::AptosCoin",
    MOVE: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::MOVE",
    USDC: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDC",
    USDT: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDt",
    WETH: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WETH",
    WBTC: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WBTC",
    EZETH:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::EZETH",
    STBTC:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::STBTC",
    RSETH:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::RSETH",
    WEETH:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::WEETH",
    LBTC: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::LBTC",
    USDA: "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::USDa",
    SUSDA:
      "0xccd2621d2897d407e06d18e6ebe3be0e6d9b61f1e809dd49360522b9105812cf::coins::SUSDa",
  };
  return coinTypes[coinSymbol.toUpperCase()] || coinTypes.APT;
}

export function getCoinDecimals(coinSymbol: string = "APT"): number {
  const decimals: Record<string, number> = {
    APT: 8,
    MOVE: 8,
    USDC: 6,
    USDT: 6,
    WETH: 8,
    WBTC: 8,
    EZETH: 8,
    STBTC: 8,
    RSETH: 8,
    WEETH: 8,
    LBTC: 8,
    USDA: 8,
    SUSDA: 8,
  };
  return decimals[coinSymbol.toUpperCase()] || 8;
}

export function convertAmountToRaw(amount: string, decimals: number): string {
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const multiplier = Math.pow(10, decimals);
  const rawAmount = Math.floor(amountNum * multiplier);
  return rawAmount.toString();
}

export function getBrokerAddress(coinType: string): string {
  return `${MOVEPOSITION_ADDRESS}::broker::Broker<${coinType}>`;
}
