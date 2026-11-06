// A separate demo app: a small data seller. Everything Till-specific is between the two markers.
import { Hono, type Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { rentData } from "./data"
import { home, locked, purchases, report, waiting } from "./pages"

const app = new Hono()
const SHOP_URL = process.env.SHOP_URL ?? "http://localhost:3002"
export const REPORT_PRICE = "0.10" // testnet price, low so the live demo's test-USDT faucet lasts
const paidOrders = new Set<string>()
const PASS_COOKIE = "brickline_pass"

// A pass arrives from Till's sign-in, or with the customer coming back from paying. Keep it in a
// cookie, then drop it from the address bar so it isn't shared with the link.
app.use("*", async (c, next) => {
  const pass = c.req.query("till_pass")
  if (!pass) return next()
  if (checkout.verifySignIn(pass)) {
    setCookie(c, PASS_COOKIE, pass, { httpOnly: true, sameSite: "Lax", secure: SHOP_URL.startsWith("https"), path: "/", maxAge: 7 * 24 * 3600 })
  }
  const url = new URL(c.req.url)
  url.searchParams.delete("till_pass")
  return c.redirect(url.pathname + url.search)
})

// ---- Till: the whole integration ----
import { Checkout } from "@till/sdk"
const checkout = new Checkout({ apiKey: process.env.CHECKOUT_API_KEY!, webhookSecret: process.env.CHECKOUT_WEBHOOK_SECRET! })

// People: sign in with Till, then buy the report
app.on(["GET", "POST"], "/buy", async c => {
  const who = checkout.verifySignIn(getCookie(c, PASS_COOKIE))
  if (!who) return c.redirect("/signin?next=/buy")
  const order = await checkout.createOrder({ amount: REPORT_PRICE, description: "Mumbai Rent Index, Nov 2026", returnUrl: SHOP_URL + "/thanks" })
  return c.redirect(order.checkoutUrl)
})
app.post("/webhooks/checkout", async c => {
  const event = await checkout.verifyWebhook(c.req.raw) // throws on a bad signature
  if (event.type === "order.paid") paidOrders.add(event.orderId)
  return c.text("ok")
})

// Sign in with Till instead of accounts: Till returns the customer with a signed pass.
app.get("/signin", async c => c.redirect(await checkout.signInUrl(SHOP_URL + (c.req.query("next") ?? "/"))))

// Agents: charge per call
app.use("/api/data", checkout.paywall({ price: "0.05", description: "Rent data, one neighbourhood" }))
app.use("/api/report", checkout.paywall({ price: "0.25", description: "Mumbai Rent Index, all neighbourhoods" }))
// ---- end of Till ----

// The API's answer says what each number is, so an agent can quote it without guessing.
const forApi = (r: (typeof rentData)[number]) => ({
  area: r.area,
  median_monthly_rent_inr: { "2BHK": r.bhk2, "1BHK": r.bhk1 },
  as_of: "2026-11-01",
})
app.get("/api/data", c => {
  const area = c.req.query("area")
  const row = area && rentData.find(r => r.area.toLowerCase() === area.toLowerCase())
  return c.json(area ? (row ? forApi(row) : { error: "unknown area" }) : rentData.map(forApi))
})

app.get("/api/report", c => c.json({ title: "Mumbai Rent Index, Nov 2026", neighbourhoods: rentData.map(forApi) }))

app.onError((err, c) => (err.message.includes("webhook signature") ? c.text("bad signature", 401) : c.text(err.message, 500)))

const signedIn = (c: Context) => checkout.verifySignIn(getCookie(c, PASS_COOKIE))?.wallet

app.get("/", c => c.html(home(rentData, signedIn(c))))

// The shop's icons and link-preview image.
const files: Record<string, string> = {
  "/favicon.ico": "image/x-icon",
  "/favicon.svg": "image/svg+xml",
  "/apple-touch-icon.png": "image/png",
  "/og.png": "image/png",
}
for (const [path, type] of Object.entries(files)) {
  app.get(path, c =>
    c.body(Bun.file(new URL(`../public${path}`, import.meta.url).pathname).stream(), 200, {
      "content-type": type,
      "cache-control": "public, max-age=86400",
    }),
  )
}

// Every receipt the customer has from any Till shop lives on Till, read from Arkiv.
app.get("/receipts", async c => c.redirect(new URL(await checkout.signInUrl(SHOP_URL)).origin + "/receipts"))

app.get("/signout", c => {
  deleteCookie(c, PASS_COOKIE, { path: "/" })
  // "Switch account" signs out here, then goes through Till's sign-in, where you can pick another.
  return c.redirect(c.req.query("switch") ? "/signin?next=/" : "/")
})

// "My purchases": everything this wallet bought here, from Till. The shop keeps no accounts.
app.get("/purchases", async c => {
  const wallet = signedIn(c)
  if (!wallet) return c.redirect("/signin?next=/purchases")
  const mine = (await checkout.ordersPaidBy(wallet)).filter(o => o.status !== "open")
  return c.html(purchases(mine, wallet))
})

// The report opens only for the wallet that paid for it, proven by a pass from Till.
async function access(c: Context, orderId: string) {
  const order = orderId ? await checkout.getOrder(orderId).catch(() => undefined) : undefined
  if (!order) return { state: "unknown" as const }
  if (order.status === "open" && !paidOrders.has(orderId)) return { state: "open" as const }
  const pass = getCookie(c, PASS_COOKIE)
  if (await checkout.paidBy(orderId, pass)) return { state: "yours" as const }
  return { state: "locked" as const, signedInAs: checkout.verifySignIn(pass)?.wallet }
}

app.get("/thanks", async c => {
  const orderId = c.req.query("order") ?? ""
  const a = await access(c, orderId)
  if (a.state === "unknown") return c.redirect("/")
  if (a.state === "yours") return c.html(report(rentData, orderId, signedIn(c)))
  if (a.state === "locked") return c.html(locked(`/signin?next=${encodeURIComponent(`/thanks?order=${orderId}`)}`, a.signedInAs))
  c.header("Refresh", "3") // check again in a few seconds, until the payment lands
  return c.html(waiting(signedIn(c)))
})

// The paid report as a spreadsheet, for the same wallet only.
app.get("/report.csv", async c => {
  const orderId = c.req.query("order") ?? ""
  if ((await access(c, orderId)).state !== "yours") return c.redirect(`/thanks?order=${orderId}`)
  const csv = ["area,2bhk_inr_per_month,1bhk_inr_per_month", ...rentData.map(r => `${r.area},${r.bhk2},${r.bhk1}`)].join("\n")
  c.header("Content-Type", "text/csv; charset=utf-8")
  c.header("Content-Disposition", 'attachment; filename="brickline-mumbai-rent-index-nov-2026.csv"')
  return c.body(csv + "\n")
})

console.log(`Demo shop on ${SHOP_URL}`)
export default { port: 3002, fetch: app.fetch }
