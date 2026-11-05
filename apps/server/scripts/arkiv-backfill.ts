// Writes the Arkiv records for orders paid before the Arkiv writer existed: one `paid`, then one
// `refunded` per refund, each showing the refunded total as it stood at that point.
// Run once: bun --env-file=../../.env scripts/arkiv-backfill.ts
import { drained, saveReceipt } from "../src/arkiv"
import { store } from "../src/store"

const orders = store.listOrders("data-shop").filter(o => o.status !== "open").reverse()
for (const order of orders) {
  // Orders paid before paidAt was stored use the time the order was created, a minute or so earlier.
  saveReceipt({ ...order, refunded: "0" }, { kind: "paid", at: order.paidAt ?? order.createdAt * 1000 })
  let refunded = 0n
  for (const r of order.refunds) {
    refunded += BigInt(r.amount)
    saveReceipt({ ...order, refunded: refunded.toString() }, { kind: "refunded", amount: r.amount, tx: r.tx, at: r.ts })
  }
}
await drained()
