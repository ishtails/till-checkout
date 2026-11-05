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
- Customer's gasless USDT payment: [`0x4646…7316`](https://explorer.testnet.whitechain.io/tx/0x46461259c098277b64f7372f40e2a217831b7ec6fb20eaf0eb08cdafa54e7316) ($5 from an email wallet on the checkout page, sent by our relayer; the customer holds no WBT). The first one, by script: [`0x93f3…6ab3`](https://explorer.testnet.whitechain.io/tx/0x93f38e2a5cd59f3995298c6780838454296ece64ef14bfa462c4ad1d9ea76ab3)
- Refund linked to that order: _(to do)_
- Agent's x402 payment through our facilitator: _(to do)_

**Why this needs on-chain stablecoin settlement on Whitechain.** An AI agent can pay this shop 5 cents for one API call with no account, no card and no monthly bill, and the shop has the money seconds later. A card payment needs a person's card on file with each seller, isn't practical at 5 cents a request, and its receipt lives only in the seller's database. Here the payment, its receipt and the refund linked to it are public records the customer can check without trusting the shop or us. Whitechain's USDT accepts a signed transfer that anyone can submit, so the shop pays the gas and the customer never needs any.

**Who pays the gas.** Our relayer pays it, and the merchant covers that cost the way it covers card fees. One payment through the Checkout contract costs about 0.0009 WBT (183k gas at 5 gwei, [measured](https://explorer.testnet.whitechain.io/tx/0x93f38e2a5cd59f3995298c6780838454296ece64ef14bfa462c4ad1d9ea76ab3)). On testnet the relayer's WBT comes from the faucet, 0.5 WBT a day, which is about 500 payments. In production the merchant tops up a gas deposit.

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
Needs [Bun](https://bun.sh) 1.4 and, for the contract, [Foundry](https://getfoundry.sh).

```bash
git clone --recurse-submodules https://github.com/ishtails/till-checkout && cd till-checkout
bun install
cp .env.example .env                    # fill in keys; see the comments in the file
cp merchants.example.json merchants.json # one merchant: API key, webhook secret, payout addresses
```

Run each in its own terminal:

```bash
bun run --cwd=apps/server start   # checkout server and relayer, :3001
bun run --cwd=apps/pay dev        # checkout, receipt and dashboard pages, :5173
bun run --cwd=apps/shop start     # the demo shop, :3002
```

Open http://localhost:3002 and buy the report. The customer's email wallet needs test USDT; the relayer needs a little WBT.

**The merchant's integration** is the block between the two `Till` markers in [`apps/shop/src/index.ts`](apps/shop/src/index.ts): create an order and redirect to it, then unlock the report when the signed `order.paid` webhook arrives.

## What's mocked
- The customer's wallet is funded before the demo. In real use they'd withdraw USDT from an exchange to it.
- The merchant dashboard has no login. Refunds need the merchant's signature anyway.
- "Needs human approval" blocks the payment. There's no approval screen.

## Limitations
- Agent payments over x402 are final, so Till can't refund them yet.
- Testnet only, one merchant in the demo.

## Decisions log
Made before the hack:
- **Gasless payments use EIP-3009 and our own relayer**, not a smart account and paymaster. Whitechain's USDT already accepts a signed transfer anyone can submit, and there's no hosted bundler or paymaster on Whitechain.
- **One Whitechain service is both the relayer and the x402 facilitator.** People and agents both produce a signed USDT transfer, so one set of drain checks and one gas wallet cover both.
- **x402 library: `@x402/*` v2, pinned at 2.28.0.** It already does the nonce, expiry, amount, recipient, balance and simulation checks, and every live facilitator speaks v2.
- **We run our own Hedera facilitator, with x402.org as the fallback.** It's the same code with a second scheme, plus an expiry check and a replay cache. Switching to the fallback is one URL in config.
- **Hedera payments settle in testnet USDC (`0.0.429274`)**, not HBAR, so prices read in dollars.
- **One Whitechain contract, `Checkout`,** for on-chain receipts and refunds capped at what was paid. Agent x402 payments stay standard and go straight to the merchant, so any x402 agent can pay.
- **Email wallet: Privy, on our hosted checkout page.** It works on chain 1874 and signs with no pop-up, and a hosted page keeps the merchant's side to about 20 lines.
- **Storage: in memory, saved to one JSON file.** Orders fit in a file, and the chain and Hedera are the records anyone checks.
- **Stack: a Bun monorepo** with a Hono server, a Vite + React app for checkout and dashboard, and a separate demo shop.

During the hack:
- **Ports:** server 3001, pay app 5173, shop 3002, agent 3003, attacker 3004.

## AI usage
See `AI_USAGE.md`. The planning notes written before the event are in `design/`.
