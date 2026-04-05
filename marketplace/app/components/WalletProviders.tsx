"use client";

import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { base, baseSepolia, mainnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import { defineChain } from "viem";

// ARC Testnet (not in viem's built-in chains)
const arcTestnet = defineChain({
  id: 5042002,
  name: "ARC Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
});

const config = getDefaultConfig({
  appName: "Post Quantum Agent Marketplace",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "placeholder-project-id",
  chains: [base, baseSepolia, mainnet, sepolia, arcTestnet],
  ssr: true,
});

const queryClient = new QueryClient();

export function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#c9a84c",
            accentColorForeground: "#05080f",
            borderRadius: "medium",
            fontStack: "system",
          })}
          coolMode={false}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
