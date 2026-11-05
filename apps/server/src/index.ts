import { Hono } from "hono"
import { cors } from "hono/cors"
import { config } from "./config"
import { orders } from "./orders"
import { pay } from "./pay"
import { relayerStatus } from "./relayer"

const app = new Hono()
app.use("*", cors())
app.get("/health", c => c.json({ ok: true }))
app.get("/v1/relayer", async c => c.json(await relayerStatus()))
app.route("/", orders)
app.route("/", pay)

console.log(`Till server on http://localhost:${config.port}`)
export default { port: config.port, fetch: app.fetch }
