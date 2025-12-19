"use client";

import { useSelector } from "react-redux";
import { type RootState } from "@/store";

export function useMovementConfig() {
  const config = useSelector((state: RootState) => state.config);

  return {
    movementApiBase: config.movementApiBase || "",
    movementFullNode: config.movementFullNode || "",
    movementRpc: config.movementRpc || "",
    movementChainId: config.movementChainId || 126,
    movementTestNetChainId: config.movementTestNetChainId || 250,
    mosaicApiBaseUrl: config.mosaicApiBaseUrl || "",
    movementLabsUrl: config.movementLabsUrl || "",
    movementExplorerUrl: config.movementExplorerUrl || "",
    movementPositionBrokerUrl: config.movementPositionBrokerUrl || "",
    loaded: config.loaded,
    error: config.error,
  };
}
