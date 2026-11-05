import { Hono } from "hono"
import { cors } from "hono/cors"
import { config } from "./config"
import { orders } from "./orders"

const app = new Hono()
app.use("*", cors())
app.get("/health", c => c.json({ ok: true }))
app.route("/", orders)

console.log(`Till server on http://localhost:${config.port}`)
export default { port: config.port, fetch: app.fetch }
