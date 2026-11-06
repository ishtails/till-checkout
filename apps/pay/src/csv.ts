import { agentExplorerTx, explorerTx, type AgentPayment, type Order } from "./api"

// One row per money movement, for the merchant's accountant: payments in, refunds out (negative),
// and agent payments. Every row links to its public on-chain record.
export function ledgerCsv(orders: Order[], agentPayments: AgentPayment[]) {
  const rows: (string | number)[][] = []
  for (const o of orders) {
    if (o.payTx) rows.push([o.createdAt * 1000, "payment", o.id, o.description, o.payer ?? "", "USDT on Whitechain", o.amount, o.payTx, explorerTx(o.payTx)])
    for (const r of o.refunds) {
      rows.push([r.ts, "refund", o.id, o.description, o.payer ?? "", "USDT on Whitechain", `-${r.amount}`, r.tx, explorerTx(r.tx)])
    }
  }
  for (const p of agentPayments) {
    const asset = p.network.startsWith("hedera") ? "USDC on Hedera" : "USDT on Whitechain"
    rows.push([p.ts, "agent payment", "", "API call", p.payer, asset, String(Number(p.amount) / 1e6), p.transaction, agentExplorerTx(p)])
    for (const r of p.refunds ?? []) {
      rows.push([r.ts, "agent refund", "", "API call", p.payer, asset, `-${Number(r.amount) / 1e6}`, r.tx, explorerTx(r.tx)])
    }
  }
  rows.sort((a, b) => Number(a[0]) - Number(b[0]))

  const header = ["date", "type", "order", "description", "customer", "paid in", "amount_usd", "transaction", "record"]
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const lines = rows.map(([ts, ...rest]) => [new Date(Number(ts)).toISOString(), ...rest].map(cell).join(","))
  return [header.join(","), ...lines].join("\n") + "\n"
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}
