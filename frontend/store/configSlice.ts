import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export interface RuntimeConfig {
  movementApiBase: string;
  movementFullNode: string;
  movementRpc: string;
  movementChainId: number;
  movementTestNetChainId: number;
  mosaicApiBaseUrl: string;
  movementLabsUrl: string;
  movementExplorerUrl: string;
  movementPositionBrokerUrl: string;
}

interface ConfigState extends Partial<RuntimeConfig> {
  loaded: boolean;
  error?: string;
}

const initialState: ConfigState = { loaded: false };

export const loadConfig = createAsyncThunk("config/load", async () => {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load /config.json");
  return (await res.json()) as RuntimeConfig;
});

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadConfig.fulfilled, (state, { payload }) => {
      state.loaded = true;
      state.movementApiBase = payload.movementApiBase;
      state.movementFullNode = payload.movementFullNode;
      state.movementRpc = payload.movementRpc;
      state.movementChainId = payload.movementChainId;
      state.movementTestNetChainId = payload.movementTestNetChainId;
      state.mosaicApiBaseUrl = payload.mosaicApiBaseUrl;
      state.movementLabsUrl = payload.movementLabsUrl;
      state.movementExplorerUrl = payload.movementExplorerUrl;
      state.movementPositionBrokerUrl = payload.movementPositionBrokerUrl;
    });
    builder.addCase(loadConfig.rejected, (state, action) => {
      state.loaded = true;
      state.error = action.error.message || "Config load failed";
    });
  },
});

export default configSlice.reducer;
