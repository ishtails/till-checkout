import { createHmac } from "node:crypto"
import { Hono } from "hono"
import { getAddress, isAddress, verifyMessage, type Hex } from "viem"
import { config } from "./config"
import { findMerchant, type Merchant } from "./merchants"
import { rateLimit } from "./relayer"

// "Sign in with Till": a shop learns which wallet its customer is, without running accounts.
// Till hands the shop a pass, signed with the shop's webhook secret, that says "this browser
// controls wallet X". The SDK's verifySignIn checks it. Same secret, same HMAC as webhooks.
const PASS_TTL_SECONDS = 7 * 24 * 60 * 60
const MESSAGE_MAX_AGE_MS = 5 * 60 * 1000

export function issuePass(merchant: Merchant, wallet: string) {
  const payload = Buffer.from(
    JSON.stringify({ m: merchant.id, w: wallet.toLowerCase(), exp: Math.floor(Date.now() / 1000) + PASS_TTL_SECONDS }),
  ).toString("base64url")
  const sig = createHmac("sha256", merchant.webhookSecret).update(payload).digest("hex")
  return `${payload}.${sig}`
}

/** The text the customer's wallet signs. The server rebuilds it, so only the time comes from the client. */
export const signInMessage = (merchantName: string, wallet: string, issuedAt: string) =>
  `Sign in to ${merchantName} with Till\nWallet: ${wallet}\nIssued: ${issuedAt}`

// A pass only goes back to the shop's own site, never to a URL someone else picked.
const allowedReturn = (merchant: Merchant, url: string) => {
  try {
    return !!merchant.siteUrl && new URL(url).origin === new URL(merchant.siteUrl).origin
  } catch {
    return false
  }
}

export const withPass = (url: string, pass: string) => `${url}${url.includes("?") ? "&" : "?"}till_pass=${pass}`

export const signin = new Hono()

signin.get("/v1/signin/:merchant", c => {
  const merchant = findMerchant(c.req.param("merchant"))
  if (!merchant) return c.json({ error: "merchant not found" }, 404)
  return c.json({ merchant: merchant.id, name: merchant.name })
})

signin.post("/v1/signin", rateLimit, async c => {
  const body = await c.req.json<{ merchant: string; address: string; issuedAt: string; signature: Hex; returnUrl: string }>()
  const merchant = findMerchant(body.merchant)
  if (!merchant) return c.json({ error: "merchant not found" }, 404)
  if (!allowedReturn(merchant, body.returnUrl)) return c.json({ error: "return URL is not on the shop's site" }, 400)
  if (!isAddress(body.address)) return c.json({ error: "bad address" }, 400)

  const age = Date.now() - Date.parse(body.issuedAt)
  if (!(age >= -60_000 && age <= MESSAGE_MAX_AGE_MS)) return c.json({ error: "sign-in expired, try again" }, 400)

  const wallet = getAddress(body.address)
  const ok = await verifyMessage({ address: wallet, message: signInMessage(merchant.name, wallet, body.issuedAt), signature: body.signature }).catch(
    () => false,
  )
  if (!ok) return c.json({ error: "signature doesn't match the wallet" }, 401)

  return c.json({ redirect: withPass(body.returnUrl, issuePass(merchant, wallet)) })
})

export const signInBase = () => `${config.payAppUrl}/signin`
