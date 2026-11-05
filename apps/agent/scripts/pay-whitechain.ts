// A plain script agent (no LLM yet): calls the shop's paid API and pays $0.05 in USDT on Whitechain over x402.
// Run: bun --env-file=../../.env scripts/pay-whitechain.ts [area]
import { x402Client } from "@x402/core/client"
import { toClientEvmSigner } from "@x402/evm"
import { ExactEvmScheme } from "@x402/evm/exact/client"
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch"
import type { Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const WHITECHAIN = "eip155:1874"
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"
const agent = privateKeyToAccount(process.env.AGENT_EVM_KEY as Hex)

const client = x402Client.fromConfig({
  schemes: [{ network: WHITECHAIN, client: new ExactEvmScheme(toClientEvmSigner(agent)) }],
  // Whitechain USDT isn't one of the library's default assets; allow it, capped at $1 a payment.
  spendControls: { allowedAssets: [{ network: WHITECHAIN, asset: USDT, maxAmountPerPayment: "1000000" }] },
})
const paidFetch = wrapFetchWithPayment(fetch, client)

const area = process.argv[2] ?? "Bandra West"
const t = Date.now()
const res = await paidFetch(`http://localhost:3002/api/data?area=${encodeURIComponent(area)}`)
console.log(res.status, await res.json(), `${Date.now() - t} ms`)
const receipt = res.headers.get("payment-response")
if (receipt) {
  const settled = decodePaymentResponseHeader(receipt)
  console.log("paid:", settled)
  console.log(`https://explorer.testnet.whitechain.io/tx/${settled.transaction}`)
}
