import { useEffect, useState } from "react"
import { api, explorerTx, type Order } from "./api"
import { arkivExplorer, receipts, type ReceiptRecord } from "./arkiv"
import { Card, Money } from "./ui"

const when = (ts: number) => new Date(ts > 1e12 ? ts : ts * 1000).toLocaleString()

type Line = { label: string; usd: string; tx: string; ts?: number }

function Row({ label, usd, tx, ts }: Line) {
  return (
    <li className="flex items-center justify-between border-t border-stone-100 py-3">
      <div>
        <p className="font-medium">{label}</p>
        {ts && <p className="text-xs text-stone-500">{when(ts)}</p>}
      </div>
      <div className="text-right">
        <p className="tabular-nums">${Number(usd).toFixed(2)}</p>
        <a className="text-xs text-emerald-700 underline" href={explorerTx(tx)} target="_blank" rel="noreferrer">
          On-chain record ↗
        </a>
      </div>
    </li>
  )
}

// The customer's view of one order: the payment and every refund, each linked to its public
// transaction. The lines come from the order's records on Arkiv, read in the browser. Until the
// first one is saved (a few seconds after paying) the page shows our server's copy and keeps
// checking; if our server is down, the page still works from Arkiv alone.
export function Receipt({ id }: { id: string }) {
  const [order, setOrder] = useState<Order>()
  const [serverDown, setServerDown] = useState(false)
  const [records, setRecords] = useState<ReceiptRecord[]>()

  useEffect(() => {
    api.order(id).then(setOrder, () => setServerDown(true))
  }, [id])

  // One record per event, so Arkiv is up to date once it has 1 + (number of refunds). Without
  // the server's copy, one read of Arkiv is all there is.
  const expected = order ? (order.payTx ? 1 : 0) + order.refunds.length : 0
  useEffect(() => {
    if (records && (!order || records.length >= expected)) return
    let stop = false
    const check = () =>
      receipts.order(id).then(
        r => {
          if (stop) return
          setRecords(r)
          if (order && r.length < expected) setTimeout(check, 3000)
        },
        () => !stop && setTimeout(check, 3000),
      )
    check()
    return () => {
      stop = true
    }
  }, [id, order, expected, records])

  const latest = records?.at(-1)
  if (!order && !latest) {
    if (serverDown && records) return <Card><p className="text-red-700">No receipt found for this order.</p></Card>
    return <Card><p className="text-stone-500">Loading…</p></Card>
  }

  const onArkiv = !!records?.length
  const lines: Line[] = onArkiv
    ? records!.map(r =>
        r.event === "paid"
          ? { label: "Payment", usd: r.amountUsd, tx: r.payTx, ts: r.eventTime }
          : { label: "Refund", usd: r.refundUsd!, tx: r.refundTx!, ts: r.eventTime },
      )
    : [
        ...(order!.payTx ? [{ label: "Payment", usd: order!.amount, tx: order!.payTx, ts: order!.createdAt }] : []),
        ...order!.refunds.map(r => ({ label: "Refund", usd: r.amount, tx: r.tx, ts: r.ts })),
      ]

  const amount = latest?.amountUsd ?? order!.amount
  const refunded = Number(latest?.refundedUsd ?? order!.refunded)
  const unpaid = !latest && order!.status === "open"
  const status = unpaid ? "Not paid yet" : refunded === 0 ? "Paid" : refunded >= Number(amount) ? "Refunded" : "Partly refunded"
  const payer = latest?.payer ?? order?.payer
  const count = records?.length ?? 0

  return (
    <Card>
      <p className="text-sm text-stone-500">Receipt · {latest?.merchantName ?? order!.merchant}</p>
      <h1 className="mt-1 text-xl font-semibold">{latest?.description ?? order!.description}</h1>
      <Money usd={amount} className="mt-4 text-4xl" />
      <p className={`mt-1 text-sm font-medium ${refunded > 0 ? "text-amber-700" : "text-emerald-700"}`}>{status}</p>

      <ul className="mt-6">
        {lines.map(l => (
          <Row key={l.tx} {...l} />
        ))}
      </ul>

      {!unpaid && (
        <p className="mt-6 text-xs text-stone-500">
          {onArkiv ? (
            <>
              Read from Arkiv, {count} {count === 1 ? "record" : "records"}
              {order && count < expected && ", saving the latest…"} ·{" "}
              <a className="text-emerald-700 underline" href={arkivExplorer("order_id", id)} target="_blank" rel="noreferrer">
                On Arkiv ↗
              </a>
            </>
          ) : (
            "Saving this receipt to Arkiv…"
          )}
        </p>
      )}
      {payer && (
        <p className="mt-1 text-xs">
          <a className="text-stone-500 underline" href={`/receipts/${payer}`}>All your receipts</a>
        </p>
      )}
      <p className="mt-6 break-all text-xs text-stone-400">Order {id}</p>
    </Card>
  )
}
