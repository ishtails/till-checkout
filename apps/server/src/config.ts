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
  arkivKey: process.env.ARKIV_PRIVATE_KEY as Hex | undefined, // optional: no key, no Arkiv receipts
  merchantsFile: resolve(root, process.env.MERCHANTS_FILE ?? "merchants.json"),
  storeFile: resolve(root, process.env.STORE_FILE ?? "data/store.json"),
  orderTtlSeconds: 30 * 60,
}
