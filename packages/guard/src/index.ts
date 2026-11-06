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
  type: "agent.paid" | "agent.blocked" | "agent.approval_requested" | "agent.approved" | "agent.denied"
  network: string
  asset: string
  amount: string
  usd: string
  payTo: string
  merchant?: string // the allowlisted merchant's name, when the payee is one
  resource?: string
  reasons?: string[]
  tx?: string
  approvalId?: string
  by?: string // the owner's wallet that approved or denied
}

/** Asks the agent's owner about one payment: `request` files it, `wait` resolves with their answer. */
export type Approver = {
  request: (d: Decision) => Promise<string>
  wait: (id: string) => Promise<{ approved: boolean; by?: string; reason?: string }>
}

const today = () => new Date().toISOString().slice(0, 10)
const money = (usd: number) => `$${usd.toFixed(2)}`
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
// Sums in whole micro-dollars, so ten $0.05 payments are exactly $0.50.
const add = (a: number, b: number) => Math.round((a + b) * 1e6) / 1e6

/**
 * Checks one payment request against the policy. Every rule is evaluated and every failing
 * reason is returned, in this order (design/04_low_level.md §3). No reasons means it may be paid,
 * unless `needsApproval`: then it's allowed but unusual, so the owner decides. A failing rule is
 * never something the owner can approve.
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
  // 6. Above the auto-pay limit, the owner is asked.
  const needsApproval = usd > policy.approvalAboveUsd

  return { merchant, usd, reasons, needsApproval }
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
  { policy, stateFile, onDecision, approver }: { policy: Policy; stateFile: string; onDecision?: (d: Decision) => unknown; approver?: Approver },
) {
  const load = (): Spent => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { day: today(), total: 0, byMerchant: {} })

  // The response hook doesn't always get the 402, so remember which resource is being paid for.
  let resource: string | undefined

  client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements: r }) => {
    resource = paymentRequired.resource?.url
    const { merchant, usd, reasons, needsApproval } = check(policy, load(), r)
    const base = { network: r.network, asset: r.asset, amount: r.amount, usd: usd.toFixed(2), payTo: r.payTo, merchant: merchant?.name, resource }
    const block = async (why: string[]) => {
      await onDecision?.({ type: "agent.blocked", ...base, reasons: why })
      return { abort: true as const, reason: `BLOCKED: ${why.join("; ")}` }
    }
    if (reasons.length > 0) return block(reasons)
    if (!needsApproval) return
    const limit = `above the ${money(policy.approvalAboveUsd)} auto-pay limit`
    if (!approver) return block([`${money(usd)} is ${limit} and no one is set up to approve it`])

    // Allowed but unusual: pause and ask the owner. Nothing is signed until they say yes.
    const ask: Decision = { type: "agent.approval_requested", ...base, reasons: [`${money(usd)} is ${limit}`] }
    const approvalId = await approver.request(ask)
    await onDecision?.({ ...ask, approvalId })
    const answer = await approver.wait(approvalId)
    if (answer.approved) {
      await onDecision?.({ type: "agent.approved", ...base, approvalId, by: answer.by })
      return
    }
    const why = answer.reason ?? "the owner denied it"
    await onDecision?.({ type: "agent.denied", ...base, approvalId, by: answer.by, reasons: [why] })
    return { abort: true, reason: `DENIED: ${why}` }
  })

  client.onPaymentResponse(async ({ requirements: r, settleResponse, paymentRequired }) => {
    if (!settleResponse?.success) return
    const { merchant, usd } = check(policy, load(), r)
    if (merchant) writeFileSync(stateFile, JSON.stringify(record(load(), merchant.name, usd), null, 2))
    await onDecision?.({
      type: "agent.paid",
      merchant: merchant?.name,
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
