import { usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth"
import { CheckCircleIcon, HandPalmIcon, PauseCircleIcon, ProhibitIcon, RobotIcon, SealCheckIcon, ShieldCheckIcon, WalletIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Address, Hex } from "viem"
import { decisionMessage } from "@till/guard/approvals"
import { limitsMessage, limitsOf, limitsProblem, type Limits } from "@till/guard/limits"
import { api, type AgentInfo, type Approval } from "./api"
import { Input } from "./components/ui/input"
import { entityExplorer, registry, type ListingRecord } from "./arkiv"
import { readAgent, RESEARCH_AGENT_ID, type AgentIdentity } from "@till/identity"
import { friendly } from "./lib/errors"
import { Badge, Button, Card, Logo, Muted, RecordLink } from "./ui"

// The agent owner's console: what the agent spent and was stopped from spending, read from its
// public log on Hedera, plus the payments it paused for the owner to approve or deny.
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"
const short = (s: string) => (s.startsWith("0x") ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)
const money = (usd: string | number) => `$${Number(usd).toFixed(2)}`
const today = () => new Date().toISOString().slice(0, 10)

type Entry = {
  seq: number
  ts: string
  type: "agent.paid" | "agent.blocked" | "agent.approval_requested" | "agent.approved" | "agent.denied"
  usd: string
  payTo: string
  network: string
  merchant?: string
  resource?: string
  reasons?: string[]
  tx?: string
  by?: string
  registry?: string // the Arkiv entity the payee was checked against
  claimed?: string // who the agent thought it was paying
}

async function readLog(topicId: string): Promise<Entry[]> {
  const res = await fetch(`${MIRROR}/topics/${topicId}/messages?order=desc&limit=50`)
  const { messages = [] } = (await res.json()) as { messages?: { sequence_number: number; message: string }[] }
  return messages.flatMap(m => {
    try {
      // Base64 of UTF-8 text: atob alone would garble "…" and other non-ASCII characters.
      const bytes = Uint8Array.from(atob(m.message), c => c.charCodeAt(0))
      return [{ ...JSON.parse(new TextDecoder().decode(bytes)), seq: m.sequence_number }]
    } catch {
      return []
    }
  })
}

const txLink = (e: Entry) =>
  e.network.startsWith("hedera") ? `https://hashscan.io/testnet/transaction/${e.tx}` : `https://explorer.testnet.whitechain.io/tx/${e.tx}`

function Stat({ label, value, note, children }: { label: string; value: string; note: string; children?: React.ReactNode }) {
  return (
    <Card className="gap-0 p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {children}
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </Card>
  )
}

const LABEL: Record<Entry["type"], { text: string; variant: "paid" | "blocked" | "neutral" | "refunded"; icon: React.ReactNode }> = {
  "agent.paid": { text: "Paid", variant: "paid", icon: <CheckCircleIcon weight="fill" /> },
  "agent.blocked": { text: "Blocked", variant: "blocked", icon: <ProhibitIcon weight="bold" /> },
  "agent.approval_requested": { text: "Asked you", variant: "refunded", icon: <PauseCircleIcon weight="fill" /> },
  "agent.approved": { text: "Approved", variant: "paid", icon: <ShieldCheckIcon weight="fill" /> },
  "agent.denied": { text: "Denied", variant: "blocked", icon: <HandPalmIcon weight="fill" /> },
}

// Whether the allowlisted merchant is in Till's registry on Arkiv, at the same addresses.
function OnArkiv({ listing, payTo, loading }: { listing?: ListingRecord; payTo: Record<string, string>; loading: boolean }) {
  if (loading) return <p className="mt-1 text-xs text-muted-foreground">Checking Arkiv…</p>
  if (!listing) return <p className="mt-1 text-xs text-destructive">Not listed on Arkiv, so every payment to it is blocked.</p>
  const matches = Object.entries(payTo).every(([n, a]) => (listing.payTo as Record<string, string>)[n]?.toLowerCase() === a.toLowerCase())
  return (
    <RecordLink className="mt-1" href={listing.explorerUrl}>
      {matches ? "Found on Arkiv, same addresses" : "On Arkiv, but at different addresses"}
    </RecordLink>
  )
}

// The agent's registered identity on Hedera, in one line: shops it pays see it as a verified agent.
function IdentityCard({ identity, topicId }: { identity?: AgentIdentity | "error"; topicId?: string }) {
  if (!identity || identity === "error") return null
  const logMatches = !!topicId && identity.hcsTopic === topicId
  return (
    <Card className="mt-6 gap-0 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <SealCheckIcon className="size-4 text-brand" weight="fill" />
          <span className="font-medium">Verified agent #{identity.agentId}</span>
          <span className="text-muted-foreground">ERC-8004 on Hedera · shops it pays can check who it is</span>
        </p>
        <RecordLink href={identity.explorerUrl}>Registry on HashScan</RecordLink>
      </div>
      {!logMatches && <p className="mt-1 text-xs text-destructive">This log ({topicId ?? "none"}) isn't the one registered for the agent ({identity.hcsTopic ?? "none"}).</p>}
    </Card>
  )
}

export function AgentConsole() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { signMessage } = useSignMessage()
  const [info, setInfo] = useState<AgentInfo>()
  const [approvals, setApprovals] = useState<Approval[]>()
  const [log, setLog] = useState<Entry[]>()
  const [listed, setListed] = useState<ListingRecord[]>()
  const [identity, setIdentity] = useState<AgentIdentity | "error">()
  const [busy, setBusy] = useState<string>()
  // The limits being edited, as typed (strings), or undefined when not editing.
  const [draft, setDraft] = useState<{ daily: string; auto: string; merchants: Record<string, { call: string; day: string }> }>()
  const seen = useRef<Set<string>>(new Set())

  const address = wallets.find(w => w.walletClientType === "privy")?.address as Address | undefined
  const isOwner = !!address && !!info?.owner && info.owner.toLowerCase() === address.toLowerCase()
  const email = user?.email?.address ?? user?.google?.email
  const switchAccount = () => logout().then(() => login())

  useEffect(() => {
    api.agent().then(setInfo, e => toast.error(friendly(e.message)))
    // The same registry the agent finds sellers in, read from Arkiv in the browser.
    registry.list().then(setListed, () => setListed([]))
    // Its ERC-8004 entry on Hedera, read in the browser: who owns it, the wallet it pays from, its log.
    readAgent(RESEARCH_AGENT_ID).then(setIdentity, () => setIdentity("error"))
  }, [])

  // Approvals every 2 s (the agent is waiting); the Hedera log every 4 s.
  useEffect(() => {
    if (!info) return
    const loadApprovals = () =>
      api.approvals().then(list => {
        setApprovals(list)
        const fresh = list.filter(a => a.status === "pending" && !seen.current.has(a.id))
        if (fresh.length && seen.current.size + fresh.length > fresh.length) {
          toast(`Your agent is asking to pay ${money(fresh[0].usd)}`, { description: `To ${fresh[0].merchant ?? short(fresh[0].payTo)}. Approve or deny it here.` })
          navigator.vibrate?.(200)
        }
        list.forEach(a => seen.current.add(a.id))
        // Mark the first load as seen, so old requests don't toast.
        if (seen.current.size === 0) seen.current.add("·")
      }, () => {})
    const loadLog = () => info.topicId && readLog(info.topicId).then(all => setLog(all.filter(e => e.type in LABEL && Number.isFinite(Number(e.usd)))), () => {}) // skips early test messages
    void loadApprovals()
    void loadLog()
    const a = setInterval(() => !document.hidden && loadApprovals(), 2000)
    const l = setInterval(() => !document.hidden && loadLog(), 4000)
    return () => {
      clearInterval(a)
      clearInterval(l)
    }
  }, [info])

  const pending = approvals?.filter(a => a.status === "pending") ?? []
  useEffect(() => {
    document.title = pending.length ? `(${pending.length}) Approval needed · Till` : "Agent console · Till"
  }, [pending.length])

  async function decide(a: Approval, decision: "approve" | "deny") {
    if (!address) return
    setBusy(a.id + decision)
    try {
      // The agent's guard rebuilds this exact text and checks it was signed by an owner's wallet.
      const message = decisionMessage(a, decision)
      const { signature } = await signMessage({ message }, { address, uiOptions: { showWalletUIs: false } })
      await api.decide(a.id, { decision, address, signature: signature as Hex })
      toast.success(decision === "approve" ? `Approved ${money(a.usd)}. Your agent is paying now.` : "Denied. Nothing was paid.")
      setApprovals(await api.approvals())
    } catch (e) {
      toast.error(friendly((e as Error).message))
    } finally {
      setBusy(undefined)
    }
  }

  function startEditing() {
    if (!info) return
    const p = info.policy
    setDraft({
      daily: String(p.dailyBudgetUsd),
      auto: String(p.approvalAboveUsd),
      merchants: Object.fromEntries(p.merchants.map(m => [m.name, { call: String(m.maxPerCallUsd), day: String(m.dailyCapUsd) }])),
    })
  }

  // The owner signs the new limits; the agent checks that signature itself before using them.
  async function saveLimits() {
    if (!info || !draft || !address) return
    const limits: Limits = {
      dailyBudgetUsd: Number(draft.daily),
      approvalAboveUsd: Number(draft.auto),
      merchants: Object.fromEntries(Object.entries(draft.merchants).map(([n, m]) => [n, { maxPerCallUsd: Number(m.call), dailyCapUsd: Number(m.day) }])),
    }
    const problem = limitsProblem(info.policy, limits)
    if (problem) return toast.error(problem.charAt(0).toUpperCase() + problem.slice(1) + ".")
    setBusy("limits")
    try {
      const issuedAt = new Date().toISOString()
      const { signature } = await signMessage({ message: limitsMessage(info.name, limits, issuedAt) }, { address, uiOptions: { showWalletUIs: false } })
      const r = await api.setLimits({ limits, issuedAt, address, signature: signature as Hex })
      setInfo({ ...info, policy: r.policy, limits: r.limits })
      setDraft(undefined)
      toast.success("New limits signed", { description: "Your agent checks your signature and uses them from its next payment." })
    } catch (e) {
      toast.error(friendly((e as Error).message))
    } finally {
      setBusy(undefined)
    }
  }

  const todays = log?.filter(e => e.ts.slice(0, 10) === today()) ?? []
  const spent = todays.filter(e => e.type === "agent.paid").reduce((s, e) => s + Number(e.usd), 0)
  const budget = info?.policy.dailyBudgetUsd ?? 0
  const stopped = todays.filter(e => e.type === "agent.blocked" || e.type === "agent.denied").length
  // Older log entries carry only the address, so name known payees from the policy.
  const known = (payTo: string) => info?.policy.merchants.find(m => Object.values(m.payTo).some(p => p.toLowerCase() === payTo.toLowerCase()))?.name
  const payee = (e: { merchant?: string; payTo: string }) => e.merchant ?? known(e.payTo) ?? short(e.payTo)

  return (
    <div className="min-h-svh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden text-sm text-muted-foreground sm:inline">Agent console</span>
          </div>
          {!ready ? null : authenticated ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex flex-col items-end leading-tight">
                {email && <span className="max-w-[45vw] truncate text-foreground">{email}</span>}
                {address && (
                  <span className="font-mono">
                    {short(address)} · <span className={isOwner ? "font-medium text-brand" : "text-destructive"}>{isOwner ? "owner" : "not the owner"}</span>
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={switchAccount}>
                Switch account
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={login}>
              Owner sign in
            </Button>
          )}
        </div>
      </header>

      {!ready || !info ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <Muted>Loading…</Muted>
        </main>
      ) : !authenticated ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl">Agent console</h1>
          <Muted className="mt-2">Only the agent's owner can open this: approve payments it pauses, and set its limits.</Muted>
          <Button size="lg" className="mt-6" onClick={login}>
            Owner sign in
          </Button>
        </main>
      ) : !isOwner ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl">This account isn't the agent's owner</h1>
          <Muted className="mt-2">
            You're signed in as {email ?? "this account"}
            {address && <> with wallet <span className="font-mono">{short(address)}</span></>}. The owner's wallet is{" "}
            <span className="font-mono">{short(info.owner ?? "")}</span>.
          </Muted>
          <Button size="lg" className="mt-6" onClick={switchAccount}>
            Switch account
          </Button>
        </main>
      ) : (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl">
              <RobotIcon className="size-5 text-brand" weight="duotone" />
              Research agent
            </h1>
            <Muted className="mt-1">
              Pays for data on its own, within your limits. Every payment, block and approval is on a public log on Hedera.
            </Muted>
          </div>
          {info?.topicId && <RecordLink href={`https://hashscan.io/testnet/topic/${info.topicId}`}>Log on HashScan · {info.topicId}</RecordLink>}
        </div>

        <IdentityCard identity={identity} topicId={info?.topicId ?? undefined} />

        {pending.map(a => (
          <Card key={a.id} className="mt-6 gap-0 border-warning/60 bg-warning/10 p-5 ring-2 ring-warning/30">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-medium text-warning-foreground">
                  <PauseCircleIcon className="size-4" weight="fill" />
                  Waiting for you · paused, nothing signed yet
                </p>
                <p className="mt-2 text-lg font-semibold">
                  Pay {money(a.usd)} to {payee(a)}?
                </p>
                <Muted className="mt-1">
                  {a.resource && <span className="font-mono text-xs break-all">{a.resource}</span>}
                  <br />
                  It passes every rule, but it's above your {money(info?.policy.approvalAboveUsd ?? 0)} auto-pay limit. Paid in{" "}
                  {a.network.startsWith("hedera") ? "USDC on Hedera" : "USDT on Whitechain"}.
                </Muted>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                {!authenticated ? (
                  <Button size="lg" className="w-full sm:w-auto" onClick={login}>
                    Sign in to answer
                  </Button>
                ) : !isOwner ? (
                  <Muted>Only the owner ({short(info?.owner ?? "")}) can answer.</Muted>
                ) : (
                  <>
                    <Button variant="outline" size="lg" className="flex-1 sm:flex-none" isLoading={busy === a.id + "deny"} disabled={!!busy} onClick={() => decide(a, "deny")}>
                      Deny
                    </Button>
                    <Button variant="brand" size="lg" className="flex-1 sm:flex-none" isLoading={busy === a.id + "approve"} disabled={!!busy} onClick={() => decide(a, "approve")}>
                      Approve {money(a.usd)}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Spent today" value={`${money(spent)} of ${money(budget)}`} note={`${money(Math.max(budget - spent, 0))} left in today's budget`}>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${budget ? Math.min((spent / budget) * 100, 100) : 0}%` }} />
            </div>
          </Stat>
          <Stat label="Auto-pays up to" value={money(info?.policy.approvalAboveUsd ?? 0)} note="Above that, it pauses and asks you." />
          <Stat label="Stopped today" value={String(stopped)} note="Blocked by a rule, or denied by you." />
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            <h2 className="text-lg">Activity</h2>
            <Muted>Read back from Hedera, not from the agent's memory.</Muted>
            <Card className="mt-4 gap-0 divide-y py-0">
              {!log ? (
                <Muted className="p-5">Loading…</Muted>
              ) : log.length === 0 ? (
                <Muted className="p-5">Nothing yet.</Muted>
              ) : (
                log.map(e => {
                  const l = LABEL[e.type] ?? LABEL["agent.paid"]
                  return (
                    <div key={e.seq} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={l.variant}>
                            {l.icon}
                            {l.text}
                          </Badge>
                          <span className="text-sm font-medium tabular-nums">{money(e.usd)}</span>
                          <span className="text-sm text-muted-foreground">
                            to {payee(e)}
                            {e.claimed && `, posing as ${e.claimed}`}
                          </span>
                        </div>
                        {e.reasons?.length ? <p className="mt-1 text-xs text-muted-foreground">{e.reasons.join(" · ")}</p> : null}
                        {e.by && <p className="mt-1 text-xs text-muted-foreground">by {short(e.by)}</p>}
                        {e.registry && (
                          <RecordLink className="mt-1" href={entityExplorer(e.registry)}>
                            {e.type === "agent.blocked" || e.type === "agent.denied" ? "Checked against Arkiv" : `Found ${e.merchant ?? "seller"} on Arkiv`}
                          </RecordLink>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                        <span>{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {e.tx && <RecordLink href={txLink(e)}>Payment</RecordLink>}
                        <RecordLink href={`${MIRROR}/topics/${info!.topicId}/messages/${e.seq}`}>Log #{e.seq}</RecordLink>
                      </div>
                    </div>
                  )
                })
              )}
            </Card>
          </section>

          <aside>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg">Limits</h2>
              {isOwner && !draft && (
                <Button variant="outline" size="xs" onClick={startEditing}>
                  Edit
                </Button>
              )}
            </div>
            <Muted>Checked below the model, so it can't talk its way past them.</Muted>
            {draft ? (
              <Card className="mt-4 gap-3 p-5 text-sm">
                <LimitField label="Daily budget" value={draft.daily} onChange={v => setDraft({ ...draft, daily: v })} />
                <LimitField label="Asks you above" value={draft.auto} onChange={v => setDraft({ ...draft, auto: v })} />
                {Object.entries(draft.merchants).map(([name, m]) => (
                  <div key={name} className="space-y-2 rounded-lg bg-muted px-3 py-2.5">
                    <p className="flex items-center gap-1.5 font-medium">
                      <WalletIcon className="size-3.5" weight="fill" />
                      {name}
                    </p>
                    <LimitField label="Per call" value={m.call} onChange={v => setDraft({ ...draft, merchants: { ...draft.merchants, [name]: { ...m, call: v } } })} />
                    <LimitField label="Per day" value={m.day} onChange={v => setDraft({ ...draft, merchants: { ...draft.merchants, [name]: { ...m, day: v } } })} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">You sign the new limits with your wallet. Payees can't be changed here.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={busy === "limits"} onClick={() => setDraft(undefined)}>
                    Cancel
                  </Button>
                  <Button variant="brand" className="flex-1" isLoading={busy === "limits"} onClick={saveLimits}>
                    Sign and save
                  </Button>
                </div>
              </Card>
            ) : (
            <Card className="mt-4 gap-3 p-5 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Daily budget</span>
                <span className="tabular-nums">{money(budget)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Asks you above</span>
                <span className="tabular-nums">{money(info?.policy.approvalAboveUsd ?? 0)}</span>
              </p>
              {info?.policy.merchants.map(m => (
                <div key={m.name} className="rounded-lg bg-muted px-3 py-2.5">
                  <p className="flex items-center gap-1.5 font-medium">
                    <WalletIcon className="size-3.5" weight="fill" />
                    {m.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Up to {money(m.maxPerCallUsd)} a call, {money(m.dailyCapUsd)} a day. Pays only {Object.values(m.payTo).map(short).join(" or ")}.
                  </p>
                  <OnArkiv listing={listed?.find(l => l.name.toLowerCase() === m.name.toLowerCase())} payTo={m.payTo} loading={!listed} />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Every payee is also checked against the seller's record on Arkiv. Any other payee, asset or amount over a cap is blocked outright. There's nothing to approve: a broken rule isn't unusual, it's wrong.
              </p>
              {info?.limits && (
                <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                  <ShieldCheckIcon className="size-3.5 shrink-0 text-brand" weight="fill" />
                  Set by {short(info.limits.by)} on {new Date(info.limits.issuedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, signed with the owner's wallet. The agent checks the signature itself.
                </p>
              )}
            </Card>
            )}
          </aside>
        </div>
      </main>
      )}
    </div>
  )
}

function LimitField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="relative">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input className="h-8 w-24 pl-5 text-right tabular-nums" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} />
      </span>
    </label>
  )
}
