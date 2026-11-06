import { Hono } from "hono"
import { encodeFunctionData, formatUnits, getAddress, isAddress, parseUnits, toHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { explorerTx, publicClient, usdtAbi } from "./chain"
import { config } from "./config"
import { RelayError, rateLimit, relay } from "./relayer"
import { store } from "./store"

// Test USDT for visitors to the live demo, so anyone can try the checkout with a new email wallet.
// The faucet wallet signs a transfer and our relayer sends it, like any payment: the visitor needs no gas.
export const DRIP = parseUnits("0.2", 6)
const limits = { perIpPerDay: 3, totalPerDay: parseUnits("3", 6) }

const faucetAccount = config.faucetKey ? privateKeyToAccount(config.faucetKey) : undefined

const today = () => new Date().toISOString().slice(0, 10)
let day = today()
let sentToday = 0n
const byIp = new Map<string, number>()

const transferTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

const balanceOf = (address: Hex) =>
  publicClient.readContract({ address: config.usdt, abi: usdtAbi, functionName: "balanceOf", args: [address] })

export const faucet = new Hono()

faucet.get("/v1/faucet", async c => {
  if (!faucetAccount) return c.json({ enabled: false })
  return c.json({ enabled: true, drip: formatUnits(DRIP, 6), address: faucetAccount.address, balance: formatUnits(await balanceOf(faucetAccount.address), 6) })
})

faucet.post("/v1/faucet", rateLimit, async c => {
  if (!faucetAccount) return c.json({ error: "faucet is off" }, 404)
  const body = await c.req.json<{ address: string }>()
  if (!isAddress(body.address)) return c.json({ error: "bad address" }, 400)
  const to = getAddress(body.address)

  if (day !== today()) {
    day = today()
    sentToday = 0n
    byIp.clear()
  }
  const ip = c.req.header("x-forwarded-for") ?? "local"
  if (store.getDrip(to)) return c.json({ error: "this wallet already got test USDT" }, 409)
  if ((byIp.get(ip) ?? 0) >= limits.perIpPerDay) return c.json({ error: "test USDT limit reached for today" }, 429)
  if (sentToday + DRIP > limits.totalPerDay) return c.json({ error: "the faucet's daily limit is reached, try tomorrow" }, 429)
  if ((await balanceOf(to)) >= DRIP) return c.json({ error: "this wallet already has enough test USDT" }, 409)

  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300)
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const message = { from: faucetAccount.address, to, value: DRIP, validAfter: 0n, validBefore, nonce }
  const signature = await faucetAccount.signTypedData({
    domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: config.usdt },
    types: transferTypes,
    primaryType: "TransferWithAuthorization",
    message,
  })
  const data = encodeFunctionData({
    abi: usdtAbi,
    functionName: "transferWithAuthorization",
    args: [message.from, message.to, message.value, message.validAfter, message.validBefore, message.nonce, signature],
  })

  try {
    const { hash } = await relay("faucet", config.usdt, data)
    sentToday += DRIP
    byIp.set(ip, (byIp.get(ip) ?? 0) + 1)
    store.putDrip(to, hash)
    return c.json({ amount: formatUnits(DRIP, 6), txHash: hash, explorer: explorerTx(hash) })
  } catch (err) {
    if (err instanceof RelayError) return c.json({ error: err.message }, 400)
    throw err
  }
})
