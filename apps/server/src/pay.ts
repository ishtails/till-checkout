import { Hono } from "hono"
import { encodeFunctionData, getAddress, isAddress, type Hex } from "viem"
import { checkoutAbi, explorerTx } from "./chain"
import { config } from "./config"
import { findMerchant } from "./merchants"
import { RelayError, rateLimit, relay } from "./relayer"
import { store } from "./store"
import { sendWebhook } from "./webhooks"

const MAX_VALIDITY_SECONDS = 600

// Orders with a relay in flight, so two clicks can't both spend gas on the same order.
const inFlight = new Set<string>()

export const pay = new Hono()

pay.post("/v1/checkout/:id/pay", rateLimit, async c => {
  const order = store.getOrder(c.req.param("id"))
  if (!order) return c.json({ error: "order not found" }, 404)

  // Rule 2: only for registered merchants.
  const merchant = findMerchant(order.merchantId)
  if (!merchant) return c.json({ error: "merchant not registered" }, 400)

  // Rule 3: only for real orders: unpaid and unexpired. The amount comes from the order, never the request.
  const now = Math.floor(Date.now() / 1000)
  if (order.status !== "open") return c.json({ error: `order is ${order.status}` }, 409)
  if (now >= order.expiresAt) return c.json({ error: "order expired" }, 410)

  const body = await c.req.json<{ payer: string; validAfter?: number; validBefore: number; signature: Hex }>()
  if (!isAddress(body.payer)) return c.json({ error: "bad payer" }, 400)
  const validAfter = BigInt(body.validAfter ?? 0)
  if (!(body.validBefore > now && body.validBefore <= now + MAX_VALIDITY_SECONDS)) {
    return c.json({ error: "validBefore must be within the next 10 minutes" }, 400)
  }

  if (inFlight.has(order.id)) return c.json({ error: "payment already in progress" }, 409)
  inFlight.add(order.id)
  try {
    const payer = getAddress(body.payer)
    const data = encodeFunctionData({
      abi: checkoutAbi,
      functionName: "pay",
      args: [order.id, merchant.evmAddress, payer, BigInt(order.amount), validAfter, BigInt(body.validBefore), body.signature],
    })
    const { hash } = await relay(merchant.id, config.checkout, data)

    order.status = "paid"
    order.payer = payer
    order.payTx = hash
    store.putOrder(order)
    void sendWebhook(merchant, { type: "order.paid", orderId: order.id, amount: order.amount, txHash: hash, ts: Date.now() })
    return c.json({ txHash: hash, explorer: explorerTx(hash) })
  } catch (err) {
    if (err instanceof RelayError) return c.json({ error: err.message }, 400)
    throw err
  } finally {
    inFlight.delete(order.id)
  }
})
