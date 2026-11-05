import { Hono } from "hono"
import { formatEther, type Hex } from "viem"
import { publicClient } from "./chain"
import { store } from "./store"

// The gas meter: what our relayer has paid in WBT for one merchant, read from each transaction's
// receipt on chain (the chain is the record). Receipts never change, so each is fetched once.
const fees = new Map<string, bigint>()

async function feeOf(hash: Hex) {
  let fee = fees.get(hash)
  if (fee === undefined) {
    const receipt = await publicClient.getTransactionReceipt({ hash })
    fee = receipt.gasUsed * receipt.effectiveGasPrice + BigInt((receipt as { l1Fee?: bigint }).l1Fee ?? 0n)
    fees.set(hash, fee)
  }
  return fee
}

const sum = async (hashes: Hex[]) => (await Promise.all(hashes.map(feeOf))).reduce((a, b) => a + b, 0n)

export const gas = new Hono()

gas.get("/v1/gas", async c => {
  const merchantId = c.req.query("merchant")
  if (!merchantId) return c.json({ error: "merchant required" }, 400)
  const orders = store.listOrders(merchantId)
  const payments = orders.flatMap(o => (o.payTx ? [o.payTx] : []))
  const refunds = orders.flatMap(o => o.refunds.map(r => r.tx))
  const agentPayments = store
    .listSettlements()
    .filter(s => s.merchantId === merchantId && s.network === "eip155:1874")
    .map(s => s.transaction as Hex)

  const [paymentsWbt, refundsWbt, agentWbt] = await Promise.all([sum(payments), sum(refunds), sum(agentPayments)])
  const total = paymentsWbt + refundsWbt + agentWbt
  const count = payments.length + refunds.length + agentPayments.length
  return c.json({
    totalWbt: formatEther(total),
    perTxWbt: count ? formatEther(total / BigInt(count)) : "0",
    payments: { count: payments.length, wbt: formatEther(paymentsWbt) },
    refunds: { count: refunds.length, wbt: formatEther(refundsWbt) },
    agentPayments: { count: agentPayments.length, wbt: formatEther(agentWbt) },
  })
})
