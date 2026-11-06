import { ArrowLeftIcon, GithubLogoIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { CodeWindow } from "./code-window"
import { Button, Card, RecordLink } from "./ui"

// Developer docs at /docs. Rendered without Privy, like the landing page. Every API named here
// exists in packages/sdk, packages/guard, packages/receipts or apps/server.
const REPO = "https://github.com/ishtails/till-checkout"
const API = "https://api.till.ishtails.xyz"
const src = (path: string) => `${REPO}/blob/main/${path}`

const SECTIONS = [
  ["quickstart", "Quickstart"],
  ["sdk", "SDK reference"],
  ["signin", "Sign in with Till"],
  ["webhooks", "Webhooks"],
  ["paywall", "Agent paywall (x402)"],
  ["guard", "The spending guard"],
  ["identity", "Agent identity"],
  ["refunds", "Refunds"],
  ["arkiv", "Arkiv: receipts and registry"],
  ["http", "HTTP endpoints"],
  ["gas", "Gas tank"],
  ["money", "How Till makes money"],
] as const

function Doc({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t py-10 first:border-0 first:pt-0">
      <h2 className="text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted-foreground [&_b]:font-medium [&_b]:text-foreground [&_:is(p,li)_code]:rounded [&_:is(p,li)_code]:bg-muted [&_:is(p,li)_code]:px-1 [&_:is(p,li)_code]:py-0.5 [&_:is(p,li)_code]:font-mono [&_:is(p,li)_code]:text-[13px] [&_:is(p,li)_code]:text-foreground">
        {children}
      </div>
    </section>
  )
}

function Table({ rows, head }: { head: [string, string]; rows: [ReactNode, ReactNode][] }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 text-sm">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-b bg-muted/60 px-4 py-2 text-xs font-medium text-foreground">
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      {rows.map(([a, b], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-b px-4 py-2.5 last:border-0">
          <span className="font-mono text-[13px] break-words text-foreground">{a}</span>
          <span>{b}</span>
        </div>
      ))}
    </Card>
  )
}

const quickstart = `import { Checkout } from "@till/sdk"
const checkout = new Checkout({
  apiKey: process.env.CHECKOUT_API_KEY,
  webhookSecret: process.env.CHECKOUT_WEBHOOK_SECRET,
  baseUrl: "https://api.till.ishtails.xyz",
})

// People: create an order and send them to Till's checkout
app.post("/buy", async c => {
  const order = await checkout.createOrder({ amount: "0.10", description: "Mumbai Rent Index", returnUrl })
  return c.redirect(order.checkoutUrl)
})

// Unlock what they bought when the signed webhook arrives
app.post("/webhooks/checkout", async c => {
  const event = await checkout.verifyWebhook(c.req.raw) // throws on a bad signature
  if (event.type === "order.paid") unlock(event.orderId)
  return c.text("ok")
})

// Agents: charge per call, no account or API key on their side
app.use("/api/data", checkout.paywall({ price: "0.05", description: "Rent data, one neighbourhood" }))`

const signin = `// Send the customer to Till; they come back with ?till_pass=...
app.get("/signin", async c => c.redirect(await checkout.signInUrl("https://shop.example/account")))

// On any request: who is this?
const who = checkout.verifySignIn(getCookie(c, "till_pass")) // { wallet, expiresAt } or null

// Did this wallet pay for this order?
if (await checkout.paidBy(orderId, pass)) showReport()

// Their purchases from your shop, with no accounts on your side
const mine = await checkout.ordersPaidBy(who.wallet)`

const webhook = `POST https://shop.example/webhooks/checkout
content-type: application/json
x-checkout-signature: <hex HMAC-SHA256 of the raw body, keyed with your webhook secret>

{ "type": "order.paid", "orderId": "0x1b44…f0b4", "amount": "100000", "txHash": "0x…", "ts": 1793950000 }`

const guardCode = `import { guard, registryView, type Policy } from "@till/guard"

guard(x402Client, {
  policy,                                   // policy.json: budget, auto-pay limit, merchants
  stateFile: "data/agent-state.json",       // today's totals
  approver,                                 // asks the owner above the auto-pay limit
  agent: "research-agent",
  owners: ["0x…"],                          // only these wallets' signed answers count
  registry: async req => registryView(await lookupMerchants(), req, seller),
  onDecision: d => logDecision("research-agent", d), // every payment and block, to HCS
})`

const identityCode = `// The agent names its ERC-8004 entry in each x402 payment
client.registerExtension({
  key: "erc8004",
  enrichPaymentPayload: async p => ({
    ...p,
    extensions: { ...p.extensions, erc8004: { registry: "eip155:296:0x8004A818…BD9e", agentId: "154" } },
  }),
})

// Till, after settling: does the registry say the payer is that agent's wallet?
import { verifyPayer } from "@till/identity"
const agent = await verifyPayer(claim, network, payer) // { agentId, owner, wallet, hcsTopic } or undefined`

const policy = `{
  "dailyBudgetUsd": 2.0,
  "approvalAboveUsd": 0.1,
  "merchants": [
    {
      "name": "Brickline",
      "payTo": { "eip155:1874": "0x2A50…15D7", "hedera:testnet": "0.0.11155222" },
      "maxPerCallUsd": 0.3,
      "dailyCapUsd": 1.0
    }
  ]
}`

const registry = `import { registryReader } from "@till/receipts/registry"

const registry = registryReader(ARKIV_ACCESS_KEY) // "" uses Arkiv's public, rate-limited RPC
const sellers = await registry.list("rent-data")   // name, endpoints with prices, payTo, entityKey
const who = await registry.byPayTo("eip155:1874", payTo) // undefined if no Till merchant is paid there`

const agentRefund = `GET  /v1/agent-payments/:key/refund
→ { from, to, remainingAtomic, nonce, validBefore, domain }   // merchant → agent, at most what's left

POST /v1/agent-payments/:key/refund
{ amount: "0.25", nonce, validBefore, signature }   // the merchant's TransferWithAuthorization`

const receipts = `import { receiptReader } from "@till/receipts"

const receipts = receiptReader(ARKIV_ACCESS_KEY)
await receipts.order(orderId) // the payment, then one record per refund
await receipts.payer(wallet)  // everything one wallet bought, from every Till shop`

export function Docs() {
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="/" className="inline-flex items-center gap-2">
            <img src="/logo.png" alt="" className="size-8 scale-150 mix-blend-multiply" />
            <span className="text-base font-semibold tracking-tight">Till</span>
            <span className="text-sm text-muted-foreground">Docs</span>
          </a>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => (location.href = "/")}>
              <ArrowLeftIcon />
              <span className="hidden sm:inline">Home</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => (location.href = REPO)}>
              <GithubLogoIcon />
              <span className="hidden sm:inline">GitHub</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <ul className="sticky top-20 space-y-1 text-sm">
            {SECTIONS.map(([id, title]) => (
              <li key={id}>
                <a className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" href={`#${id}`}>
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 max-w-3xl">
          <h1 className="text-4xl">Build with Till</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            A checkout that people and AI agents can both pay. People pay in USDT on Whitechain with no gas. Agents pay per call over x402, inside limits their owner sets. Everything here runs on testnet today.
          </p>

          <div className="mt-10">
            <Doc id="quickstart" title="Quickstart">
              <p>
                Add Till to your own server in about 20 lines. Create an order, send the customer to Till's hosted checkout, and unlock what they bought when the signed webhook arrives. One more line puts an API behind x402, so agents can pay per call.
              </p>
              <CodeWindow code={quickstart} filename="server.ts" />
              <p>
                The SDK is <code>packages/sdk</code> in the repo; it isn't on npm yet. Your API key, webhook secret and payout addresses live in the server's <code>merchants.json</code>. A complete shop using all of this:{" "}
                <RecordLink className="text-sm" href={src("apps/shop/src/index.ts")}>
                  apps/shop/src/index.ts
                </RecordLink>
              </p>
            </Doc>

            <Doc id="sdk" title="SDK reference">
              <p>
                <code>new Checkout({"{ apiKey, webhookSecret, baseUrl }"})</code>. Amounts you pass in are USD decimal strings, like <code>"5.00"</code>.
              </p>
              <Table
                head={["Method", "What it does"]}
                rows={[
                  ["createOrder({ amount, description, returnUrl, metadata? })", "Creates an order. Returns { id, checkoutUrl, status }: send the customer to checkoutUrl."],
                  ["getOrder(id)", "The order: status (open, paid, refunded), payer, payTx, amount, refunded, refunds."],
                  ["verifyWebhook(request)", "Checks the X-Checkout-Signature HMAC over the raw body and returns the event. Throws if it doesn't match."],
                  ["paywall({ price, description })", "Hono middleware. Unpaid calls get a 402 with the price on Whitechain and Hedera; paid ones go through."],
                  ["signInUrl(returnUrl)", "Where to send a customer so Till can tell you which wallet they are."],
                  ["verifySignIn(pass)", "Checks a till_pass and returns { wallet, expiresAt }, or null if it's forged or expired."],
                  ["paidBy(orderId, pass)", "True if the pass belongs to the wallet that paid this order."],
                  ["ordersPaidBy(wallet)", "Your orders paid by one wallet, newest first."],
                ]}
              />
            </Doc>

            <Doc id="signin" title="Sign in with Till">
              <p>
                Know which customer paid, with no accounts to run. Send them to <code>signInUrl()</code>. They sign in with their email (the same wallet they pay with), and Till sends them back to your site with a <code>till_pass</code> query parameter. After paying, the checkout's return to your site carries a pass too.
              </p>
              <p>
                The pass is the wallet address and an expiry, signed with your webhook secret, so only you and Till can make one. Till only returns to your own site's origin.
              </p>
              <CodeWindow code={signin} filename="account.ts" />
            </Doc>

            <Doc id="webhooks" title="Webhooks">
              <p>
                Till posts <code>order.paid</code> when a payment is confirmed on Whitechain, and <code>order.refunded</code> after each refund. <code>amount</code> is in USDT's smallest unit (6 decimals), so <code>"100000"</code> is $0.10.
              </p>
              <CodeWindow code={webhook} filename="webhook" />
              <p>
                Each event is sent once. If you miss one, read the order with <code>getOrder()</code> when the customer comes back to your <code>returnUrl</code>.
              </p>
            </Doc>

            <Doc id="paywall" title="Agent paywall (x402)">
              <p>
                <code>paywall()</code> answers an unpaid request with HTTP 402 and two ways to pay: <b>USDT on Whitechain</b> (<code>eip155:1874</code>) or <b>USDC on Hedera testnet</b> (<code>hedera:testnet</code>). The agent signs a payment for the exact amount and retries. Till's own facilitator checks it and settles it straight to your address, then your handler runs.
              </p>
              <p>
                On Whitechain the agent signs an EIP-3009 transfer and Till's relayer submits it, so the agent needs no WBT. On Hedera, Till's account pays the network fee. Any standard x402 client works; the agent needs no account with you.
              </p>
              <p>
                The facilitator is at <code>{API}/facilitator</code> (<code>/supported</code>, <code>/verify</code>, <code>/settle</code>). It only settles to registered merchants.
              </p>
            </Doc>

            <Doc id="guard" title="The spending guard, for agent builders">
              <p>
                <code>@till/guard</code> sits inside the agent's wallet, below the model, and checks every 402 before anything is signed. A web page can't change it, and neither can the model.
              </p>
              <CodeWindow code={guardCode} filename="wallet.ts" />
              <p>These rules run in order. Every failing rule is reported, and any failure is a hard block:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>The asset is USDT on Whitechain or USDC on Hedera.</li>
                <li>The payee is on the policy's allowlist.</li>
                <li>
                  The payee is the seller's registered address on Arkiv. The agent says who it thinks it's paying; if the 402's payee isn't that seller's address, it's blocked, with the entity it was checked against.
                </li>
                <li>The amount is within the merchant's per-call cap.</li>
                <li>Today's spend with that merchant stays within its daily cap.</li>
                <li>Today's total stays within the daily budget.</li>
              </ol>
              <p>
                <b>Approvals.</b> A payment that passes every rule but is above <code>approvalAboveUsd</code> pauses. The agent files it with Till, and the owner approves or denies it on the <a className="text-brand hover:underline" href="/agent">agent console</a>, signing with their wallet. Till only carries the answer: the guard picks the request's ID itself and checks the signature against its own list of owners, so Till can't approve on the owner's behalf, and an old answer can't be reused. Nothing is signed until an owner says yes. A broken rule can never be approved.
              </p>
              <CodeWindow code={policy} filename="policy.json" />
              <p>
                <b>The log.</b> Every decision (<code>agent.paid</code>, <code>agent.blocked</code>, <code>agent.approval_requested</code>, <code>agent.approved</code>, <code>agent.denied</code>) goes to a Hedera Consensus Service topic that only the agent's key can write to. Each message has the amount, payee, reasons, the Arkiv entity it was checked against and, once paid, the transaction. The console reads it back from Hedera's mirror node.
              </p>
            </Doc>

            <Doc id="identity" title="Agent identity (ERC-8004)">
              <p>
                The guard protects the agent's owner from bad sellers. Identity works the other way: it tells a shop which agent paid it, and who owns that agent.
              </p>
              <p>
                An agent registers in the <b>ERC-8004 Identity Registry</b> already deployed on Hedera testnet (<code>0x8004A818BFB912233c491871b3d84c89A494BD9e</code>). The entry is an NFT held by the owner. It records the wallet the agent pays from, which that wallet has to sign itself, so no one can claim someone else's wallet. It can also record metadata: Till stores the agent's HCS log topic and its Hedera account.
              </p>
              <p>
                The agent sends its ID in each x402 payment's <code>extensions</code>. The claim isn't signed, so after the payment settles Till checks it against the registry: on Whitechain the payer must be the registered wallet, and on Hedera it must be the registered account. A match is shown on the merchant's dashboard as "Verified agent #N · owner 0x…". The agent console reads the same entry and checks that the log it shows is the one the owner registered.
              </p>
              <CodeWindow code={identityCode} filename="identity.ts" />
              <p>
                Register an agent with{" "}
                <RecordLink className="text-sm" href={src("apps/agent/scripts/identity-register.ts")}>
                  apps/agent/scripts/identity-register.ts
                </RecordLink>
                . Till's research agent is{" "}
                <RecordLink className="text-sm" href="https://hashscan.io/testnet/contract/0x8004A818BFB912233c491871b3d84c89A494BD9e">
                  agent #154
                </RecordLink>
                .
              </p>
            </Doc>

            <Doc id="refunds" title="Refunds">
              <p>
                <b>Checkout orders.</b> From the dashboard, the merchant refunds an order in full or in part, as many times as they like. They sign a USDT transfer in their email wallet (no gas), Till's relayer submits it to the Checkout contract, and the contract won't refund more than was paid in total. Each refund sends <code>order.refunded</code> and is saved to Arkiv.
              </p>
              <p>
                <b>Agent payments on Whitechain.</b> An x402 payment went straight from the agent's wallet to the merchant's, so its refund is the reverse. The merchant signs an EIP-3009 <code>TransferWithAuthorization</code> back to the agent's wallet, and the relayer submits it, so the merchant pays no gas. Till checks the total can't pass what was paid.
              </p>
              <CodeWindow code={agentRefund} filename="agent refund" />
              <p>
                <b>Agent payments on Hedera</b> are refunded from the merchant's own Hedera wallet.
              </p>
            </Doc>

            <Doc id="arkiv" title="Arkiv: receipts and the merchant registry">
              <p>
                <b>Receipts.</b> After a payment or refund is confirmed, Till saves one record on Arkiv (<code>till.receipt</code>), and never edits it. The receipt page reads those records in the customer's browser, so it still works if Till's server is down. "Your receipts" lists everything one wallet bought, from every Till shop.
              </p>
              <CodeWindow code={receipts} filename="receipts.ts" />
              <p>
                <b>The registry.</b> Till lists every merchant on Arkiv (<code>till.merchant</code>): name, category, each paid endpoint with its price, and the address it's paid at on each network. Agents find sellers there instead of trusting a page's link, and the guard checks each payee against it.
              </p>
              <CodeWindow code={registry} filename="registry.ts" />
              <p>
                Both are written only by Till's writer wallet, and every read filters to it, so a record from anyone else never shows up.{" "}
                <RecordLink className="text-sm" href={src("arkiv/schema.md")}>
                  Schema and queries
                </RecordLink>
              </p>
            </Doc>

            <Doc id="http" title="HTTP endpoints">
              <p>
                Base URL <code>{API}</code>. Endpoints marked (API key) take <code>Authorization: Bearer &lt;apiKey&gt;</code>; the SDK sets it.
              </p>
              <Table
                head={["Endpoint", "What it's for"]}
                rows={[
                  ["POST /v1/orders", "Create an order (API key)."],
                  ["GET /v1/orders/:id", "Read one order."],
                  ["GET /v1/orders?merchant=", "A merchant's orders, for the dashboard."],
                  ["GET /v1/orders/by-payer/:wallet", "Your orders paid by one wallet (API key)."],
                  ["GET /v1/merchant", "Your payout addresses and sign-in link (API key)."],
                  ["GET /v1/checkout/:id, POST /v1/checkout/:id/pay", "The checkout page's order view, and its signed payment."],
                  ["GET, POST /v1/orders/:id/refund", "Build and submit a checkout refund."],
                  ["GET /v1/agent-payments", "Agent payments settled through Till's facilitator."],
                  ["GET, POST /v1/agent-payments/:key/refund", "Build and submit a refund of an agent payment on Whitechain."],
                  ["GET /v1/signin/:merchant, POST /v1/signin", "Sign in with Till."],
                  ["GET /v1/agent, GET /v1/approvals, GET /v1/approvals/:id", "The agent's policy and its approval requests."],
                  ["POST /v1/approvals, POST /v1/approvals/:id", "The agent files a request (with its token); the owner answers (with a wallet signature)."],
                  ["GET /v1/registry", "Each merchant's Arkiv entity and explorer link."],
                  ["GET /v1/gas?merchant=, GET /v1/relayer", "Gas the relayer spent for a merchant, and the relayer's balance."],
                  ["GET /v1/gas-tank?merchant=, POST /v1/gas-tank/topup", "A merchant's gas tank, and a signed USDT top-up."],
                  ["/facilitator/supported, /verify, /settle", "The x402 facilitator."],
                ]}
              />
            </Doc>

            <Doc id="gas" title="Gas tank">
              <p>
                Till's relayer pays the gas on Whitechain, so your customers and agents never need WBT. You prepay for it in USDT from the dashboard, with a
                signed transfer like every other payment, so topping up costs you no gas either.
              </p>
              <p>
                Each transaction is charged at its real fee, read from its receipt and priced at a WBT rate set in Till's config, <b>plus 10%</b>. New merchants start with{" "}
                <b>$5 of credit</b>, about a hundred transactions. When the tank runs dry, Till stops paying gas for your payments until you top up, and the
                customer sees a clear message instead of a stuck payment.
              </p>
              <Table
                head={["Endpoint", "What it's for"]}
                rows={[
                  ["GET /v1/gas-tank?merchant=", "Balance, transactions left, cost per transaction, top-ups, and what to sign for the next one."],
                  ["POST /v1/gas-tank/topup", "{ merchant, from, amount, nonce, validBefore, signature }: a USDT TransferWithAuthorization to Till's gas wallet."],
                ]}
              />
            </Doc>

            <Doc id="money" title="How Till makes money">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  <b>Gas at cost plus 10%</b>, through the gas tank. This one is built: it's in the dashboard today.
                </li>
                <li>
                  <b>A small fee per payment</b>, around 0.5%, taken by the Checkout contract when it settles. Not built yet; it's one split in the contract
                  that already handles payments and refunds.
                </li>
                <li>
                  <b>Paid tiers for agent owners</b>, later: a hosted guard, team approvals, longer history.
                </li>
              </ol>
              <p>Everything here is open source, and a merchant can run their own server and relayer and pay nothing.</p>
            </Doc>
          </div>
        </main>
      </div>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2 px-5 py-6 text-xs text-muted-foreground">
          <a className="hover:underline" href={REPO}>
            github.com/ishtails/till-checkout
          </a>
        </div>
      </footer>
    </div>
  )
}
