import {
  ArrowRightIcon,
  BookOpenIcon,
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
import { motion } from "motion/react"
import { Children, useEffect, useState, type ReactNode } from "react"
import { registry, registryExplorer, type ListingRecord } from "./arkiv"
import { FADE_IN_VARIANTS, MotionReveal, SPRING_TOKENS, STAGGER_CONTAINER_VARIANTS, STAGGER_ITEM_VARIANTS, useMotionConfig } from "./lib/motion"
import { CodeWindow } from "./code-window"
import { Badge, Button, Card, RecordLink } from "./ui"

const SHOP = import.meta.env.VITE_SHOP_URL ?? "http://localhost:3002"
const REPO = "https://github.com/ishtails/till-checkout"
const WX = "https://explorer.testnet.whitechain.io/tx/"

const integration = `import { Checkout } from "@till/sdk"
const checkout = new Checkout({ apiKey, webhookSecret })

// People: sign in with Till, then buy the report
app.post("/buy", async c => {
  if (!checkout.verifySignIn(getCookie(c, "pass"))) return c.redirect("/signin?next=/buy")
  const order = await checkout.createOrder({ amount: "0.10", description: "Mumbai Rent Index", returnUrl })
  return c.redirect(order.checkoutUrl)
})
app.post("/webhooks/checkout", async c => {
  const event = await checkout.verifyWebhook(c.req.raw)
  if (event.type === "order.paid") unlockReport(event.orderId)
  return c.text("ok")
})

// Sign in with Till: no accounts to run
app.get("/signin", async c => c.redirect(await checkout.signInUrl(next)))

// Agents: charge per call
app.use("/api/data", checkout.paywall({ price: "0.05" }))`

/** Fades its content up once it scrolls into view. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { resolveTransition, resolveVariants } = useMotionConfig()
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={resolveVariants(FADE_IN_VARIANTS)}
      transition={{ ...resolveTransition("smooth"), delay }}
    >
      {children}
    </motion.div>
  )
}

/** A grid whose children come in one after another once it scrolls into view. */
function StaggerGrid({ children, className }: { children: ReactNode; className?: string }) {
  const { resolveTransition, resolveVariants } = useMotionConfig()
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={resolveVariants(STAGGER_CONTAINER_VARIANTS)}
      custom={0.09}
    >
      {Children.map(children, child => (
        <motion.div className="h-full [&>*]:h-full" variants={resolveVariants(STAGGER_ITEM_VARIANTS)} transition={resolveTransition("smooth")}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t py-16 sm:py-20">
      <Reveal>
        <Badge variant="paid">{eyebrow}</Badge>
        <h2 className="mt-3 max-w-2xl text-3xl text-balance sm:text-4xl">{title}</h2>
      </Reveal>
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
  ["The guard blocked a look-alike API asking 10× the price, to an address Arkiv doesn't list", "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11155231/messages/26", "Hedera log"],
  ["The agent found the real shop on Arkiv and paid $0.05 in USDC, no human involved", "https://hashscan.io/testnet/transaction/0.0.11155223@1793960375.693637515", "HashScan"],
  ["An agent paid $0.05 in USDT over x402", `${WX}0xb2f54cf5653ff2fdbd92bfe9da6be213a8191cdc19a65ef7a7dbae1119c6eb20`, "Whitechain"],
  ["The merchant refunded an agent's payment, with no gas", `${WX}0x9fb9fb96855ce195d3ed927321db56e359a16bb76b3458b32f5afa7aebfe644c`, "Whitechain"],
]

// Read live from Arkiv in the browser: the same records an agent looks sellers up in.
function MerchantsOnTill() {
  const [merchants, setMerchants] = useState<ListingRecord[] | "error">()
  useEffect(() => {
    registry.list().then(setMerchants, () => setMerchants("error"))
  }, [])
  return (
    <Card className="mt-8 gap-0 py-0">
      <ul>
        {merchants === undefined && <li className="px-5 py-4 text-sm text-muted-foreground">Reading from Arkiv…</li>}
        {merchants === "error" && <li className="px-5 py-4 text-sm text-muted-foreground">Couldn't reach Arkiv just now.</li>}
        {Array.isArray(merchants) &&
          merchants.map(m => (
            <li key={m.entityKey} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-4 last:border-0">
              <span className="flex items-center gap-3 text-sm">
                <StorefrontIcon className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  <a className="font-medium hover:underline" href={m.siteUrl}>
                    {m.name}
                  </a>
                  <span className="text-muted-foreground">
                    {" "}
                    · {m.category} · {m.endpoints.map(e => `$${e.priceUsd}`).join(" or ")} a call
                  </span>
                </span>
              </span>
              <RecordLink href={m.explorerUrl}>On Arkiv</RecordLink>
            </li>
          ))}
      </ul>
    </Card>
  )
}

export function Landing() {
  const { reduced } = useMotionConfig()
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <span className="inline-flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-8 scale-150 mix-blend-multiply" />
          <span className="text-base font-semibold tracking-tight">Till</span>
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => (location.href = "/docs")}>
            <BookOpenIcon />
            <span className="hidden sm:inline">Docs</span>
          </Button>
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
        <div className="pt-14 pb-10 sm:pt-24">
          <MotionReveal preset="soft" delay={0.1}>
            <h1 className="max-w-3xl text-4xl leading-[1.05] text-balance sm:text-6xl">Get paid by people and AI agents that can't be tricked into overpaying.</h1>
          </MotionReveal>
          <MotionReveal preset="soft" delay={0.2}>
            <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              Till is a checkout a shop adds in about 20 lines. People pay in USDT with just an email and no gas. AI agents pay per API call, inside limits they can't be talked out of. Refunds take one click.
            </p>
          </MotionReveal>
          <MotionReveal preset="soft" delay={0.3} className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="brand" size="lg" onClick={() => (location.href = SHOP)}>
              See the demo
              <ArrowRightIcon />
            </Button>
            <Button variant="outline" size="lg" onClick={() => (location.href = REPO)}>
              <GithubLogoIcon />
              Read the code
            </Button>
          </MotionReveal>
          <MotionReveal preset="soft" delay={0.35}>
            <p className="mt-4 text-sm text-muted-foreground">The demo shop sells a $0.10 report. Sign in with any email and you get free test USDT to buy it.</p>
          </MotionReveal>
        </div>

        {/* The product at a glance: what a customer sees, and what the agent's guard does. */}
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { ...SPRING_TOKENS.smoothHeavy, delay: 0.5 }}
          className="mb-16 grid gap-4 rounded-3xl bg-secondary/60 p-4 ring-1 ring-foreground/5 sm:mb-24 sm:p-8 md:grid-cols-2"
        >
          <Card className="gap-0 p-6">
            <p className="text-sm text-muted-foreground">Brickline</p>
            <p className="mt-1 text-lg font-medium">Mumbai Rent Index</p>
            <p className="mt-4 text-5xl font-semibold tracking-tight tabular-nums">$0.10</p>
            <p className="mt-1 text-xs text-muted-foreground">USDT on Whitechain · no gas to pay</p>
            <div className="mt-6 flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">you@example.com</span>
              <span className="font-medium tabular-nums">0.20 USDT</span>
            </div>
            <div className="mt-3 flex h-12 items-center justify-center gap-2 rounded-md bg-brand text-base font-medium text-brand-foreground">
              <CheckCircleIcon className="size-5" weight="fill" />
              Paid
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <DatabaseIcon className="size-3.5" /> Receipt saved on Arkiv
            </p>
          </Card>
          <div className="overflow-hidden rounded-xl bg-primary p-6 font-mono text-[12.5px] leading-relaxed text-primary-foreground/80 shadow-xs">
            <p className="text-primary-foreground/40"># the agent follows a review page's link</p>
            <p>GET look-alike.api/data?area=Bandra</p>
            <p className="mt-1">402 · pay $0.50 to 0.0.6660666</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded bg-destructive/20 px-2 py-0.5 text-red-300">
              <ProhibitIcon className="size-3.5" weight="bold" /> blocked before signing
            </p>
            <p className="mt-1 text-primary-foreground/60">· not Brickline's address on Arkiv</p>
            <p className="text-primary-foreground/60">· $0.50 is above the $0.30 per-call cap</p>
            <p className="mt-4 text-primary-foreground/40"># same agent, finds the shop on Arkiv</p>
            <p>402 · pay $0.05 to Brickline</p>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded bg-emerald-400/15 px-2 py-0.5 text-emerald-300">
              <CheckCircleIcon className="size-3.5" weight="fill" /> paid $0.05 USDC on Hedera
            </p>
            <p className="mt-4 text-primary-foreground/40"># $0.25 is over its $0.10 auto-pay limit</p>
            <p>it waits; the owner approves on their phone</p>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded bg-emerald-400/15 px-2 py-0.5 text-emerald-300">
              <CheckCircleIcon className="size-3.5" weight="fill" /> paid $0.25 USDC on Hedera
            </p>
            <p className="mt-4 text-primary-foreground/40"># all of it is on a public log on Hedera</p>
          </div>
        </motion.div>

        <Section eyebrow="Two halves" title="A checkout for the shop, and a spending guard for the agent.">
          <StaggerGrid className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card className="gap-0 p-6">
              <StorefrontIcon className="size-6 text-brand" weight="duotone" />
              <p className="mt-4 text-lg font-medium">For merchants: the checkout</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  "Add it in about 20 lines and get paid in USDT on Whitechain.",
                  "Customers pay with just an email. They never hold gas: the shop prepays it from a gas tank, in USDT.",
                  "Agents pay per call over x402. No account or API key.",
                  "Refund people and agents in one click, in full or in part. A CSV for the accountant.",
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
              <p className="mt-4 text-lg font-medium">For the agent's owner: the guard</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  "Limits live in the agent's wallet, below the model, so a web page can't change them.",
                  "Only known sellers, at their address on Arkiv, within a cap per call and a daily budget.",
                  "Wrong is blocked outright. Unusual, above the auto-pay limit, waits for the owner's OK on their phone.",
                  "Limits and approvals count only when the owner's wallet signs them, so not even Till can change them.",
                  "Every payment, approval and block goes on a public log on Hedera.",
                ].map(t => (
                  <li key={t} className="flex gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-brand" weight="fill" />
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          </StaggerGrid>
        </Section>

        <Section eyebrow="Why the limit lives in the wallet" title="A poisoned link fooled every model I tried. The guard caught every one.">
          <p className="mt-4 max-w-2xl text-muted-foreground">
            I ran the attack 27 times on Claude Haiku, Sonnet and Opus. Instructions planted on the page didn't work. But a review page linking to a look-alike API fooled every model, every time, because nothing on the page gives it away. Only the payment request shows the real price and payee, and that's where Till checks.
          </p>
          <StaggerGrid className="mt-8 grid gap-3 sm:grid-cols-3">
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
              <p className="mt-3 text-sm">With no link, it finds the real shop on Arkiv and pays $0.05 in USDC on Hedera, with no human approving.</p>
            </Card>
          </StaggerGrid>
        </Section>

        <section className="border-t py-16 sm:py-20">
          <Reveal className="grid items-center gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-12">
            <div>
              <Badge variant="paid">For developers</Badge>
              <h2 className="mt-3 text-3xl text-balance sm:text-4xl">About 20 lines in the shop's own server.</h2>
              <div className="mt-6 space-y-4 text-muted-foreground">
                <p>Create an order and redirect to Till's hosted checkout. Unlock what was bought when the signed webhook arrives.</p>
                <p>One more line puts an API behind x402, so agents can pay per call with no sign-up.</p>
                <RecordLink className="text-sm" href={`${REPO}/blob/main/apps/shop/src/index.ts`}>
                  The demo shop's integration
                </RecordLink>
              </div>
            </div>
            <CodeWindow code={integration} filename="shop/src/index.ts" />
          </Reveal>
        </section>

        <Section eyebrow="Built on" title="Each chain does one job. The merchant never sees any of it.">
          <StaggerGrid className="mt-8 grid gap-4 sm:grid-cols-3">
            <Feature icon={<EnvelopeSimpleIcon />} title="Whitechain: the money">
              USDT payments with no gas for the payer, through Till's relayer and a small verified contract that caps refunds at what was paid.
            </Feature>
            <Feature icon={<RobotIcon />} title="Hedera: the agents">
              Agents pay in USDC over x402 through a facilitator Till runs. Every payment, approval or block goes on a public HCS log, and the agent's identity is on ERC-8004.
            </Feature>
            <Feature icon={<DatabaseIcon />} title="Arkiv: receipts and sellers">
              Every receipt and every shop's listing is on Arkiv. Receipts load without the shop or Till, and agents find sellers there.
            </Feature>
          </StaggerGrid>
        </Section>

        <Section eyebrow="Merchants on Till" title="Agents find sellers in a public registry, not from a page's link.">
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Till lists every shop on Arkiv: what it sells, the price of each call, and the address it's paid at. The agent looks sellers up there, and a payment to any other address is blocked.
          </p>
          <Reveal>
            <MerchantsOnTill />
          </Reveal>
          <RecordLink className="mt-3 text-sm" href={registryExplorer()}>
            The registry query on Arkiv
          </RecordLink>
        </Section>

        <Section eyebrow="Proof" title="Everything above happened on testnet.">
          <Reveal>
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
          </Reveal>
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2 px-5 py-6 text-xs text-muted-foreground">
          <span className="flex gap-4">
            <a className="hover:underline" href="/docs">
              Docs
            </a>
            <a className="hover:underline" href={REPO}>
              github.com/ishtails/till-checkout
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
