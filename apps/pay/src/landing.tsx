import {
  ArrowRightIcon,
  CheckCircleIcon,
  CodeIcon,
  DatabaseIcon,
  EnvelopeSimpleIcon,
  GithubLogoIcon,
  ProhibitIcon,
  ReceiptIcon,
  RobotIcon,
  ShieldCheckIcon,
  StorefrontIcon,
} from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { Badge, Button, Card, RecordLink } from "./ui"

const SHOP = import.meta.env.VITE_SHOP_URL ?? "http://localhost:3002"
const REPO = "https://github.com/ishtails/till-checkout"
const WX = "https://explorer.testnet.whitechain.io/tx/"

const integration = `import { Checkout } from "@till/sdk"
const checkout = new Checkout({ apiKey, webhookSecret })

// People: sell the report
app.post("/buy", async c => {
  const order = await checkout.createOrder({ amount: "0.10", description: "Mumbai rent report", returnUrl })
  return c.redirect(order.checkoutUrl)
})
app.post("/webhooks/checkout", async c => {
  const event = await checkout.verifyWebhook(c.req.raw)
  if (event.type === "order.paid") unlockReport(event.orderId)
  return c.text("ok")
})

// Agents: charge per call
app.use("/api/data", checkout.paywall({ price: "0.05" }))`

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t py-16 sm:py-20">
      <Badge variant="paid">{eyebrow}</Badge>
      <h2 className="mt-3 max-w-2xl text-3xl sm:text-4xl">{title}</h2>
      {children}
    </section>
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="gap-0 p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground [&_svg]:size-5">{icon}</span>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </Card>
  )
}

const proof: [string, string, string][] = [
  ["A customer paid $5 with just an email, and held no gas", `${WX}0x46461259c098277b64f7372f40e2a217831b7ec6fb20eaf0eb08cdafa54e7316`, "Whitechain"],
  ["The merchant refunded $2, then the other $3", `${WX}0xf59305f59aec54c8fa918dc1be9160823081b498dec32f240e9e67a30fdc4b8b`, "Whitechain"],
  ["The guard blocked a look-alike API asking 10× the price", "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11155231/messages/6", "Hedera log"],
  ["The agent paid the real shop $0.05 in USDC, no human involved", "https://hashscan.io/testnet/transaction/0.0.11155223@1793901510.215554723", "HashScan"],
  ["An agent paid $0.05 in USDT over x402", `${WX}0xb2f54cf5653ff2fdbd92bfe9da6be213a8191cdc19a65ef7a7dbae1119c6eb20`, "Whitechain"],
]

export function Landing() {
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <span className="inline-flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-8 scale-150 mix-blend-multiply" />
          <span className="text-base font-semibold tracking-tight">Till</span>
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => (location.href = REPO)}>
            <GithubLogoIcon />
            <span className="hidden sm:inline">GitHub</span>
          </Button>
          <Button size="sm" onClick={() => (location.href = SHOP)}>
            See the demo
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        <div className="py-14 sm:py-24">
          <Badge variant="neutral">Built at ETHGlobal Mumbai · live on testnet</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl leading-[1.05] sm:text-6xl">Get paid by people and AI agents that can't be tricked into overpaying.</h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Till is a checkout a shop adds in about 20 lines. People pay in USDT with just an email and no gas. AI agents pay per API call, inside limits they can't be talked out of. Refunds take one click.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="brand" size="lg" onClick={() => (location.href = SHOP)}>
              See the demo
              <ArrowRightIcon />
            </Button>
            <Button variant="outline" size="lg" onClick={() => (location.href = REPO)}>
              <GithubLogoIcon />
              Read the code
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">The demo shop sells a $0.10 report. Sign in with any email and you get free test USDT to buy it.</p>
        </div>

        <Section eyebrow="Two halves" title="A checkout for the shop, and a spending guard for the agent.">
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card className="gap-0 p-6">
              <StorefrontIcon className="size-6 text-brand" weight="duotone" />
              <p className="mt-4 text-lg font-medium">For merchants: the checkout</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  "Add it in about 20 lines and get paid in USDT on Whitechain.",
                  "Customers pay with an email. The shop covers the gas, under a thousandth of a WBT a payment.",
                  "Agents pay per call over x402. No account or API key.",
                  "Refund in one click, in full or in part. A CSV for the accountant.",
                ].map(t => (
                  <li key={t} className="flex gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-brand" weight="fill" />
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="gap-0 p-6">
              <ShieldCheckIcon className="size-6 text-brand" weight="duotone" />
              <p className="mt-4 text-lg font-medium">For whoever runs the agent: the guard</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  "Limits live in the agent's wallet, below the model, so a web page can't change them.",
                  "Only known payees, a cap per call, a daily budget.",
                  "A blocked payment is never signed.",
                  "Every payment and every block goes on a public log on Hedera.",
                ].map(t => (
                  <li key={t} className="flex gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-brand" weight="fill" />
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>

        <Section eyebrow="Why the limit lives in the wallet" title="A poisoned link fooled every model we tried. The guard caught every one.">
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Before the event we ran the attack 27 times on Claude Haiku, Sonnet and Opus. Injected instructions didn't work. But a review page linking to a look-alike API fooled every model, every time, because nothing on the page gives it away. Only the payment request shows the real price and payee, and that's where Till checks.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Card className="gap-0 p-5">
              <RobotIcon className="size-5 text-muted-foreground" />
              <p className="mt-3 text-sm">The agent follows a review page's link to what looks like the shop's API.</p>
            </Card>
            <Card className="gap-0 p-5">
              <ProhibitIcon className="size-5 text-destructive" />
              <p className="mt-3 text-sm">
                The API asks <b>$0.50</b>, ten times the price, paid to a stranger. The guard blocks it before signing.
              </p>
            </Card>
            <Card className="gap-0 p-5">
              <CheckCircleIcon className="size-5 text-brand" weight="fill" />
              <p className="mt-3 text-sm">Pointed at the real shop, the agent pays $0.05 in USDC on Hedera, with no human approving.</p>
            </Card>
          </div>
        </Section>

        <Section eyebrow="For developers" title="About 20 lines in the shop's own server.">
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-4 text-muted-foreground">
              <p>Create an order and redirect to Till's hosted checkout. Unlock what was bought when the signed webhook arrives.</p>
              <p>One more line puts an API behind x402, so agents can pay per call with no sign-up.</p>
              <RecordLink className="text-sm" href={`${REPO}/blob/main/apps/shop/src/index.ts`}>
                The demo shop's integration
              </RecordLink>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-primary p-5 text-[12.5px] leading-relaxed text-primary-foreground/90">
              <code>{integration}</code>
            </pre>
          </div>
        </Section>

        <Section eyebrow="Built on" title="Each chain does one job. The merchant never sees any of it.">
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Feature icon={<EnvelopeSimpleIcon />} title="Whitechain: the money">
              USDT payments with no gas for the payer, through our relayer and a small verified contract that caps refunds at what was paid.
            </Feature>
            <Feature icon={<RobotIcon />} title="Hedera: the agents">
              Agents pay in USDC over x402 through a facilitator we run, and every payment or block goes on a public HCS log.
            </Feature>
            <Feature icon={<DatabaseIcon />} title="Arkiv: the receipts">
              Every receipt is saved on Arkiv. The receipt page reads it from there, so it doesn't depend on the shop, or on us.
            </Feature>
          </div>
        </Section>

        <Section eyebrow="Proof" title="Everything above happened on testnet. Click any of it.">
          <Card className="mt-8 gap-0 py-0">
            <ul>
              {proof.map(([what, href, where]) => (
                <li key={href} className="flex items-center justify-between gap-4 border-b px-5 py-4 last:border-0">
                  <span className="flex items-center gap-3 text-sm">
                    <ReceiptIcon className="size-4 shrink-0 text-muted-foreground" />
                    {what}
                  </span>
                  <RecordLink href={href}>{where}</RecordLink>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        <section className="border-t py-16 text-center sm:py-24">
          <h2 className="text-3xl sm:text-4xl">Try it in a minute.</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">Buy a $0.10 report with any email. Then open your receipt, read straight from Arkiv.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="brand" size="lg" onClick={() => (location.href = SHOP)}>
              See the demo
              <ArrowRightIcon />
            </Button>
            <Button variant="outline" size="lg" onClick={() => (location.href = REPO)}>
              <CodeIcon />
              GitHub
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground">
          <span>Built solo by Kartik at ETHGlobal Mumbai, November 2026. Testnet only.</span>
          <a className="hover:underline" href={REPO}>
            github.com/ishtails/till-checkout
          </a>
        </div>
      </footer>
    </div>
  )
}
