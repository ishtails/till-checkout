import { Hono } from "hono"
import { cors } from "hono/cors"
import { config } from "./config"
import { facilitatorRoutes } from "./facilitator"
import { gas } from "./gas"
import { orders } from "./orders"
import { pay } from "./pay"
import { refund } from "./refund"
import { relayerStatus } from "./relayer"

const app = new Hono()
app.use("*", cors())
app.get("/health", c => c.json({ ok: true }))
app.get("/v1/relayer", async c => c.json(await relayerStatus()))
app.route("/", orders)
app.route("/", pay)
app.route("/", refund)
app.route("/", facilitatorRoutes)
app.route("/", gas)

console.log(`Till server on http://localhost:${config.port}`)
export default { port: config.port, fetch: app.fetch }
