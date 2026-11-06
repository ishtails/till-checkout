// The demo shop's own pages. Nothing here knows about Till; see index.ts for the integration.
// It has its own look on purpose: it's the merchant's site, and Till's checkout is a separate page.
import { html } from "hono/html"

type Row = { area: string; bhk2: number; bhk1: number }
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

const layout = (title: string, body: unknown) => html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <style>
        :root {
          --bg: #faf7f2; --ink: #1b1813; --muted: #72695d; --line: #e8e1d6; --card: #fff;
          --accent: #c2410c; --accent-ink: #9a3412; --accent-soft: #fdf0e7; --till: #145c4a;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 Inter, ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
        a { color: inherit; }
        .demo { background: var(--till); color: #ecfdf5; font-size: 13.5px; text-align: center; padding: 9px 16px; }
        .demo a { color: #fff; font-weight: 600; }
        .wrap { max-width: 1040px; margin: 0 auto; padding: 0 20px; }
        nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 0; }
        .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; letter-spacing: -0.01em; text-decoration: none; }
        .mark { width: 30px; height: 30px; border-radius: 8px; background: var(--ink); color: var(--bg); display: grid; place-items: center; font-family: "Instrument Serif", serif; font-size: 20px; }
        nav .links { display: flex; gap: 22px; font-size: 14px; color: var(--muted); }
        nav .links a { text-decoration: none; } nav .links a:hover { color: var(--ink); }
        .serif { font-family: "Instrument Serif", Georgia, serif; font-weight: 400; letter-spacing: -0.01em; }
        .hero { display: grid; grid-template-columns: 1.15fr 1fr; gap: 48px; align-items: center; padding: 40px 0 56px; }
        .eyebrow { display: inline-flex; gap: 8px; align-items: center; font-size: 13px; color: var(--accent-ink); background: var(--accent-soft); padding: 4px 10px; border-radius: 99px; font-weight: 500; }
        h1 { font-size: clamp(40px, 6vw, 64px); line-height: 1.02; margin: 18px 0 16px; }
        .lead { font-size: 18px; color: var(--muted); max-width: 30em; margin: 0 0 28px; }
        .btn { display: inline-flex; align-items: center; gap: 10px; font: 600 16px Inter, sans-serif; background: var(--ink); color: #fff; border: 0; border-radius: 12px; padding: 14px 22px; cursor: pointer; transition: transform .08s, background .15s; }
        .btn:hover { background: #2d2820; } .btn:active { transform: translateY(1px); }
        .btn .price { background: rgba(255,255,255,.14); padding: 2px 8px; border-radius: 8px; font-weight: 500; }
        .note { font-size: 13px; color: var(--muted); margin-top: 12px; display: flex; align-items: center; gap: 6px; }
        .dot { width: 6px; height: 6px; border-radius: 99px; background: var(--till); display: inline-block; }
        .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 1px 2px rgb(27 24 19 / .04), 0 12px 32px -16px rgb(27 24 19 / .12); }
        .preview { padding: 22px; position: relative; overflow: hidden; }
        .preview h3 { margin: 0; font-size: 15px; font-weight: 600; } .preview .sub { font-size: 13px; color: var(--muted); margin: 2px 0 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { text-align: left; font-weight: 500; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; padding: 8px 0; border-bottom: 1px solid var(--line); }
        td { padding: 11px 0; border-bottom: 1px solid #f1ece4; } td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .blur { filter: blur(5px); user-select: none; }
        .lock { position: absolute; inset: auto 0 0 0; height: 58%; display: grid; place-items: end center; padding-bottom: 22px; background: linear-gradient(to bottom, rgb(255 255 255 / 0), #fff 55%); font-size: 13.5px; color: var(--muted); }
        .lock b { color: var(--ink); }
        section { padding: 56px 0; border-top: 1px solid var(--line); }
        h2 { font-size: clamp(30px, 4vw, 40px); line-height: 1.1; margin: 0 0 10px; }
        .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; }
        .feat { padding: 20px; } .feat b { display: block; margin-bottom: 4px; } .feat p { margin: 0; color: var(--muted); font-size: 14.5px; }
        .agents { display: grid; grid-template-columns: 1fr 1.1fr; gap: 40px; align-items: center; }
        pre { margin: 0; background: #17140f; color: #e9e2d6; border-radius: 16px; padding: 20px; font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-x: auto; }
        pre .k { color: #f0a46c; } pre .c { color: #8f8577; } pre .g { color: #7fd1b0; }
        footer { padding: 32px 0 48px; color: var(--muted); font-size: 13px; border-top: 1px solid var(--line); }
        .page { max-width: 640px; margin: 0 auto; padding: 40px 20px 72px; }
        .page h1 { font-size: 44px; }
        @media (max-width: 820px) {
          .hero, .agents { grid-template-columns: 1fr; gap: 28px; padding-top: 16px; }
          .grid3 { grid-template-columns: 1fr; }
          nav .links { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="demo">
        A live demo of <a href="https://github.com/ishtails/till-checkout">Till</a>, a checkout for people and AI agents.
        Sign in with any email, get free test USDT, and buy the report.
      </div>
      <div class="wrap">
        <nav>
          <a class="brand" href="/"><span class="mark">B</span> Brickline</a>
          <div class="links"><a href="/#report">The report</a><a href="/#api">For AI agents</a></div>
        </nav>
      </div>
      ${body}
    </body>
  </html>`

const buyButton = html`<form method="post" action="/buy">
    <button class="btn">Buy the report <span class="price">$0.10</span></button>
  </form>
  <p class="note"><span class="dot"></span> Pay with just your email. No wallet app, no gas.</p>`

export const home = (rows: Row[]) =>
  layout(
    "Brickline · Rent data for Indian cities",
    html`
      <main class="wrap">
        <div class="hero" id="report">
          <div>
            <span class="eyebrow">November 2026 · ${rows.length} neighbourhoods</span>
            <h1 class="serif">What does a 2BHK really cost in Mumbai?</h1>
            <p class="lead">Median monthly rents for 1BHK and 2BHK flats, neighbourhood by neighbourhood. One clean report, updated every month.</p>
            ${buyButton}
          </div>
          <div class="card preview">
            <h3>Mumbai Rent Index</h3>
            <p class="sub">Median rent a month, November 2026</p>
            <table>
              <tr><th>Area</th><th class="num">2BHK</th><th class="num">1BHK</th></tr>
              ${rows.map((r, i) => html`<tr><td>${r.area}</td><td class="num ${i > 0 ? "blur" : ""}">${rupees(r.bhk2)}</td><td class="num ${i > 0 ? "blur" : ""}">${rupees(r.bhk1)}</td></tr>`)}
            </table>
            <div class="lock"><span><b>${rows.length - 1} more areas</b> unlock when you buy</span></div>
          </div>
        </div>

        <section>
          <h2 class="serif">Why people buy it</h2>
          <div class="grid3">
            <div class="card feat"><b>Before you sign a lease</b><p>Know the going rate before a broker quotes you one.</p></div>
            <div class="card feat"><b>Before you move</b><p>Compare Bandra with Powai or Thane in one table.</p></div>
            <div class="card feat"><b>For your landlord talk</b><p>Bring a number, not a feeling.</p></div>
          </div>
        </section>

        <section id="api">
          <div class="agents">
            <div>
              <span class="eyebrow">For AI agents</span>
              <h2 class="serif" style="margin-top:14px">The same data, five cents a call.</h2>
              <p class="lead" style="font-size:16px">Agents ask for one neighbourhood at a time and pay per request over x402, in USDT on Whitechain or USDC on Hedera. No account, no API key, no monthly bill.</p>
            </div>
            <pre><span class="c"># an agent asks for one area</span>
<span class="k">GET</span> /api/data?area=Bandra%20West

<span class="c"># the shop names its price</span>
402 Payment Required  <span class="g">$0.05</span>

<span class="c"># the agent pays and gets the data</span>
200 OK  { "area": "Bandra West", "bhk2": ... }</pre>
          </div>
        </section>
      </main>
      <footer><div class="wrap">Brickline is a demo shop built for Till. The figures are sample data.</div></footer>
    `,
  )

export const report = (rows: Row[]) =>
  layout(
    "Your report · Brickline",
    html`
      <main class="page">
        <span class="eyebrow">Paid · thank you</span>
        <h1 class="serif" style="margin-top:16px">Your report is ready</h1>
        <div class="card preview" style="margin-top:20px">
          <h3>Mumbai Rent Index</h3>
          <p class="sub">Median rent a month, November 2026</p>
          <table>
            <tr><th>Area</th><th class="num">2BHK</th><th class="num">1BHK</th></tr>
            ${rows.map(r => html`<tr><td>${r.area}</td><td class="num">${rupees(r.bhk2)}</td><td class="num">${rupees(r.bhk1)}</td></tr>`)}
          </table>
        </div>
        <p class="note" style="margin-top:20px"><a href="/">← Back to the shop</a></p>
      </main>
    `,
  )

export const waiting = () =>
  layout(
    "Waiting for payment · Brickline",
    html`
      <main class="page">
        <h1 class="serif">Waiting for your payment</h1>
        <p class="lead">This page unlocks the report as soon as the payment is confirmed. <a href="">Refresh</a></p>
      </main>
    `,
  )
