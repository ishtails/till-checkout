# Build spec: what to build after kickoff

This is the product spec, written before the event. The detailed design is worked out pre-kickoff in `design/` (see `CLAUDE.md`, "Pre-kickoff work").

## Tagline (draft; finalise Thursday morning)

> Get paid by people and AI agents in USDT. No gas, refunds included.

Alternative, if the video leads with the attack: "A checkout AI agents can pay, but can't be tricked into overpaying."

Rule: an outcome in under 15 words, no technology names.

## The user and the problem

- **User:** a small online business or API seller.
- **Problem:** they want stablecoin payments from two kinds of payers:
  - **People:** today they need a wallet, gas and a seed phrase.
  - **AI agents:** they can pay per call over x402, but there are no refunds, and an agent can be tricked into overpaying.

## What it does (in demo order)

1. **The merchant drops it in:** a checkout widget plus an x402 paywall for an API, added to a demo shop in about 20 lines. Whitechain asks for exactly this shape.
2. **A person pays with no crypto steps.** Embedded or email wallet, and an EIP-3009 `transferWithAuthorization` signature. The merchant's relayer submits it and pays the gas. The test USDT supports EIP-3009 and permit (verified).
3. **An agent pays per call over x402**, through your facilitator, settling on Whitechain, and on Hedera for the Hedera track.
4. **The agent's limits hold.** A malicious review page sends it to a look-alike of the real API. The page says $0.05, but the API asks $0.50 to a stranger. Its allowlist and per-call cap block the payment before anything is signed, and the attempt is logged. (Tested 25 Oct: injected instructions fooled 0 of 18 runs; this poisoned link fooled 9 of 9, all blocked.) This is the "WOW" moment, in the first two minutes of the video.
5. **The merchant refunds in one click.** x402 payments are push payments that can't be reversed, so a refund is a new transfer from the merchant, tied to the original receipt.
6. **The agent's spending log** goes to a Hedera Consensus Service topic: every payment and every blocked attempt (Hedera extra points). Person orders and refunds have their on-chain receipt in the Checkout contract's events (`design/04_low_level.md`).
7. **After the Friday gate:** the order receipt is also written to Arkiv, and the customer's receipt page reads it from there (Arkiv's "Build on Arkiv" track; spike passed 29 Oct, `notes/spikes/arkiv/RESULTS.md`). Then an accountant export if time allows. Renewals are dropped (29 Oct): the one-click refund already earns Whitechain's "extra credit if your flow goes past the first payment".

**Show both the merchant view and the customer view** (a Whitechain requirement).

## Components (minimum)

| Piece | Owner | Notes |
|---|---|---|
| Checkout widget + merchant SDK | Kartik + Claude | Drop-in, ~20 lines in the demo shop |
| Relayer (gas sponsor) on Whitechain | Kartik | Must show where its WBT comes from and why it can't be drained: per-merchant allowlist, caps, nonce/expiry checks |
| x402 facilitator with checks | Kartik | Settles on Whitechain (your own facilitator, an idea Scale lists; it's the relayer service, D2) and Hedera (own, or the official / Blocky402 fallback) |
| Agent client + spending policy | Claude-assisted | Budget, per-merchant cap, allowlist, approval above a threshold |
| Refund flow | Kartik | Merchant button → transfer back → linked receipt |
| HCS receipt log | Claude-assisted | One topic; write per payment and refund |
| Demo shop + merchant dashboard | Claude-assisted | Minimal UI with a component kit; no custom design work |
| Contracts on Whitechain | Kartik | Verified on the explorer (required). Keep them small: a receipt/refund registry or merchant registry, only if the flow needs it |

**Not built unless the demo needs it:** databases (use in-memory or a JSON file), queues, schedulers, auth systems, multi-tenant anything, a landing page.

## Scope cuts, decided now

If the **Fri 6 Nov 12:00** gate slips, drop in this order: the accountant export, then Arkiv, then the receipts UI polish (keep the HCS writes), then our own Hedera facilitator (switch to `x402.org/facilitator`, one URL in config). People pay on Whitechain only; Hedera is the agent path.

**Never drop:** the gasless person payment, the agent x402 payment, the blocked overcharge, the refund, and both views.

## Video script outline (2–4 minutes, aim for 3:30)

1. **0:00–0:20.** The problem in one sentence, and who it's for.
2. **0:20–1:00.** The merchant adds the widget (show the ~20 lines). A person pays with an email wallet: no gas, no seed phrase. Show the Whitechain explorer link.
3. **1:00–1:50.** An agent buys API calls over x402. A malicious page tells it to pay 10× the price, and the limit blocks it. Show the log, and the blocked attempt on HashScan.
4. **1:50–2:30.** The merchant refunds in one click; the customer sees it on the receipt page. Show the refund on the Whitechain explorer.
5. **2:30–3:15.** How it works: one diagram covering relayer drain protection, the facilitator checks, and why on-chain settlement (the Whitechain README line).
6. **3:15–3:30.** What's next.

Record on a laptop, at 720p or higher, in Kartik's own voice. Don't speed it up, and don't use music with text in place of narration.

## README sections (write Thursday, as the spec)

What it does (the tagline and three lines) · Demo video · How it works (diagram) · Whitechain (explorer links, USDT payment tx, "why on-chain settlement", relayer economics and drain protection) · Hedera (x402 endpoint, settled tx ID, HashScan link, spending controls, HCS topic) · Setup · What's mocked · Limitations · Decisions log · AI usage (link to `AI_USAGE.md`).

Also required in the repo: `WHITECHAIN_FEEDBACK.md`.
