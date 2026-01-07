/**
 * SDK Context - Unified SDK abstraction layer matching MovePosition's architecture
 * Provides centralized access to Super SDK, Aptos SDK, and API clients
 */

import * as superJsonApiClient from "../../lib/super-json-api-client/src";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { SuperpositionAptosSDK } from "../../lib/super-aptos-sdk/src";

export interface SdkContext {
  superClient: superJsonApiClient.SuperClient;
  aptos: Aptos;
  superAptosSDK: SuperpositionAptosSDK;
  rootAddress: string;
  network: Network;
  apiUrl: string;
}

let sdkContextInstance: SdkContext | null = null;

/**
 * Get or create SDK context singleton
 * Matches MovePosition's SDK_CONTEXT pattern
 */
export function getSDKContext(): SdkContext {
  if (sdkContextInstance) {
    return sdkContextInstance;
  }

  // Load from public config or environment
  const apiUrl = process.env.NEXT_PUBLIC_MOVEMENT_API_BASE || "";
  const rootAddress = process.env.NEXT_PUBLIC_MOVEPOSITION_ADDRESS || "";
  const networkShort = process.env.NEXT_PUBLIC_APTOS_NETWORK_SHORT || "testnet";
  const defaultFullnode = "https://mainnet.movementnetwork.xyz/v1";
  const fullnodeUrl =
    process.env.NEXT_PUBLIC_MOVEMENT_LABS_URL || defaultFullnode;

  if (!apiUrl || !rootAddress) {
    throw new Error(
      "Missing SDK configuration. Check NEXT_PUBLIC_MOVEMENT_API_BASE and NEXT_PUBLIC_MOVEPOSITION_ADDRESS"
    );
  }

  const network =
    networkShort === "mainnet" ? Network.MAINNET : Network.TESTNET;

  const aptosConfig = new AptosConfig({
    fullnode: fullnodeUrl,
    network: network, // Required when using custom endpoints
  });

  const aptos = new Aptos(aptosConfig);
  const superClient = new superJsonApiClient.SuperClient({
    BASE: apiUrl,
  });
  const superAptosSDK = new SuperpositionAptosSDK(rootAddress);

  sdkContextInstance = {
    superClient,
    aptos,
    superAptosSDK,
    rootAddress,
    network,
    apiUrl,
  };

  return sdkContextInstance;
}

/**
 * Reset SDK context (useful for testing or config changes)
 */
export function resetSDKContext(): void {
  sdkContextInstance = null;
}

/**
 * Get SDK context with error handling
 */
export function requireSDKContext(): SdkContext {
  try {
    return getSDKContext();
  } catch (error) {
    console.error("Failed to initialize SDK context:", error);
    throw error;
  }
}
