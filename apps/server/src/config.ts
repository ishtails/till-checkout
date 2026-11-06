import { resolve } from "node:path"
import type { Address, Hex } from "viem"

// File paths in .env are relative to the repo root, wherever the server is started from.
const root = resolve(import.meta.dir, "../../..")

function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in .env`)
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  payAppUrl: process.env.PAY_APP_URL ?? "http://localhost:5173",
  rpcUrl: need("WHITECHAIN_RPC_URL"),
  usdt: need("USDT_ADDRESS") as Address,
  checkout: need("CHECKOUT_CONTRACT") as Address,
  relayerKey: need("RELAYER_PRIVATE_KEY") as Hex,
  hederaFeePayerId: need("HEDERA_FEE_PAYER_ID"),
  hederaFeePayerKey: need("HEDERA_FEE_PAYER_KEY"),
  faucetKey: process.env.FAUCET_PRIVATE_KEY as Hex | undefined, // optional: no key, no test-USDT button
  arkivKey: process.env.ARKIV_PRIVATE_KEY as Hex | undefined, // optional: no key, no Arkiv receipts
  arkivAccessKey: process.env.ARKIV_ACCESS_KEY ?? "", // "" uses Arkiv's public RPC, which is rate limited
  // The demo's research agent: who may approve its payments, the token it files requests with,
  // its policy (read from the agent's own file) and its public log on Hedera.
  // AGENT_OWNER: the wallets that may approve, comma-separated; the first is shown as the owner.
  agentOwners: (process.env.AGENT_OWNER ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
  agentToken: process.env.AGENT_TOKEN,
  agentPolicyFile: resolve(root, "apps/agent/policy.json"),
  hcsTopicId: process.env.HCS_TOPIC_ID,
  merchantsFile: resolve(root, process.env.MERCHANTS_FILE ?? "merchants.json"),
  storeFile: resolve(root, process.env.STORE_FILE ?? "data/store.json"),
  orderTtlSeconds: 30 * 60,
}
