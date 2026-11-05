// A plain script agent (no LLM yet): calls the shop's paid API and pays $0.05 in USDC on Hedera over x402.
// Run: bun --env-file=../../.env scripts/pay-hedera.ts [area]
import { x402Client } from "@x402/core/client"
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch"
import { createClientHederaSigner, PrivateKey } from "@x402/hedera"
import { ExactHederaScheme } from "@x402/hedera/exact/client"

const HEDERA = "hedera:testnet"
const signer = createClientHederaSigner(
  process.env.AGENT_HEDERA_ID!,
  PrivateKey.fromStringECDSA(process.env.AGENT_HEDERA_KEY!),
  { network: HEDERA },
)

// Only the Hedera scheme is registered, so the client picks the shop's USDC option.
// Testnet USDC is one of the library's default assets, capped at $1 a payment.
const client = x402Client.fromConfig({ schemes: [{ network: HEDERA, client: new ExactHederaScheme(signer) }] })
const paidFetch = wrapFetchWithPayment(fetch, client)

const area = process.argv[2] ?? "Bandra West"
const t = Date.now()
const res = await paidFetch(`http://localhost:3002/api/data?area=${encodeURIComponent(area)}`)
console.log(res.status, await res.json(), `${Date.now() - t} ms`)
const receipt = res.headers.get("payment-response")
if (receipt) {
  const settled = decodePaymentResponseHeader(receipt)
  console.log("paid:", settled)
  console.log(`https://hashscan.io/testnet/transaction/${settled.transaction}`)
}
