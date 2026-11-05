import { Hono } from "hono"
import { encodeFunctionData, parseUnits, type Hex } from "viem"
import { saveReceipt } from "./arkiv"
import { checkoutAbi, explorerTx, publicClient } from "./chain"
import { config } from "./config"
import { findMerchant } from "./merchants"
import { refundNonce } from "./orders"
import { RelayError, rateLimit, relay } from "./relayer"
import { store } from "./store"
import { sendWebhook } from "./webhooks"

const MAX_VALIDITY_SECONDS = 600

// Orders with a refund in flight, so two clicks can't both spend gas.
const inFlight = new Set<string>()

/** Who was paid and how much is left to refund, read from the contract: the chain is the record. */
async function onChain(orderId: Hex) {
  const [, merchant, amount, refunded] = await publicClient.readContract({
    address: config.checkout,
    abi: checkoutAbi,
    functionName: "orders",
    args: [orderId],
  })
  return { merchant, remaining: amount - refunded }
}

export const refund = new Hono()

// Everything the dashboard needs to build the merchant's ReceiveWithAuthorization for the next refund.
refund.get("/v1/orders/:id/refund", async c => {
  const order = store.getOrder(c.req.param("id"))
  if (!order || order.status === "open") return c.json({ error: "order not paid" }, 404)
  const { merchant, remaining } = await onChain(order.id)
  return c.json({
    from: merchant,
    to: config.checkout,
    remainingAtomic: remaining.toString(),
    nonce: refundNonce(order),
    validBefore: Math.floor(Date.now() / 1000) + 300,
    domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: config.usdt },
  })
})

refund.post("/v1/orders/:id/refund", rateLimit, async c => {
  const order = store.getOrder(c.req.param("id"))
  if (!order) return c.json({ error: "order not found" }, 404)
  const merchant = findMerchant(order.merchantId)
  if (!merchant) return c.json({ error: "merchant not registered" }, 400)
  if (order.status === "open") return c.json({ error: "order not paid" }, 409)

  const body = await c.req.json<{ amount: string; validAfter?: number; validBefore: number; signature: Hex }>()
  const amount = parseUnits(body.amount, 6)
  const left = BigInt(order.amount) - BigInt(order.refunded)
  // Rule 3: refunds only up to what was paid (the contract enforces it too).
  if (amount <= 0n || amount > left) return c.json({ error: "refund must be more than 0 and at most what's left" }, 400)
  const now = Math.floor(Date.now() / 1000)
  if (!(body.validBefore > now && body.validBefore <= now + MAX_VALIDITY_SECONDS)) {
    return c.json({ error: "validBefore must be within the next 10 minutes" }, 400)
  }

  if (inFlight.has(order.id)) return c.json({ error: "refund already in progress" }, 409)
  inFlight.add(order.id)
  try {
    const data = encodeFunctionData({
      abi: checkoutAbi,
      functionName: "refund",
      args: [order.id, amount, BigInt(body.validAfter ?? 0), BigInt(body.validBefore), body.signature],
    })
    const { hash } = await relay(merchant.id, config.checkout, data)

    order.refunded = (BigInt(order.refunded) + amount).toString()
    order.refunds.push({ amount: amount.toString(), tx: hash, ts: Date.now() })
    if (order.refunded === order.amount) order.status = "refunded"
    store.putOrder(order)
    saveReceipt(order, { kind: "refunded", amount: amount.toString(), tx: hash })
    void sendWebhook(merchant, { type: "order.refunded", orderId: order.id, amount: amount.toString(), txHash: hash, ts: Date.now() })
    return c.json({ txHash: hash, explorer: explorerTx(hash) })
  } catch (err) {
    if (err instanceof RelayError) return c.json({ error: err.message }, 400)
    throw err
  } finally {
    inFlight.delete(order.id)
  }
})
