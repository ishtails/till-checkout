// Checks the owner's editable limits against a running server: only the owner can set them, a
// stale or nonsense change is refused, and the agent uses them only when the owner's signature checks
// out. Ends by putting the limits back to the policy file's values.
import { limitsMessage, limitsOf, type Limits } from "@till/guard/limits"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { currentPolicy, filePolicy } from "../../agent/src/policy"

const API = process.env.API_URL ?? "http://localhost:3001"
const owner = privateKeyToAccount(process.env.MERCHANT_TEMP_PRIVATE_KEY as `0x${string}`)
const stranger = privateKeyToAccount(generatePrivateKey())

async function put(who: typeof owner, limits: Limits, issuedAt = new Date().toISOString()) {
  const signature = await who.signMessage({ message: limitsMessage("research-agent", limits, issuedAt) })
  const res = await fetch(`${API}/v1/agent/limits`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limits, issuedAt, address: who.address, signature }),
  })
  return { status: res.status, error: ((await res.json()) as { error?: string }).error }
}

const base = limitsOf(filePolicy())
const looser = { ...base, approvalAboveUsd: 0.3 }
console.log("stranger:", await put(stranger, looser))
console.log("auto-pay above budget:", await put(owner, { ...base, approvalAboveUsd: 5 }))
console.log("old signature:", await put(owner, looser, new Date(Date.now() - 10 * 60_000).toISOString()))
console.log("owner:", await put(owner, looser))
const info = await fetch(`${API}/v1/agent`).then(r => r.json())
console.log("Till now says auto-pay up to:", info.policy.approvalAboveUsd, "set by", info.limits?.by)
console.log("agent uses:", (await currentPolicy()).approvalAboveUsd)
await Bun.sleep(5) // a later issuedAt than the change above
console.log("put back:", await put(owner, base), "agent uses:", (await currentPolicy()).approvalAboveUsd)
