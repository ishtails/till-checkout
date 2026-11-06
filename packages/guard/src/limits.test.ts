import { describe, expect, test } from "bun:test"
import type { Policy } from "./index"
import { applyLimits, limitsMessage, limitsOf, limitsProblem } from "./limits"

const policy: Policy = {
  dailyBudgetUsd: 2,
  approvalAboveUsd: 0.1,
  merchants: [{ name: "Brickline", payTo: { "eip155:1874": "0x2A50" }, maxPerCallUsd: 0.3, dailyCapUsd: 1 }],
}

describe("limits", () => {
  test("the signed text names every limit", () => {
    expect(limitsMessage("research-agent", limitsOf(policy), "2026-11-06T12:00:00.000Z")).toBe(
      "Set limits for research-agent\nDaily budget: $2.00\nAuto-pay up to: $0.10\nBrickline: $0.30 a call, $1.00 a day\nIssued: 2026-11-06T12:00:00.000Z",
    )
  })

  test("applying limits changes amounts, never payees", () => {
    const l = { ...limitsOf(policy), approvalAboveUsd: 0.5, merchants: { Brickline: { maxPerCallUsd: 0.6, dailyCapUsd: 2 } } }
    const p = applyLimits(policy, l)
    expect(p.approvalAboveUsd).toBe(0.5)
    expect(p.merchants[0]).toEqual({ name: "Brickline", payTo: { "eip155:1874": "0x2A50" }, maxPerCallUsd: 0.6, dailyCapUsd: 2 })
  })

  test("nonsense limits are refused", () => {
    const base = limitsOf(policy)
    expect(limitsProblem(policy, base)).toBeUndefined()
    expect(limitsProblem(policy, { ...base, dailyBudgetUsd: 0 })).toBeDefined()
    expect(limitsProblem(policy, { ...base, approvalAboveUsd: 3 })).toBe("the auto-pay limit can't be above the daily budget")
    expect(limitsProblem(policy, { ...base, merchants: { Brickline: { maxPerCallUsd: 2, dailyCapUsd: 1 } } })).toBe(
      "Brickline's per-call cap can't be above its daily cap",
    )
    expect(limitsProblem(policy, { ...base, merchants: { ...base.merchants, Evil: { maxPerCallUsd: 1, dailyCapUsd: 1 } } })).toBe("unknown merchant")
  })
})
