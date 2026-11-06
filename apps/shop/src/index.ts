// A separate demo app: a small data seller. Everything Till-specific is between the two markers.
import { Hono } from "hono"
import { rentData } from "./data"
import { home, report, waiting } from "./pages"

const app = new Hono()
const SHOP_URL = process.env.SHOP_URL ?? "http://localhost:3002"
export const REPORT_PRICE = "0.10" // testnet price, low so the live demo's test-USDT faucet lasts
const unlocked = new Set<string>()
const unlockReport = (orderId: string) => unlocked.add(orderId)

// ---- Till: the whole integration ----
import { Checkout } from "@till/sdk"
const checkout = new Checkout({ apiKey: process.env.CHECKOUT_API_KEY!, webhookSecret: process.env.CHECKOUT_WEBHOOK_SECRET! })

// People: sell the report
app.post("/buy", async c => {
  const order = await checkout.createOrder({ amount: REPORT_PRICE, description: "Mumbai Rent Index, Nov 2026", returnUrl: SHOP_URL + "/thanks" })
  return c.redirect(order.checkoutUrl)
})
app.post("/webhooks/checkout", async c => {
  const event = await checkout.verifyWebhook(c.req.raw) // throws on a bad signature
  if (event.type === "order.paid") unlockReport(event.orderId)
  return c.text("ok")
})

// Agents: charge per call
app.use("/api/data", checkout.paywall({ price: "0.05", description: "Rent data, one neighbourhood" }))
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

app.onError((err, c) => (err.message.includes("webhook signature") ? c.text("bad signature", 401) : c.text(err.message, 500)))

app.get("/", c => c.html(home(rentData)))

// The webhook normally arrives first; reading the order covers a missed one, or a restart.
async function checkPaid(orderId: string): Promise<"paid" | "open" | "unknown"> {
  if (unlocked.has(orderId)) return "paid"
  const order = orderId ? await checkout.getOrder(orderId).catch(() => undefined) : undefined
  if (!order) return "unknown"
  if (order.status === "open") return "open"
  unlockReport(orderId)
  return "paid"
}

app.get("/thanks", async c => {
  const orderId = c.req.query("order") ?? ""
  const state = await checkPaid(orderId)
  if (state === "unknown") return c.redirect("/")
  if (state === "paid") return c.html(report(rentData, orderId))
  c.header("Refresh", "3") // check again in a few seconds, until the payment lands
  return c.html(waiting())
})

// The paid report as a spreadsheet.
app.get("/report.csv", async c => {
  const orderId = c.req.query("order") ?? ""
  if ((await checkPaid(orderId)) !== "paid") return c.redirect("/")
  const csv = ["area,2bhk_inr_per_month,1bhk_inr_per_month", ...rentData.map(r => `${r.area},${r.bhk2},${r.bhk1}`)].join("\n")
  c.header("Content-Type", "text/csv; charset=utf-8")
  c.header("Content-Disposition", 'attachment; filename="brickline-mumbai-rent-index-nov-2026.csv"')
  return c.body(csv + "\n")
})

console.log(`Demo shop on ${SHOP_URL}`)
export default { port: 3002, fetch: app.fetch }
