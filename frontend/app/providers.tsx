"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { CopilotKit } from "@copilotkit/react-core";
import { ReactNode, useEffect } from "react";
import { MovementWalletModal } from "./components/movement-wallet-modal";
import {
  Provider as ReduxProvider,
  useDispatch,
  useSelector,
} from "react-redux";
import { store, type RootState, type AppDispatch } from "../store";
import { loadConfig } from "../store/configSlice";
import { useMovementConfig } from "./hooks/useMovementConfig";

interface ProvidersProps {
  children: ReactNode;
}

function ConfigGate({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const loaded = useSelector((s: RootState) => s.config.loaded);
  const error = useSelector((s: RootState) => s.config.error);

  useEffect(() => {
    dispatch(loadConfig());
  }, [dispatch]);

  if (!loaded) return null;
  if (error) return <div>Failed to load config: {error}</div>;
  return <>{children}</>;
}

function PrivyProviderWithConfig({
  children,
  appId,
  clientId,
  copilotApiKey,
}: {
  children: ReactNode;
  appId: string;
  clientId: string | undefined;
  copilotApiKey: string | undefined;
}) {
  const config = useMovementConfig();

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        // Disable automatic wallet creation - users will create wallets manually (e.g., Movement wallets)
        embeddedWallets: {
          ethereum: {
            createOnLogin: "off", // Disable automatic Ethereum wallet creation
          },
          showWalletUIs: false, // Hide Privy's default wallet UIs
        },
        // Configure Movement blockchain (EVM-compatible)
        supportedChains: [
          {
            id: config.movementChainId || 126, // Movement mainnet chain ID from config
            name: "Movement",
            network: "movement",
            nativeCurrency: {
              name: "MOV",
              symbol: "MOV",
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: [
                  config.movementLabsUrl || "https://mainnet.movementlabs.xyz",
                ],
              },
            },
            blockExplorers: {
              default: {
                name: "Movement Explorer",
                url:
                  config.movementExplorerUrl ||
                  "https://explorer.movementlabs.xyz",
              },
            },
          },
        ],
      }}
    >
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        showDevConsole={false}
        agent="a2a_chat"
        publicApiKey={copilotApiKey}
      >
        <ConfigGate>
          {children}
          <MovementWalletModal />
        </ConfigGate>
      </CopilotKit>
    </PrivyProvider>
  );
}

export function Providers({ children }: ProvidersProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;
  const copilotApiKey = process.env.NEXT_PUBLIC_COPILOTKIT_API_KEY;

  if (!appId) {
    throw new Error(
      "NEXT_PUBLIC_PRIVY_APP_ID is not set. Please add it to your .env.local file."
    );
  }

  return (
    <ReduxProvider store={store}>
      <PrivyProviderWithConfig
        appId={appId}
        clientId={clientId}
        copilotApiKey={copilotApiKey}
      >
        {children}
      </PrivyProviderWithConfig>
    </ReduxProvider>
  );
}
