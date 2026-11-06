// Checks agent identity end to end against a running Till server: a paywalled endpoint, the agent's
// x402 client with its ERC-8004 ID in the payment's extensions, then the settlement as Till
// recorded it. Also checks that the same ID claimed by a different payer doesn't verify.
//   API_URL=http://localhost:3011 NETWORK=eip155:1874 bun --env-file=../../.env scripts/identity-check.ts
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { EXTENSION_KEY, readAgent, REGISTRY_ID, RESEARCH_AGENT_ID, verifyPayer } from "@till/identity"
import { Checkout } from "@till/sdk"
import { x402Client } from "@x402/core/client"
import { toClientEvmSigner } from "@x402/evm"
import { ExactEvmScheme } from "@x402/evm/exact/client"
import { wrapFetchWithPayment } from "@x402/fetch"
import { createClientHederaSigner, PrivateKey } from "@x402/hedera"
import { ExactHederaScheme } from "@x402/hedera/exact/client"
import { Hono } from "hono"
import type { Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const API = process.env.API_URL ?? "http://localhost:3001"
const NETWORK = (process.env.NETWORK ?? "eip155:1874") as `${string}:${string}`
const AGENT_ID = process.env.AGENT_ID ?? RESEARCH_AGENT_ID
const merchant = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../merchants.json"), "utf8"))[0]

// 1. A one-endpoint shop on the Till server under test.
const checkout = new Checkout({ apiKey: merchant.apiKey, webhookSecret: merchant.webhookSecret, baseUrl: API })
const shop = new Hono()
shop.use("/paid", checkout.paywall({ price: "0.01", description: "Identity check" }))
shop.get("/paid", c => c.json({ ok: true }))
const server = Bun.serve({ port: 0, fetch: shop.fetch })

// 2. The agent's client, with its identity attached the way wallet.ts does it.
const client =
  NETWORK === "eip155:1874"
    ? x402Client.fromConfig({
        schemes: [{ network: NETWORK, client: new ExactEvmScheme(toClientEvmSigner(privateKeyToAccount(process.env.AGENT_EVM_KEY as Hex))) }],
        spendControls: { allowedAssets: [{ network: NETWORK, asset: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", maxAmountPerPayment: "20000" }] },
      })
    : x402Client.fromConfig({
        schemes: [
          {
            network: NETWORK,
            client: new ExactHederaScheme(
              createClientHederaSigner(process.env.AGENT_HEDERA_ID!, PrivateKey.fromStringECDSA(process.env.AGENT_HEDERA_KEY!), { network: NETWORK }),
            ),
          },
        ],
      })
client.registerExtension({
  key: EXTENSION_KEY,
  enrichPaymentPayload: async p => ({ ...p, extensions: { ...p.extensions, [EXTENSION_KEY]: { registry: REGISTRY_ID, agentId: AGENT_ID } } }),
})

const res = await wrapFetchWithPayment(fetch, client)(`http://localhost:${server.port}/paid`)
console.log(`paid call on ${NETWORK}: HTTP ${res.status}`, await res.text())

// 3. What Till recorded (the check runs in the background, so give it a few seconds).
type S = { key: string; payer: string; transaction: string; network: string; agent?: unknown }
let mine: S | undefined
for (let i = 0; i < 10 && !(mine as S | undefined)?.agent; i++) {
  await Bun.sleep(1500)
  const all = (await fetch(`${API}/v1/agent-payments`).then(r => r.json())) as S[]
  mine = all.find(s => s.network === NETWORK)
}
console.log("settlement:", mine && { payer: mine.payer, transaction: mine.transaction, agent: mine.agent })

// 4. The same ID claimed by someone else's wallet.
const stranger = "0x000000000000000000000000000000000000dEaD"
console.log(`agent #${AGENT_ID} claimed by ${stranger}:`, (await verifyPayer({ registry: REGISTRY_ID, agentId: AGENT_ID }, "eip155:1874", stranger)) ?? "not verified")
console.log("registry entry:", await readAgent(AGENT_ID))
server.stop()
