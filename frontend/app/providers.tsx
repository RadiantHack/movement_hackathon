"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { CopilotKit } from "@copilotkit/react-core";
import { ReactNode } from "react";
import { MovementWalletModal } from "./components/movement-wallet-modal";

interface ProvidersProps {
  children: ReactNode;
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
            id: 2024, // Movement mainnet chain ID
            name: "Movement",
            network: "movement",
            nativeCurrency: {
              name: "MOV",
              symbol: "MOV",
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: ["https://mainnet.movementlabs.xyz"],
              },
            },
            blockExplorers: {
              default: {
                name: "Movement Explorer",
                url: "https://explorer.movementlabs.xyz",
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
        {children}
        <MovementWalletModal />
      </CopilotKit>
    </PrivyProvider>
  );
}
