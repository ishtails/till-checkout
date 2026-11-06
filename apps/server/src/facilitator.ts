import { x402Facilitator } from "@x402/core/facilitator"
import { tankEmpty } from "./gas-tank"
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types"
import { toFacilitatorEvmSigner } from "@x402/evm"
import { ExactEvmScheme } from "@x402/evm/exact/facilitator"
import {
  createHederaClient,
  createHederaPreflightTransfer,
  createHederaSignAndSubmitTransaction,
  createHederaVerifyPayerSignature,
  extractTransactionFromPayload,
  HEDERA_TESTNET_USDC,
  inspectHederaTransaction,
  PrivateKey,
  toFacilitatorHederaSigner,
} from "@x402/hedera"
import { ExactHederaScheme } from "@x402/hedera/exact/facilitator"
import { Hono } from "hono"
import type { Hex } from "viem"
import { relayer, relayerClient } from "./chain"
import { config } from "./config"
import { findMerchantByPayTo } from "./merchants"
import { capReached, recordFee } from "./relayer"
import { store } from "./store"
import { identify } from "./identity"

// Our x402 facilitator (D2: the same service and hot wallet as the relayer).
// The library checks signature, recipient, amount, validity window, unused nonce, balance and simulates.
// Our checks below run first, in this order (design/04_low_level.md §1).

const WHITECHAIN = "eip155:1874"
const HEDERA = "hedera:testnet"
const assets: Record<string, string> = { [WHITECHAIN]: config.usdt.toLowerCase(), [HEDERA]: HEDERA_TESTNET_USDC }
const MIN_ATOMIC = 10_000n // $0.01 (both tokens have 6 decimals)
const MAX_ATOMIC = 10_000_000n // $10
// A Hedera transaction dies 120 s after its valid start, whatever maxTimeoutSeconds says (spike, 24 Oct).
const MAX_TIMEOUT_SECONDS: Record<string, number> = { [WHITECHAIN]: 300, [HEDERA]: 120 }
const HEDERA_VALID_SECONDS = 120
const HEDERA_MARGIN_SECONDS = 10 // leave time to submit

type EvmAuthorization = { from: string; nonce: string; validBefore: string }

const hederaTxId = (payload: PaymentPayload) =>
  inspectHederaTransaction(extractTransactionFromPayload(payload.payload as never)).transactionId

/** The replay / idempotency key: (payer, nonce) for EVM, the transaction ID for Hedera. */
function settlementKey(payload: PaymentPayload) {
  const auth = (payload.payload as { authorization?: EvmAuthorization }).authorization
  if (auth) return `${payload.accepted.network}:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`
  if (payload.accepted.network === HEDERA) return `${HEDERA}:${hederaTxId(payload)}`
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
  const now = Math.floor(Date.now() / 1000)
  const maxTimeout = MAX_TIMEOUT_SECONDS[r.network] ?? 0
  if (r.maxTimeoutSeconds > maxTimeout) reasons.push(`maxTimeoutSeconds above ${maxTimeout}`)
  const auth = (paymentPayload.payload as { authorization?: EvmAuthorization }).authorization
  if (auth && BigInt(auth.validBefore) > BigInt(now + maxTimeout)) reasons.push("authorization valid for too long")
  // The library's Hedera verify passes an expired transaction, which then fails at settle.
  if (r.network === HEDERA) {
    const validStart = Number(hederaTxId(paymentPayload).split("@")[1])
    if (validStart + HEDERA_VALID_SECONDS - HEDERA_MARGIN_SECONDS < now) reasons.push("transaction expired")
  }
  // 5. Drain caps, shared with the relayer.
  const cap = merchant && capReached(merchant.id)
  if (cap) reasons.push(cap)
  // 6. Replay: a payment we already settled can't be verified again.
  if (store.getSettlement(settlementKey(paymentPayload))) reasons.push("already_settled")
  return { merchant, reason: reasons.join("; ") || undefined }
}

// Hedera: our own fee payer account pays the network fee (about 0.014 HBAR per USDC payment).
const hederaSigner = toFacilitatorHederaSigner({
  getAddresses: () => [config.hederaFeePayerId],
  signAndSubmitTransaction: createHederaSignAndSubmitTransaction(
    network => createHederaClient(network),
    PrivateKey.fromStringECDSA(config.hederaFeePayerKey),
  ),
  verifyPayerSignature: createHederaVerifyPayerSignature(),
  preflightTransfer: createHederaPreflightTransfer(),
})

export const facilitator = new x402Facilitator()
  .register(WHITECHAIN, new ExactEvmScheme(toFacilitatorEvmSigner({ ...relayerClient, address: relayer.address } as never)))
  // "reject": a payTo given as an EVM alias would make our fee payer fund a new account.
  .register(HEDERA, new ExactHederaScheme(hederaSigner, { aliasPolicy: "reject" }))
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

  // Whitechain gas comes out of the merchant's gas tank, so an empty tank stops the payment here.
  if (requirements.network === WHITECHAIN) {
    const owner = findMerchantByPayTo(requirements.payTo)
    const empty = owner && (await tankEmpty(owner.id))
    if (empty) throw new Error(empty)
  }
  const response = await facilitator.settle(paymentPayload, requirements)
  if (response.success) {
    const merchant = findMerchantByPayTo(requirements.payTo)!
    if (requirements.network === WHITECHAIN) await recordFee(merchant.id, response.transaction as Hex)
    const settlement = {
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
    }
    store.putSettlement(settlement)
    // In the background: who the paying agent is, checked against its ERC-8004 entry.
    void identify(settlement, paymentPayload)
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
