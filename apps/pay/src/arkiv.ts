import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { and, eq } from "@arkiv-network/sdk/query"
import { http } from "viem"

// Receipts read straight from Arkiv in the browser: our server isn't in the path, so they still
// load if Till is down. The server writes one record per event (apps/server/src/arkiv.ts).
const arkiv = createPublicClient({ chain: tiramisu, transport: http() })

export type ArkivReceipt = {
  orderId: string
  event: "paid" | "refunded"
  merchant: string
  description: string
  amountUsd: string
  payer: string
  payTx: string
  refundUsd?: string
  refundTx?: string
  refundedUsd: string
  ts: number // when the record was saved
}

async function find(attr: "order_id" | "payer", value: string) {
  const page = await arkiv
    .select("*")
    .where(and([eq("app", "till"), eq(attr, value.toLowerCase())]))
    .limit(200)
    .fetch()
  return page.entities.map(e => e.toJson() as ArkivReceipt).sort((a, b) => a.ts - b.ts)
}

/** Every record for one order, oldest first. */
export const orderRecords = (orderId: string) => find("order_id", orderId)

/** Every record for one customer, across all Till shops, oldest first. */
export const payerRecords = (payer: string) => find("payer", payer)

/** Arkiv's data explorer, showing the same records anyone can query. */
export const arkivExplorer = (attr: "order_id" | "payer", value: string) =>
  `https://data.arkiv.network/?q=${encodeURIComponent(`${attr} = str('${value.toLowerCase()}')`)}`
