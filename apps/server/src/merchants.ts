import { readFileSync } from "node:fs"
import { getAddress, type Address } from "viem"
import { config } from "./config"

export type Merchant = {
  id: string
  name: string
  apiKey: string
  webhookUrl: string
  webhookSecret: string
  evmAddress: Address
  hederaAccountId: string
}

// The registered merchants. The relayer only ever pays gas for these (drain rule 2).
const merchants: Merchant[] = JSON.parse(readFileSync(config.merchantsFile, "utf8")).map((m: Merchant) => ({
  ...m,
  evmAddress: getAddress(m.evmAddress),
}))

export const findMerchantByKey = (apiKey: string) => merchants.find(m => m.apiKey === apiKey)
export const findMerchant = (id: string) => merchants.find(m => m.id === id)
export const findMerchantByPayTo = (payTo: string) =>
  merchants.find(m => m.evmAddress.toLowerCase() === payTo.toLowerCase() || m.hederaAccountId === payTo)
