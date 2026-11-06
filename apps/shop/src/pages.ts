// The demo shop's own pages. Nothing here knows about Till; see index.ts for the integration.
import { html } from "hono/html"

const layout = (body: unknown) => html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Mumbai Rent Data</title>
      <style>
        body { font-family: Georgia, serif; max-width: 640px; margin: 48px auto; padding: 0 16px; color: #1c1917; background: #fffbeb; }
        h1 { font-size: 32px; margin-bottom: 4px; }
        .muted { color: #78716c; }
        .card { background: white; border: 1px solid #e7e5e4; border-radius: 12px; padding: 24px; margin-top: 24px; }
        button { font: inherit; font-size: 18px; background: #b45309; color: white; border: 0; border-radius: 8px; padding: 12px 20px; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; } td { padding: 6px 0; border-bottom: 1px solid #f5f5f4; }
      </style>
    </head>
    <body>
      ${body}
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
      <p class="muted">The same data, one city area per call: <code>GET /api/data</code>, $0.05 per call.</p>
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
    <p><a href="/">Back to the shop</a></p>
  `)

export const waiting = () =>
  layout(html`
    <h1>Waiting for your payment</h1>
    <p class="muted">This page unlocks the report as soon as the payment is confirmed. <a href="">Refresh</a></p>
  `)
