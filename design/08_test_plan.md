# 08 Test plan

## At each milestone

| Milestone | Check |
|---|---|
| Contract | Forge tests: pay; double pay reverts; wrong merchant reverts; refund over the cap reverts; partial refunds sum correctly; a refund signed by a non-merchant reverts; the digest matches the token's `DOMAIN_SEPARATOR` (fork of 1874) |
| Gasless payment | The customer's address has **0 WBT** before and after; the tx `from` is the relayer; a `Paid` event; the merchant's USDT rises by the amount |
| Drain checks | Same signature posted twice → second rejected, no tx. Unknown merchant → rejected. Bad signature → rejected after simulation, no tx sent. 11 requests in a minute → 429 |
| x402 on Whitechain | The 402 lists both networks; settle tx `from` is the relayer; the agent has 0 WBT; replaying the same payment header → cached response, no second tx |
| x402 on Hedera | Transaction ID on HashScan shows USDC agent → merchant, fee paid by our fee payer; replayed header → cached, no second tx |
| Refund | A `Refunded` event; the customer's USDT is back; the receipt page shows both txs; a second full refund reverts in simulation |
| Policy | Unit test per rule (6). Live: the attacker endpoint is blocked with both reasons; no signature is created (no settle call reaches anyone) |
| HCS | Topic on HashScan shows one `agent.paid` and one `agent.blocked` with matching amounts |

## Transactions that must exist before submission (README links)

| # | What | Where | Link format |
|---|---|---|---|
| 1 | Checkout contract, verified | Whitechain | `https://explorer.testnet.whitechain.io/address/<contract>#code` |
| 2 | Person's gasless payment (`Checkout.pay`, USDT `0xcedf…`) | Whitechain | `https://explorer.testnet.whitechain.io/tx/<hash>` |
| 3 | Agent x402 payment (`transferWithAuthorization`) | Whitechain | same |
| 4 | Refund (`Checkout.refund`) | Whitechain | same |
| 5 | Agent x402 payment in USDC, **with the transaction ID written in the README** | Hedera | `https://hashscan.io/testnet/transaction/<id>` |
| 6 | HCS topic with paid and blocked messages | Hedera | `https://hashscan.io/testnet/topic/<topicId>` |
| 7 | Relayer address, showing its WBT top-ups (faucet) and spend | Whitechain | `/address/<relayer>` |

## Before pressing submit

- [ ] The 7 links above open and show what the README claims.
- [ ] README sections per `02_build_spec.md`, including "Why on-chain settlement on Whitechain" and relayer economics with the measured fee.
- [ ] `WHITECHAIN_FEEDBACK.md`, `AI_USAGE.md` and `design/` are in the repo.
- [ ] Video is 2–4 min, 720p or better, Kartik's voice, not sped up; it shows the customer, merchant and agent; it shows a HashScan link and a Whitechain explorer link.
- [ ] Commit history is steady (no single big final commit).
- [ ] Up to 3 partners selected: Whitechain, Hedera and Arkiv (untick Arkiv if it was cut).
