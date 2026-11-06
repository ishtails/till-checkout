import { Hono } from "hono"
import { bytesToHex, encodeAbiParameters, formatUnits, keccak256, parseUnits } from "viem"
import { config } from "./config"
import { findMerchant, findMerchantByKey, type Merchant } from "./merchants"
import { signInBase } from "./signin"
import { store, type Order } from "./store"

const MIN_USD = 0.01
const MAX_USD = 10

export const usd = (atomic: string) => formatUnits(BigInt(atomic), 6)

// Same as Checkout.payNonce: the customer's signature is bound to this order and merchant.
export const payNonce = (order: Order, merchant: Merchant) =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [order.id, merchant.evmAddress]))

// Same as Checkout.refundNonce: good for exactly one refund step of one order.
export const refundNonce = (order: Order) =>
  keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "string" }, { type: "uint256" }],
      [order.id, "refund", BigInt(order.refunded)],
    ),
  )

export function publicOrder(order: Order) {
  return {
    id: order.id,
    merchant: findMerchant(order.merchantId)?.name,
    description: order.description,
    amount: usd(order.amount),
    refunded: usd(order.refunded),
    status: order.status,
    payer: order.payer,
    paidTo: order.paidTo,
    payTx: order.payTx,
    refunds: order.refunds.map(r => ({ amount: usd(r.amount), tx: r.tx, ts: r.ts })),
    returnUrl: order.returnUrl,
    createdAt: order.createdAt,
  }
}

function merchantFromAuth(header: string | undefined) {
  const key = header?.replace(/^Bearer /, "")
  return key ? findMerchantByKey(key) : undefined
}

export const orders = new Hono()

orders.post("/v1/orders", async c => {
  const merchant = merchantFromAuth(c.req.header("authorization"))
  if (!merchant) return c.json({ error: "bad api key" }, 401)

  const body = await c.req.json<{ amount: string; description: string; returnUrl: string; metadata?: Record<string, string> }>()
  const amountUsd = Number(body.amount)
  if (!(amountUsd >= MIN_USD && amountUsd <= MAX_USD)) {
    return c.json({ error: `amount must be between ${MIN_USD} and ${MAX_USD} USD` }, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  const order: Order = {
    id: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    merchantId: merchant.id,
    amount: parseUnits(body.amount, 6).toString(),
    description: body.description,
    returnUrl: body.returnUrl,
    metadata: body.metadata,
    status: "open",
    createdAt: now,
    expiresAt: now + config.orderTtlSeconds,
    refunded: "0",
    refunds: [],
  }
  store.putOrder(order)
  return c.json({ id: order.id, checkoutUrl: `${config.payAppUrl}/checkout/${order.id}`, status: order.status })
})

orders.get("/v1/orders/:id", c => {
  const order = store.getOrder(c.req.param("id"))
  return order ? c.json(publicOrder(order)) : c.json({ error: "not found" }, 404)
})

orders.get("/v1/orders", c => {
  const merchantId = c.req.query("merchant")
  if (!merchantId) return c.json({ error: "merchant required" }, 400)
  return c.json(store.listOrders(merchantId).map(publicOrder))
})

orders.get("/v1/merchant", c => {
  const merchant = merchantFromAuth(c.req.header("authorization"))
  if (!merchant) return c.json({ error: "bad api key" }, 401)
  return c.json({
    id: merchant.id,
    name: merchant.name,
    signInUrl: `${signInBase()}?merchant=${merchant.id}`,
    payTo: { "eip155:1874": merchant.evmAddress, "hedera:testnet": merchant.hederaAccountId },
  })
})

// Everything the pay page needs to build the customer's ReceiveWithAuthorization typed data.
orders.get("/v1/checkout/:id", c => {
  const order = store.getOrder(c.req.param("id"))
  if (!order) return c.json({ error: "not found" }, 404)
  const merchant = findMerchant(order.merchantId)!
  return c.json({
    ...publicOrder(order),
    merchantName: merchant.name,
    amountAtomic: order.amount,
    token: config.usdt,
    contract: config.checkout,
    chainId: 1874,
    merchantAddress: merchant.evmAddress,
    nonce: payNonce(order, merchant),
    validBefore: Math.min(Math.floor(Date.now() / 1000) + 300, order.expiresAt),
    domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: config.usdt },
  })
})
