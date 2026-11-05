import { existsSync, readFileSync, writeFileSync } from "node:fs"
import type { x402Client } from "@x402/core/client"

// The spending guard: the agent's own limits, checked before any payment is signed.
// It runs inside the agent's payment tool, below the model, so the model can't talk its way past it.

/** The only assets the agent may pay with: USDT on Whitechain and USDC on Hedera testnet. Both have 6 decimals. */
export const ALLOWED_ASSETS: Record<string, string> = {
  "eip155:1874": "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7",
  "hedera:testnet": "0.0.429274",
}

export type Policy = {
  dailyBudgetUsd: number
  approvalAboveUsd: number
  merchants: { name: string; payTo: Record<string, string>; maxPerCallUsd: number; dailyCapUsd: number }[]
}

/** What the agent has spent today, in USD, in total and per merchant name. */
export type Spent = { day: string; total: number; byMerchant: Record<string, number> }

export type PaymentRequest = { network: string; asset: string; amount: string; payTo: string }

export type Decision = {
  type: "agent.paid" | "agent.blocked"
  network: string
  asset: string
  amount: string
  usd: string
  payTo: string
  resource?: string
  reasons?: string[]
  tx?: string
}

const today = () => new Date().toISOString().slice(0, 10)
const money = (usd: number) => `$${usd.toFixed(2)}`
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
// Sums in whole micro-dollars, so ten $0.05 payments are exactly $0.50.
const add = (a: number, b: number) => Math.round((a + b) * 1e6) / 1e6

/**
 * Checks one payment request against the policy. Every rule is evaluated and every failing
 * reason is returned, in this order (design/04_low_level.md §3). No reasons means it may be paid.
 */
export function check(policy: Policy, spent: Spent, req: PaymentRequest) {
  const usd = Number(req.amount) / 1e6
  const reasons: string[] = []
  const merchant = policy.merchants.find(m => m.payTo[req.network] && same(m.payTo[req.network], req.payTo))
  const spentToday = spent.day === today() ? spent : { total: 0, byMerchant: {} as Record<string, number> }

  // 1. Asset allowed.
  if (!ALLOWED_ASSETS[req.network] || !same(ALLOWED_ASSETS[req.network], req.asset)) {
    reasons.push(`asset ${req.asset} on ${req.network} is not allowed`)
  }
  // 2. Payee on the allowlist.
  if (!merchant) reasons.push(`payee ${req.payTo} is not on the allowlist`)
  // 3. Per-call cap (an unknown payee gets the lowest cap in the policy).
  const cap = merchant?.maxPerCallUsd ?? Math.min(...policy.merchants.map(m => m.maxPerCallUsd))
  if (usd > cap) reasons.push(`${money(usd)} is above the ${money(cap)} per-call cap`)
  // 4. Per-merchant daily cap.
  if (merchant) {
    const after = add(spentToday.byMerchant[merchant.name] ?? 0, usd)
    if (after > merchant.dailyCapUsd) {
      reasons.push(`would spend ${money(after)} today with ${merchant.name}, above the ${money(merchant.dailyCapUsd)} daily cap`)
    }
  }
  // 5. Daily budget.
  if (add(spentToday.total, usd) > policy.dailyBudgetUsd) {
    reasons.push(`would spend ${money(add(spentToday.total, usd))} today, above the ${money(policy.dailyBudgetUsd)} daily budget`)
  }
  // 6. Human approval: blocked in this demo, there's no approval screen.
  if (usd > policy.approvalAboveUsd) reasons.push(`needs human approval above ${money(policy.approvalAboveUsd)}`)

  return { merchant, usd, reasons }
}

/** Adds a settled payment to the day's totals. */
export function record(spent: Spent, merchant: string, usd: number): Spent {
  const base = spent.day === today() ? spent : { day: today(), total: 0, byMerchant: {} }
  return {
    day: base.day,
    total: add(base.total, usd),
    byMerchant: { ...base.byMerchant, [merchant]: add(base.byMerchant[merchant] ?? 0, usd) },
  }
}

/**
 * Attaches the guard to an x402 client. A blocked payment aborts before anything is signed.
 * Totals update only when a payment actually settles, and are kept in `stateFile`.
 * `onDecision` gets every payment and every blocked attempt (the agent logs them to HCS).
 */
export function guard(
  client: x402Client,
  { policy, stateFile, onDecision }: { policy: Policy; stateFile: string; onDecision?: (d: Decision) => unknown },
) {
  const load = (): Spent => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { day: today(), total: 0, byMerchant: {} })

  // The response hook doesn't always get the 402, so remember which resource is being paid for.
  let resource: string | undefined

  client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements: r }) => {
    resource = paymentRequired.resource?.url
    const { usd, reasons } = check(policy, load(), r)
    if (reasons.length === 0) return
    await onDecision?.({
      type: "agent.blocked",
      network: r.network,
      asset: r.asset,
      amount: r.amount,
      usd: usd.toFixed(2),
      payTo: r.payTo,
      resource,
      reasons,
    })
    return { abort: true, reason: `BLOCKED: ${reasons.join("; ")}` }
  })

  client.onPaymentResponse(async ({ requirements: r, settleResponse, paymentRequired }) => {
    if (!settleResponse?.success) return
    const { merchant, usd } = check(policy, load(), r)
    if (merchant) writeFileSync(stateFile, JSON.stringify(record(load(), merchant.name, usd), null, 2))
    await onDecision?.({
      type: "agent.paid",
      network: r.network,
      asset: r.asset,
      amount: r.amount,
      usd: usd.toFixed(2),
      payTo: r.payTo,
      resource: paymentRequired?.resource?.url ?? resource,
      tx: settleResponse.transaction,
    })
  })

  return client
}
