// The demo shop's own pages. Nothing here knows about Till; see index.ts for the integration.
// It has its own look on purpose: it's the merchant's site, and Till's checkout is a separate page.
import { html } from "hono/html"

const layout = (body: unknown) => html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Mumbai Rent Data</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #1c1917; background: #fffbeb; line-height: 1.5; }
        .demo { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; background: #145c4a; color: #f0fdf4; padding: 10px 16px; text-align: center; }
        .demo a { color: #fff; font-weight: 600; }
        main { max-width: 640px; margin: 0 auto; padding: 40px 16px 64px; }
        h1 { font-size: 34px; line-height: 1.15; margin: 0 0 6px; letter-spacing: -0.01em; }
        h2 { font-size: 21px; margin: 0 0 6px; }
        p { margin: 0 0 12px; }
        .muted { color: #78716c; }
        .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 14px; padding: 24px; margin-top: 20px; box-shadow: 0 1px 2px rgb(0 0 0 / 0.04); }
        button { font: inherit; font-size: 18px; background: #b45309; color: #fff; border: 0; border-radius: 10px; padding: 12px 22px; cursor: pointer; margin-top: 8px; }
        button:hover { background: #92400e; }
        code { font-size: 14px; background: #f5f5f4; padding: 2px 6px; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; } td { padding: 8px 0; border-bottom: 1px solid #f5f5f4; }
        a { color: #92400e; }
      </style>
    </head>
    <body>
      <div class="demo">
        Live demo of <a href="https://github.com/ishtails/till-checkout">Till</a>, a checkout for people and AI agents.
        Sign in with any email, get free test USDT, and buy the report. No gas, no wallet app.
      </div>
      <main>${body}</main>
    </body>
  </html>`

export const home = () =>
  layout(html`
    <h1>Mumbai Rent Data</h1>
    <p class="muted">Median rents by neighbourhood, updated monthly.</p>
    <div class="card">
      <h2>Mumbai rent report, November 2026</h2>
      <p>2BHK and 1BHK median rents across Mumbai neighbourhoods.</p>
      <form method="post" action="/buy"><button>Buy report · $0.10</button></form>
    </div>
    <div class="card">
      <h2>For AI agents</h2>
      <p class="muted">The same data, one city area per call: <code>GET /api/data</code>, $0.05 per call, paid over x402.</p>
    </div>
  `)

export const report = (rows: { area: string; bhk2: number; bhk1: number }[]) =>
  layout(html`
    <h1>Thanks, your report is ready</h1>
    <div class="card">
      <h2>Mumbai rent report, November 2026</h2>
      <table>
        <tr><td><b>Area</b></td><td><b>2BHK</b></td><td><b>1BHK</b></td></tr>
        ${rows.map(r => html`<tr><td>${r.area}</td><td>₹${r.bhk2.toLocaleString("en-IN")}</td><td>₹${r.bhk1.toLocaleString("en-IN")}</td></tr>`)}
      </table>
    </div>
    <p style="margin-top:20px"><a href="/">Back to the shop</a></p>
  `)

export const waiting = () =>
  layout(html`
    <h1>Waiting for your payment</h1>
    <p class="muted">This page unlocks the report as soon as the payment is confirmed. <a href="">Refresh</a></p>
  `)
