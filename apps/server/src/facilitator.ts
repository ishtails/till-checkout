import { x402Facilitator } from "@x402/core/facilitator"
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types"
import { toFacilitatorEvmSigner } from "@x402/evm"
import { ExactEvmScheme } from "@x402/evm/exact/facilitator"
import { Hono } from "hono"
import type { Hex } from "viem"
import { relayer, relayerClient } from "./chain"
import { config } from "./config"
import { findMerchantByPayTo } from "./merchants"
import { capReached, recordFee } from "./relayer"
import { store } from "./store"

// Our x402 facilitator (D2: the same service and hot wallet as the relayer).
// The library checks signature, recipient, amount, validity window, unused nonce, balance and simulates.
// Our checks below run first, in this order (design/04_low_level.md §1).

const WHITECHAIN = "eip155:1874"
const assets: Record<string, string> = { [WHITECHAIN]: config.usdt.toLowerCase() }
const MIN_ATOMIC = 10_000n // $0.01
const MAX_ATOMIC = 10_000_000n // $10
const MAX_TIMEOUT_SECONDS = 300

type EvmAuthorization = { from: string; nonce: string; validBefore: string }

/** The replay / idempotency key: (payer, nonce) for EVM. */
function settlementKey(payload: PaymentPayload) {
  const auth = (payload.payload as { authorization?: EvmAuthorization }).authorization
  if (auth) return `${payload.accepted.network}:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`
  throw new Error("unsupported payload")
}

function ourChecks({ paymentPayload, requirements: r }: { paymentPayload: PaymentPayload; requirements: PaymentRequirements }) {
  const reasons: string[] = []
  // 1. Our networks and our assets only.
  if (assets[r.network] !== r.asset.toLowerCase()) reasons.push(`asset ${r.asset} on ${r.network} not accepted`)
  // 2. payTo must be a registered merchant: we only pay gas for our merchants.
  const merchant = findMerchantByPayTo(r.payTo)
  if (!merchant) reasons.push(`payTo ${r.payTo} is not a registered merchant`)
  // 3. No dust, and a cap on the blast radius.
  const amount = BigInt(r.amount)
  if (amount < MIN_ATOMIC || amount > MAX_ATOMIC) reasons.push(`amount ${r.amount} outside $0.01–$10`)
  // 4. Short-lived authorizations.
  const auth = (paymentPayload.payload as { authorization?: EvmAuthorization }).authorization
  if (r.maxTimeoutSeconds > MAX_TIMEOUT_SECONDS) reasons.push(`maxTimeoutSeconds above ${MAX_TIMEOUT_SECONDS}`)
  if (auth && BigInt(auth.validBefore) > BigInt(Math.floor(Date.now() / 1000) + MAX_TIMEOUT_SECONDS)) {
    reasons.push("authorization valid for too long")
  }
  // 5. Drain caps, shared with the relayer.
  const cap = merchant && capReached(merchant.id)
  if (cap) reasons.push(cap)
  // 6. Replay: a payment we already settled can't be verified again.
  if (store.getSettlement(settlementKey(paymentPayload))) reasons.push("already_settled")
  return { merchant, reason: reasons.join("; ") || undefined }
}

export const facilitator = new x402Facilitator()
  .register(WHITECHAIN, new ExactEvmScheme(toFacilitatorEvmSigner({ ...relayerClient, address: relayer.address } as never)))
  .onBeforeVerify(async ctx => {
    const { reason } = ourChecks(ctx)
    if (reason) return { abort: true, reason }
  })
  .onBeforeSettle(async ctx => {
    const { reason } = ourChecks(ctx)
    if (reason) return { abort: true, reason }
  })

/**
 * Settle wrapped in the cache: a retry of a payment we already settled gets the first answer back
 * without sending anything. Hooks can abort but can't return a result, hence the wrapper.
 */
async function settle(paymentPayload: PaymentPayload, requirements: PaymentRequirements) {
  const key = settlementKey(paymentPayload)
  const seen = store.getSettlement(key)
  if (seen) return seen.response

  const response = await facilitator.settle(paymentPayload, requirements)
  if (response.success) {
    const merchant = findMerchantByPayTo(requirements.payTo)!
    if (requirements.network === WHITECHAIN) await recordFee(merchant.id, response.transaction as Hex)
    store.putSettlement({
      key,
      merchantId: merchant.id,
      network: requirements.network,
      asset: requirements.asset,
      amount: requirements.amount,
      payer: response.payer ?? "",
      payTo: requirements.payTo,
      transaction: response.transaction,
      ts: Date.now(),
      response,
    })
  }
  return response
}

type Body = { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements }

export const facilitatorRoutes = new Hono()
  .get("/facilitator/supported", c => c.json(facilitator.getSupported()))
  .post("/facilitator/verify", async c => {
    const { paymentPayload, paymentRequirements } = await c.req.json<Body>()
    return c.json(await facilitator.verify(paymentPayload, paymentRequirements))
  })
  .post("/facilitator/settle", async c => {
    const { paymentPayload, paymentRequirements } = await c.req.json<Body>()
    try {
      return c.json(await settle(paymentPayload, paymentRequirements))
    } catch (err) {
      const message = (err as Error).message
      console.warn("settle refused:", message)
      return c.json({ success: false, errorReason: message, transaction: "", network: paymentRequirements.network })
    }
  })
  .get("/v1/agent-payments", c => c.json(store.listSettlements().map(({ response, ...s }) => s)))
