import { Hono } from "hono"
import { cors } from "hono/cors"
import { agentRefund } from "./agent-refund"
import { gasTank } from "./gas-tank"
import { approvals } from "./approvals"
import { config } from "./config"
import { facilitatorRoutes } from "./facilitator"
import { faucet } from "./faucet"
import { gas } from "./gas"
import { orders } from "./orders"
import { pay } from "./pay"
import { refund } from "./refund"
import { publishRegistry, registry } from "./registry"
import { signin } from "./signin"
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
app.route("/", faucet)
app.route("/", signin)
app.route("/", approvals)
app.route("/", agentRefund)
app.route("/", gasTank)
app.route("/", registry)

// List merchants on Arkiv in the background: a save takes a few seconds and startup shouldn't wait.
void publishRegistry()

console.log(`Till server on http://localhost:${config.port}`)
export default { port: config.port, fetch: app.fetch }
