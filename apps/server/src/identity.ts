import { EXTENSION_KEY, verifyPayer, type AgentClaim } from "@till/identity"
import type { PaymentPayload } from "@x402/core/types"
import { store, type Settlement } from "./store"

// Agent identity on settled payments. An agent may name its ERC-8004 entry (Hedera testnet) in the
// payment's extensions. That claim is unsigned, so it counts only if the registry says the payer
// is that agent's wallet, which the wallet itself signed when it was set. Checked after the
// payment settles, so a slow registry read never holds a payment up; the dashboard shows the
// result as "Verified agent #N".

export function claimOf(payload: PaymentPayload): AgentClaim | undefined {
  const c = payload.extensions?.[EXTENSION_KEY] as Partial<AgentClaim> | undefined
  return typeof c?.registry === "string" && typeof c?.agentId === "string" ? { registry: c.registry, agentId: c.agentId } : undefined
}

/** Checks the payment's claimed identity and, if it holds, records it on the settlement. */
export async function identify(settlement: Settlement, payload: PaymentPayload) {
  const claim = claimOf(payload)
  if (!claim) return
  try {
    const agent = await verifyPayer(claim, settlement.network, settlement.payer)
    const latest = store.getSettlement(settlement.key) ?? settlement
    store.putSettlement({
      ...latest,
      agent: agent ? { agentId: agent.agentId, owner: agent.owner, registry: agent.registry, verified: true } : { agentId: claim.agentId, registry: claim.registry, verified: false },
    })
    console.log(`identity: payment ${settlement.key.slice(0, 18)}… from agent #${claim.agentId}: ${agent ? `verified, owner ${agent.owner}` : "doesn't match the registry"}`)
  } catch (err) {
    console.warn("identity check failed:", (err as Error).message)
  }
}
