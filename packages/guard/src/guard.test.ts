import { describe, expect, test } from "bun:test"
import { check, record, type Policy, type Spent } from "./index"

const SHOP_EVM = "0x2A50c1fC157B10404A6BD4197B98c665684915D7"
const SHOP_HEDERA = "0.0.11155222"
const USDC = "0.0.429274"
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"

const policy: Policy = {
  dailyBudgetUsd: 1,
  approvalAboveUsd: 1,
  merchants: [
    { name: "Brickline", payTo: { "eip155:1874": SHOP_EVM, "hedera:testnet": SHOP_HEDERA }, maxPerCallUsd: 0.1, dailyCapUsd: 0.5 },
  ],
}
const day = new Date().toISOString().slice(0, 10)
const none: Spent = { day, total: 0, byMerchant: {} }
const hedera = (amount: string, payTo = SHOP_HEDERA) => ({ network: "hedera:testnet", asset: USDC, amount, payTo })

describe("check", () => {
  test("the real shop's $0.05 passes, on either network", () => {
    expect(check(policy, none, hedera("50000")).reasons).toEqual([])
    expect(check(policy, none, { network: "eip155:1874", asset: USDT, amount: "50000", payTo: SHOP_EVM.toLowerCase() }).reasons).toEqual([])
  })

  test("the look-alike's $0.50 to a stranger fails two rules", () => {
    expect(check(policy, none, hedera("500000", "0.0.6660666")).reasons).toEqual([
      "payee 0.0.6660666 is not on the allowlist",
      "$0.50 is above the $0.10 per-call cap",
    ])
  })

  test("an asset that isn't USDT or USDC", () => {
    expect(check(policy, none, { ...hedera("50000"), asset: "0.0.0" }).reasons).toEqual(["asset 0.0.0 on hedera:testnet is not allowed"])
  })

  test("the merchant's daily cap", () => {
    const spent = record(none, "Brickline", 0.48)
    expect(check(policy, spent, hedera("50000")).reasons).toEqual([
      "would spend $0.53 today with Brickline, above the $0.50 daily cap",
    ])
  })

  test("ten $0.05 calls fit the $0.50 cap exactly; the eleventh doesn't", () => {
    let spent = none
    for (let i = 0; i < 9; i++) spent = record(spent, "Brickline", 0.05)
    expect(check(policy, spent, hedera("50000")).reasons).toEqual([])
    spent = record(spent, "Brickline", 0.05)
    expect(check(policy, spent, hedera("50000")).reasons).toHaveLength(1)
  })

  test("the daily budget across merchants", () => {
    const spent = record(none, "Someone else", 0.98)
    expect(check(policy, spent, hedera("50000")).reasons).toEqual(["would spend $1.03 today, above the $1.00 daily budget"])
  })

  test("above the auto-pay limit but within every rule: the owner is asked", () => {
    const strict = { ...policy, approvalAboveUsd: 0.04 }
    expect(check(strict, none, hedera("50000"))).toMatchObject({ reasons: [], needsApproval: true })
    expect(check(policy, none, hedera("50000")).needsApproval).toBe(false)
  })

  test("a broken rule is a hard block, even above the auto-pay limit", () => {
    const strict = { ...policy, approvalAboveUsd: 0.04 }
    expect(check(strict, none, hedera("50000", "0.0.6660666")).reasons).toEqual(["payee 0.0.6660666 is not on the allowlist"])
  })

  test("yesterday's spending doesn't count", () => {
    const old: Spent = { day: "2026-11-04", total: 1, byMerchant: { "Brickline": 0.5 } }
    expect(check(policy, old, hedera("50000")).reasons).toEqual([])
    expect(record(old, "Brickline", 0.05)).toEqual({ day, total: 0.05, byMerchant: { "Brickline": 0.05 } })
  })
})
