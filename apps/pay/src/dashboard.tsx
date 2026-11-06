import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth"
import { DownloadSimpleIcon, GasPumpIcon, RobotIcon, ShoppingBagIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import type { Address, Hex } from "viem"
import { parseUnits } from "viem"
import { agentExplorerTx, api, explorerTx, usdtBalance, type AgentPayment, type GasMeter, type Order } from "./api"
import { receiveTypes } from "./checkout"
import { Input } from "./components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table"
import { download, ledgerCsv } from "./csv"
import { Badge, Button, Card, Logo, Muted, RecordLink } from "./ui"

const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-secondary-foreground [&_svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </Card>
  )
}

// The merchant's view (no login of its own in this demo; see the README). A refund needs the
// merchant's signature, so the Refund button works only for the wallet the order was paid to.
export function Dashboard() {
  const merchantId = new URLSearchParams(location.search).get("merchant") ?? "data-shop"
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { signTypedData } = useSignTypedData()
  const [orders, setOrders] = useState<Order[]>()
  const [agentPayments, setAgentPayments] = useState<AgentPayment[]>()
  const [gas, setGas] = useState<GasMeter>()
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
    api.gas(merchantId).then(setGas, () => {})
  }, [merchantId, orders])
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

  const received = orders?.reduce((a, o) => a + Number(o.amount) - Number(o.refunded), 0) ?? 0
  const agentTotal = agentPayments?.reduce((a, p) => a + Number(p.amount) / 1e6, 0) ?? 0

  return (
    <div className="min-h-svh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden text-sm text-muted-foreground sm:inline">Merchant dashboard</span>
          </div>
          {!ready ? null : authenticated ? (
            <div className="flex items-center gap-3 text-right text-xs text-muted-foreground">
              <div className="hidden sm:block">
                <p className="text-foreground">{user?.email?.address ?? user?.google?.email}</p>
                {address && (
                  <p className="font-mono">
                    {short(address)}
                    {balance !== undefined && <> · {balance.toFixed(2)} USDT</>}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={logout}>
                Log out
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={login}>
              Merchant sign in
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={<ShoppingBagIcon weight="fill" />} label="Received from customers" value={`$${received.toFixed(2)}`} note={`${orders?.length ?? 0} orders, after refunds`} />
          <Stat icon={<RobotIcon weight="fill" />} label="Paid by AI agents" value={`$${agentTotal.toFixed(2)}`} note={`${agentPayments?.length ?? 0} API calls over x402`} />
          <Stat
            icon={<GasPumpIcon weight="fill" />}
            label="Gas we paid for you"
            value={gas ? `${Number(gas.totalWbt).toFixed(4)} WBT` : "…"}
            note={gas ? `About ${Number(gas.perTxWbt).toFixed(5)} WBT a transaction. Your customers and agents paid none.` : ""}
          />
        </div>

        {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mt-10 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg">Orders</h2>
            <Muted>Paid by people at checkout. Refund any amount up to what's left.</Muted>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!orders || !agentPayments}
            onClick={() => download(`till-${merchantId}-${new Date().toISOString().slice(0, 10)}.csv`, ledgerCsv(orders!, agentPayments!))}
          >
            <DownloadSimpleIcon />
            CSV for your accountant
          </Button>
        </div>
        <Card className="mt-4 gap-0 py-0">
          {!orders ? (
            <Muted className="p-6">Loading…</Muted>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">Order</TableHead>
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">Customer</TableHead>
                  <TableHead className="px-4 text-right text-xs font-normal text-muted-foreground">Amount</TableHead>
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">Status</TableHead>
                  <TableHead className="px-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(o => {
                  const refunded = Number(o.refunded)
                  const status = o.status === "refunded" ? "Refunded" : refunded > 0 ? "Partly refunded" : "Paid"
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="px-4 py-3">
                        <a className="font-medium hover:underline" href={`/receipt/${o.id}`}>
                          {o.description}
                        </a>
                        <p className="text-xs text-muted-foreground">{new Date(o.createdAt * 1000).toLocaleString()}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.payer ? short(o.payer) : "–"}</TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        ${Number(o.amount).toFixed(2)}
                        {refunded > 0 && o.status !== "refunded" && <p className="text-xs text-warning-foreground">−${refunded.toFixed(2)}</p>}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={status === "Paid" ? "paid" : "refunded"}>{status}</Badge>
                          <RecordLink href={explorerTx(o.refunds.at(-1)?.tx ?? o.payTx!)}>Explorer</RecordLink>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {/* Only the wallet that was paid can sign the refund. */}
                        {o.status === "paid" && address && o.paidTo?.toLowerCase() === address.toLowerCase() && (
                          <div className="flex items-center justify-end gap-2">
                            <div className="relative">
                              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                              <Input
                                className="h-8 w-20 pl-5 text-right tabular-nums"
                                inputMode="decimal"
                                placeholder={(Number(o.amount) - refunded).toFixed(2)}
                                value={amounts[o.id] ?? ""}
                                onChange={e => setAmounts(a => ({ ...a, [o.id]: e.target.value }))}
                              />
                            </div>
                            <Button variant="outline" size="sm" isLoading={busy === o.id} disabled={busy !== undefined} onClick={() => refund(o)}>
                              Refund
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="mt-10">
          <h2 className="text-lg">Agent payments</h2>
          <Muted>Paid per API call over x402, straight to your wallet. These are final, so they can't be refunded.</Muted>
        </div>
        <Card className="mt-4 gap-0 py-0">
          {!agentPayments ? (
            <Muted className="p-6">Loading…</Muted>
          ) : agentPayments.length === 0 ? (
            <Muted className="p-6">No agent payments yet.</Muted>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">When</TableHead>
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">Agent</TableHead>
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">Paid in</TableHead>
                  <TableHead className="px-4 text-right text-xs font-normal text-muted-foreground">Amount</TableHead>
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentPayments.map(p => {
                  const hedera = p.network.startsWith("hedera")
                  return (
                    <TableRow key={p.transaction}>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.ts).toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs">{p.payer.startsWith("0x") ? short(p.payer) : p.payer}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="neutral">{hedera ? "USDC on Hedera" : "USDT on Whitechain"}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">${(Number(p.amount) / 1e6).toFixed(2)}</TableCell>
                      <TableCell className="px-4 py-3">
                        <RecordLink href={agentExplorerTx(p)}>{hedera ? "HashScan" : "Explorer"}</RecordLink>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>
    </div>
  )
}
