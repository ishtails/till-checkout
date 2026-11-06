import { readFileSync } from "node:fs"
import { Hono } from "hono"
import { isAddress, verifyMessage, type Hex } from "viem"
import { config } from "./config"
import type { Policy } from "@till/guard"
import { decisionMessage, isApprovalId, newApprovalId } from "@till/guard/approvals"
import { applyLimits, limitsMessage, limitsProblem, type Limits } from "@till/guard/limits"
import { store, type Approval } from "./store"

// Human approval for the agent: when its guard pauses a payment (allowed, but above the auto-pay
// limit), the agent files it here under an ID it picked, and waits. The owner answers from the
// console by signing the decision with their wallet. Till only carries the answer: the agent's
// guard checks the signature itself, so Till can't approve anything on the owner's behalf.
const AGENT = "research-agent"
const EXPIRES_MS = 5 * 60_000

// A request nobody answered in time is expired, and the agent gives up on it.
const fresh = (a: Approval): Approval =>
  a.status === "pending" && Date.now() - a.createdAt > EXPIRES_MS ? { ...a, status: "expired" } : a

export const approvals = new Hono()

const filePolicy = (): Policy => JSON.parse(readFileSync(config.agentPolicyFile, "utf8"))

// What the console shows besides the log: the agent's owner, its policy (with the owner's signed
// limits applied) and where its log is. `limits` carries the signature, so the agent checks it itself.
approvals.get("/v1/agent", c => {
  // Limits count only while their signer is still an owner, as the agent itself checks.
  const stored = store.getAgentLimits()
  const signed = stored && config.agentOwners.includes(stored.by.toLowerCase()) ? stored : undefined
  return c.json({
    name: AGENT,
    owner: config.agentOwners[0] ?? null,
    topicId: config.hcsTopicId ?? null,
    policy: signed ? applyLimits(filePolicy(), signed.limits) : filePolicy(),
    limits: signed ?? null,
  })
})

// The owner changes the limits: { limits, issuedAt, address, signature } over limitsMessage().
approvals.put("/v1/agent/limits", async c => {
  const { limits, issuedAt, address, signature } = await c.req.json<{ limits: Limits; issuedAt: string; address: string; signature: Hex }>()
  if (!isAddress(address) || !config.agentOwners.includes(address.toLowerCase())) return c.json({ error: "only the agent's owner can change its limits" }, 403)
  const problem = limitsProblem(filePolicy(), limits)
  if (problem) return c.json({ error: problem }, 400)
  const age = Date.now() - Date.parse(issuedAt)
  if (!(age >= -60_000 && age < 5 * 60_000)) return c.json({ error: "sign again: that signature is too old" }, 400)
  const previous = store.getAgentLimits()
  if (previous && Date.parse(previous.issuedAt) >= Date.parse(issuedAt)) return c.json({ error: "newer limits are already set" }, 409)
  const ok = await verifyMessage({ address, message: limitsMessage(AGENT, limits, issuedAt), signature }).catch(() => false)
  if (!ok) return c.json({ error: "signature doesn't match" }, 403)
  const signed = { limits, issuedAt, by: address, signature }
  store.putAgentLimits(signed)
  return c.json({ policy: applyLimits(filePolicy(), limits), limits: signed })
})

approvals.get("/v1/approvals", c => c.json(store.listApprovals(AGENT).slice(0, 20).map(fresh)))

approvals.get("/v1/approvals/:id", c => {
  const a = store.getApproval(c.req.param("id"))
  return a ? c.json(fresh(a)) : c.json({ error: "no such approval" }, 404)
})

// Filed by the agent, with its token.
approvals.post("/v1/approvals", async c => {
  if (!config.agentToken || c.req.header("authorization") !== `Bearer ${config.agentToken}`) return c.json({ error: "unauthorized" }, 401)
  const b = await c.req.json<Partial<Approval> & { approvalId?: string }>()
  if (!b.usd || !b.amount || !b.network || !b.payTo) return c.json({ error: "usd, amount, network and payTo are required" }, 400)
  if (b.approvalId !== undefined && !isApprovalId(b.approvalId)) return c.json({ error: "approvalId must be 32 hex characters" }, 400)
  if (b.approvalId && store.getApproval(b.approvalId)) return c.json({ error: "that approvalId is already used" }, 409)
  const a: Approval = {
    id: b.approvalId ?? newApprovalId(),
    agent: AGENT,
    usd: b.usd,
    amount: b.amount,
    network: b.network,
    payTo: b.payTo,
    merchant: b.merchant,
    resource: b.resource,
    status: "pending",
    createdAt: Date.now(),
  }
  store.putApproval(a)
  return c.json(a)
})

// Answered by the owner: { decision, address, signature } over decisionMessage().
approvals.post("/v1/approvals/:id", async c => {
  const a = store.getApproval(c.req.param("id"))
  if (!a) return c.json({ error: "no such approval" }, 404)
  const current = fresh(a)
  if (current.status !== "pending") return c.json({ error: `already ${current.status}` }, 409)
  const { decision, address, signature } = await c.req.json<{ decision: "approve" | "deny"; address: string; signature: Hex }>()
  if (decision !== "approve" && decision !== "deny") return c.json({ error: "decision must be approve or deny" }, 400)
  if (!isAddress(address) || !config.agentOwners.includes(address.toLowerCase())) {
    return c.json({ error: "only the agent's owner can answer this" }, 403)
  }
  const ok = await verifyMessage({ address, message: decisionMessage(a, decision), signature }).catch(() => false)
  if (!ok) return c.json({ error: "signature doesn't match" }, 403)
  const done: Approval = { ...a, status: decision === "approve" ? "approved" : "denied", decidedAt: Date.now(), by: address, signature }
  store.putApproval(done)
  return c.json(done)
})
