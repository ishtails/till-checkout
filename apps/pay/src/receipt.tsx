import { ArrowCounterClockwiseIcon, CheckCircleIcon, DatabaseIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { api, explorerTx, type Order } from "./api"
import { arkivExplorer, receipts, type ReceiptRecord } from "./arkiv"
import { Badge, Money, Muted, RecordLink, Shell } from "./ui"

const when = (ts: number) => new Date(ts > 1e12 ? ts : ts * 1000).toLocaleString()

type Line = { label: string; usd: string; tx: string; ts?: number }

function Row({ label, usd, tx, ts }: Line) {
  const isRefund = label === "Refund"
  return (
    <li className="flex items-center justify-between gap-3 border-t py-3.5">
      <div className="flex items-center gap-3">
        <span className={`flex size-8 items-center justify-center rounded-full ${isRefund ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-secondary-foreground"}`}>
          {isRefund ? <ArrowCounterClockwiseIcon className="size-4" weight="bold" /> : <CheckCircleIcon className="size-4" weight="fill" />}
        </span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          {ts && <p className="text-xs text-muted-foreground">{when(ts)}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium tabular-nums">
          {isRefund ? "−" : ""}${Number(usd).toFixed(2)}
        </p>
        <RecordLink href={explorerTx(tx)}>On-chain record</RecordLink>
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
    if (serverDown && records) return <Shell><p className="text-destructive">No receipt found for this order.</p></Shell>
    return <Shell><Muted>Loading…</Muted></Shell>
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

  // Back to wherever the customer came from (the checkout, the shop, their receipts); else their receipts.
  const back = () => (history.length > 1 ? history.back() : location.assign(payer ? `/receipts/${payer}` : "/receipts"))

  return (
    <Shell>
      <button className="mb-4 text-sm text-muted-foreground hover:text-foreground" onClick={back}>
        ← Back
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Muted>Receipt · {latest?.merchantName ?? order!.merchant}</Muted>
          <h1 className="mt-1 text-xl">{latest?.description ?? order!.description}</h1>
        </div>
        <Badge variant={unpaid ? "neutral" : refunded > 0 ? "refunded" : "paid"}>{status}</Badge>
      </div>
      <Money usd={amount} className="mt-5 text-5xl" />

      <ul className="mt-6">
        {lines.map(l => (
          <Row key={l.tx} {...l} />
        ))}
      </ul>

      {!unpaid && (
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          <DatabaseIcon className="size-4 shrink-0" />
          {onArkiv ? (
            <span>
              Stored on Arkiv{order && count < expected && ", updating…"} ·{" "}
              <RecordLink href={arkivExplorer("order_id", id)}>View</RecordLink>
            </span>
          ) : (
            <span>Saving to Arkiv…</span>
          )}
        </div>
      )}
      {payer && (
        <a className="mt-4 inline-block text-sm font-medium hover:underline" href={`/receipts/${payer}`}>
          All your receipts →
        </a>
      )}
      <p className="mt-6 break-all font-mono text-[11px] text-muted-foreground/70">Order {id}</p>
    </Shell>
  )
}
