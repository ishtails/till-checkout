import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Policy } from "@till/guard"
import { applyLimits, limitsMessage, limitsProblem, type SignedLimits } from "@till/guard/limits"
import { verifyMessage, type Hex } from "viem"

// The agent's policy: the file's merchants and payees, with the limits its owner last set on the
// console. Those limits come from Till, but the agent only uses them if one of its owners' wallets
// signed them (AGENT_OWNER), so Till itself can't loosen them. It also keeps the newest signed set
// it has accepted, so Till can't swap in an older, looser one either. With nothing signed, it uses
// the file.
const AGENT = "research-agent"
const API = process.env.TILL_API_URL ?? "http://localhost:3001"
const seenFile = resolve(import.meta.dir, "../../../data/agent-limits.json")

/** The wallets whose signatures count, for the agent's limits and for approvals. */
export const owners = (process.env.AGENT_OWNER ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)

export const filePolicy = (): Policy => JSON.parse(readFileSync(resolve(import.meta.dir, "../policy.json"), "utf8"))

async function ownerSigned(base: Policy, s: SignedLimits) {
  if (!owners.includes(s.by.toLowerCase()) || limitsProblem(base, s.limits) || Number.isNaN(Date.parse(s.issuedAt))) return false
  return verifyMessage({ address: s.by as Hex, message: limitsMessage(AGENT, s.limits, s.issuedAt), signature: s.signature as Hex }).catch(() => false)
}

const newer = (a: SignedLimits, b: SignedLimits) => Date.parse(a.issuedAt) > Date.parse(b.issuedAt)

function lastSeen(): SignedLimits | undefined {
  try {
    return existsSync(seenFile) ? (JSON.parse(readFileSync(seenFile, "utf8")) as SignedLimits) : undefined
  } catch {
    return undefined
  }
}

/** The policy to check this payment against. */
export async function currentPolicy(): Promise<Policy> {
  const base = filePolicy()
  const seen = lastSeen()
  const kept = seen && (await ownerSigned(base, seen)) ? seen : undefined

  let served: SignedLimits | null | undefined
  try {
    served = ((await fetch(`${API}/v1/agent`).then(r => r.json())) as { limits: SignedLimits | null }).limits
  } catch (err) {
    console.error("couldn't read limits from Till:", (err as Error).message)
  }
  const fromTill = served && (await ownerSigned(base, served)) ? served : undefined
  if (served && !fromTill) console.error("limits from Till aren't signed by the owner: ignoring them")

  if (fromTill && (!kept || newer(fromTill, kept))) {
    writeFileSync(seenFile, JSON.stringify(fromTill, null, 2))
    return applyLimits(base, fromTill.limits)
  }
  if (kept) {
    if (fromTill && newer(kept, fromTill)) console.error(`Till served limits from ${fromTill.issuedAt}, older than the owner's newest (${kept.issuedAt}): using the newest`)
    return applyLimits(base, kept.limits)
  }
  return base
}
