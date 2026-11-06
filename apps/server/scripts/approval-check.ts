// Checks human approval against a running server: the agent files a request under its own ID, a
// stranger and a forged signature can't answer it, the owner can, once, and an ID can't be reused.
// With `approve` or `deny` as the argument it instead answers the newest pending request, for agent
// runs. It signs with OWNER_PRIVATE_KEY (default: the MERCHANT_TEMP test key), so run it against a
// local server whose AGENT_OWNER lists that key; the live agent's owners are real wallets only.
import { decisionMessage, newApprovalId } from "@till/guard/approvals"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const API = process.env.API_URL ?? "http://localhost:3001"
const owner = privateKeyToAccount((process.env.OWNER_PRIVATE_KEY ?? process.env.MERCHANT_TEMP_PRIVATE_KEY) as `0x${string}`)
const stranger = privateKeyToAccount(generatePrivateKey())

type Approval = { id: string; agent: string; usd: string; merchant?: string; payTo: string; status: string; by?: string; error?: string }

async function answer(a: Approval, d: "approve" | "deny", who = owner, sig?: string) {
  const signature = sig ?? (await who.signMessage({ message: decisionMessage(a, d) }))
  const res = await fetch(`${API}/v1/approvals/${a.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: d, address: who.address, signature }),
  })
  return { status: res.status, body: (await res.json()) as Approval }
}

const mode = process.argv[2]
if (mode === "approve" || mode === "deny") {
  // Wait for the agent's request, then answer it.
  for (;;) {
    const pending = ((await fetch(`${API}/v1/approvals`).then(r => r.json())) as Approval[]).find(a => a.status === "pending")
    if (pending) {
      const r = await answer(pending, mode)
      console.log(`${mode}d ${pending.id} ($${pending.usd} to ${pending.merchant}):`, r.status, r.body.status ?? r.body.error)
      break
    }
    await Bun.sleep(1000)
  }
  process.exit(0)
}

const file = (token?: string, approvalId: string = newApprovalId()) =>
  fetch(`${API}/v1/approvals`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ approvalId, usd: "0.25", amount: "250000", network: "eip155:1874", payTo: "0x2A50c1fC157B10404A6BD4197B98c665684915D7", merchant: "Brickline", resource: "check" }),
  })

console.log("no token:", (await file()).status)
const id = newApprovalId()
const a = (await (await file(process.env.AGENT_TOKEN, id)).json()) as Approval
console.log("filed under the agent's ID:", a.id === id, a.status)
console.log("same ID again:", (await file(process.env.AGENT_TOKEN, id)).status)
console.log("malformed ID:", (await file(process.env.AGENT_TOKEN, "abc")).status)
console.log("stranger:", (await answer(a, "approve", stranger)).body.error)
const forged = await stranger.signMessage({ message: decisionMessage(a, "approve") })
console.log("owner's address, stranger's signature:", (await answer(a, "approve", owner, forged)).body.error)
const ok = await answer(a, "approve")
console.log("owner:", ok.status, ok.body.status, ok.body.by)
console.log("again:", (await answer(a, "deny")).body.error)
const info = await fetch(`${API}/v1/agent`).then(r => r.json())
console.log("agent info:", { owner: info.owner, topicId: info.topicId, autoPayUpTo: info.policy.approvalAboveUsd })
