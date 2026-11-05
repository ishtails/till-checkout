# How I use Arkiv

## What I filter on, who can edit, and when it expires

**Filters.** Two columns are indexed, one for each page that reads from Arkiv:

- `order_id`: the receipt page (`/receipt/<order>`) loads every record for one order and shows the payment and each refund from them.
- `payer`: "Your receipts" (`/receipts`) loads every record for one wallet, from any shop, and shows each purchase with its current state ("Paid", "$2.00 refunded", "Refunded").

Everything else (amounts, transactions, the shop's name) is stored but not indexed, because no page filters on it.

**Who can edit.** Nobody. The Till server creates each record with its writer wallet and never patches or deletes one, so an order's history only grows: a refund adds a record next to the payment, the way a bank statement adds a line. Every read filters on that writer with `.ownedBy()`, so a record someone else creates in the same schema never shows up on a receipt.

**When it expires.** Each record lives for the longest Rabdi allows, about 182 days. That covers the time people check a purchase: returns, refunds and disputes. Keeping receipts for years would need `extendEntity` on a schedule (see `friction.md`).

## How each Arkiv feature shows up for users

| Arkiv feature | What the user sees |
|---|---|
| Indexed `order_id` | The receipt page's payment and refund lines come from Arkiv. It says "Read from Arkiv, 3 records", and until the first record is saved it says "Saving this receipt to Arkiv…" and checks again. |
| Indexed `payer` (an `addr` column) | "Your receipts": one list of a customer's purchases from every Till shop, with totals paid and refunded. |
| `ownedBy` on every read | A fake record from another wallet can't change what a receipt says. |
| A named schema (`till.receipt`) | Queries only match Till's receipts, and the rows come back typed, so the page shows amounts as written. |
| Records never edited, one per event | A partial refund shows as its own line under the payment, and the refunded total is in each record. |
| The entity explorer's query URL | The "On Arkiv ↗" link opens the same query on Rabdi's entity explorer, so the customer can check the records without us. |
| Reads from the browser | The receipt loads from Arkiv even when Till's server is down (tested by stopping it). |

## How the writes work

The server saves a record after the payment or refund is confirmed on Whitechain ([`apps/server/src/arkiv.ts`](../apps/server/src/arkiv.ts)). A save takes about 6 seconds, so it runs after the customer's payment is done and never holds it up. Saves go through one queue, one at a time, so two of them never race for the same nonce.

That queue is fine for a demo and for a small shop, but it's the first thing I'd change with real traffic. One save at a time caps the server at about 10 records a minute, and the queue lives in memory, so a restart drops whatever was waiting. The fix is to batch records into one transaction (the SDK has `executeBatch`) and keep the queue on disk. Nothing is lost on the money side either way: every payment is on Whitechain, and a missing record can be written again from it, which is what [`apps/server/scripts/arkiv-backfill.ts`](../apps/server/scripts/arkiv-backfill.ts) does.
