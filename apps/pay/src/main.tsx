import { PrivyProvider } from "@privy-io/react-auth"
import { createRoot } from "react-dom/client"
import { defineChain } from "viem"
import { App } from "./app"
import "./index.css"

const whitechain = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  blockExplorers: { default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" } },
})

createRoot(document.getElementById("root")!).render(
  <PrivyProvider
    appId={import.meta.env.VITE_PRIVY_APP_ID}
    config={{
      loginMethods: ["email"],
      embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      defaultChain: whitechain,
      supportedChains: [whitechain],
      appearance: { theme: "light" },
    }}
  >
    <App />
  </PrivyProvider>,
)
