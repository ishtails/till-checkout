import { useEffect, useState } from "react"
import { api, explorerTx, type Order } from "./api"
import { Card, Money } from "./ui"

const when = (ts: number) => new Date(ts > 1e12 ? ts : ts * 1000).toLocaleString()

function Row({ label, usd, tx, ts }: { label: string; usd: string; tx: string; ts?: number }) {
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

// The customer's view of one order: the payment and every refund, each linked to its public transaction.
export function Receipt({ id }: { id: string }) {
  const [order, setOrder] = useState<Order>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    api.order(id).then(setOrder, e => setError(e.message))
  }, [id])

  if (error) return <Card><p className="text-red-700">{error}</p></Card>
  if (!order) return <Card><p className="text-stone-500">Loading…</p></Card>

  const refunded = Number(order.refunded)
  const status =
    order.status === "open" ? "Not paid yet" : refunded === 0 ? "Paid" : refunded >= Number(order.amount) ? "Refunded" : "Partly refunded"

  return (
    <Card>
      <p className="text-sm text-stone-500">Receipt · {order.merchant}</p>
      <h1 className="mt-1 text-xl font-semibold">{order.description}</h1>
      <Money usd={order.amount} className="mt-4 text-4xl" />
      <p className={`mt-1 text-sm font-medium ${refunded > 0 ? "text-amber-700" : "text-emerald-700"}`}>{status}</p>

      <ul className="mt-6">
        {order.payTx && <Row label="Payment" usd={order.amount} tx={order.payTx} ts={order.createdAt} />}
        {order.refunds.map(r => (
          <Row key={r.tx} label="Refund" usd={r.amount} tx={r.tx} ts={r.ts} />
        ))}
      </ul>

      <p className="mt-6 break-all text-xs text-stone-400">Order {order.id}</p>
    </Card>
  )
}
