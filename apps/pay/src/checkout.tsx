import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth"
import { useEffect, useState } from "react"
import type { Address, Hex } from "viem"
import { api, usdtBalance, type CheckoutInfo } from "./api"
import { Card, Money } from "./ui"

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

  if (loadError) return <Card><p className="text-red-700">{loadError}</p></Card>
  if (!info || !ready) return <Card><p className="text-stone-500">Loading…</p></Card>

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
    <Card>
      <p className="text-sm text-stone-500">{info.merchantName}</p>
      <h1 className="mt-1 text-xl font-semibold">{info.description}</h1>
      <Money usd={info.amount} className="mt-4 text-4xl" />

      <div className="mt-8">
        {step.kind === "paid" || alreadyPaid ? (
          <div className="space-y-4">
            <p className="text-lg font-medium text-emerald-700">Paid ✓</p>
            <div className="flex gap-3">
              <a className="rounded-lg border border-stone-300 px-4 py-2" href={`/receipt/${id}`}>
                View receipt
              </a>
              <a className="rounded-lg bg-stone-900 px-4 py-2 text-white" href={info.returnUrl + `?order=${id}`}>
                Back to {info.merchantName}
              </a>
            </div>
          </div>
        ) : !authenticated ? (
          <button className="w-full rounded-lg bg-stone-900 py-3 text-white" onClick={login}>
            Continue with email
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">
              Signed in as {user?.email?.address}
              {balance !== undefined && <> · Balance {balance.toFixed(2)} USDT</>}
            </p>
            {short && faucet?.enabled && drip.kind !== "sent" && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                <p>This is a testnet demo. Your new wallet has no test USDT yet.</p>
                <button
                  className="mt-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 disabled:opacity-50"
                  disabled={!address || drip.kind === "sending"}
                  onClick={getTestUsdt}
                >
                  {drip.kind === "sending" ? "Sending…" : `Get ${faucet.drip} test USDT`}
                </button>
                {drip.kind === "error" && <p className="mt-2 text-red-700">{drip.message}</p>}
              </div>
            )}
            <button
              className="w-full rounded-lg bg-emerald-700 py-3 text-lg text-white disabled:opacity-50"
              disabled={!address || step.kind === "paying" || short}
              onClick={pay}
            >
              {step.kind === "paying" ? "Paying…" : `Pay $${Number(info.amount).toFixed(2)}`}
            </button>
            {step.kind === "error" && <p className="text-sm text-red-700">{step.message}</p>}
          </div>
        )}
      </div>
    </Card>
  )
}
