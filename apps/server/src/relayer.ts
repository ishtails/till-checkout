import type { MiddlewareHandler } from "hono"
import { formatEther, parseEther, toFunctionSelector, type Hex } from "viem"
import { publicClient, relayer, walletClient } from "./chain"
import { config } from "./config"

// Drain protection for the one hot wallet that pays gas (design/04_low_level.md §2).
export const limits = {
  txPerMerchantPerDay: 500,
  wbtPerDay: parseEther("0.2"),
  requestsPerMinutePerIp: 10,
}

// Rule 1: the relayer only ever signs these three calls.
const allowed: Record<string, string[]> = {
  [config.checkout.toLowerCase()]: [
    toFunctionSelector("pay(bytes32,address,address,uint128,uint256,uint256,bytes)"),
    toFunctionSelector("refund(bytes32,uint128,uint256,uint256,bytes)"),
  ],
  [config.usdt.toLowerCase()]: [
    toFunctionSelector("transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)"),
  ],
}

// Rule 6: daily caps, counted from receipts. In memory; resets with the date.
const today = () => new Date().toISOString().slice(0, 10)
let day = today()
let wbtSpent = 0n
const txByMerchant = new Map<string, number>()
function rollDay() {
  if (day !== today()) {
    day = today()
    wbtSpent = 0n
    txByMerchant.clear()
  }
}

export class RelayError extends Error {}

/** Rule 6, before sending. Returns the reason if a cap is reached. */
export function capReached(merchantId: string): string | undefined {
  rollDay()
  if (wbtSpent >= limits.wbtPerDay) return "relayer daily gas cap reached"
  if ((txByMerchant.get(merchantId) ?? 0) >= limits.txPerMerchantPerDay) return "merchant daily transaction cap reached"
}

/** Rule 6, after sending: count the real fee from the receipt. */
export async function recordFee(merchantId: string, hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const l1Fee = BigInt((receipt as { l1Fee?: bigint }).l1Fee ?? 0n)
  const fee = receipt.gasUsed * receipt.effectiveGasPrice + l1Fee
  wbtSpent += fee
  txByMerchant.set(merchantId, (txByMerchant.get(merchantId) ?? 0) + 1)
  console.log(`relayed ${hash} for ${merchantId} status=${receipt.status} fee=${formatEther(fee)} WBT`)
  return { receipt, fee }
}

/**
 * Sends one of the three allowed calls for a registered merchant, after simulating it.
 * Callers check rules 2 and 3 (registered merchant, real order) before calling this.
 */
export async function relay(merchantId: string, to: Hex, data: Hex) {
  const selector = data.slice(0, 10)
  if (!allowed[to.toLowerCase()]?.includes(selector)) throw new RelayError("call not allowed")

  const cap = capReached(merchantId)
  if (cap) throw new RelayError(cap)
  // The merchant's gas tank must have credit (imported here, not at the top, to avoid a cycle).
  const empty = await (await import("./gas-tank")).tankEmpty(merchantId)
  if (empty) throw new RelayError(empty)

  // Rule 4: simulate the exact call. If it would revert, nothing is sent and we spend no gas.
  try {
    await publicClient.call({ account: relayer, to, data })
  } catch (err) {
    throw new RelayError(`would revert: ${(err as { shortMessage?: string }).shortMessage ?? (err as Error).message}`)
  }

  const hash = await walletClient.sendTransaction({ to, data })
  const { receipt, fee } = await recordFee(merchantId, hash)
  if (receipt.status !== "success") throw new RelayError(`reverted on chain: ${hash}`)
  return { hash, fee, gasUsed: receipt.gasUsed }
}

// Rule 5: 10 requests a minute per IP on the endpoints that spend gas.
const hits = new Map<string, number[]>()
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header("x-forwarded-for") ?? "local"
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60_000)
  if (recent.length >= limits.requestsPerMinutePerIp) return c.json({ error: "too many requests" }, 429)
  recent.push(now)
  hits.set(ip, recent)
  await next()
}

export const relayerStatus = async () => ({
  address: relayer.address,
  balanceWbt: formatEther(await publicClient.getBalance({ address: relayer.address })),
  spentTodayWbt: formatEther(wbtSpent),
  capPerDayWbt: formatEther(limits.wbtPerDay),
})
