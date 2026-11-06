import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth"
import { DownloadSimpleIcon, GasPumpIcon, RobotIcon, SealCheckIcon, ShoppingBagIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Address, Hex } from "viem"
import { parseUnits } from "viem"
import { agentExplorerTx, api, explorerTx, usdtBalance, type AgentPayment, type GasTank, type Order } from "./api"
import { receiveTypes } from "./checkout"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog"
import { Input } from "./components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table"
import { download, ledgerCsv } from "./csv"
import { AccountMenu } from "./account-menu"
import { friendly } from "./lib/errors"
import { Badge, Button, Card, Logo, Muted, RecordLink } from "./ui"

const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"
// EIP-3009: the merchant's signed transfer back to the agent, which our relayer submits.
const transferTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
}
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
export function Dashboard({ merchantId }: { merchantId: string }) {
  // The shop's name and wallet: the dashboard opens only for that wallet.
  const [shop, setShop] = useState<{ name: string; wallet: string } | "missing">()
  useEffect(() => void api.merchant(merchantId).then(setShop, () => setShop("missing")), [merchantId])
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { signTypedData } = useSignTypedData()
  const [orders, setOrders] = useState<Order[]>()
  const [agentPayments, setAgentPayments] = useState<AgentPayment[]>()
  const [tank, setTank] = useState<GasTank>()
  const [balance, setBalance] = useState<number>()
  const [busy, setBusy] = useState<string>()
  // The refund amount typed for each order, in USD. Empty means the full amount left.
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()
  // The order, or agent payment, waiting for the merchant to confirm its refund.
  const [confirming, setConfirming] = useState<Order>()
  const [confirmingAgent, setConfirmingAgent] = useState<AgentPayment>()

  const address = wallets.find(w => w.walletClientType === "privy")?.address as Address | undefined

  // Checkouts that were opened but never paid aren't orders yet.
  const load = () => api.orders(merchantId).then(all => setOrders(all.filter(o => o.status !== "open")), e => setError(e.message))
  useEffect(() => void load(), [merchantId])
  useEffect(() => {
    api.gasTank(merchantId).then(setTank, () => {})
  }, [merchantId, orders])
  useEffect(() => {
    const loadAgents = () => api.agentPayments().then(all => setAgentPayments(all.filter(p => p.merchantId === merchantId)), () => {})
    void loadAgents()
    // New orders and agent payments show up on their own, without a reload.
    const timer = setInterval(() => {
      if (document.hidden) return
      void load()
      void loadAgents()
    }, 5000)
    return () => clearInterval(timer)
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
      const { txHash } = await api.refund(order.id, {
        amount: typed || (Number(left) / 1e6).toString(),
        validAfter: 0,
        validBefore: info.validBefore,
        signature: signature as Hex,
      })
      setAmounts(a => ({ ...a, [order.id]: "" }))
      toast.success(`Refunded $${(Number(value) / 1e6).toFixed(2)}`, {
        description: "Sent back to the customer on Whitechain.",
        action: { label: "View", onClick: () => window.open(explorerTx(txHash), "_blank") },
      })
      await load()
    } catch (e) {
      toast.error(friendly((e as Error).message))
    } finally {
      setBusy(undefined)
    }
  }

  async function refundAgent(p: AgentPayment) {
    if (!address) return
    setBusy(p.key)
    try {
      const info = await api.agentRefundInfo(p.key)
      const value = BigInt(info.remainingAtomic)
      if (value <= 0n) throw new Error("Already refunded in full.")
      if (info.from.toLowerCase() !== address.toLowerCase()) throw new Error(`This was paid to ${short(info.from)}. Sign in with that wallet to refund it.`)
      const { signature } = await signTypedData(
        {
          domain: info.domain,
          types: transferTypes,
          primaryType: "TransferWithAuthorization",
          message: { from: address, to: info.to, value: value.toString(), validAfter: "0", validBefore: String(info.validBefore), nonce: info.nonce },
        },
        { address, uiOptions: { showWalletUIs: false } },
      )
      const { txHash } = await api.agentRefund(p.key, {
        amount: (Number(value) / 1e6).toString(),
        nonce: info.nonce,
        validBefore: info.validBefore,
        signature: signature as Hex,
      })
      toast.success(`Refunded $${(Number(value) / 1e6).toFixed(2)} to the agent`, {
        description: "Sent back to its wallet on Whitechain.",
        action: { label: "View", onClick: () => window.open(explorerTx(txHash), "_blank") },
      })
      setAgentPayments(await api.agentPayments().then(all => all.filter(x => x.merchantId === merchantId)))
    } catch (e) {
      toast.error(friendly((e as Error).message))
    } finally {
      setBusy(undefined)
    }
  }

  // The merchant prepays gas in USDT: a signed transfer to Till's gas wallet, which our relayer submits.
  async function topUp(amount: string) {
    if (!address || !tank) return
    setBusy("topup")
    try {
      const t = (await api.gasTank(merchantId)).topup
      const value = parseUnits(amount, 6)
      const { signature } = await signTypedData(
        {
          domain: t.domain,
          types: transferTypes,
          primaryType: "TransferWithAuthorization",
          message: { from: address, to: t.to, value: value.toString(), validAfter: "0", validBefore: String(t.validBefore), nonce: t.nonce },
        },
        { address, uiOptions: { showWalletUIs: false } },
      )
      const { txHash } = await api.topUp({ merchant: merchantId, from: address, amount, nonce: t.nonce, validBefore: t.validBefore, signature: signature as Hex })
      toast.success(`Added $${amount} to your gas tank`, { action: { label: "View", onClick: () => window.open(explorerTx(txHash), "_blank") } })
      setTank(await api.gasTank(merchantId))
      setBalance(await usdtBalance(address, USDT))
    } catch (e) {
      toast.error(friendly((e as Error).message))
    } finally {
      setBusy(undefined)
    }
  }

  const merchantWallet = shop && shop !== "missing" ? shop.wallet : undefined
  const isMerchant = !!address && !!merchantWallet && merchantWallet.toLowerCase() === address.toLowerCase()
  const wrongWallet = authenticated && address && merchantWallet && !isMerchant
  const email = user?.email?.address ?? user?.google?.email
  const switchAccount = async () => {
    await logout()
    login()
  }
  const refundLeft = (o: Order) => Number(o.amount) - Number(o.refunded)
  const refundAmount = (o: Order) => Number(amounts[o.id]?.trim() || refundLeft(o))

  const received = orders?.reduce((a, o) => a + Number(o.amount) - Number(o.refunded), 0) ?? 0
  const agentTotal = agentPayments?.reduce((a, p) => a + (Number(p.amount) - Number(p.refunded ?? 0)) / 1e6, 0) ?? 0

  return (
    <div className="min-h-svh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden text-sm text-muted-foreground sm:inline">Merchant dashboard</span>
          </div>
          {!ready ? null : authenticated ? (
            <AccountMenu
              email={user?.email?.address ?? user?.google?.email}
              address={address}
              role={shop && shop !== "missing" ? (isMerchant ? { label: `${shop.name}'s wallet`, ok: true } : { label: `Not ${shop.name}'s wallet (${short(shop.wallet)})`, ok: false }) : undefined}
              details={balance !== undefined && <>{balance.toFixed(2)} USDT</>}
              onSwitch={switchAccount}
              onSignOut={() => void logout()}
            />
          ) : (
            <Button size="sm" onClick={login}>
              Merchant sign in
            </Button>
          )}
        </div>
      </header>

      {!ready || !shop ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <Muted>Loading…</Muted>
        </main>
      ) : shop === "missing" ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl">No shop "{merchantId}" on Till</h1>
          <Muted className="mt-2">Check the link, or open <a className="text-brand hover:underline" href="/dashboard/data-shop">/dashboard/data-shop</a>.</Muted>
        </main>
      ) : !authenticated ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl">{shop.name}'s dashboard</h1>
          <Muted className="mt-2">Only the shop can open this: its orders, refunds, agent payments and gas tank.</Muted>
          <Button size="lg" className="mt-6" onClick={login}>
            Merchant sign in
          </Button>
        </main>
      ) : !isMerchant ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl">This account isn't {shop.name}'s</h1>
          <Muted className="mt-2">
            You're signed in as {email ?? "this account"}
            {address && <> with wallet <span className="font-mono">{short(address)}</span></>}. {shop.name} is paid to{" "}
            <span className="font-mono">{short(shop.wallet)}</span>.
          </Muted>
          <Button size="lg" className="mt-6" onClick={switchAccount}>
            Switch account
          </Button>
        </main>
      ) : (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={<ShoppingBagIcon weight="fill" />} label="Received from customers" value={`$${received.toFixed(2)}`} note={`${orders?.length ?? 0} orders, after refunds`} />
          <Stat icon={<RobotIcon weight="fill" />} label="Paid by AI agents" value={`$${agentTotal.toFixed(2)}`} note={`${agentPayments?.length ?? 0} API calls over x402`} />
          <Card className="gap-0 p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-secondary-foreground [&_svg]:size-3.5">
                  <GasPumpIcon weight="fill" />
                </span>
                Gas tank
              </div>
              {address && (!merchantWallet || merchantWallet.toLowerCase() === address.toLowerCase()) && (
                <Button variant="outline" size="xs" isLoading={busy === "topup"} disabled={busy !== undefined || !tank} onClick={() => topUp("1")}>
                  Top up $1
                </Button>
              )}
            </div>
            <p className={`mt-3 text-2xl font-semibold tracking-tight tabular-nums ${tank && tank.balanceUsd <= 0 ? "text-destructive" : ""}`}>
              {tank ? `$${tank.balanceUsd.toFixed(2)}` : "…"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tank
                ? tank.balanceUsd <= 0
                  ? "Empty: payments are paused until you top up."
                  : `${tank.txLeft !== null ? `About ${tank.txLeft} more transactions. ` : ""}Your customers and agents pay no gas; you pay it at cost + ${Math.round(tank.margin * 100)}%, in USDT.`
                : ""}
            </p>
          </Card>
        </div>

        {wrongWallet && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning/20 px-4 py-3 text-sm text-warning-foreground">
            <span className="flex items-center gap-2">
              <WarningCircleIcon className="size-4 shrink-0" weight="fill" />
              You're signed in as {email}. Refunds need the shop's wallet ({short(merchantWallet!)}).
            </span>
            <Button variant="outline" size="sm" onClick={switchAccount}>
              Switch account
            </Button>
          </div>
        )}
        {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{friendly(error)}</p>}

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
            Download CSV
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
                            <Button variant="outline" size="sm" isLoading={busy === o.id} disabled={busy !== undefined} onClick={() => setConfirming(o)}>
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
          <Muted>Paid per API call over x402, straight to your wallet. Refund a Whitechain payment here, with no gas; refund Hedera ones from your Hedera wallet.</Muted>
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
                  <TableHead className="px-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentPayments.map(p => {
                  const hedera = p.network.startsWith("hedera")
                  return (
                    <TableRow key={p.transaction}>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.ts).toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs">
                        {p.payer.startsWith("0x") ? short(p.payer) : p.payer}
                        {p.agent?.verified ? (
                          <a
                            className="mt-1 flex w-fit items-center gap-1 font-sans text-[11px] font-medium text-brand hover:underline"
                            href={`https://hashscan.io/testnet/contract/${p.agent.registry.split(":")[2]}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`ERC-8004 agent #${p.agent.agentId} on Hedera, owned by ${p.agent.owner}`}
                          >
                            <SealCheckIcon className="size-3.5" weight="fill" />
                            Verified agent #{p.agent.agentId} · owner {short(p.agent.owner ?? "")}
                          </a>
                        ) : p.agent ? (
                          <span className="mt-1 block font-sans text-[11px] text-muted-foreground">Claimed agent #{p.agent.agentId}, not verified</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="neutral">{hedera ? "USDC on Hedera" : "USDT on Whitechain"}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        ${(Number(p.amount) / 1e6).toFixed(2)}
                        {Number(p.refunded ?? 0) > 0 && <p className="text-xs text-warning-foreground">−${(Number(p.refunded) / 1e6).toFixed(2)}</p>}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          {Number(p.refunded ?? 0) > 0 && <Badge variant="refunded">Refunded</Badge>}
                          <RecordLink href={p.refunds?.length ? explorerTx(p.refunds.at(-1)!.tx) : agentExplorerTx(p)}>{hedera ? "HashScan" : "Explorer"}</RecordLink>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {/* Only the wallet that was paid can sign the refund, and only on Whitechain. */}
                        {!hedera && address && p.payTo.toLowerCase() === address.toLowerCase() && Number(p.refunded ?? 0) < Number(p.amount) && (
                          <Button variant="outline" size="sm" isLoading={busy === p.key} disabled={busy !== undefined} onClick={() => setConfirmingAgent(p)}>
                            Refund
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>
      )}

      <AlertDialog open={!!confirming} onOpenChange={open => !open && setConfirming(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund ${confirming ? refundAmount(confirming).toFixed(2) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && (
                <>
                  It goes back to {short(confirming.payer ?? "")} for “{confirming.description}”, on Whitechain. Refunds can't be undone, and the total can't pass what was paid
                  (${refundLeft(confirming).toFixed(2)} left).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="brand"
              onClick={() => {
                const o = confirming
                setConfirming(undefined)
                if (o) void refund(o)
              }}
            >
              Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmingAgent} onOpenChange={open => !open && setConfirmingAgent(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund ${confirmingAgent ? ((Number(confirmingAgent.amount) - Number(confirmingAgent.refunded ?? 0)) / 1e6).toFixed(2) : ""} to the agent?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingAgent && <>It goes back to the agent's wallet {short(confirmingAgent.payer)} in USDT on Whitechain. You pay no gas. Refunds can't be undone.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="brand"
              onClick={() => {
                const p = confirmingAgent
                setConfirmingAgent(undefined)
                if (p) void refundAgent(p)
              }}
            >
              Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
