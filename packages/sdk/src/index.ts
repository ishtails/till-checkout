import { createHmac, timingSafeEqual } from "node:crypto"

export type TillOrder = {
  id: string
  merchant: string
  description: string
  amount: string // USD, decimal string
  refunded: string
  status: "open" | "paid" | "refunded"
  payer?: string
  payTx?: string
  refunds: { amount: string; tx: string; ts: number }[]
}

export type TillEvent = {
  type: "order.paid" | "order.refunded"
  orderId: string
  amount: string // atomic USDT units
  txHash: string
  ts: number
}

export type CheckoutOptions = { apiKey: string; webhookSecret: string; baseUrl?: string }

/** The merchant's side of Till: create orders, read them, and check webhooks. */
export class Checkout {
  private baseUrl: string

  constructor(private options: CheckoutOptions) {
    this.baseUrl = options.baseUrl ?? "http://localhost:3001"
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      ...init,
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json", ...init?.headers },
    })
    const body = await res.json()
    if (!res.ok) throw new Error(`Till: ${body.error ?? res.status}`)
    return body as T
  }

  /** Amount in USD, e.g. "5.00". Send the customer to `checkoutUrl`. */
  createOrder(input: { amount: string; description: string; returnUrl: string; metadata?: Record<string, string> }) {
    return this.call<{ id: string; checkoutUrl: string; status: string }>("/v1/orders", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  getOrder(id: string) {
    return this.call<TillOrder>(`/v1/orders/${id}`)
  }

  /** Checks the X-Checkout-Signature HMAC over the raw body. Throws if it doesn't match. */
  async verifyWebhook(request: Request): Promise<TillEvent> {
    const body = await request.text()
    const given = Buffer.from(request.headers.get("x-checkout-signature") ?? "", "hex")
    const expected = createHmac("sha256", this.options.webhookSecret).update(body).digest()
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new Error("Till: bad webhook signature")
    }
    return JSON.parse(body)
  }
}
