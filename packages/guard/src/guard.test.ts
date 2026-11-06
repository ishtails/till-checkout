import { describe, expect, test } from "bun:test"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { decisionMessage } from "./approvals"
import { approvalProblem, check, record, registryView, type Policy, type RegistryEntry, type Spent } from "./index"

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

describe("registry on Arkiv", () => {
  const KEY = "0x2b22a7b395f4d97cef1632c54ea44733bab048ee2e0aae80ec6ea0ff996efdc2"
  const listings: RegistryEntry[] = [{ name: "Brickline", payTo: { "eip155:1874": SHOP_EVM, "hedera:testnet": SHOP_HEDERA }, entityKey: KEY }]
  const STRANGER = "0x7854711f971b3183Ed52BeaA28f62c2d2582FA80"
  const evm = (amount: string, payTo: string) => ({ network: "eip155:1874", asset: USDT, amount, payTo })

  test("the real shop matches Brickline's record", () => {
    const req = hedera("50000")
    expect(check(policy, none, req, registryView(listings, req, "Brickline")).reasons).toEqual([])
    expect(check(policy, none, req, registryView(listings, req)).reasons).toEqual([])
  })

  test("the look-alike claiming to be Brickline is blocked, naming Arkiv", () => {
    const req = evm("500000", STRANGER)
    expect(check(policy, none, req, registryView(listings, req, "Brickline")).reasons).toEqual([
      `payee ${STRANGER} is not on the allowlist`,
      "payee 0x7854…FA80 isn't Brickline's registered address on Arkiv (entity 0x2b22…fdc2)",
      "$0.50 is above the $0.10 per-call cap",
    ])
  })

  test("an unnamed payee nobody registered", () => {
    const req = hedera("50000", "0.0.6660666")
    expect(check(policy, none, req, registryView(listings, req)).reasons).toContain("payee 0.0.6660666 isn't a Till merchant on Arkiv")
  })

  test("a seller Arkiv doesn't list", () => {
    const req = hedera("50000")
    expect(check(policy, none, req, registryView(listings, req, "RentFast")).reasons).toEqual(["RentFast isn't listed on Arkiv"])
  })

  test("the allowlist and Arkiv disagree about who the payee is", () => {
    const renamed = [{ ...listings[0], name: "Someone else" }]
    const req = hedera("50000")
    expect(check(policy, none, req, registryView(renamed, req)).reasons).toEqual([
      "the allowlist calls 0.0.11155222 Brickline, but Arkiv lists it as Someone else",
    ])
  })

  test("Arkiv unreachable is a hard block", () => {
    expect(check(policy, none, hedera("50000"), { error: "timeout" }).reasons).toEqual(["couldn't check the payee on Arkiv: timeout"])
  })
})

describe("approvals", () => {
  const owner = privateKeyToAccount(generatePrivateKey())
  const stranger = privateKeyToAccount(generatePrivateKey())
  const owners = [owner.address.toLowerCase()]
  const subject = { id: "a".repeat(32), usd: "0.25", merchant: "Brickline", payTo: SHOP_HEDERA, agent: "research-agent" }
  const signed = (who = owner, s = subject) => who.signMessage({ message: decisionMessage(s, "approve") })

  test("the owner's signature for this request counts", async () => {
    expect(await approvalProblem(subject, { by: owner.address, signature: await signed() }, owners)).toBeUndefined()
  })

  test("an approval with no signature, as a server alone could give, doesn't count", async () => {
    expect(await approvalProblem(subject, { by: owner.address }, owners)).toBe("the approval has no signature")
  })

  test("a stranger's approval doesn't count, under their address or the owner's", async () => {
    expect(await approvalProblem(subject, { by: stranger.address, signature: await signed(stranger) }, owners)).toContain("not the agent's owner")
    expect(await approvalProblem(subject, { by: owner.address, signature: await signed(stranger) }, owners)).toContain("isn't")
  })

  test("the owner's approval of another request, or another amount, doesn't count", async () => {
    const other = await signed(owner, { ...subject, id: "b".repeat(32) })
    expect(await approvalProblem(subject, { by: owner.address, signature: other }, owners)).toContain("isn't")
    const cheaper = await signed(owner, { ...subject, usd: "0.05" })
    expect(await approvalProblem(subject, { by: owner.address, signature: cheaper }, owners)).toContain("isn't")
  })
})

describe("guard, above the auto-pay limit", () => {
  const owner = privateKeyToAccount(generatePrivateKey())
  const live: Policy = { ...policy, dailyBudgetUsd: 2, approvalAboveUsd: 0.1, merchants: [{ ...policy.merchants[0], maxPerCallUsd: 0.3, dailyCapUsd: 1 }] }
  const stateFile = `${require("node:os").tmpdir()}/till-guard-test-${Date.now()}.json`

  // A stand-in for the x402 client: keeps the hook the guard registers, so the test can call it.
  async function attempt(approver: import("./index").Approver) {
    let hook: ((ctx: unknown) => Promise<unknown>) | undefined
    const client = { onBeforePaymentCreation: (f: typeof hook) => (hook = f), onPaymentResponse: () => {} }
    const { guard } = await import("./index")
    const decisions: string[] = []
    guard(client as never, { policy: live, stateFile, approver, agent: "research-agent", owners: [owner.address], onDecision: d => decisions.push(d.type) })
    const result = await hook!({ paymentRequired: { resource: { url: "https://shop/api/report" } }, selectedRequirements: hedera("250000") })
    return { result: result as { abort?: boolean; reason?: string } | undefined, decisions }
  }

  test("pays once the owner signs this request", async () => {
    let filed = ""
    const { result, decisions } = await attempt({
      request: async d => (filed = d.approvalId),
      wait: async id => {
        const signature = await owner.signMessage({ message: decisionMessage({ id, usd: "0.25", merchant: "Brickline", payTo: SHOP_HEDERA, agent: "research-agent" }, "approve") })
        return { approved: true, by: owner.address, signature }
      },
    })
    expect(filed).toMatch(/^[0-9a-f]{32}$/)
    expect(result).toBeUndefined()
    expect(decisions).toEqual(["agent.approval_requested", "agent.approved"])
  })

  test("a server that says 'approved' with no owner signature is blocked", async () => {
    const { result, decisions } = await attempt({ request: async d => d.approvalId, wait: async () => ({ approved: true, by: owner.address }) })
    expect(result?.reason).toBe("BLOCKED: the approval has no signature")
    expect(decisions).toEqual(["agent.approval_requested", "agent.blocked"])
  })

  test("a server that files the request under its own ID is blocked before anyone is asked", async () => {
    const { result, decisions } = await attempt({ request: async () => "c".repeat(32), wait: async () => ({ approved: true }) })
    expect(result?.reason).toContain("BLOCKED: the approval request was filed as")
    expect(decisions).toEqual(["agent.blocked"])
  })

  test("with no owners set up, nothing above the limit is paid", async () => {
    let hook: ((ctx: unknown) => Promise<unknown>) | undefined
    const client = { onBeforePaymentCreation: (f: typeof hook) => (hook = f), onPaymentResponse: () => {} }
    const { guard } = await import("./index")
    guard(client as never, { policy: live, stateFile, approver: { request: async d => d.approvalId, wait: async () => ({ approved: true }) }, agent: "research-agent" })
    const result = (await hook!({ paymentRequired: {}, selectedRequirements: hedera("250000") })) as { reason?: string }
    expect(result.reason).toContain("no one is set up to approve it")
  })
})
