import { PrivyProvider } from "@privy-io/react-auth"
import { createRoot } from "react-dom/client"
import { defineChain } from "viem"
import { App } from "./app"
import { Docs } from "./docs"
import { Landing } from "./landing"
import { Toaster } from "sonner"
import "./index.css"

const whitechain = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  blockExplorers: { default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" } },
})

const root = createRoot(document.getElementById("root")!)
// The landing page and the docs need no wallet, so they render without Privy.
if (location.pathname === "/") root.render(<Landing />)
else if (location.pathname.replace(/\/$/, "") === "/docs") root.render(<Docs />)
else
  root.render(
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: whitechain,
        supportedChains: [whitechain],
        appearance: { theme: "light" },
      }}
    >
      <App />
      <Toaster position="bottom-center" richColors closeButton />
    </PrivyProvider>,
  )
