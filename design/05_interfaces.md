# 05 Interfaces

## Merchant SDK: what the demo shop adds (the "about 20 lines")

The shop's whole integration, written as the shape it will take (TypeScript, Hono):

```text
import { Checkout } from "<sdk>"
const checkout = new Checkout({ apiKey: env.CHECKOUT_API_KEY, webhookSecret: env.CHECKOUT_WEBHOOK_SECRET })

// People: sell the report
app.post("/buy", async c => {
  const order = await checkout.createOrder({ amount: "5.00", description: "Mumbai rent report", returnUrl: SHOP_URL + "/thanks" })
  return c.redirect(order.checkoutUrl)
})
app.post("/webhooks/checkout", async c => {
  const event = await checkout.verifyWebhook(c.req.raw)          // throws on a bad signature
  if (event.type === "order.paid") unlockReport(event.orderId)
  return c.text("ok")
})

// Agents: charge per call, on Whitechain or Hedera
app.use("/api/data", checkout.paywall({ price: "0.05", description: "Rent data, one city" }))
app.get("/api/data", c => c.json(rentData))
```

**SDK surface (all of it):**

| Call | Does |
|---|---|
| `new Checkout({ apiKey, webhookSecret, baseUrl? })` | `baseUrl` defaults to the local server |
| `createOrder({ amount, description, returnUrl, metadata? })` | → `{ id, checkoutUrl, status }` |
| `getOrder(id)` | → the order |
| `verifyWebhook(request)` | HMAC-SHA256 check, then the parsed event |
| `paywall({ price, description })` | Fetches the merchant's `payTo` per network from `GET /v1/merchant`. Returns `@x402/hono` `paymentMiddleware` with both networks and the facilitator clients `[ours]`, or `[ours, x402.org]` for Hedera when `HEDERA_FACILITATOR_URL` is set |

## HTTP endpoints (checkout server)

| Method and path | Auth | Body → response |
|---|---|---|
| `POST /v1/orders` | `Authorization: Bearer <merchant api key>` | `{amount, description, returnUrl, metadata?}` → `{id, checkoutUrl, status:"open"}` |
| `GET /v1/orders/:id` | none (local demo) | → `{id, merchant, amount, refunded, status, payer?, payTx?, refunds:[{amount, tx}]}` |
| `GET /v1/orders?merchant=` | none (local demo) | → list, for the dashboard |
| `GET /v1/merchant` | merchant key | → `{id, name, payTo: {"eip155:1874", "hedera:testnet"}}` |
| `GET /v1/checkout/:id` | none | → `{merchantName, description, amount, token, contract, chainId, nonce, validBefore}`: everything the page needs to build the typed data |
| `POST /v1/checkout/:id/pay` | the signature | `{payer, validAfter, validBefore, signature}` → `{txHash}` or `{error}` |
| `POST /v1/orders/:id/refund` | the merchant's signature | `{amount, validAfter, validBefore, signature}` → `{txHash}` |
| `GET /v1/agent-payments` | none | Payments settled through our facilitator, for the dashboard |
| `GET /facilitator/supported`, `POST /facilitator/verify`, `POST /facilitator/settle` | none | x402 v2 facilitator API |

Amounts are decimal strings in USD in the API, and atomic units (6 decimals) on-chain and in x402.

**Webhooks (server → shop):** `POST <merchant.webhookUrl>` with header `X-Checkout-Signature: <hex HMAC-SHA256(secret, rawBody)>` and body `{type: "order.paid"|"order.refunded", orderId, amount, txHash, ts}`. Sent once; the shop also reads the order on the `returnUrl` redirect, so a missed webhook doesn't break the demo.

## x402 payment requirements (what the shop's 402 returns)

```json
{
  "x402Version": 2,
  "resource": { "url": "http://localhost:3002/api/data", "description": "Rent data, one city", "mimeType": "application/json" },
  "accepts": [
    { "scheme": "exact", "network": "eip155:1874",
      "asset": "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", "amount": "50000",
      "payTo": "0xMerchant", "maxTimeoutSeconds": 300,
      "extra": { "name": "Tether USD", "version": "1" } },
    { "scheme": "exact", "network": "hedera:testnet",
      "asset": "0.0.429274", "amount": "50000",
      "payTo": "0.0.M", "maxTimeoutSeconds": 120,
      "extra": { "feePayer": "0.0.F" } }
  ]
}
```

The attacker's 402 is the same shape, with `amount: "500000"` and its own `payTo`.

## Env and config

| App | Variable | Value or source |
|---|---|---|
| server | `WHITECHAIN_RPC_URL` | `https://rpc.testnet.whitechain.io` |
| server | `USDT_ADDRESS` | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |
| server | `CHECKOUT_CONTRACT` | From the deploy |
| server | `RELAYER_PRIVATE_KEY` | New EOA, ~0.3 WBT |
| server | `HEDERA_FEE_PAYER_ID`, `HEDERA_FEE_PAYER_KEY` | New Hedera account, testnet HBAR |
| server | `MERCHANTS_FILE` | `merchants.json`: `[{id, name, apiKey, webhookUrl, webhookSecret, evmAddress, hederaAccountId}]` |
| server | `STORE_FILE` | `data/store.json` |
| server | `LIMITS` | Defaults in code: §1–2 of `04_low_level.md` |
| pay | `VITE_PRIVY_APP_ID`, `VITE_API_URL` | Privy dashboard; server URL |
| shop | `CHECKOUT_API_KEY`, `CHECKOUT_WEBHOOK_SECRET`, `HEDERA_FACILITATOR_URL?` | `merchants.json`; set only to fall back |
| agent | none (runs on the `claude` CLI's Pro login) | `claude -p --system-prompt … --tools "" --restricted --mcp-config wallet.json --strict-mcp-config --allowedTools mcp__wallet__read_page,mcp__wallet__buy_data`. Model `claude-opus-5-5` (clearest explanations); `claude-haiku-5-5` if the video needs it ~5 s faster. Fallback: an API key with $5 of credit, same MCP server |
| agent | `AGENT_EVM_KEY`, `AGENT_HEDERA_ID`, `AGENT_HEDERA_KEY` | New; USDT on Whitechain, USDC on Hedera |
| agent | `HCS_TOPIC_ID`, `POLICY_FILE`, `NETWORK` | Prep; `policy.json`; `eip155:1874` or `hedera:testnet` |
| attacker | `ATTACKER_EVM`, `ATTACKER_HEDERA` | Any address; never paid |

**Pinned versions:**
- `@x402/core`, `@x402/evm`, `@x402/hedera`, `@x402/hono` and `@x402/fetch` at exactly `2.28.0`.
- `@hiero-ledger/sdk` at exactly `2.85.0` (the version `@x402/hedera` pins). This one is needed for the HCS calls, which `@x402/hedera` doesn't re-export. The same version keeps a single copy of the SDK in the install.
- `viem` at the latest 2.x on kickoff day.
