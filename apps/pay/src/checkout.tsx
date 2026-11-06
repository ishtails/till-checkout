import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth"
import { useEffect, useState } from "react"
import type { Address, Hex } from "viem"
import { api, usdtBalance, type CheckoutInfo } from "./api"
import { CheckCircleIcon, CoinsIcon, EnvelopeSimpleIcon, ReceiptIcon } from "@phosphor-icons/react"
import { Badge, Button, Money, Muted, Shell } from "./ui"

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

type Step = { kind: "ready" } | { kind: "paying" } | { kind: "paid"; tx: Hex } | { kind: "error"; message: string }

export function Checkout({ id }: { id: string }) {
  const { ready, authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
  const { signTypedData } = useSignTypedData()
  const [info, setInfo] = useState<CheckoutInfo>()
  const [loadError, setLoadError] = useState<string>()
  const [balance, setBalance] = useState<number>()
  const [step, setStep] = useState<Step>({ kind: "ready" })
  const [faucet, setFaucet] = useState<{ enabled: boolean; drip?: string }>()
  const [drip, setDrip] = useState<{ kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }>({ kind: "idle" })

  const wallet = wallets.find(w => w.walletClientType === "privy")
  const address = wallet?.address as Address | undefined

  useEffect(() => {
    api.checkout(id).then(setInfo, e => setLoadError(e.message))
  }, [id])

  useEffect(() => {
    if (address && info) usdtBalance(address, info.token).then(setBalance)
  }, [address, info, step.kind, drip.kind])

  useEffect(() => {
    api.faucet().then(setFaucet, () => setFaucet({ enabled: false }))
  }, [])

  if (loadError) return <Shell><p className="text-destructive">{loadError}</p></Shell>
  if (!info || !ready) return <Shell><Muted>Loading…</Muted></Shell>

  const alreadyPaid = info.status !== "open"
  const short = balance !== undefined && balance < Number(info.amount)

  // Live demo only: a new email wallet holds no USDT, so the server's faucet sends a little, gas-free.
  async function getTestUsdt() {
    if (!address) return
    setDrip({ kind: "sending" })
    try {
      await api.drip(address)
      setDrip({ kind: "sent" })
    } catch (e) {
      setDrip({ kind: "error", message: (e as Error).message })
    }
  }

  async function pay() {
    if (!info || !address) return
    setStep({ kind: "paying" })
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
      const { txHash } = await api.pay(id, { payer: address, validAfter: 0, validBefore: fresh.validBefore, signature: signature as Hex })
      setStep({ kind: "paid", tx: txHash })
    } catch (e) {
      setStep({ kind: "error", message: (e as Error).message })
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
            <Badge variant="paid" className="h-8 px-3 text-sm">
              <CheckCircleIcon weight="fill" />
              Paid
            </Badge>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => (location.href = `/receipt/${id}`)}>
                <ReceiptIcon />
                View receipt
              </Button>
              <Button onClick={() => (location.href = info.returnUrl + `?order=${id}`)}>Back to {info.merchantName}</Button>
            </div>
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
              <span className="truncate text-muted-foreground">{user?.email?.address ?? user?.google?.email}</span>
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
            <Button variant="brand" size="lg" className="w-full" isLoading={step.kind === "paying"} disabled={!address || short} onClick={pay}>
              {step.kind === "paying" ? "Paying…" : `Pay $${Number(info.amount).toFixed(2)}`}
            </Button>
            {step.kind === "error" && <p className="text-sm text-destructive">{step.message}</p>}
          </div>
        )}
      </div>
    </Shell>
  )
}
