import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth"
import { ArrowLeftIcon, CheckCircleIcon, CoinsIcon, EnvelopeSimpleIcon, ReceiptIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Address, Hex } from "viem"
import { api, explorerTx, usdtBalance, type CheckoutInfo } from "./api"
import { friendly } from "./lib/errors"
import { Badge, Button, Money, Muted, RecordLink, Shell } from "./ui"

export const receiveTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
}

type Step =
  | { kind: "ready" }
  | { kind: "signing" }
  | { kind: "sending" }
  | { kind: "paid"; tx: Hex; pass: string }
  | { kind: "error"; message: string }

const RETURN_SECONDS = 5

export function Checkout({ id }: { id: string }) {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { signTypedData } = useSignTypedData()
  const [info, setInfo] = useState<CheckoutInfo>()
  const [loadError, setLoadError] = useState<string>()
  const [balance, setBalance] = useState<number>()
  const [step, setStep] = useState<Step>({ kind: "ready" })
  const [faucet, setFaucet] = useState<{ enabled: boolean; drip?: string }>()
  const [drip, setDrip] = useState<{ kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }>({ kind: "idle" })
  const [countdown, setCountdown] = useState<number>()

  const wallet = wallets.find(w => w.walletClientType === "privy")
  const address = wallet?.address as Address | undefined

  useEffect(() => {
    api.checkout(id).then(setInfo, e => setLoadError(friendly(e.message)))
  }, [id])

  useEffect(() => {
    if (address && info) usdtBalance(address, info.token).then(setBalance)
  }, [address, info, step.kind, drip.kind])

  useEffect(() => {
    api.faucet().then(setFaucet, () => setFaucet({ enabled: false }))
  }, [])

  // Back to the shop, carrying the sign-in pass from this payment, so the shop knows who paid.
  const backToShop = () => {
    if (!info) return
    const url = info.returnUrl + `?order=${id}`
    location.href = step.kind === "paid" ? `${url}&till_pass=${step.pass}` : url
  }

  // After paying here, go back to the shop on its own, unless the customer stops it.
  useEffect(() => {
    if (countdown === undefined || !info) return
    if (countdown <= 0) {
      backToShop()
      return
    }
    const t = setTimeout(() => setCountdown(c => (c === undefined ? c : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown, info, id])

  if (loadError)
    return (
      <Shell>
        <p className="text-sm">{loadError}</p>
        <Button variant="outline" className="mt-5" onClick={() => history.back()}>
          <ArrowLeftIcon />
          Go back
        </Button>
      </Shell>
    )
  if (!info || !ready) return <Shell><Muted>Loading…</Muted></Shell>

  const alreadyPaid = info.status !== "open"
  const short = balance !== undefined && balance < Number(info.amount)
  const busy = step.kind === "signing" || step.kind === "sending"
  const email = user?.email?.address ?? user?.google?.email

  async function switchAccount() {
    await logout()
    setBalance(undefined)
    setDrip({ kind: "idle" })
    setStep({ kind: "ready" })
    login()
  }

  // Live demo only: a new email wallet holds no USDT, so the server's faucet sends a little, gas-free.
  async function getTestUsdt() {
    if (!address) return
    setDrip({ kind: "sending" })
    try {
      const { amount } = await api.drip(address)
      setDrip({ kind: "sent" })
      toast.success(`+${amount} test USDT received`, { description: "You can pay now." })
    } catch (e) {
      setDrip({ kind: "error", message: friendly((e as Error).message) })
    }
  }

  async function pay() {
    if (!info || !address) return
    setStep({ kind: "signing" })
    try {
      // Fresh validity window, so the signature never outlives a few minutes.
      const fresh = await api.checkout(id)
      const { signature } = await signTypedData(
        {
          domain: fresh.domain,
          types: receiveTypes,
          primaryType: "ReceiveWithAuthorization",
          message: {
            from: address,
            to: fresh.contract,
            value: fresh.amountAtomic,
            validAfter: "0",
            validBefore: String(fresh.validBefore),
            nonce: fresh.nonce,
          },
        },
        { address, uiOptions: { showWalletUIs: false } },
      )
      setStep({ kind: "sending" })
      const { txHash, pass } = await api.pay(id, { payer: address, validAfter: 0, validBefore: fresh.validBefore, signature: signature as Hex })
      setStep({ kind: "paid", tx: txHash, pass })
      setCountdown(RETURN_SECONDS)
      toast.success("Payment confirmed", { description: `$${Number(info.amount).toFixed(2)} to ${info.merchantName}` })
    } catch (e) {
      setStep({ kind: "error", message: friendly((e as Error).message) })
    }
  }

  return (
    <Shell>
      <Muted>{info.merchantName}</Muted>
      <h1 className="mt-1 text-xl">{info.description}</h1>
      <Money usd={info.amount} className="mt-5 text-5xl" />
      <p className="mt-1 text-xs text-muted-foreground">USDT on Whitechain · no gas to pay</p>

      <div className="mt-8">
        {step.kind === "paid" || alreadyPaid ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="paid" className="h-8 px-3 text-sm">
                <CheckCircleIcon weight="fill" />
                Paid
              </Badge>
              {step.kind === "paid" && <RecordLink href={explorerTx(step.tx)}>See the transaction</RecordLink>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => (location.href = `/receipt/${id}`)}>
                <ReceiptIcon />
                View receipt
              </Button>
              <Button onClick={backToShop}>Back to {info.merchantName}</Button>
            </div>
            {countdown !== undefined && (
              <p className="text-center text-xs text-muted-foreground">
                Returning to {info.merchantName} in {countdown} s ·{" "}
                <button className="underline" onClick={() => setCountdown(undefined)}>
                  Stay here
                </button>
              </p>
            )}
          </div>
        ) : !authenticated ? (
          <div className="space-y-3">
            <Button size="lg" className="w-full" onClick={login}>
              <EnvelopeSimpleIcon />
              Continue with email
            </Button>
            <p className="text-center text-xs text-muted-foreground">No wallet app, no seed phrase. Your email is enough.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate text-muted-foreground">{email}</p>
                <button className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50" disabled={busy} onClick={switchAccount}>
                  Not you? Switch account
                </button>
              </div>
              {balance !== undefined && <span className="shrink-0 font-medium tabular-nums">{balance.toFixed(2)} USDT</span>}
            </div>
            {short && faucet?.enabled && drip.kind !== "sent" && (
              <div className="rounded-lg bg-secondary p-4 text-sm text-secondary-foreground">
                <p>This is a testnet demo, and your new wallet has no test USDT yet.</p>
                <Button variant="outline" size="sm" className="mt-3" isLoading={drip.kind === "sending"} disabled={!address} onClick={getTestUsdt}>
                  {drip.kind !== "sending" && <CoinsIcon />}
                  {drip.kind === "sending" ? "Sending…" : `Get ${faucet.drip} test USDT`}
                </Button>
                {drip.kind === "error" && <p className="mt-2 text-destructive">{drip.message}</p>}
              </div>
            )}
            <Button variant="brand" size="lg" className="w-full" isLoading={busy} disabled={!address || short} onClick={pay}>
              {step.kind === "signing" ? "Signing…" : step.kind === "sending" ? "Confirming on Whitechain…" : `Pay $${Number(info.amount).toFixed(2)}`}
            </Button>
            {busy && (
              <ol className="flex justify-center gap-4 text-xs text-muted-foreground">
                <li className={step.kind === "signing" ? "font-medium text-foreground" : ""}>1. Sign</li>
                <li className={step.kind === "sending" ? "font-medium text-foreground" : ""}>2. Confirm on chain</li>
                <li>3. Paid</li>
              </ol>
            )}
            {step.kind === "error" && <p className="text-sm text-destructive">{step.message}</p>}
          </div>
        )}
      </div>
    </Shell>
  )
}
