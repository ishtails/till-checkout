import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { config } from "./config"

export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
  blockExplorers: { default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" } },
})

export const explorerTx = (hash: string) => `https://explorer.testnet.whitechain.io/tx/${hash}`

export const relayer = privateKeyToAccount(config.relayerKey)
export const publicClient = createPublicClient({ chain: whitechainSepolia, transport: http() })
export const walletClient = createWalletClient({ account: relayer, chain: whitechainSepolia, transport: http() })

export const checkoutAbi = parseAbi([
  "function pay(bytes32 orderId, address merchant, address payer, uint128 amount, uint256 validAfter, uint256 validBefore, bytes signature)",
  "function refund(bytes32 orderId, uint128 amount, uint256 validAfter, uint256 validBefore, bytes signature)",
  "function orders(bytes32) view returns (address payer, address merchant, uint128 amount, uint128 refunded)",
  "error AlreadyPaid()",
  "error NotPaid()",
  "error ZeroAmount()",
  "error RefundTooLarge()",
  "error TransferFailed()",
])

export const usdtAbi = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
  "function balanceOf(address) view returns (uint256)",
])
