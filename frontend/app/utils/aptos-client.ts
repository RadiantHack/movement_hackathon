/**
 * Shared Aptos Client Utility
 * Provides a centralized way to create Aptos instances
 */

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

interface CreateAptosClientParams {
  movementFullNode: string | null;
  network?: Network;
}

/**
 * Creates an Aptos client instance for Movement Network
 * @param params - Configuration parameters
 * @returns Aptos instance or null if fullNode is not provided
 */
export function createAptosClient({
  movementFullNode,
  network = Network.CUSTOM,
}: CreateAptosClientParams): Aptos | null {
  if (!movementFullNode) {
    return null;
  }

  return new Aptos(
    new AptosConfig({
      network,
      fullnode: movementFullNode,
    })
  );
}
