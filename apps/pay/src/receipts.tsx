import { usePrivy, useWallets } from "@privy-io/react-auth"
import { DatabaseIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { arkivExplorer, receipts, type ReceiptRecord } from "./arkiv"
import { Badge, Button, Muted, RecordLink, Shell } from "./ui"

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
      <Shell>
        <h1 className="text-xl">Your receipts</h1>
        <Muted className="mt-1">Every purchase you made from any shop that uses Till, in one place.</Muted>
        <Button size="lg" className="mt-6 w-full" disabled={!ready} onClick={login}>
          <EnvelopeSimpleIcon />
          {ready && authenticated ? "Loading your wallet…" : "Sign in with the email you paid with"}
        </Button>
      </Shell>
    )
  }
  if (error) return <Shell><p className="text-destructive">{error}</p></Shell>
  if (!records) return <Shell><Muted>Reading your receipts from Arkiv…</Muted></Shell>

  // Records are oldest first, so the last one for an order is its current state.
  const orders = [...new Map(records.map(r => [r.orderId, r])).values()].reverse()
  const paidAt = new Map(records.filter(r => r.event === "paid").map(r => [r.orderId, r.eventTime]))
  const paid = orders.reduce((a, r) => a + Number(r.amountUsd), 0)
  const refunded = orders.reduce((a, r) => a + Number(r.refundedUsd), 0)
  const shops = new Set(orders.map(r => r.merchant)).size

  return (
    <Shell>
      <h1 className="text-xl">Your receipts</h1>
      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{address}</p>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        {[
          [String(orders.length), orders.length === 1 ? "purchase" : "purchases"],
          [`$${paid.toFixed(2)}`, "paid"],
          [`$${refunded.toFixed(2)}`, "refunded"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg bg-muted px-2 py-3">
            <p className="text-lg font-semibold tracking-tight tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <Muted className="mt-3 text-xs">
        From {shops} {shops === 1 ? "shop" : "shops"}
      </Muted>

      <ul className="mt-4">
        {orders.map(r => {
          const none = Number(r.refundedUsd) === 0
          const all = r.refundedUsd === r.amountUsd
          return (
            <li key={r.orderId}>
              <a className="-mx-2 flex items-center justify-between gap-3 rounded-lg border-t px-2 py-3 hover:bg-muted/60" href={`/receipt/${r.orderId}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.merchantName} · {new Date((paidAt.get(r.orderId) ?? r.eventTime) * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm font-medium tabular-nums">${Number(r.amountUsd).toFixed(2)}</p>
                  <Badge variant={none ? "paid" : "refunded"} className="h-5 px-2">
                    {none ? "Paid" : all ? "Refunded" : `$${Number(r.refundedUsd).toFixed(2)} refunded`}
                  </Badge>
                </div>
              </a>
            </li>
          )
        })}
      </ul>
      {orders.length === 0 && <Muted className="mt-4">No receipts for this address yet.</Muted>}

      <div className="mt-5 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <DatabaseIcon className="size-4 shrink-0" />
        <span>
          Read from Arkiv, {records.length} {records.length === 1 ? "record" : "records"} ·{" "}
          <RecordLink href={arkivExplorer("payer", address)}>On Arkiv</RecordLink>
        </span>
      </div>
    </Shell>
  )
}
