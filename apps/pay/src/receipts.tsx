import { usePrivy, useWallets } from "@privy-io/react-auth"
import { ArrowRightIcon, DatabaseIcon, EnvelopeSimpleIcon, RobotIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { RESEARCH_AGENT_ID } from "@till/identity"
import { AccountMenu } from "./account-menu"
import { readLog } from "./agent"
import { api, type AgentInfo } from "./api"
import { arkivExplorer, receipts, type ReceiptRecord } from "./arkiv"
import { Badge, Button, Card, Logo, Muted, RecordLink, Shell } from "./ui"

// The customer's side of Till. Purchases are read from Arkiv by wallet address: no shop holds this
// list and our server isn't asked. /account is the signed-in customer's dashboard (purchases, and
// their agent if they own one); /receipts/<address> shows any address's purchases.

/** Everything one wallet bought from any Till shop, with totals, read from Arkiv. */
function Purchases({ address }: { address: string }) {
  const [records, setRecords] = useState<ReceiptRecord[]>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    receipts.payer(address).then(setRecords, e => setError(e.message))
  }, [address])

  if (error) return <p className="text-destructive">{error}</p>
  if (!records) return <Muted>Reading your purchases from Arkiv…</Muted>

  // Records are oldest first, so the last one for an order is its current state.
  const orders = [...new Map(records.map(r => [r.orderId, r])).values()].reverse()
  const paidAt = new Map(records.filter(r => r.event === "paid").map(r => [r.orderId, r.eventTime]))
  const paid = orders.reduce((a, r) => a + Number(r.amountUsd), 0)
  const refunded = orders.reduce((a, r) => a + Number(r.refundedUsd), 0)
  const shops = new Set(orders.map(r => r.merchant)).size

  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
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
      {orders.length === 0 && <Muted className="mt-4">No purchases for this address yet.</Muted>}

      <div className="mt-5 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <DatabaseIcon className="size-4 shrink-0" />
        <span>
          Read from Arkiv, {records.length} {records.length === 1 ? "record" : "records"}. No shop holds this list ·{" "}
          <RecordLink href={arkivExplorer("payer", address)}>On Arkiv</RecordLink>
        </span>
      </div>
    </>
  )
}

/** Any wallet's purchases: /receipts/<address>. */
export function Receipts({ address }: { address: string }) {
  return (
    <Shell>
      <h1 className="text-xl">Receipts</h1>
      <p className="mt-1 mb-5 break-all font-mono text-[11px] text-muted-foreground">{address}</p>
      <Purchases address={address} />
    </Shell>
  )
}

/** The customer's agent, if this wallet owns one: today's spending against its budget, read from its public log. */
function YourAgent({ address }: { address: string }) {
  const [info, setInfo] = useState<AgentInfo>()
  const [today, setToday] = useState<{ spent: number; blocked: number; waiting: number }>()

  useEffect(() => void api.agent().then(setInfo, () => {}), [])
  const owns = !!info?.owner && info.owner.toLowerCase() === address.toLowerCase()

  useEffect(() => {
    if (!owns || !info?.topicId) return
    const day = new Date().toISOString().slice(0, 10)
    Promise.all([readLog(info.topicId), api.approvals()]).then(([log, approvals]) => {
      const todays = log.filter(e => e.ts?.slice(0, 10) === day && Number.isFinite(Number(e.usd)))
      setToday({
        spent: todays.filter(e => e.type === "agent.paid").reduce((s, e) => s + Number(e.usd), 0),
        blocked: todays.filter(e => e.type === "agent.blocked").length,
        waiting: approvals.filter(a => a.status === "pending").length,
      })
    }, () => {})
  }, [owns, info?.topicId])

  if (!owns || !info) return null
  const budget = info.policy.dailyBudgetUsd
  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <RobotIcon className="size-4 text-brand" weight="duotone" />
            Your agent · research agent #{RESEARCH_AGENT_ID}
          </p>
          <Muted className="mt-1 text-sm">
            {today
              ? `Spent $${today.spent.toFixed(2)} of its $${budget.toFixed(2)} budget today · ${today.blocked} blocked`
              : "Reading its log on Hedera…"}
          </Muted>
          {!!today?.waiting && (
            <p className="mt-1 text-sm font-medium text-warning-foreground">
              {today.waiting} {today.waiting === 1 ? "payment is" : "payments are"} waiting for your approval
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => location.assign(`/agent/${RESEARCH_AGENT_ID}`)}>
          Open console <ArrowRightIcon />
        </Button>
      </div>
    </Card>
  )
}

/** The signed-in customer's dashboard: /account. */
export function Account() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const address = wallets.find(w => w.walletClientType === "privy")?.address
  const email = user?.email?.address ?? user?.google?.email
  const switchAccount = () => logout().then(() => login())

  return (
    <div className="min-h-svh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden text-sm text-muted-foreground sm:inline">Your account</span>
          </div>
          {!ready ? null : authenticated ? (
            <AccountMenu email={email} address={address} onSwitch={switchAccount} onSignOut={() => void logout()} />
          ) : (
            <Button size="sm" onClick={login}>
              Sign in
            </Button>
          )}
        </div>
      </header>

      {!ready || (authenticated && !address) ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <Muted>Loading…</Muted>
        </main>
      ) : !authenticated || !address ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl">Your account</h1>
          <Muted className="mt-2">Everything you bought from any shop that uses Till, in one place. And your agent, if you have one.</Muted>
          <Button size="lg" className="mt-6" onClick={login}>
            <EnvelopeSimpleIcon />
            Sign in with the email you paid with
          </Button>
        </main>
      ) : (
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
          <div>
            <h1 className="text-xl">Your account</h1>
            <Muted className="mt-1">Your purchases from every Till shop, and your agent.</Muted>
          </div>
          <YourAgent address={address} />
          <section>
            <h2 className="mb-3 text-lg">Your purchases</h2>
            <Card className="gap-0 p-5">
              <Purchases address={address} />
            </Card>
          </section>
        </main>
      )}
    </div>
  )
}
