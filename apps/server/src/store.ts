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

// A payment the agent's guard paused for its owner: allowed by every rule, but above the auto-pay limit.
export type Approval = {
  id: string
  agent: string
  usd: string
  amount: string // atomic
  network: string
  payTo: string
  merchant?: string
  resource?: string
  status: "pending" | "approved" | "denied" | "expired"
  createdAt: number // ms
  decidedAt?: number
  by?: string // the owner's wallet
  signature?: string // the owner's signed decision, so anyone can check it
}

type Data = {
  approvals: Record<string, Approval>
  orders: Record<string, Order>
  settlements: Record<string, Settlement>
  faucet: Record<string, { tx: Hex; ts: number }> // test-USDT drips, one per address
}

// D9: in memory, saved to one JSON file on every change, so it survives restarts.
function load(): Data {
  if (!existsSync(config.storeFile)) return { orders: {}, settlements: {}, faucet: {}, approvals: {} }
  return { settlements: {}, faucet: {}, approvals: {}, ...JSON.parse(readFileSync(config.storeFile, "utf8")) }
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
  getApproval: (id: string) => data.approvals[id],
  listApprovals: (agent: string) =>
    Object.values(data.approvals)
      .filter(a => a.agent === agent)
      .sort((a, b) => b.createdAt - a.createdAt),
  putApproval(a: Approval) {
    data.approvals[a.id] = a
    save()
  },
  getDrip: (address: string) => data.faucet[address.toLowerCase()],
  putDrip(address: string, tx: Hex) {
    data.faucet[address.toLowerCase()] = { tx, ts: Date.now() }
    save()
  },
}
