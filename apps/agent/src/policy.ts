import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Policy } from "@till/guard"
import { applyLimits, limitsMessage, limitsProblem, type SignedLimits } from "@till/guard/limits"
import { verifyMessage, type Hex } from "viem"

// The agent's policy: the file's merchants and payees, with the limits its owner last set on the
// console. Those limits come from Till, but the agent only uses them if the owner's wallet signed
// them (AGENT_OWNER), so Till itself can't loosen them. Anything else falls back to the file.
const AGENT = "research-agent"
const API = process.env.TILL_API_URL ?? "http://localhost:3001"
const owners = (process.env.AGENT_OWNER ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)

export const filePolicy = (): Policy => JSON.parse(readFileSync(resolve(import.meta.dir, "../policy.json"), "utf8"))

async function ownerSigned(base: Policy, s: SignedLimits) {
  if (!owners.includes(s.by.toLowerCase()) || limitsProblem(base, s.limits)) return false
  return verifyMessage({ address: s.by as Hex, message: limitsMessage(AGENT, s.limits, s.issuedAt), signature: s.signature as Hex }).catch(() => false)
}

/** The policy to check this payment against. */
export async function currentPolicy(): Promise<Policy> {
  const base = filePolicy()
  try {
    const { limits } = (await fetch(`${API}/v1/agent`).then(r => r.json())) as { limits: SignedLimits | null }
    if (limits && (await ownerSigned(base, limits))) return applyLimits(base, limits.limits)
    if (limits) console.error("limits from Till aren't signed by the owner: using the file")
  } catch (err) {
    console.error("couldn't read limits from Till: using the file:", (err as Error).message)
  }
  return base
}
