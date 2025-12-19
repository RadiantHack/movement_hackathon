// global variables for using redux for movement api endpoints and other

import { store } from "@/store";
import { RuntimeConfig } from "@/store/configSlice";

/**
 * Get current config state from Redux store
 */
export function getConfig(): Partial<RuntimeConfig> & { loaded: boolean } {
  return store.getState().config;
}

/**
 * Get Movement API base URL
 * Returns undefined if not loaded yet
 */
export function getMovementApiBase(): string | undefined {
  return store.getState().config.movementApiBase;
}

/**
 * Get Movement RPC URL
 */
export function getMovementRpc(): string | undefined {
  return store.getState().config.movementRpc;
}

/**
 * Get Movement Chain ID
 */
export function getMovementChainId(): number | undefined {
  return store.getState().config.movementChainId;
}

/**
 * Get Mosaic API base URL
 */
export function getMosaicApiBase(): string | undefined {
  return store.getState().config.mosaicApiBaseUrl;
}

export function getMovementLabsUrl(): string | undefined {
  return store.getState().config.movementLabsUrl;
}

export function getMovementExplorerUrl(): string | undefined {
  return store.getState().config.movementExplorerUrl;
}

export function getMovementPositionBrokerUrl(): string | undefined {
  return store.getState().config.movementPositionBrokerUrl;
}

/**
 * Check if config is loaded
 */
export function isConfigLoaded(): boolean {
  return store.getState().config.loaded;
}

/**
 * Get config value with error if not loaded
 * Throws error if config not loaded - use when config is required
 */
export function requireMovementApiBase(): string {
  const config = store.getState().config;

  if (!config.loaded) {
    throw new Error(
      "Config not loaded yet. Ensure config is loaded before calling this function."
    );
  }

  if (!config.movementApiBase) {
    throw new Error("movementApiBase is not configured");
  }

  return config.movementApiBase;
}

export function requireMovementRpc(): string {
  const config = store.getState().config;

  if (!config.loaded) {
    throw new Error("Config not loaded yet");
  }

  if (!config.movementRpc) {
    throw new Error("movementRpc is not configured");
  }

  return config.movementRpc;
}

export function requireMovementChainId(): number {
  const config = store.getState().config;

  if (!config.loaded) {
    throw new Error("Config not loaded yet");
  }

  if (config.movementChainId == null) {
    throw new Error("movementChainId is not configured");
  }

  return config.movementChainId;
}

export function movementTestNetChainId(): number {
  const config = store.getState().config;

  if (!config.loaded) {
    throw new Error("Config not loaded yet");
  }

  if (config.movementTestNetChainId == null) {
    throw new Error("movementChainId is not configured");
  }

  return config.movementTestNetChainId;
}

export function requireConfig(): Required<RuntimeConfig> {
  const config = store.getState().config;

  if (!config.loaded) {
    throw new Error("Config not loaded yet");
  }

  if (
    !config.movementApiBase ||
    !config.movementRpc ||
    !config.movementChainId ||
    !config.movementTestNetChainId ||
    !config.mosaicApiBaseUrl ||
    !config.movementLabsUrl ||
    !config.movementExplorerUrl
  ) {
    throw new Error("Config is incomplete");
  }

  return config as Required<RuntimeConfig>;
}
