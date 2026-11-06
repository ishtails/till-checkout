// Signs and sets the agent's limits on live as the test owner: `raise` for the test runs, `reset` for the file's values.
import { limitsMessage, limitsOf } from "@till/guard/limits"
import { privateKeyToAccount } from "viem/accounts"
import { filePolicy } from "../../agent/src/policy"

const API = process.env.API_URL ?? "http://localhost:3001"
const owner = privateKeyToAccount(process.env.MERCHANT_TEMP_PRIVATE_KEY as `0x${string}`)
const base = limitsOf(filePolicy())
const limits = process.argv[2] === "raise" ? { ...base, dailyBudgetUsd: 3, merchants: { Brickline: { ...base.merchants.Brickline, dailyCapUsd: 2 } } } : base
const issuedAt = new Date().toISOString()
const signature = await owner.signMessage({ message: limitsMessage("research-agent", limits, issuedAt) })
const res = await fetch(`${API}/v1/agent/limits`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ limits, issuedAt, address: owner.address, signature }),
})
console.log(process.argv[2], res.status, JSON.stringify((await res.json()).policy ?? {}).slice(0, 160))
