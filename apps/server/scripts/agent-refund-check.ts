// Refunds part of an agent payment on Whitechain against a running server: a stranger's signature
// is refused, the paid merchant's goes through, and the total can't pass what was paid. Needs an
// agent payment paid to MERCHANT_TEMP_ADDRESS (whose key we hold).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const API = process.env.API_URL ?? "http://localhost:3001"
const merchant = privateKeyToAccount(process.env.MERCHANT_TEMP_PRIVATE_KEY as `0x${string}`)
const stranger = privateKeyToAccount(generatePrivateKey())
const AMOUNT = process.argv[2] ?? "0.01"

type Payment = { key: string; network: string; payTo: string; amount: string; refunded?: string }
type Info = { from: `0x${string}`; to: `0x${string}`; remainingAtomic: string; nonce: `0x${string}`; validBefore: number; domain: never }

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

const payments = (await fetch(`${API}/v1/agent-payments`).then(r => r.json())) as Payment[]
const p = payments.find(x => x.network === "eip155:1874" && x.payTo.toLowerCase() === merchant.address.toLowerCase())
if (!p) throw new Error("no Whitechain agent payment paid to MERCHANT_TEMP_ADDRESS")
const url = `${API}/v1/agent-payments/${encodeURIComponent(p.key)}/refund`

async function attempt(who: typeof merchant, amount: string) {
  const info = (await fetch(url).then(r => r.json())) as Info
  const value = BigInt(Math.round(Number(amount) * 1e6))
  const signature = await who.signTypedData({
    domain: info.domain,
    types,
    primaryType: "TransferWithAuthorization",
    message: { from: info.from, to: info.to, value, validAfter: 0n, validBefore: BigInt(info.validBefore), nonce: info.nonce },
  })
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount, nonce: info.nonce, validBefore: info.validBefore, signature }),
  })
  return { status: res.status, ...(await res.json()) }
}

console.log("payment:", p.key.slice(0, 40) + "…", `$${Number(p.amount) / 1e6} paid, $${Number(p.refunded ?? 0) / 1e6} refunded`)
console.log("stranger signs:", await attempt(stranger, AMOUNT))
console.log("more than was paid:", await attempt(merchant, "1"))
console.log("merchant signs:", await attempt(merchant, AMOUNT))
const after = ((await fetch(`${API}/v1/agent-payments`).then(r => r.json())) as Payment[]).find(x => x.key === p.key)!
console.log("now refunded:", `$${Number(after.refunded ?? 0) / 1e6}`)
