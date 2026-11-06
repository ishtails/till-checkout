import { usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth"
import { EnvelopeSimpleIcon, ShieldCheckIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import type { Address, Hex } from "viem"
import { api } from "./api"
import { friendly } from "./lib/errors"
import { Button, Muted, Shell } from "./ui"

// "Sign in with Till": a shop sends its customer here to learn which wallet they are. The customer
// signs in with their email, their wallet signs a short message (no pop-up), and Till sends them
// back to the shop with a signed pass. The shop never runs accounts of its own.
export function SignIn() {
  const params = new URLSearchParams(location.search)
  const merchant = params.get("merchant") ?? ""
  const returnUrl = params.get("return") ?? ""
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { signMessage } = useSignMessage()
  const [shop, setShop] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const address = wallets.find(w => w.walletClientType === "privy")?.address as Address | undefined
  const email = user?.email?.address ?? user?.google?.email

  useEffect(() => {
    api.signinInfo(merchant).then(s => setShop(s.name), e => setError(friendly(e.message)))
  }, [merchant])

  async function proceed() {
    if (!address || !shop) return
    setBusy(true)
    setError(undefined)
    try {
      const issuedAt = new Date().toISOString()
      // The server rebuilds this exact text and checks the signature against the wallet.
      const message = `Sign in to ${shop} with Till\nWallet: ${address}\nIssued: ${issuedAt}`
      const { signature } = await signMessage({ message }, { address, uiOptions: { showWalletUIs: false } })
      const { redirect } = await api.signin({ merchant, address, issuedAt, signature: signature as Hex, returnUrl })
      location.href = redirect
    } catch (e) {
      setError(friendly((e as Error).message))
      setBusy(false)
    }
  }

  if (!returnUrl) return <Shell><Muted>This sign-in link is invalid.</Muted></Shell>
  if (!shop && !error) return <Shell><Muted>Loading…</Muted></Shell>

  return (
    <Shell>
      <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <ShieldCheckIcon className="size-5" weight="duotone" />
      </span>
      <h1 className="mt-4 text-xl">Sign in to {shop ?? "the shop"} with Till</h1>
      <Muted className="mt-1">
        {shop} sees your wallet address, not your email.
      </Muted>

      <div className="mt-6 space-y-3">
        {!ready ? null : !authenticated ? (
          <Button size="lg" className="w-full" onClick={login}>
            <EnvelopeSimpleIcon />
            Continue with email
          </Button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate text-muted-foreground">{email}</p>
                <button className="text-xs text-muted-foreground hover:text-foreground hover:underline" disabled={busy} onClick={() => logout().then(() => login())}>
                  Not you? Switch account
                </button>
              </div>
              {address && <span className="shrink-0 font-mono text-xs text-muted-foreground">{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>}
            </div>
            <Button variant="brand" size="lg" className="w-full" isLoading={busy} disabled={!address || !shop} onClick={proceed}>
              Continue to {shop}
            </Button>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Shell>
  )
}
