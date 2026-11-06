// The owner's limits, as set on the console. They're signed by the owner's wallet, and the agent
// checks that signature itself before using them, so not even Till can loosen them. Payees can't be
// changed here: they come from the policy file and are checked against Arkiv.
// No Node imports: the server, the agent and the console all build this same text.
import type { Policy } from "./index"

export type Limits = {
  dailyBudgetUsd: number
  approvalAboveUsd: number
  merchants: Record<string, { maxPerCallUsd: number; dailyCapUsd: number }>
}

export type SignedLimits = { limits: Limits; issuedAt: string; by: string; signature: string }

const money = (usd: number) => `$${usd.toFixed(2)}`

/** The exact text the owner signs. */
export function limitsMessage(agent: string, l: Limits, issuedAt: string) {
  const merchants = Object.entries(l.merchants)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, m]) => `${name}: ${money(m.maxPerCallUsd)} a call, ${money(m.dailyCapUsd)} a day`)
  return [
    `Set limits for ${agent}`,
    `Daily budget: ${money(l.dailyBudgetUsd)}`,
    `Auto-pay up to: ${money(l.approvalAboveUsd)}`,
    ...merchants,
    `Issued: ${issuedAt}`,
  ].join("\n")
}

/** The limits a policy has now, in the shape the owner edits. */
export const limitsOf = (p: Policy): Limits => ({
  dailyBudgetUsd: p.dailyBudgetUsd,
  approvalAboveUsd: p.approvalAboveUsd,
  merchants: Object.fromEntries(p.merchants.map(m => [m.name, { maxPerCallUsd: m.maxPerCallUsd, dailyCapUsd: m.dailyCapUsd }])),
})

/** The policy with the owner's limits applied. Merchants and their payees stay as they are. */
export const applyLimits = (p: Policy, l: Limits): Policy => ({
  ...p,
  dailyBudgetUsd: l.dailyBudgetUsd,
  approvalAboveUsd: l.approvalAboveUsd,
  merchants: p.merchants.map(m => ({ ...m, ...(l.merchants[m.name] ?? {}) })),
})

/** Why these limits can't be used, or undefined if they're fine. */
export function limitsProblem(p: Policy, l: Limits): string | undefined {
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 100
  if (!ok(l.dailyBudgetUsd) || !ok(l.approvalAboveUsd)) return "amounts must be between $0.01 and $100"
  if (l.approvalAboveUsd > l.dailyBudgetUsd) return "the auto-pay limit can't be above the daily budget"
  for (const m of p.merchants) {
    const x = l.merchants[m.name]
    if (!x || !ok(x.maxPerCallUsd) || !ok(x.dailyCapUsd)) return `limits for ${m.name} must be between $0.01 and $100`
    if (x.maxPerCallUsd > x.dailyCapUsd) return `${m.name}'s per-call cap can't be above its daily cap`
  }
  if (Object.keys(l.merchants).some(n => !p.merchants.some(m => m.name === n))) return "unknown merchant"
}
