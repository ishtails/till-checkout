import type { Limits } from "@till/guard/limits"
import type { Address, Hex } from "viem"

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

export const explorerTx = (hash: string) => `https://explorer.testnet.whitechain.io/tx/${hash}`

export type Order = {
  id: Hex
  merchant: string
  description: string
  amount: string
  refunded: string
  status: "open" | "paid" | "refunded"
  payer?: Address
  paidTo?: Address
  payTx?: Hex
  refunds: { amount: string; tx: Hex; ts: number }[]
  returnUrl: string
  createdAt: number
}

export type CheckoutInfo = Order & {
  merchantName: string
  amountAtomic: string
  token: Address
  contract: Address
  chainId: number
  merchantAddress: Address
  nonce: Hex
  validBefore: number
  domain: { name: string; version: string; chainId: number; verifyingContract: Address }
}

export type AgentPayment = {
  key: string
  payTo: string
  refunded?: string // atomic
  refunds?: { amount: string; tx: Hex; ts: number }[]
  merchantId: string
  network: string
  amount: string // atomic, 6 decimals
  payer: string
  transaction: string
  ts: number
}

export const agentExplorerTx = (p: AgentPayment) =>
  p.network.startsWith("hedera") ? `https://hashscan.io/testnet/transaction/${p.transaction}` : explorerTx(p.transaction)

export type GasMeter = {
  totalWbt: string
  perTxWbt: string
  payments: { count: number; wbt: string }
  refunds: { count: number; wbt: string }
  agentPayments: { count: number; wbt: string }
}

export type GasTank = {
  balanceUsd: number
  creditsUsd: number
  chargedUsd: number
  tillEarnedUsd: number
  perTxUsd: number
  txLeft: number | null
  topups: { amount: string; from: string; tx: Hex; ts: number }[]
  wbtUsd: number
  margin: number
  startUsd: number
  topup: { to: Address; nonce: Hex; validBefore: number; domain: CheckoutInfo["domain"] }
}

export type RefundInfo = {
  from: Address
  to: Address
  remainingAtomic: string
  nonce: Hex
  validBefore: number
  domain: CheckoutInfo["domain"]
}

export type AgentPolicy = {
  dailyBudgetUsd: number
  approvalAboveUsd: number
  merchants: { name: string; payTo: Record<string, string>; maxPerCallUsd: number; dailyCapUsd: number }[]
}
export type SignedLimits = { limits: Limits; issuedAt: string; by: string; signature: string }
export type AgentInfo = { name: string; owner: string | null; topicId: string | null; policy: AgentPolicy; limits: SignedLimits | null }
export type Approval = {
  id: string
  agent: string
  usd: string
  amount: string
  network: string
  payTo: string
  merchant?: string
  resource?: string
  status: "pending" | "approved" | "denied" | "expired"
  createdAt: number
  decidedAt?: number
  by?: string
}

export type AgentRefundInfo = {
  from: Address
  to: Address
  remainingAtomic: string
  nonce: Hex
  validBefore: number
  domain: CheckoutInfo["domain"]
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { "content-type": "application/json", ...init?.headers } })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

export const api = {
  checkout: (id: string) => call<CheckoutInfo>(`/v1/checkout/${id}`),
  order: (id: string) => call<Order>(`/v1/orders/${id}`),
  pay: (id: string, body: { payer: Address; validAfter: number; validBefore: number; signature: Hex }) =>
    call<{ txHash: Hex; pass: string }>(`/v1/checkout/${id}/pay`, { method: "POST", body: JSON.stringify(body) }),
  orders: (merchant: string) => call<Order[]>(`/v1/orders?merchant=${merchant}`),
  gas: (merchant: string) => call<GasMeter>(`/v1/gas?merchant=${merchant}`),
  gasTank: (merchant: string) => call<GasTank>(`/v1/gas-tank?merchant=${merchant}`),
  topUp: (body: { merchant: string; from: Address; amount: string; nonce: Hex; validBefore: number; signature: Hex }) =>
    call<{ txHash: Hex }>("/v1/gas-tank/topup", { method: "POST", body: JSON.stringify(body) }),
  agentPayments: () => call<AgentPayment[]>("/v1/agent-payments"),
  refundInfo: (id: string) => call<RefundInfo>(`/v1/orders/${id}/refund`),
  refund: (id: string, body: { amount: string; validAfter: number; validBefore: number; signature: Hex }) =>
    call<{ txHash: Hex }>(`/v1/orders/${id}/refund`, { method: "POST", body: JSON.stringify(body) }),
  agentRefundInfo: (key: string) => call<AgentRefundInfo>(`/v1/agent-payments/${encodeURIComponent(key)}/refund`),
  agentRefund: (key: string, body: { amount: string; nonce: Hex; validBefore: number; signature: Hex }) =>
    call<{ txHash: Hex }>(`/v1/agent-payments/${encodeURIComponent(key)}/refund`, { method: "POST", body: JSON.stringify(body) }),
  signinInfo: (merchant: string) => call<{ merchant: string; name: string }>(`/v1/signin/${merchant}`),
  signin: (body: { merchant: string; address: Address; issuedAt: string; signature: Hex; returnUrl: string }) =>
    call<{ redirect: string }>("/v1/signin", { method: "POST", body: JSON.stringify(body) }),
  agent: () => call<AgentInfo>("/v1/agent"),
  approvals: () => call<Approval[]>("/v1/approvals"),
  setLimits: (body: { limits: Limits; issuedAt: string; address: Address; signature: Hex }) =>
    call<{ policy: AgentPolicy; limits: SignedLimits }>("/v1/agent/limits", { method: "PUT", body: JSON.stringify(body) }),
  decide: (id: string, body: { decision: "approve" | "deny"; address: Address; signature: Hex }) =>
    call<Approval>(`/v1/approvals/${id}`, { method: "POST", body: JSON.stringify(body) }),
  faucet: () => call<{ enabled: boolean; drip?: string }>("/v1/faucet"),
  drip: (address: Address) =>
    call<{ amount: string; txHash: Hex }>("/v1/faucet", { method: "POST", body: JSON.stringify({ address }) }),
}

export const usdtBalance = async (address: Address, token: Address) => {
  // balanceOf(address) via a plain eth_call, so the page needs no extra client setup.
  const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0")
  const res = await fetch("https://rpc.testnet.whitechain.io", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data }, "latest"] }),
  }).then(r => r.json())
  return Number(BigInt(res.result)) / 1e6
}
