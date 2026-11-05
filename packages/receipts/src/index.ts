import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"
import { addr, dec, defineSchema, str, u64 } from "@arkiv-network/sdk/schema"
import { http, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Till's receipts on Arkiv: one entity per event on an order (`paid`, then one `refunded` per
// refund), never edited, so an order's history only grows. The server writes them
// (apps/server/src/arkiv.ts); the receipt pages read them in the browser. Fields and reasons:
// arkiv/schema.md.
export const Receipt = defineSchema("till.receipt", {
  // Indexed: the two things a page looks receipts up by. The receipt page by order, "Your
  // receipts" by customer across every shop.
  order_id: str().indexed(),
  payer: addr().indexed(),
  // Stored, not indexed: what the receipt shows. No page filters on these.
  merchant: str(),
  event: str(), // "paid" | "refunded"
  merchant_name: str(),
  description: str(),
  amount_usd: dec(),
  refund_usd: dec().optional(), // this refund, on a "refunded" record
  refunded_usd: dec(), // the order's refunded total after this event
  pay_tx: str(),
  refund_tx: str().optional(),
  event_time: u64(), // unix seconds when the payment or refund happened, not when it was saved
  chain: str().default("whitechain-sepolia:1874"),
  token: str().default("USDT"),
})

// The wallet the Till server writes with. Anyone can create an entity that fits this schema, so
// every read is filtered to this owner: a record from any other wallet never shows on a receipt.
export const RECEIPT_WRITER: Address = "0xffE2359A07d0e193621419008eeE8D7f57f9a326"

export type ReceiptRecord = {
  key: string
  orderId: string
  payer: string
  merchant: string
  event: "paid" | "refunded"
  merchantName: string
  description: string
  amountUsd: string
  refundUsd?: string
  refundedUsd: string
  payTx: string
  refundTx?: string
  eventTime: number
}

export type ReceiptInput = Omit<ReceiptRecord, "key">

export function receiptWriter(privateKey: Hex, accessKey: string) {
  const wallet = createWalletClient({ chain: rabdi({ accessKey }), transport: http(), account: privateKeyToAccount(privateKey) })
  return {
    address: wallet.account.address,
    /** Saves one record and resolves once it's in a block (~2–6 s). */
    write: (r: ReceiptInput) =>
      wallet.createEntity(
        Receipt,
        {
          order_id: r.orderId.toLowerCase(),
          payer: addr(r.payer),
          merchant: r.merchant,
          event: r.event,
          merchant_name: r.merchantName,
          description: r.description,
          amount_usd: dec(r.amountUsd),
          ...(r.refundUsd && { refund_usd: dec(r.refundUsd) }),
          refunded_usd: dec(r.refundedUsd),
          pay_tx: r.payTx,
          ...(r.refundTx && { refund_tx: r.refundTx }),
          event_time: u64(r.eventTime),
        },
        // The longest the chain allows (~182 days). A receipt older than that would need extendEntity.
        { expiration: ExpirationTime.max() },
      ),
  }
}

export function receiptReader(accessKey: string) {
  const arkiv = createPublicClient({ chain: rabdi({ accessKey }), transport: http() })

  // Written out per filter: the SDK checks each where() against the schema's indexed columns.
  const query = (by: "order_id" | "payer", value: string) =>
    (by === "order_id"
      ? arkiv.select().from(Receipt).where(eq("order_id", value.toLowerCase()))
      : arkiv.select().from(Receipt).where(eq("payer", addr(value)))
    )
      .ownedBy(RECEIPT_WRITER)
      .limit(100)
      .fetch()

  async function find(by: "order_id" | "payer", value: string) {
    const page = await query(by, value)
    return page.entities
      .map(
        (e): ReceiptRecord => ({
          key: e.$key,
          orderId: e.order_id.value,
          payer: e.payer.value,
          merchant: e.merchant.value,
          event: e.event.value as ReceiptRecord["event"],
          merchantName: e.merchant_name.value,
          description: e.description.value,
          amountUsd: e.amount_usd.value,
          refundUsd: e.refund_usd?.value,
          refundedUsd: e.refunded_usd.value,
          payTx: e.pay_tx.value,
          refundTx: e.refund_tx?.value,
          eventTime: Number(e.event_time.value),
        }),
      )
      .sort((a, b) => a.eventTime - b.eventTime || Number(a.refundedUsd) - Number(b.refundedUsd))
  }

  return {
    /** Every record for one order, oldest first. */
    order: (orderId: string) => find("order_id", orderId),
    /** Every record for one customer, across all Till shops, oldest first. */
    payer: (payer: string) => find("payer", payer),
  }
}

/** The query a page runs, written out for Arkiv's explorer. */
export const receiptQuery = (attr: "order_id" | "payer", value: string) =>
  `arkiv.schema = str('till.receipt') AND ${attr} = ${
    attr === "payer" ? `addr(${value.toLowerCase()})` : `str('${value.toLowerCase()}')`
  } AND $owner = addr(${RECEIPT_WRITER.toLowerCase()})`

/** Rabdi's entity explorer, running the same query, so anyone can see the same records. */
export const arkivExplorer = (attr: "order_id" | "payer", value: string) =>
  `https://rabdi.explorer.arkiv.network/entity-explorer?q=${encodeURIComponent(receiptQuery(attr, value))}`
