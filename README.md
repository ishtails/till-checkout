# Till

Get paid by people and AI agents that can't be tricked into overpaying.

For small online sellers who want to be paid in USDT by people and by AI agents.
The checkout: people pay with an email and no gas, agents pay per API call with no sign-up, and refunds take one click.
The spending guard: the agent's limits are checked before anything is signed, and every payment and blocked attempt is a public record.

> Built at ETHGlobal Mumbai, 5–7 Nov 2026. This README started as the spec at kickoff; sections marked _(to do)_ get filled in as each piece works. The full design notes are in [`design/`](design/).

## Demo video
_(to do: recorded Friday)_

## Two halves
- **The checkout, for merchants** (`packages/sdk`, `apps/pay`, `apps/server`, `contracts/`). A shop adds it in about 20 lines and gets paid in USDT on Whitechain. People pay with an email and the shop covers the gas. Agents pay per call over x402, with no account or API key. The merchant refunds an order in one click.
- **The spending guard, for whoever runs an agent** (`packages/guard`). It checks every payment request against the agent's limits before anything is signed, and logs every payment and every blocked attempt to a public topic on Hedera.

Merchants want agents as customers. People will only let an agent spend if its limits hold. Till covers both sides.

## What happens in the demo
1. A data shop adds Till in about 20 lines (`apps/shop`).
2. A customer buys a $5 report with an email and a code. No wallet setup, no gas.
3. An AI agent follows a review page's link to what looks like the shop's API. It's a look-alike: the page says $0.05, but the API asks $0.50, paid to a stranger. The agent's spending guard blocks it before anything is signed, and the agent stops and says why.
4. Run again against the real shop, the agent pays $0.05 with no human approving.
5. The merchant refunds the customer's order in one click. The receipt shows the refund next to the payment.
6. The receipt page reads the order's records from Arkiv, not from the shop's database.

## How it works
- **People:** the customer signs a transfer in their email wallet. Our relayer submits it to the Checkout contract on Whitechain and pays the gas. The contract pays the merchant and records the order.
- **Agents:** the shop's API answers with an x402 payment request. The agent's spending guard checks it against its limits, then the agent pays over x402 through a facilitator we run, on Whitechain (USDT) or Hedera (USDC).
- **Refunds:** the merchant signs a refund for an order. The contract sends it back to the payer and won't refund more than was paid.
- **Receipts:** after each payment or refund, the server saves a record of it on Arkiv. The customer's receipt page reads them from there.

| Piece | Folder | What it is |
|---|---|---|
| Checkout server | `apps/server` | Orders API, the Whitechain relayer and x402 facilitator, the Hedera x402 facilitator, webhooks, a JSON store |
| Checkout contract | `contracts/` | `Checkout.sol` on Whitechain: `pay` and `refund` |
| Pay app | `apps/pay` | Checkout page, receipt page and merchant dashboard |
| Merchant SDK | `packages/sdk` | `createOrder`, `verifyWebhook`, `paywall()` |
| Spending guard | `packages/guard` | The agent's payment rules, checked before signing |
| Demo shop | `apps/shop` | A separate data seller that uses only the SDK |
| Agent | `apps/agent` | A headless Claude run with a "wallet" tool server that holds the keys, the x402 client and the guard |
| Attacker page | `apps/attacker` | A review page with a look-alike link, and an API that asks 10× the price |

_(to do: diagram)_

## Whitechain
- Checkout contract (verified): [`0xa4eBC27F8ba275d765DE0aECa7Fa1C09204dEeb6`](https://explorer.testnet.whitechain.io/address/0xa4eBC27F8ba275d765DE0aECa7Fa1C09204dEeb6)
- Customer's gasless USDT payment: _(to do)_
- Refund linked to that order: _(to do)_
- Agent's x402 payment through our facilitator: _(to do)_

**Why this needs on-chain stablecoin settlement on Whitechain.** An AI agent can pay this shop 5 cents for one API call with no account, no card and no monthly bill, and the shop has the money seconds later. A card payment needs a person's card on file with each seller, isn't practical at 5 cents a request, and its receipt lives only in the seller's database. Here the payment, its receipt and the refund linked to it are public records the customer can check without trusting the shop or us. Whitechain's USDT accepts a signed transfer that anyone can submit, so the shop pays the gas and the customer never needs any.

**Who pays the gas.** Our relayer pays it, and the merchant covers that cost the way it covers card fees. One payment costs about 0.0005 WBT _(to do: measured tx link)_. On testnet the relayer's WBT comes from the faucet, 0.5 WBT a day, which is several hundred payments. In production the merchant tops up a gas deposit.

**What stops someone draining the relayer:**
1. It signs only three calls: `Checkout.pay`, `Checkout.refund` and USDT `transferWithAuthorization`.
2. Only for registered merchants.
3. Only for real orders: unpaid, unexpired, the right amount. Refunds only up to what was paid.
4. It simulates every transaction first. A bad signature costs nothing.
5. 10 requests a minute per IP.
6. 500 transactions per merchant per day, and 0.2 WBT of gas per day in total.
7. It holds at most about 0.3 WBT.

## Hedera
- x402 endpoint: `GET /api/data` on the demo shop
- Settled payment: _(to do: transaction ID and HashScan link)_
- Facilitator: ours (`apps/server`). It adds an expiry check and a replay cache to the library's checks. Fallback: x402.org, one line of config
- Agent spending log (HCS topic): _(to do)_

**The spending guard.** It runs inside the agent's payment tool, below the model, so a blocked payment is never signed. The demo agent's limits:
1. Only USDT on Whitechain or USDC on Hedera.
2. Only payees on its allowlist.
3. At most $0.10 per call to this shop.
4. At most $0.50 a day to this shop.
5. At most $1 a day in total.
6. Anything over $1 needs a human, and is blocked in this demo.

Every payment and every blocked attempt is written to the HCS topic, with the reasons.

## Arkiv
_(to do, after the Friday gate)_. After each payment or refund, the server saves a record on Arkiv, and the customer's receipt page reads the order's records from there by `order_id`. Schema, friction, reach, why and how go in `/arkiv/`.

## Setup
_(to do)_

## What's mocked
- The customer's wallet is funded before the demo. In real use they'd withdraw USDT from an exchange to it.
- The merchant dashboard has no login. Refunds need the merchant's signature anyway.
- "Needs human approval" blocks the payment. There's no approval screen.

## Limitations
- Agent payments over x402 are final, so Till can't refund them yet.
- Testnet only, one merchant in the demo.

## Decisions log
- **Ports:** server 3001, pay app 5173, shop 3002, agent 3003, attacker 3004.

## AI usage
See `AI_USAGE.md`. The planning notes written before the event are in `design/`.
