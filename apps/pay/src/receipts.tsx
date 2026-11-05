import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useEffect, useState } from "react"
import { arkivExplorer, receipts, type ReceiptRecord } from "./arkiv"
import { Card } from "./ui"

// "Your receipts": everything one customer bought from any Till shop, read from Arkiv by their
// wallet address. No shop holds this list and our server isn't asked; Arkiv answers the query.
// /receipts shows the signed-in customer's own; /receipts/<address> shows any address.
export function Receipts({ address: given }: { address?: string }) {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const address = given ?? wallets.find(w => w.walletClientType === "privy")?.address
  const [records, setRecords] = useState<ReceiptRecord[]>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (address) receipts.payer(address).then(setRecords, e => setError(e.message))
  }, [address])

  if (!address) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Your receipts</h1>
        <p className="mt-2 text-sm text-stone-500">Sign in with the email you paid with.</p>
        <button className="mt-6 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white" disabled={!ready} onClick={login}>
          {ready && authenticated ? "Loading your wallet…" : "Sign in"}
        </button>
      </Card>
    )
  }
  if (error) return <Card><p className="text-red-700">{error}</p></Card>
  if (!records) return <Card><p className="text-stone-500">Reading your receipts from Arkiv…</p></Card>

  // Records are oldest first, so the last one for an order is its current state.
  const orders = [...new Map(records.map(r => [r.orderId, r])).values()].reverse()
  const paidAt = new Map(records.filter(r => r.event === "paid").map(r => [r.orderId, r.eventTime]))
  const paid = orders.reduce((a, r) => a + Number(r.amountUsd), 0)
  const refunded = orders.reduce((a, r) => a + Number(r.refundedUsd), 0)
  const shops = new Set(orders.map(r => r.merchant)).size

  return (
    <Card>
      <h1 className="text-xl font-semibold">Your receipts</h1>
      <p className="mt-1 break-all text-xs text-stone-500">{address}</p>
      <p className="mt-4 text-sm">
        {orders.length} {orders.length === 1 ? "purchase" : "purchases"} from {shops} {shops === 1 ? "shop" : "shops"} · $
        {paid.toFixed(2)} paid, ${refunded.toFixed(2)} refunded
      </p>

      <ul className="mt-4">
        {orders.map(r => {
          const status = Number(r.refundedUsd) === 0 ? "Paid" : r.refundedUsd === r.amountUsd ? "Refunded" : `$${Number(r.refundedUsd).toFixed(2)} refunded`
          return (
            <li key={r.orderId} className="flex items-center justify-between border-t border-stone-100 py-3">
              <div>
                <a className="font-medium underline" href={`/receipt/${r.orderId}`}>{r.description}</a>
                <p className="text-xs text-stone-500">{r.merchantName} · {new Date((paidAt.get(r.orderId) ?? r.eventTime) * 1000).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="tabular-nums">${Number(r.amountUsd).toFixed(2)}</p>
                <p className={`text-xs ${status === "Paid" ? "text-emerald-700" : "text-amber-700"}`}>{status}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {orders.length === 0 && <p className="mt-4 text-sm text-stone-500">No receipts for this address yet.</p>}

      <p className="mt-6 text-xs text-stone-500">
        Read from Arkiv, {records.length} {records.length === 1 ? "record" : "records"} ·{" "}
        <a className="text-emerald-700 underline" href={arkivExplorer("payer", address)} target="_blank" rel="noreferrer">
          On Arkiv ↗
        </a>
      </p>
    </Card>
  )
}
