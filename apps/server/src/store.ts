import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Address, Hex } from "viem"
import { config } from "./config"

export type OrderStatus = "open" | "paid" | "refunded"

export type Order = {
  id: Hex // bytes32, the key everywhere: store, contract, events, webhooks, receipt page
  merchantId: string
  amount: string // atomic USDT units (6 decimals)
  description: string
  returnUrl: string
  metadata?: Record<string, string>
  status: OrderStatus
  createdAt: number
  expiresAt: number
  payer?: Address
  paidTo?: Address // the merchant wallet that was paid, which is the one that signs refunds
  payTx?: Hex
  paidAt?: number // ms
  refunded: string // atomic
  refunds: { amount: string; tx: Hex; ts: number }[]
}

// One agent payment settled through our facilitator. Keyed by (payer, nonce) on EVM or the
// transaction ID on Hedera, which makes it the replay / idempotency cache as well.
export type Settlement = {
  key: string
  merchantId: string
  network: string
  asset: string
  amount: string // atomic
  payer: string
  payTo: string
  transaction: string
  ts: number
  response: unknown // the SettleResponse returned the first time, returned again on a retry
}

type Data = {
  orders: Record<string, Order>
  settlements: Record<string, Settlement>
}

// D9: in memory, saved to one JSON file on every change, so it survives restarts.
function load(): Data {
  if (!existsSync(config.storeFile)) return { orders: {}, settlements: {} }
  return { settlements: {}, ...JSON.parse(readFileSync(config.storeFile, "utf8")) }
}

const data = load()

function save() {
  mkdirSync(dirname(config.storeFile), { recursive: true })
  writeFileSync(config.storeFile, JSON.stringify(data, null, 2))
}

export const store = {
  getOrder: (id: string) => data.orders[id.toLowerCase()],
  listOrders: (merchantId: string) =>
    Object.values(data.orders)
      .filter(o => o.merchantId === merchantId)
      .sort((a, b) => b.createdAt - a.createdAt),
  putOrder(order: Order) {
    data.orders[order.id.toLowerCase()] = order
    save()
  },
  getSettlement: (key: string) => data.settlements[key],
  listSettlements: () => Object.values(data.settlements).sort((a, b) => b.ts - a.ts),
  putSettlement(s: Settlement) {
    data.settlements[s.key] = s
    save()
  },
}
