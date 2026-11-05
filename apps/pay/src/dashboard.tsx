import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth"
import { useEffect, useState } from "react"
import type { Address, Hex } from "viem"
import { parseUnits } from "viem"
import { agentExplorerTx, api, explorerTx, usdtBalance, type AgentPayment, type Order } from "./api"
import { receiveTypes } from "./checkout"

const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`

// The merchant's view (no login of its own in this demo; see the README). A refund needs the
// merchant's signature, so the Refund button works only for the wallet the order was paid to.
export function Dashboard() {
  const merchantId = new URLSearchParams(location.search).get("merchant") ?? "data-shop"
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { signTypedData } = useSignTypedData()
  const [orders, setOrders] = useState<Order[]>()
  const [agentPayments, setAgentPayments] = useState<AgentPayment[]>()
  const [balance, setBalance] = useState<number>()
  const [busy, setBusy] = useState<string>()
  // The refund amount typed for each order, in USD. Empty means the full amount left.
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()

  const address = wallets.find(w => w.walletClientType === "privy")?.address as Address | undefined

  // Checkouts that were opened but never paid aren't orders yet.
  const load = () => api.orders(merchantId).then(all => setOrders(all.filter(o => o.status !== "open")), e => setError(e.message))
  useEffect(() => void load(), [merchantId])
  useEffect(() => {
    api.agentPayments().then(all => setAgentPayments(all.filter(p => p.merchantId === merchantId)), e => setError(e.message))
  }, [merchantId])
  useEffect(() => {
    if (address) usdtBalance(address, USDT).then(setBalance)
  }, [address, orders])

  async function refund(order: Order) {
    if (!address) return
    setBusy(order.id)
    setError(undefined)
    try {
      const info = await api.refundInfo(order.id)
      const left = BigInt(info.remainingAtomic)
      const typed = amounts[order.id]?.trim()
      const value = typed ? parseUnits(typed, 6) : left
      if (value <= 0n || value > left) throw new Error(`Refund between $0.01 and $${(Number(left) / 1e6).toFixed(2)}.`)
      if (info.from.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`This order was paid to ${short(info.from)}. Sign in with that wallet to refund it.`)
      }
      const { signature } = await signTypedData(
        {
          domain: info.domain,
          types: receiveTypes,
          primaryType: "ReceiveWithAuthorization",
          message: {
            from: address,
            to: info.to,
            value: value.toString(),
            validAfter: "0",
            validBefore: String(info.validBefore),
            nonce: info.nonce,
          },
        },
        { address, uiOptions: { showWalletUIs: false } },
      )
      await api.refund(order.id, {
        amount: typed || (Number(left) / 1e6).toString(),
        validAfter: 0,
        validBefore: info.validBefore,
        signature: signature as Hex,
      })
      setAmounts(a => ({ ...a, [order.id]: "" }))
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <main className="mx-auto mt-12 max-w-3xl px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Orders</h1>
        {!ready ? null : authenticated ? (
          <div className="text-right text-sm text-stone-600">
            <p>
              {user?.email?.address} · <button className="underline" onClick={logout}>Log out</button>
            </p>
            {address && (
              <p className="font-mono text-xs">
                {address}
                {balance !== undefined && <> · {balance.toFixed(2)} USDT</>}
              </p>
            )}
          </div>
        ) : (
          <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white" onClick={login}>
            Merchant sign in
          </button>
        )}
      </div>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white shadow-sm">
        {!orders ? (
          <p className="p-6 text-stone-500">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-3 font-normal">Order</th>
                <th className="px-4 py-3 font-normal">Customer</th>
                <th className="px-4 py-3 text-right font-normal">Amount</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const refunded = Number(o.refunded)
                return (
                  <tr key={o.id} className="border-t border-stone-100">
                    <td className="px-4 py-3">
                      <a className="underline" href={`/receipt/${o.id}`}>{o.description}</a>
                      <p className="text-xs text-stone-400">{new Date(o.createdAt * 1000).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{o.payer ? short(o.payer) : "–"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${Number(o.amount).toFixed(2)}
                      {refunded > 0 && o.status !== "refunded" && <p className="text-xs text-amber-700">${refunded.toFixed(2)} refunded</p>}
                    </td>
                    <td className="px-4 py-3">
                      <a className="text-emerald-700 underline" href={explorerTx(o.refunds.at(-1)?.tx ?? o.payTx!)} target="_blank" rel="noreferrer">
                        {o.status === "refunded" ? "Refunded" : refunded > 0 ? "Partly refunded" : "Paid"} ↗
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Only the wallet that was paid can sign the refund. */}
                      {o.status === "paid" && address && o.paidTo?.toLowerCase() === address.toLowerCase() && (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-stone-400">$</span>
                          <input
                            className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-right tabular-nums"
                            inputMode="decimal"
                            placeholder={(Number(o.amount) - refunded).toFixed(2)}
                            value={amounts[o.id] ?? ""}
                            onChange={e => setAmounts(a => ({ ...a, [o.id]: e.target.value }))}
                          />
                          <button
                            className="rounded-lg border border-stone-300 px-3 py-1 disabled:opacity-50"
                            disabled={busy !== undefined}
                            onClick={() => refund(o)}
                          >
                            {busy === o.id ? "Refunding…" : "Refund"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Agent payments</h2>
      <p className="mt-1 text-sm text-stone-500">Paid per API call over x402, straight to your wallet. These are final, so they can't be refunded.</p>
      <div className="mt-4 rounded-2xl border border-stone-200 bg-white shadow-sm">
        {!agentPayments ? (
          <p className="p-6 text-stone-500">Loading…</p>
        ) : agentPayments.length === 0 ? (
          <p className="p-6 text-stone-500">No agent payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-3 font-normal">When</th>
                <th className="px-4 py-3 font-normal">Agent</th>
                <th className="px-4 py-3 font-normal">Paid in</th>
                <th className="px-4 py-3 text-right font-normal">Amount</th>
                <th className="px-4 py-3 font-normal">Record</th>
              </tr>
            </thead>
            <tbody>
              {agentPayments.map(p => (
                <tr key={p.transaction} className="border-t border-stone-100">
                  <td className="px-4 py-3 text-xs text-stone-500">{new Date(p.ts).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.payer.startsWith("0x") ? short(p.payer) : p.payer}</td>
                  <td className="px-4 py-3">{p.network.startsWith("hedera") ? "USDC on Hedera" : "USDT on Whitechain"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">${(Number(p.amount) / 1e6).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <a className="text-emerald-700 underline" href={agentExplorerTx(p)} target="_blank" rel="noreferrer">
                      {p.network.startsWith("hedera") ? "HashScan" : "Explorer"} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
