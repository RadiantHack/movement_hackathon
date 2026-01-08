/**
 * API Route Constants
 * Default values for API routes that can be overridden via environment variables
 */

/**
 * Default Movement Network RPC URL
 * Can be overridden via NEXT_PUBLIC_MOVEMENT_RPC_URL environment variable
 */
export const DEFAULT_MOVEMENT_RPC_URL =
  "https://mainnet.movementnetwork.xyz/v1";

/**
 * Get Movement RPC URL from environment variable with fallback to default
 * @returns Movement RPC URL string
 */
export function getMovementRpcUrl(): string {
  return process.env.NEXT_PUBLIC_MOVEMENT_RPC_URL || DEFAULT_MOVEMENT_RPC_URL;
}
