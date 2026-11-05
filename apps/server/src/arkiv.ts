import { receiptWriter } from "@till/receipts"
import { formatUnits, type Hex } from "viem"
import { config } from "./config"
import { findMerchant } from "./merchants"
import type { Order } from "./store"

// Receipts on Arkiv: one record per event (`paid`, then `refunded`), so an order's history is
// public and outlives our server. The customer's receipt page and "Your receipts" read them
// straight from Arkiv by order_id or payer. A write takes a few seconds, so it runs after the
// payment or refund is confirmed and never holds it up. Schema: packages/receipts.
const writer = config.arkivKey ? receiptWriter(config.arkivKey, config.arkivAccessKey) : undefined

export type ArkivEvent = { kind: "paid"; at: number } | { kind: "refunded"; amount: string; tx: Hex; at: number }

// One write at a time, so two events never race for the same nonce.
let queue = Promise.resolve()

export function saveReceipt(order: Order, event: ArkivEvent) {
  if (!writer) return
  queue = queue.then(() => write(order, event)).catch(err => console.warn(`arkiv ${order.id} failed:`, (err as Error).message))
}

/** Resolves once every queued write has finished (for scripts). */
export const drained = () => queue

async function write(order: Order, event: ArkivEvent) {
  const usd = (atomic: string) => formatUnits(BigInt(atomic), 6)
  const { entityKey, txHash } = await writer!.write({
    orderId: order.id,
    payer: order.payer!,
    merchant: order.merchantId,
    event: event.kind,
    merchantName: findMerchant(order.merchantId)?.name ?? order.merchantId,
    description: order.description,
    amountUsd: usd(order.amount),
    refundedUsd: usd(order.refunded),
    payTx: order.payTx!,
    ...(event.kind === "refunded" && { refundUsd: usd(event.amount), refundTx: event.tx }),
    eventTime: Math.floor(event.at / 1000),
  })
  console.log(`arkiv ${event.kind} ${order.id} -> entity ${entityKey} tx ${txHash}`)
}
