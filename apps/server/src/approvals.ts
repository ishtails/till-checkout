import { readFileSync } from "node:fs"
import { Hono } from "hono"
import { isAddress, verifyMessage, type Hex } from "viem"
import { config } from "./config"
import { store, type Approval } from "./store"

// Human approval for the agent: when its guard pauses a payment (allowed, but above the auto-pay
// limit), the agent files it here and waits. The owner answers from the console by signing the
// decision with their wallet, so no one else can approve, and the signature is kept as proof.
const AGENT = "research-agent"
const EXPIRES_MS = 5 * 60_000

export const decisionMessage = (a: Approval, decision: "approve" | "deny") =>
  `${decision === "approve" ? "Approve" : "Deny"} agent payment ${a.id}\n$${a.usd} to ${a.merchant ?? a.payTo}\nAgent: ${a.agent}`

// A request nobody answered in time is expired, and the agent gives up on it.
const fresh = (a: Approval): Approval =>
  a.status === "pending" && Date.now() - a.createdAt > EXPIRES_MS ? { ...a, status: "expired" } : a

export const approvals = new Hono()

// What the console shows besides the log: the agent's owner, its policy and where its log is.
approvals.get("/v1/agent", c =>
  c.json({
    name: AGENT,
    owner: config.agentOwners[0] ?? null,
    topicId: config.hcsTopicId ?? null,
    policy: JSON.parse(readFileSync(config.agentPolicyFile, "utf8")),
  }),
)

approvals.get("/v1/approvals", c => c.json(store.listApprovals(AGENT).slice(0, 20).map(fresh)))

approvals.get("/v1/approvals/:id", c => {
  const a = store.getApproval(c.req.param("id"))
  return a ? c.json(fresh(a)) : c.json({ error: "no such approval" }, 404)
})

// Filed by the agent, with its token.
approvals.post("/v1/approvals", async c => {
  if (!config.agentToken || c.req.header("authorization") !== `Bearer ${config.agentToken}`) return c.json({ error: "unauthorized" }, 401)
  const b = await c.req.json<Partial<Approval>>()
  if (!b.usd || !b.amount || !b.network || !b.payTo) return c.json({ error: "usd, amount, network and payTo are required" }, 400)
  const a: Approval = {
    id: crypto.randomUUID().slice(0, 8),
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
