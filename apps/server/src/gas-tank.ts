import { Hono } from "hono"
import { encodeFunctionData, formatEther, isAddress, parseUnits, toHex, type Address, type Hex } from "viem"
import { explorerTx, relayer, usdtAbi } from "./chain"
import { config } from "./config"
import { merchantGasWbt } from "./gas"
import { findMerchant } from "./merchants"
import { RelayError, rateLimit, relay } from "./relayer"
import { store } from "./store"

// The gas tank: Till pays the gas for a merchant's customers and agents, and the merchant prepays
// for it in USDT. Each transaction is charged at cost (the real fee, read from its receipt, priced
// in USD) plus a margin, which is how Till earns on it. New merchants start with a free credit.
// When the tank is empty, the relayer stops paying gas for that merchant until it's topped up.
export const tank = {
  wbtUsd: Number(process.env.GAS_WBT_USD ?? 55), // WBT's market price (about $55 in mid 2026); set in env
  margin: Number(process.env.GAS_MARGIN ?? 0.1),
  startUsd: Number(process.env.GAS_TANK_START_USD ?? 5),
}

const usd = (atomic: bigint | string) => Number(atomic) / 1e6

/** The merchant's tank in USD: credits in, gas charged out. */
export async function tankBalance(merchantId: string) {
  const { totalWbt, count } = await merchantGasWbt(merchantId)
  const charged = Number(formatEther(totalWbt)) * tank.wbtUsd * (1 + tank.margin)
  const topups = store.listTopups(merchantId)
  const credits = tank.startUsd + topups.reduce((s, t) => s + usd(t.amount), 0)
  const perTx = count ? charged / count : 0
  return {
    balanceUsd: credits - charged,
    creditsUsd: credits,
    chargedUsd: charged,
    tillEarnedUsd: charged - charged / (1 + tank.margin),
    perTxUsd: perTx,
    txLeft: perTx ? Math.max(Math.floor((credits - charged) / perTx), 0) : null,
    topups,
  }
}

/** Before relaying for a merchant: refuse once their tank is empty. */
export async function tankEmpty(merchantId: string) {
  if (!findMerchant(merchantId)) return undefined // the faucet and top-ups aren't merchants
  const { balanceUsd } = await tankBalance(merchantId)
  if (balanceUsd <= 0) return "this merchant's gas tank is empty: top it up in the dashboard"
}

export const gasTank = new Hono()

gasTank.get("/v1/gas-tank", async c => {
  const merchantId = c.req.query("merchant")
  const merchant = merchantId && findMerchant(merchantId)
  if (!merchant) return c.json({ error: "merchant not found" }, 404)
  return c.json({
    ...(await tankBalance(merchant.id)),
    wbtUsd: tank.wbtUsd,
    margin: tank.margin,
    startUsd: tank.startUsd,
    // To top up: the merchant signs a USDT transfer to Till's gas wallet; our relayer submits it.
    topup: {
      to: relayer.address,
      nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
      validBefore: Math.floor(Date.now() / 1000) + 300,
      domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: config.usdt },
    },
  })
})

gasTank.post("/v1/gas-tank/topup", rateLimit, async c => {
  const b = await c.req.json<{ merchant: string; from: string; amount: string; nonce: Hex; validBefore: number; signature: Hex }>()
  const merchant = findMerchant(b.merchant)
  if (!merchant) return c.json({ error: "merchant not found" }, 404)
  if (!isAddress(b.from)) return c.json({ error: "from must be an address" }, 400)
  const amount = parseUnits(b.amount, 6)
  if (amount < parseUnits("0.1", 6) || amount > parseUnits("100", 6)) return c.json({ error: "top up between $0.10 and $100" }, 400)
  try {
    const data = encodeFunctionData({
      abi: usdtAbi,
      functionName: "transferWithAuthorization",
      args: [b.from as Address, relayer.address, amount, 0n, BigInt(b.validBefore), b.nonce, b.signature],
    })
    const { hash } = await relay("gas-tank", config.usdt, data)
    store.putTopup(merchant.id, { amount: amount.toString(), from: b.from, tx: hash, ts: Date.now() })
    return c.json({ txHash: hash, explorer: explorerTx(hash), ...(await tankBalance(merchant.id)) })
  } catch (err) {
    if (err instanceof RelayError) return c.json({ error: err.message }, 400)
    throw err
  }
})
