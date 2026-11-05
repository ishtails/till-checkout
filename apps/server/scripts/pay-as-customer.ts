// Plays the customer end to end against a running server: create an order as the shop,
// sign the ReceiveWithAuthorization as the customer (who holds no WBT), and hand it to the relayer.
// Run: bun --env-file=../../.env scripts/pay-as-customer.ts [amountUsd]
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const api = process.env.API_URL ?? "http://localhost:3001"
const [merchant] = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../merchants.json"), "utf8"))
const customer = privateKeyToAccount(process.env.CUSTOMER_PRIVATE_KEY as Hex)
const amount = process.argv[2] ?? "0.10"

const order = await fetch(`${api}/v1/orders`, {
  method: "POST",
  headers: { authorization: `Bearer ${merchant.apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({ amount, description: "Test order", returnUrl: "http://localhost:3002/thanks" }),
}).then(r => r.json())
console.log("order", order.id)

const co = await fetch(`${api}/v1/checkout/${order.id}`).then(r => r.json())

const signature = await customer.signTypedData({
  domain: co.domain,
  types: {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "ReceiveWithAuthorization",
  message: {
    from: customer.address,
    to: co.contract,
    value: BigInt(co.amountAtomic),
    validAfter: 0n,
    validBefore: BigInt(co.validBefore),
    nonce: co.nonce,
  },
})

const t = Date.now()
const res = await fetch(`${api}/v1/checkout/${order.id}/pay`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ payer: customer.address, validAfter: 0, validBefore: co.validBefore, signature }),
}).then(r => r.json())
console.log(res, `${Date.now() - t} ms`)
