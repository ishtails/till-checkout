// Tops up Brickline's gas tank with a small USDT transfer signed by MERCHANT_TEMP (any wallet may
// top a tank up) against a running server, and prints the tank before and after.
import { privateKeyToAccount } from "viem/accounts"

const API = process.env.API_URL ?? "http://localhost:3001"
const payer = privateKeyToAccount(process.env.MERCHANT_TEMP_PRIVATE_KEY as `0x${string}`)
const AMOUNT = process.argv[2] ?? "0.10"

type Tank = {
  balanceUsd: number
  txLeft: number | null
  topup: { to: `0x${string}`; nonce: `0x${string}`; validBefore: number; domain: never }
}
const read = () => fetch(`${API}/v1/gas-tank?merchant=data-shop`).then(r => r.json()) as Promise<Tank>

const before = await read()
console.log("before:", `$${before.balanceUsd.toFixed(4)}`, `${before.txLeft} transactions left`)
const value = BigInt(Math.round(Number(AMOUNT) * 1e6))
const signature = await payer.signTypedData({
  domain: before.topup.domain,
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: { from: payer.address, to: before.topup.to, value, validAfter: 0n, validBefore: BigInt(before.topup.validBefore), nonce: before.topup.nonce },
})
const res = await fetch(`${API}/v1/gas-tank/topup`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ merchant: "data-shop", from: payer.address, amount: AMOUNT, nonce: before.topup.nonce, validBefore: before.topup.validBefore, signature }),
})
const body = await res.json()
console.log("top up:", res.status, body.explorer ?? body.error)
const after = await read()
console.log("after:", `$${after.balanceUsd.toFixed(4)}`, `${after.txLeft} transactions left`)
