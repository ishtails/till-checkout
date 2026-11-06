
<p align="center">
  <img src="assets/cover@2x.png" alt="Till: get paid by people and AI agents that can't be tricked into overpaying" width="880">
</p>

<h1 align="center">Till</h1>

<p align="center"><b>Get paid by people and AI agents that can't be tricked into overpaying.</b></p>

<p align="center">
  A checkout for small online sellers: people pay in USDT with an email and no gas, agents pay per API call with no sign-up, and refunds take one click.<br>
  A spending guard for whoever runs the agent: its limits are checked before anything is signed, and every payment and blocked attempt is a public record.
</p>

<p align="center">
  <a href="https://till.ishtails.xyz"><b>Try it live</b></a> · Demo video <i>(link added once recorded)</i> · <a href="https://till.ishtails.xyz/docs">Docs</a> · <a href="design/">Specs</a> · Built solo at ETHGlobal Mumbai, 5–7 Nov 2026
</p>

## Why I built it

AI agents are starting to pay for things: one API call, one dataset, five cents at a time. Shops want them as customers, and a card can't charge five cents with no account. But people will only let an agent spend if its limits hold.

Before the event I tested that. I gave Claude Haiku, Sonnet and Opus a task and a review page whose link pointed to a look-alike of the real API, asking ten times the price, paid to a stranger. **The link fooled every model, every time** (9 of 9). Injected instructions didn't work at all (0 of 18), but a poisoned link has nothing on the page to give it away: only the payment request shows the real price and payee. So the limit has to live in the wallet, not the model.

Till is both halves: a checkout a shop adds in about 20 lines, and a guard in the agent's wallet. Something wrong is blocked outright. Something only unusual, like a bigger payment than normal, waits for the owner's OK on their phone.

**Try it:** open the [demo shop](https://shop.till.ishtails.xyz), sign in with any email, get free test USDT, and buy the report ($0.10; prices are lowered for testnet). Your receipt is read from Arkiv. The agent runs on my laptop; its log is public on [HashScan](https://hashscan.io/testnet/topic/0.0.11155231).

## The demo
1. **A person pays.** Brickline, a demo data shop, adds Till in about 20 lines. A customer buys a $0.10 report with an email and a code. No wallet app, no gas.
2. **An agent is tricked, and the wallet isn't.** The agent follows a review page's link to a look-alike API asking $0.50 to a stranger. The guard blocks it before anything is signed: the payee isn't on its list or Brickline's address on Arkiv, and it's over the $0.30 cap.
3. **The agent pays the real shop.** With no link, it finds Brickline in Till's registry on Arkiv and pays $0.05 in USDC on Hedera, with no human approving.
4. **The owner is asked.** It wants the whole-city dataset, $0.25, over its $0.10 auto-pay limit. The request shows up on the owner's phone; they approve, and it pays.
5. **The merchant refunds.** Four cents back, in one click. The customer's receipt shows it under the payment, read from Arkiv, not from the shop.

## Proof

Everything above happened on testnet:

| What happened | Where |
|---|---|
| A customer paid $5 with just an email. Till's relayer paid the gas; the customer holds no WBT | [Whitechain tx](https://explorer.testnet.whitechain.io/tx/0x46461259c098277b64f7372f40e2a217831b7ec6fb20eaf0eb08cdafa54e7316) |
| The merchant refunded it in part: $2, then the other $3 | [$2](https://explorer.testnet.whitechain.io/tx/0xf59305f59aec54c8fa918dc1be9160823081b498dec32f240e9e67a30fdc4b8b) · [$3](https://explorer.testnet.whitechain.io/tx/0x21c4d4263a743b34dcef5da098dad9cade4a412c3364075f1e283021014c3419) |
| The guard blocked the look-alike: wrong payee, not the seller's address on Arkiv, over the cap | [HCS message #26](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11155231/messages/26) |
| The agent found the shop on Arkiv and paid $0.05 in USDC on Hedera, with no human approving | [HashScan tx](https://hashscan.io/testnet/transaction/0.0.11155223@1793960375.693637515) |
| An agent paid $0.05 in USDT on Whitechain over x402, through Till's facilitator | [Whitechain tx](https://explorer.testnet.whitechain.io/tx/0xb2f54cf5653ff2fdbd92bfe9da6be213a8191cdc19a65ef7a7dbae1119c6eb20) |
| The merchant refunded an agent's payment, with no gas | [Whitechain tx](https://explorer.testnet.whitechain.io/tx/0x9fb9fb96855ce195d3ed927321db56e359a16bb76b3458b32f5afa7aebfe644c) |
| The receipt page reads the order (paid $5, refunded $2 and $3) from Arkiv | [Arkiv explorer](https://rabdi.explorer.arkiv.network/entity-explorer?q=arkiv.schema%20%3D%20str('till.receipt')%20AND%20order_id%20%3D%20str('0x1b44530319fbffb44ec51e0cec380d6bb019806795a05c064ba28d412a40f0b4')%20AND%20%24owner%20%3D%20addr(0xffe2359a07d0e193621419008eee8d7f57f9a326)) |

## How it works
- **People** sign a USDT transfer in their email wallet. Till's relayer submits it to a small Checkout contract on Whitechain and pays the gas, out of the merchant's prepaid gas tank. The contract pays the merchant and records the order.
- **Agents** get an x402 payment request from the shop's API. The guard in the agent's wallet checks it, then the agent pays through a facilitator Till runs, on Whitechain (USDT) or Hedera (USDC).
- **The owner** sets the agent's limits and answers approvals on the agent console. Both count only when the owner's wallet signs them, and the agent checks that signature itself, so Till carries them but can't make them up.
- **Records:** every agent payment, approval and block goes on a public log on Hedera. Every receipt, and every shop's listing, is on Arkiv.

```mermaid
flowchart LR
  C[Customer<br/>email wallet] -- signs payment --> R
  M[Merchant<br/>dashboard] -- signs refund --> R
  A[AI agent<br/>+ spending guard] -- x402 --> S[Demo shop<br/>~20 lines of Till]
  S -- verify / settle --> R
  subgraph Till[Till server]
    R[Relayer + x402 facilitator]
  end
  R -- pays gas --> WC[(Whitechain<br/>Checkout contract, USDT)]
  R -- pays fee --> HE[(Hedera<br/>USDC)]
  O[Owner<br/>agent console] -- signs approvals and limits --> R
  A -- every payment, approval and block --> T[(Hedera HCS<br/>spending log)]
  R -- receipt after each payment / refund --> AR[(Arkiv<br/>receipts, merchant registry)]
  A -- finds sellers, checks payees --> AR
  AR -- read in the browser --> P[Receipt page,<br/>Your receipts]
```

| Piece | Folder | What it is |
|---|---|---|
| Checkout server | `apps/server` | Orders API, the relayer and x402 facilitators, approvals, gas tanks, webhooks, a JSON store |
| Checkout contract | `contracts/` | `Checkout.sol` on Whitechain: `pay` and `refund` |
| Pay app | `apps/pay` | Landing page, docs, checkout, receipts, merchant dashboard and agent console |
| Merchant SDK | `packages/sdk` | `createOrder`, `verifyWebhook`, `paywall()`, Sign in with Till |
| Spending guard | `packages/guard` | The agent's rules, checked before signing, and the owner's signed limits and approvals |
| Receipts and registry | `packages/receipts` | The Arkiv schemas for receipts and merchant listings |
| Agent identity | `packages/identity` | Reading and checking the agent's ERC-8004 entry |
| Demo shop | `apps/shop` | A separate data seller that uses only the SDK |
| Agent | `apps/agent` | Claude, run headless, with a wallet tool server that holds the keys, the x402 client and the guard |
| Attacker | `apps/attacker` | The review page with a look-alike link, and an API that asks 10× the price |

The full reference, including Sign in with Till and webhooks, is at [till.ishtails.xyz/docs](https://till.ishtails.xyz/docs).

## Whitechain
**In short:** a verified Checkout contract, gasless USDT payments in the main flow, a ~20-line integration, merchant and customer views, refunds for people and agents, an accountant's export, and a gas tank the merchant prepays. What it was like to build: [`WHITECHAIN_FEEDBACK.md`](WHITECHAIN_FEEDBACK.md).

- Checkout contract (verified): [`0xa4eBC27F8ba275d765DE0aECa7Fa1C09204dEeb6`](https://explorer.testnet.whitechain.io/address/0xa4eBC27F8ba275d765DE0aECa7Fa1C09204dEeb6)
- Customer's gasless USDT payment: [`0x4646…7316`](https://explorer.testnet.whitechain.io/tx/0x46461259c098277b64f7372f40e2a217831b7ec6fb20eaf0eb08cdafa54e7316) ($5 from an email wallet, sent by Till's relayer). The first one, by script: [`0x93f3…6ab3`](https://explorer.testnet.whitechain.io/tx/0x93f38e2a5cd59f3995298c6780838454296ece64ef14bfa462c4ad1d9ea76ab3)
- Refund in one click from the dashboard: [`0x911c…c8ca`](https://explorer.testnet.whitechain.io/tx/0x911cf211e623c0c19a77fe75b10560f97344512f657f5f14abc6dcb03377c8ca) (all $5 of the order paid in [`0xfcc7…e83f`](https://explorer.testnet.whitechain.io/tx/0xfcc75268a2195658d98bef7cfb4a43b8d27aa9bffe36ac2f18e4f862dabae83f)). The merchant signs; the relayer pays the gas; the contract won't refund more than was paid
- Partial refunds: [$2](https://explorer.testnet.whitechain.io/tx/0xf59305f59aec54c8fa918dc1be9160823081b498dec32f240e9e67a30fdc4b8b), then [the other $3](https://explorer.testnet.whitechain.io/tx/0x21c4d4263a743b34dcef5da098dad9cade4a412c3364075f1e283021014c3419), of a $5 order paid in [`0x05dd…b76a`](https://explorer.testnet.whitechain.io/tx/0x05dd3b8e645f109c5faed70d6722b44fd4b2b6e5c0d6a84be6ffd9df57c4b76a)
- Agent's x402 payment through Till's facilitator: [`0xb2f5…eb20`](https://explorer.testnet.whitechain.io/tx/0xb2f54cf5653ff2fdbd92bfe9da6be213a8191cdc19a65ef7a7dbae1119c6eb20) ($0.05 for one call, straight to the merchant; the agent holds no WBT)
- Refund of an agent's payment: [`0x9fb9…644c`](https://explorer.testnet.whitechain.io/tx/0x9fb9fb96855ce195d3ed927321db56e359a16bb76b3458b32f5afa7aebfe644c) (the merchant signs a USDT transfer back to the agent; the relayer submits it)
- For the accountant: **Download CSV** gives one row per payment, refund and agent payment, each with its explorer link

**Why this needs on-chain stablecoin settlement on Whitechain.** An AI agent can pay this shop 5 cents for one API call with no account, no card and no monthly bill, and the shop has the money seconds later. A card payment needs a person's card on file with each seller, isn't practical at 5 cents a request, and its receipt lives only in the seller's database. Here the payment, its receipt and the refund linked to it are public records the customer can check without trusting the shop or me. Whitechain's USDT accepts a signed transfer that anyone can submit, so the shop pays the gas and the customer never needs any.

**How the business pays for gas.** From a gas tank it prepays in USDT. Each transaction the relayer sends for that shop is charged at its real fee, read from the receipt on chain and priced in dollars, plus 10%, which is how Till earns. New merchants start with $5 of credit; topping up is a USDT transfer the merchant signs, so it costs no gas either. A checkout payment is about 183k gas, about 0.0009 WBT ([measured](https://explorer.testnet.whitechain.io/tx/0x93f38e2a5cd59f3995298c6780838454296ece64ef14bfa462c4ad1d9ea76ab3)). On 6 Nov the demo shop had spent $0.87 across 23 transactions, with $4.13 left.

**Where the relayer's WBT comes from.** On testnet, the faucet: 0.5 WBT a day, about 500 payments. In production Till would buy WBT with the tanks' USDT; that swap isn't built.

**What stops someone draining it:**
1. It signs only three calls: `Checkout.pay`, `Checkout.refund` and USDT `transferWithAuthorization`.
2. Only for registered merchants, and only while their gas tank has credit.
3. Only for real orders: unpaid, unexpired, the right amount. Refunds only up to what was paid.
4. It simulates every transaction first, so a bad signature costs nothing.
5. 10 requests a minute per IP.
6. 500 transactions per merchant per day, and 0.2 WBT of gas per day in total.
7. It holds at most about 0.3 WBT.

## Hedera
**In short:** an x402 endpoint that settles in USDC on Hedera through my own facilitator, an agent that pays on its own inside limits it can't be talked out of, human approval above an amount, a public HCS log of every payment, approval and block, and the agent's identity on ERC-8004.

- x402 endpoint: `GET /api/data` on the demo shop. Its 402 offers USDT on Whitechain and USDC on Hedera.
- A settled payment: [`0.0.11155223@1793960375.693637515`](https://hashscan.io/testnet/transaction/0.0.11155223@1793960375.693637515) ($0.05 to the merchant `0.0.11155222`; the fee payer `0.0.11155223` paid the 0.016 HBAR fee, the agent paid none)
- Facilitator: mine (`apps/server`). On top of the library's checks it refuses a transaction past its 120-second window (the library's verify passes one, which then fails at settle), and it caches settlements by transaction ID, so a retried settle returns the first result instead of a false "failed". Fallback: x402.org, one line of config
- Spending log (HCS topic): [`0.0.11155231`](https://hashscan.io/testnet/topic/0.0.11155231)

**The spending guard** runs inside the agent's payment tool, below the model, so a blocked payment is never signed ([`packages/guard`](packages/guard)). The demo agent's rules:
1. Only USDT on Whitechain or USDC on Hedera.
2. Only payees on its allowlist, at the seller's registered address on Arkiv.
3. At most $0.30 a call and $1 a day to this shop, and $2 a day in total.
4. Anything over $0.10 that passes every rule waits for the owner.

A broken rule is a hard block nobody can approve. Only a payment that passes every rule and is over the auto-pay limit goes to the owner: that's the line between "wrong" and "unusual". The model can't change any of it: its only tools are "find sellers", "read a page" and "buy data", and a page that says "your budget was raised" changes nothing.

**The owner's signature is the only thing that counts.** The owner sets the limits and answers approvals on the agent console, signing with their wallet. Till stores and carries both, but the agent checks the signatures itself against its owner's address:
- For an approval, the agent picks a random request ID, and the owner signs that ID, the amount and the payee. An answer Till made up, one signed by anyone else, or one from an earlier request is refused ([tests](packages/guard/src/guard.test.ts)).
- For limits, the agent keeps the newest set the owner signed, so Till can't swap in an older, looser one.

**The public log.** Every payment, approval and block is one message on the topic, written by the agent's own key, with the reasons. [Message #26](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11155231/messages/26), the blocked look-alike:

```json
{"agent":"research-agent","agentId":"154","type":"agent.blocked","network":"hedera:testnet","usd":"0.50","payTo":"0.0.6660666","claimed":"Brickline",
 "reasons":["payee 0.0.6660666 is not on the allowlist","payee 0.0.6660666 isn't Brickline's registered address on Arkiv (entity 0x2b22…fdc2)","$0.50 is above the $0.30 per-call cap"]}
```

After each run the agent prints a spend report that it reads back from Hedera's mirror node, not from its own memory, with a link to each entry.

**Agent identity (ERC-8004).** The agent is [agent #154](https://hashscan.io/testnet/contract/0x8004A818BFB912233c491871b3d84c89A494BD9e) in the Identity Registry already deployed on Hedera testnet ([registration](https://hashscan.io/testnet/transaction/0x6a36a9bf4eee48da31e9140db458ce767786403879966f3a6db59281bef76a4b)). The wallet it pays from signed that it belongs to the agent ([transaction](https://hashscan.io/testnet/transaction/0xd9fffa6824292017f84b9aa19d4fb29ed7e716ccb09d3578a30577b7d7bfd6b8)). The agent puts its ID on every payment; after settling, Till checks the payer against the registry, and the dashboard shows "Verified agent #154". The same ID from another wallet doesn't verify.

**What the agent said after the block**, in one run:

> My wallet blocked the payment, so nothing was paid […] it asked for **$0.50**, 10 times the listed price. It also asked to be paid to an account (`0.0.6660666`) that isn't on my approved list. […] I didn't try to get around the block.

## Arkiv
**In short:** Till keeps two things on Arkiv. A registry of shops, which the agent finds sellers in and the guard checks every payee against. And a receipt for every payment and refund, which the customer's pages read straight from Arkiv. Schemas, friction, reach and why: [`arkiv/`](arkiv/).

**The merchant registry.** Each shop is one listing (`till.merchant`): what it sells, the price of each call, and the address it's paid at on each network. The agent's `find_sellers` tool queries it by category, so it finds the shop without following any link. Before paying, the guard checks the 402's payee against the seller's listing, which is what blocked the look-alike in the demo. Brickline's listing: [entity `0x2b22…fdc2`](https://rabdi.explorer.arkiv.network/entity-explorer?q=%24key%20%3D%20key(0x2b22a7b395f4d97cef1632c54ea44733bab048ee2e0aae80ec6ea0ff996efdc2)). The landing page's "Merchants on Till" reads it live.

**Receipts.** After each confirmed payment or refund, the server saves one record (`till.receipt`), off the payment path, and never edits it.
- The receipt page (`/receipt/<order>`) shows the payment and every refund from the order's records, with an "On Arkiv ↗" link to the same query. It still loads with Till's server down.
- "Your receipts" (`/receipts`) shows everything one wallet bought from any Till shop, from one query by `payer`.
- Only the paying wallet's address goes on Arkiv, never an email or name.

**Who can write.** Both kinds are written by Till's wallet, `0xffE2359A07d0e193621419008eeE8D7f57f9a326`, and every read filters on it, so a look-alike can't list itself and a fake receipt never shows. A query to run on Rabdi's [entity explorer](https://rabdi.explorer.arkiv.network/entity-explorer):

```
arkiv.schema = str('till.receipt') AND $owner = addr(0xffe2359a07d0e193621419008eee8d7f57f9a326)
```

The demo's records: [one order](https://rabdi.explorer.arkiv.network/entity-explorer?q=arkiv.schema%20%3D%20str('till.receipt')%20AND%20order_id%20%3D%20str('0x1b44530319fbffb44ec51e0cec380d6bb019806795a05c064ba28d412a40f0b4')%20AND%20%24owner%20%3D%20addr(0xffe2359a07d0e193621419008eee8d7f57f9a326)) (paid $5, refunded $2 and $3), [one customer](https://rabdi.explorer.arkiv.network/entity-explorer?q=arkiv.schema%20%3D%20str('till.receipt')%20AND%20payer%20%3D%20addr(0x4d0bb1b811810df38344602c0ff2bac8b9bee300)%20AND%20%24owner%20%3D%20addr(0xffe2359a07d0e193621419008eee8d7f57f9a326)) (4 purchases), and [a live refund saved as it happened](https://rabdi.explorer.arkiv.network/tx/0x16a252b9dfa62c9b877cbb6ee32d85925790960238bd0722eabb406c6a1121c7).

## Setup
Needs [Bun](https://bun.sh) 1.4 and, for the contract, [Foundry](https://getfoundry.sh).

```bash
git clone --recurse-submodules https://github.com/ishtails/till-checkout && cd till-checkout
bun install
cp .env.example .env                    # fill in keys; see the comments in the file
cp merchants.example.json merchants.json # one merchant: API key, webhook secret, payout addresses
(cd contracts && forge test)            # the Checkout contract's 13 tests
(cd packages/guard && bun test)         # the guard's rules, limits and approvals
```

The required keys are the relayer's (a Whitechain key with a little WBT), the Hedera fee payer's, the Privy app ID, and the merchant's payout addresses in `merchants.json`. The Checkout contract is already deployed; its address is filled in. Arkiv and the faucet are optional.

Run each in its own terminal, the server first (the shop checks its facilitator on startup):

```bash
bun run --cwd=apps/server start   # checkout server and relayer, :3001
bun run --cwd=apps/pay dev        # landing, checkout, receipts, dashboard, agent console, :5173
bun run --cwd=apps/shop start     # the demo shop, :3002
```

Open http://localhost:5173 for the landing page, or http://localhost:3002 to buy the report. The customer's email wallet needs test USDT; the relayer needs a little WBT. The merchant dashboard is at `/dashboard` and the agent console at `/agent`.

For the agent, also run the attacker (`bun run --cwd=apps/attacker start`: the review page on :3004, the look-alike API on :3005), then:

```bash
cd apps/agent
bun --env-file=../../.env src/run.ts attack   # follows the review page's link; the guard blocks it
bun --env-file=../../.env src/run.ts real     # finds the shop on Arkiv, pays $0.05 in USDC on Hedera
bun --env-file=../../.env src/run.ts full     # buys the $0.25 dataset: waits for the owner's approval
NETWORK=eip155:1874 bun --env-file=../../.env src/run.ts real   # the same, in USDT on Whitechain
```

It needs the `claude` CLI, logged in, and `AGENT_OWNER` set to the owner's wallet. The agent's Hedera account needs testnet USDC and a little HBAR for the log. Approve the `full` run on the agent console, signed in as that wallet.

**The merchant's integration** is the block between the two `Till` markers in [`apps/shop/src/index.ts`](apps/shop/src/index.ts): create an order and redirect to it, unlock the report when the signed `order.paid` webhook arrives, and one line that charges agents per call.

## What's mocked
- The customer's test USDT comes from the demo's faucet (0.2 USDT per new wallet). In real use they'd withdraw USDT from an exchange.
- The merchant dashboard has no login. Refunds and top-ups need the merchant's signature anyway.
- WBT's price for the gas tank is set in config, since testnet WBT has no market price.

## Limitations
- Agent payments on Hedera are refunded from the merchant's own Hedera wallet, not from the dashboard. Whitechain ones refund in one click.
- The agent's ERC-8004 entry was registered by a setup script with a test key, because the pay app can't send transactions on Hedera yet. That key only owns the registry entry; approvals and limits count only when the owner's own wallet signs them.
- Only Till's server writes receipts and listings on Arkiv. Next: each merchant writes with its own key.
- Testnet only, one merchant in the demo.

## Decisions log
- **Gasless payments use EIP-3009 and my own relayer**, not a smart account and paymaster. Whitechain's USDT already accepts a signed transfer anyone can submit, and there's no hosted bundler or paymaster on Whitechain.
- **One Whitechain service is both the relayer and the x402 facilitator.** People and agents both produce a signed USDT transfer, so one set of drain checks and one gas wallet cover both.
- **x402 library: `@x402/*` v2, pinned at 2.28.0.** It already does the nonce, expiry, amount, recipient, balance and simulation checks, and every live facilitator speaks v2.
- **My own Hedera facilitator, with x402.org as the fallback.** Same code with a second scheme, plus an expiry check and a replay cache. Switching is one URL in config.
- **Hedera payments settle in testnet USDC (`0.0.429274`)**, not HBAR, so prices read in dollars.
- **One Whitechain contract, `Checkout`,** for on-chain receipts and refunds capped at what was paid. Agent x402 payments stay standard and go straight to the merchant, so any x402 agent can pay.
- **Email wallet: Privy, on a hosted checkout page.** It works on chain 1874 and signs with no pop-up, and a hosted page keeps the merchant's side to about 20 lines.
- **Storage: in memory, saved to one JSON file.** Orders fit in a file, and the chains are the records anyone checks.
- **The demo attack is a poisoned link, not an injected instruction.** Current models ignored injected instructions in every test run, so a demo built on that wouldn't reproduce.
- **Approval is a third outcome, not a looser rule.** A broken rule is blocked outright; only a payment that passes every rule and is over the auto-pay limit goes to the owner.
- **The agent trusts its owner's signature, not Till.** Limits and approvals travel through Till, but the agent verifies them itself, so a compromised server can't spend for it.
- **Sellers come from a registry on Arkiv, not from links.** The guard checks every payee against it, which stops the look-alike even when the agent trusts the page.
- **Gas is prepaid by the merchant in USDT, at cost plus 10%.** The customer and the agent never hold WBT, and Till earns on the margin.
- **Agent identity uses ERC-8004 on Hedera testnet**, where the registry is already deployed. It ties the agent to the wallet it pays from with that wallet's own signature, which an HCS-14 ID alone can't.
- **The agent runs on the `claude` CLI's login**, with only the wallet's three tools, so no API key is needed.

## License
MIT, see [`LICENSE`](LICENSE).

## AI usage
See [`AI_USAGE.md`](AI_USAGE.md). The specs are in [`design/`](design/).
