import { createHmac } from "node:crypto"
import type { Merchant } from "./merchants"

export type WebhookEvent = {
  type: "order.paid" | "order.refunded"
  orderId: string
  amount: string
  txHash: string
  ts: number
}

// Sent once. The shop also reads the order on the returnUrl redirect, so a missed webhook doesn't break the demo.
export async function sendWebhook(merchant: Merchant, event: WebhookEvent) {
  const body = JSON.stringify(event)
  const signature = createHmac("sha256", merchant.webhookSecret).update(body).digest("hex")
  try {
    const res = await fetch(merchant.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-checkout-signature": signature },
      body,
    })
    console.log(`webhook ${event.type} ${event.orderId} -> ${res.status}`)
  } catch (err) {
    console.warn(`webhook ${event.type} ${event.orderId} failed:`, (err as Error).message)
  }
}
