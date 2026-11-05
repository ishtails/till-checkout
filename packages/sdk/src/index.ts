import { createHmac, timingSafeEqual } from "node:crypto"
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server"
import { ExactEvmScheme } from "@x402/evm/exact/server"
import { ExactHederaScheme } from "@x402/hedera/exact/server"
import { paymentMiddleware } from "@x402/hono"
import type { MiddlewareHandler } from "hono"

const WHITECHAIN = "eip155:1874"
const WHITECHAIN_USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"
const HEDERA = "hedera:testnet"
const HEDERA_USDC = "0.0.429274"
const toAtomic = (usd: string) => String(Math.round(Number(usd) * 1e6))

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

  private merchant?: Promise<{ payTo: Record<string, string> }>
  private payTo = async (network: string) => {
    this.merchant ??= this.call("/v1/merchant")
    return (await this.merchant).payTo[network]
  }

  /**
   * Charges per request over x402: unpaid calls get a 402 with the price, paid ones go through.
   * The agent picks USDT on Whitechain or USDC on Hedera. Either way it settles through Till's facilitator,
   * straight to the merchant.
   */
  paywall({ price, description }: { price: string; description: string }): MiddlewareHandler {
    const server = new x402ResourceServer([new HTTPFacilitatorClient({ url: `${this.baseUrl}/facilitator` })])
      .register(WHITECHAIN, new ExactEvmScheme())
      .register(HEDERA, new ExactHederaScheme())
    return paymentMiddleware(
      {
        description,
        mimeType: "application/json",
        accepts: [
          {
            scheme: "exact",
            network: WHITECHAIN,
            payTo: () => this.payTo(WHITECHAIN),
            // The token has no version(); its EIP-712 domain is { "Tether USD", "1" }.
            price: { asset: WHITECHAIN_USDT, amount: toAtomic(price), extra: { name: "Tether USD", version: "1" } },
            maxTimeoutSeconds: 300,
          },
          {
            scheme: "exact",
            network: HEDERA,
            payTo: () => this.payTo(HEDERA),
            price: { asset: HEDERA_USDC, amount: toAtomic(price) },
            // A Hedera transaction is only valid for 120 s after it's signed. The fee payer comes from the facilitator.
            maxTimeoutSeconds: 120,
          },
        ],
      },
      server,
    )
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
