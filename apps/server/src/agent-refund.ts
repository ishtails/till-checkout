import { Hono } from "hono"
import { encodeFunctionData, parseUnits, toHex, type Address, type Hex } from "viem"
import { explorerTx, usdtAbi } from "./chain"
import { config } from "./config"
import { RelayError, rateLimit, relay } from "./relayer"
import { store } from "./store"

// Refunds for agent payments on Whitechain. An x402 payment went straight from the agent's wallet to
// the merchant's, so a refund is the reverse: the merchant signs a USDT transfer back to the agent
// (EIP-3009, no gas for them) and our relayer submits it. Like checkout refunds, the total can't
// pass what was paid. Hedera payments are refunded from the merchant's own Hedera wallet.
const WHITECHAIN = "eip155:1874"
const MAX_VALIDITY_SECONDS = 600
const inFlight = new Set<string>()

const domain = () => ({ name: "Tether USD", version: "1", chainId: 1874, verifyingContract: config.usdt })

export const agentRefund = new Hono()

// What the dashboard needs to build the merchant's TransferWithAuthorization for the next refund.
agentRefund.get("/v1/agent-payments/:key/refund", c => {
  const s = store.getSettlement(c.req.param("key"))
  if (!s) return c.json({ error: "payment not found" }, 404)
  if (s.network !== WHITECHAIN) return c.json({ error: "only Whitechain payments can be refunded here" }, 400)
  return c.json({
    from: s.payTo,
    to: s.payer,
    remainingAtomic: (BigInt(s.amount) - BigInt(s.refunded ?? "0")).toString(),
    nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
    validBefore: Math.floor(Date.now() / 1000) + 300,
    domain: domain(),
  })
})

agentRefund.post("/v1/agent-payments/:key/refund", rateLimit, async c => {
  const key = c.req.param("key")
  const s = store.getSettlement(key)
  if (!s) return c.json({ error: "payment not found" }, 404)
  if (s.network !== WHITECHAIN) return c.json({ error: "only Whitechain payments can be refunded here" }, 400)

  const body = await c.req.json<{ amount: string; nonce: Hex; validBefore: number; signature: Hex }>()
  const amount = parseUnits(body.amount, 6)
  const left = BigInt(s.amount) - BigInt(s.refunded ?? "0")
  if (amount <= 0n || amount > left) return c.json({ error: "refund must be more than 0 and at most what's left" }, 400)
  const now = Math.floor(Date.now() / 1000)
  if (!(body.validBefore > now && body.validBefore <= now + MAX_VALIDITY_SECONDS)) {
    return c.json({ error: "validBefore must be within the next 10 minutes" }, 400)
  }

  if (inFlight.has(key)) return c.json({ error: "refund already in progress" }, 409)
  inFlight.add(key)
  try {
    // From the merchant's wallet that was paid, back to the agent's: the signature only works for exactly this.
    const data = encodeFunctionData({
      abi: usdtAbi,
      functionName: "transferWithAuthorization",
      args: [s.payTo as Address, s.payer as Address, amount, 0n, BigInt(body.validBefore), body.nonce, body.signature],
    })
    const { hash } = await relay(s.merchantId, config.usdt, data)
    store.putSettlement({
      ...s,
      refunded: (BigInt(s.refunded ?? "0") + amount).toString(),
      refunds: [...(s.refunds ?? []), { amount: amount.toString(), tx: hash, ts: Date.now() }],
    })
    return c.json({ txHash: hash, explorer: explorerTx(hash) })
  } catch (err) {
    if (err instanceof RelayError) return c.json({ error: err.message }, 400)
    throw err
  } finally {
    inFlight.delete(key)
  }
})
