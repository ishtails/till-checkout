import { createWalletClient, ExpirationTime, jsonToPayload } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { formatUnits, http, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { config } from "./config"
import { findMerchant } from "./merchants"
import type { Order } from "./store"

// Receipts on Arkiv: one record per event (`paid`, then `refunded`), so an order's history is
// public and outlives our server. The customer's receipt page and "Your receipts" read them
// straight from Arkiv by order_id or payer. A write takes ~6 s, so it runs after the payment or
// refund is confirmed and never holds it up.
const wallet = config.arkivKey
  ? createWalletClient({ chain: tiramisu, transport: http(), account: privateKeyToAccount(config.arkivKey) })
  : undefined

export const arkivWriter = wallet?.account.address

export type ArkivEvent = { kind: "paid" } | { kind: "refunded"; amount: string; tx: Hex }

// One write at a time, so two events never race for the same nonce.
let queue = Promise.resolve()

export function saveReceipt(order: Order, event: ArkivEvent) {
  if (!wallet) return
  queue = queue.then(() => write(order, event)).catch(err => console.warn(`arkiv ${order.id} failed:`, (err as Error).message))
}

/** Resolves once every queued write has finished (for scripts). */
export const drained = () => queue

async function write(order: Order, event: ArkivEvent) {
  const merchant = findMerchant(order.merchantId)
  const usd = (atomic: string) => formatUnits(BigInt(atomic), 6)
  const receipt = {
    orderId: order.id,
    event: event.kind,
    merchant: merchant?.name ?? order.merchantId,
    description: order.description,
    amountUsd: usd(order.amount),
    token: "USDT",
    chain: "whitechain-sepolia:1874",
    payer: order.payer,
    payTx: order.payTx,
    ...(event.kind === "refunded" && { refundUsd: usd(event.amount), refundTx: event.tx }),
    refundedUsd: usd(order.refunded),
    ts: Date.now(),
  }
  const { entityKey, txHash } = await wallet!.createEntity({
    // Attribute names must be lowercase (friction.md, item 1). Addresses are lowercased so a
    // query by payer matches however the address was typed.
    attributes: {
      app: "till",
      order_id: order.id.toLowerCase(),
      payer: order.payer!.toLowerCase(),
      merchant: order.merchantId,
      event: event.kind,
    },
    payload: jsonToPayload(receipt),
    contentType: "application/json",
    expires: ExpirationTime.fromDays(365),
  })
  console.log(`arkiv ${event.kind} ${order.id} -> entity ${entityKey} tx ${txHash}`)
}
