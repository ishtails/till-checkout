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
  payTx?: Hex
  refunded: string // atomic
  refunds: { amount: string; tx: Hex; ts: number }[]
}

type Data = {
  orders: Record<string, Order>
}

// D9: in memory, saved to one JSON file on every change, so it survives restarts.
function load(): Data {
  if (!existsSync(config.storeFile)) return { orders: {} }
  return JSON.parse(readFileSync(config.storeFile, "utf8"))
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
}
