# 04 Low-level design

Signatures and rules only; no code is written before kickoff. Hook names are from `@x402/core` 2.28.0's type definitions (read 24 Oct).

## 1. Facilitator checks (verify and settle)

There is one `x402Facilitator` instance in the checkout server, with two schemes registered: `ExactEvmScheme` for `eip155:1874` (signer: the relayer key via `toFacilitatorEvmSigner`) and `ExactHederaScheme` for `hedera:testnet` (signer: our fee payer via `toFacilitatorHederaSigner`). It's served at `/facilitator/{supported,verify,settle}`.

**Already done by the libraries:**
- **EVM:**
  - signature;
  - `to == payTo`;
  - `value == amount`;
  - `validAfter` and `validBefore`;
  - nonce unused (`authorizationState`);
  - balance;
  - a simulated `transferWithAuthorization`.
- **Hedera:**
  - a `TransferTransaction` only;
  - the fee payer is the transaction ID's account and never a net sender;
  - net-zero sums;
  - an exact amount to `payTo`;
  - only the one asset;
  - the payer's signature against its on-chain key;
  - aliases rejected.

**Ours, in `onBeforeVerify` / `onBeforeSettle` (abort with a reason), in this order:**

| # | Check | Why |
|---|---|---|
| 1 | `network` ∈ {`eip155:1874`, `hedera:testnet`} and `asset` is exactly USDT `0xcedf…` / USDC `0.0.429274` | Nothing else gets our gas |
| 2 | `payTo` is a registered merchant's address or account (`merchants.json`) | Drain protection: we only pay gas for our merchants |
| 3 | `amount` ≥ 0.01 and ≤ 10 (USD, atomic units) | No dust that costs more gas than it moves; caps the blast radius |
| 4 | EVM: `maxTimeoutSeconds` ≤ 300 and `validBefore` ≤ now + 300. **Hedera: `maxTimeoutSeconds` ≤ 120, and verify rejects a transaction whose valid start + valid duration has passed** | Short-lived authorizations. Hedera transactions die 120 s after signing whatever `maxTimeoutSeconds` says; the library's verify doesn't check it (spike, 24 Oct) |
| 5 | Per-merchant daily settle count < 500; relayer's daily WBT spend < 0.2 | Drain cap (§2) |
| 6 | **Replay / idempotency cache:** key = EVM `(from, nonce)` or Hedera transaction ID. A settle seen before returns the stored `SettleResponse` without submitting; a verify of a seen key fails with `already_settled` | On Hedera the network already refuses a repeat (`DUPLICATE_TRANSACTION`, no fee), but the library's verify still passes it, and a retried settle would report *failure* for a payment that went through. The cache returns the first result instead (spike: 1 ms, no submit). That fills the spec's "SHOULD perform replay checks" gap. On EVM the token nonce already stops replays (spike: a library-only re-settle sends nothing), so there it makes settle safe to retry |

The cache lives in the JSON store, so it survives restarts. Settle is wrapped (cache lookup, then `facilitator.settle`, then cache write), since hooks can abort but can't return a result.

## 2. Relayer drain protection (Whitechain)

The relayer is one EOA. The same key settles x402 payments, `Checkout.pay` and `Checkout.refund`.

1. **Only three calls are ever signed:**
   - `Checkout.pay`;
   - `Checkout.refund`;
   - `USDT.transferWithAuthorization`.

   The send function rejects any other `to` or selector.
2. **Only for registered merchants:**
   - for `pay`, the order's merchant;
   - for `refund`, the order's merchant;
   - for x402, `payTo`.
3. **Only for real orders:** `pay` needs an order that exists, is unpaid and unexpired, with the amount equal to the order's. `refund` needs a paid order, with the amount ≤ paid − refunded.
4. **Simulate first:** an `eth_call` of the exact transaction. If it would revert, nothing is sent, so a bad signature costs us zero gas. The x402 library already simulates.
5. **Rate limit:** 10 requests a minute per IP on `/pay` and `/refund` (in memory).
6. **Caps:**
   - 500 relayed transactions per merchant per day;
   - a global 0.2 WBT spend per day, tracked from receipts (`gasUsed × effectiveGasPrice` plus the L1 fee).

   At the cap, the server refuses and the README shows why.
7. **Small hot wallet:** the relayer holds at most ~0.3 WBT. A refill is manual from the faucet on testnet; in production it comes from the merchant's gas deposit.

**Where its WBT comes from, for the README:** on testnet, the faucet (0.5 WBT a day). In production, the merchant tops up a gas deposit, or buys WBT on WhiteBIT and sends it. One payment costs about **0.00051 WBT** (measured on a fork: ~102k gas at the 5 gwei floor; the L1 data fee is negligible), so the merchant covers gas the way it covers card fees today. One 0.5 WBT faucet drip covers ~980 payments.

## 3. Policy engine (agent side)

It runs in `x402Client.onBeforePaymentCreation({ paymentRequired, selectedRequirements })`. Returning `{ abort: true, reason }` means no signature is created. Built-in `spendControls` stay on as a backstop: `allowedAssets` must list Whitechain USDT, or the client refuses it, while Hedera testnet USDC is already a default asset. Both are capped at **$1**, the approval threshold. The built-in cap runs *before* our hook and fails with a generic message (spike, 24 Oct), so the per-call cap ($0.10) belongs in our engine, where the log can name every failing rule.

**Config (`policy.json`):**
- `dailyBudgetUsd`: 1.00
- `approvalAboveUsd`: 1.00
- `merchants`: `[{ name: "Data seller", payTo: { "eip155:1874": "0xMerchant", "hedera:testnet": "0.0.M" }, maxPerCallUsd: 0.10, dailyCapUsd: 0.50 }]`

**The rules.** All are evaluated, and every failing reason is reported, so the video log shows each one:

| Order | Rule | Fails when |
|---|---|---|
| 1 | Asset allowed | Not Whitechain USDT or Hedera USDC |
| 2 | Payee on the allowlist | `payTo` isn't one of the listed merchants' addresses on that network |
| 3 | Per-call cap | Amount > that merchant's `maxPerCallUsd` (unknown payee: the lowest cap in the file) |
| 4 | Per-merchant daily cap | Spent today + amount > `dailyCapUsd` |
| 5 | Daily budget | Spent today + amount > `dailyBudgetUsd` |
| 6 | Human approval | Amount > `approvalAboveUsd`. Reported as "needs approval" and blocked (no approval UI; the README says so) |

- **Counters** live in `agent-state.json` and update only in `onPaymentResponse` with `settleResponse.success`. The agent runs one call at a time, so there's no reservation step.
- **The tool result** goes back to the LLM, e.g. `BLOCKED: payee 0xAttacker not on allowlist; $0.50 above $0.10 per-call cap`.

## 4. Refund linkage to receipts

- **The order is the receipt:**
  - `orderId` (bytes32, random) is the key everywhere: the server store, the contract's `orders[orderId]`, both events, webhooks and the receipt page.
  - `Paid(orderId, merchant, payer, amount)` and `Refunded(orderId, payer, amount, totalRefunded)` are indexed by `orderId`. So the customer's receipt page lists both transactions from one ID, and anyone can check them on the explorer.
- **Refunds can't exceed the payment:** the contract enforces `refunded + amount ≤ paid`, so partial refunds work and over-refunds revert.
- **Refunds can't be replayed:** the merchant's refund nonce is `keccak256(orderId, "refund", refundedSoFar)`. Each signature is good for exactly one refund step of one order.
- **Agent x402 payments** aren't refundable in the product. The video doesn't show it (Kartik, 24 Oct), and the README lists it under limitations: x402 `exact` payments are final, so a refund would be a new transfer.

## 5. HCS message format

- **Topic:** created once in prep with the agent's Hedera account. The submit key is the agent key; the topic memo is "agent spending log".
- **Message:** one JSON object, well under the 1,024-byte single-chunk size:

```json
{"v":1,"type":"agent.paid","ts":"2026-11-06T10:12:03Z","agent":"research-agent",
 "network":"hedera:testnet","asset":"0.0.429274","amount":"50000","usd":"0.05",
 "payTo":"0.0.M","resource":"http://localhost:3002/api/data","tx":"0.0.F@1762…"}
{"v":1,"type":"agent.blocked","ts":"…","agent":"research-agent","network":"hedera:testnet",
 "asset":"0.0.429274","amount":"500000","usd":"0.50","payTo":"0.0.ATTACKER",
 "resource":"http://localhost:3004/api/premium",
 "reasons":["payee not on allowlist","$0.50 above $0.10 per-call cap"]}
```

**Tamper evidence** comes from HCS itself: the consensus timestamp, the sequence number and the running hash. HashScan shows each message under the topic.

## 6. The Whitechain contract: `Checkout`

**Why it exists:** every Whitechain track requires a verified contract. This one does visible work: on-chain receipts, signatures bound to orders, and refund caps (D7). It holds no funds between calls.

**Storage:**
- `usdt` (immutable)
- `orders[bytes32]` → `{payer, merchant, amount (uint128), refunded (uint128)}`

| Function | Does | Reverts when |
|---|---|---|
| `pay(orderId, merchant, payer, amount, validAfter, validBefore, signature)` | Requires the order to be unpaid. Writes the order (effects first). `usdt.receiveWithAuthorization(payer, this, amount, validAfter, validBefore, keccak256(abi.encode(orderId, merchant)), signature)`. `usdt.transfer(merchant, amount)`. Emits `Paid` | Already paid; the signature doesn't match (wrong merchant, amount or order changes the nonce or digest); expired |
| `refund(orderId, amount, validAfter, validBefore, signature)` | Requires paid and `refunded + amount ≤ paid` (the order's amount). Updates `refunded`. `usdt.receiveWithAuthorization(merchant, this, amount, …, keccak256(abi.encode(orderId, "refund", refundedBefore)), signature)`. `usdt.transfer(payer, amount)`. Emits `Refunded` | Not paid; over-refund; not signed by the order's merchant |
| `orders(orderId)` | View | |

**Design notes:**
- **Anyone can call `pay` and `refund`.** The signatures carry all the authority, so the relayer has no special role and nothing to steal.
- **`receiveWithAuthorization`** (not `transfer…`) can only be submitted by the contract. Nobody can take the customer's signature and settle it outside the order.
- **The bytes-signature overload is used.** TetherTokenV2 has both `(v,r,s)` and `bytes`, per the verified ABI, and the bytes form also accepts smart-wallet signatures.
- **No owner, no upgradeability, no pause.** Merchants aren't registered on-chain; the server's allowlist is the gas gate.
- **Tests (forge, on a fork of 1874):**
  - pay happy path;
  - double pay;
  - wrong merchant;
  - refund cap;
  - partial refunds summing to the full amount;
  - a refund signed by someone else;
  - the domain digest matching the token's `DOMAIN_SEPARATOR`.
