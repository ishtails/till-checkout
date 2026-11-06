// Checks "Sign in with Till" end to end against a running server and shop:
// the paying wallet opens its report; another wallet, a forged pass and a foreign return URL don't.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const API = process.env.API_URL ?? "http://localhost:3001"
const SHOP = process.env.SHOP_URL ?? "http://localhost:3002"
const orderId = process.argv[2]
const payer = privateKeyToAccount(process.env.CUSTOMER_PRIVATE_KEY as `0x${string}`)
const stranger = privateKeyToAccount(generatePrivateKey())

async function signIn(account: typeof payer, returnUrl: string) {
  const { name } = await (await fetch(`${API}/v1/signin/data-shop`)).json()
  const issuedAt = new Date().toISOString()
  const signature = await account.signMessage({ message: `Sign in to ${name} with Till\nWallet: ${account.address}\nIssued: ${issuedAt}` })
  const res = await fetch(`${API}/v1/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchant: "data-shop", address: account.address, issuedAt, signature, returnUrl }),
  })
  return res.json() as Promise<{ redirect?: string; error?: string }>
}

// Follows the shop's ?till_pass= redirect by hand, keeping its cookie, then opens the report.
async function open(redirect: string) {
  const first = await fetch(redirect, { redirect: "manual" })
  const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? ""
  const page = await (await fetch(`${SHOP}/thanks?order=${orderId}`, { headers: { cookie } })).text()
  const csv = await fetch(`${SHOP}/report.csv?order=${orderId}`, { headers: { cookie }, redirect: "manual" })
  return { cookieSet: !!cookie, report: page.includes("Your report is ready"), locked: page.includes("Sign in to open your report"), csv: csv.status }
}

const back = `${SHOP}/thanks?order=${orderId}`
const mine = await signIn(payer, back)
console.log("payer:", mine.redirect ? await open(mine.redirect) : mine)
const theirs = await signIn(stranger, back)
console.log("stranger:", theirs.redirect ? await open(theirs.redirect) : theirs)
console.log("no pass:", await (await fetch(back)).text().then(t => ({ locked: t.includes("Sign in to open your report") })))
console.log("forged pass:", await open(`${back}&till_pass=eyJtIjoiZGF0YS1zaG9wIiwidyI6IjB4MDAifQ.deadbeef`))
console.log("foreign return URL:", await signIn(payer, "https://evil.example/steal"))
