# Schema

Till keeps one kind of entity on Arkiv: a **receipt record**. Every time an order is paid or refunded, the Till server saves one record. An order paid and then refunded twice has three records: `paid`, `refunded`, `refunded`. Nothing is ever edited, so an order's history only grows.

The schema is defined once in [`packages/receipts/src/index.ts`](../packages/receipts/src/index.ts) with `defineSchema("till.receipt", …)`. The server writes through it, and the receipt pages read through it.

## Fields

| Field | Type | Indexed | What it is |
|---|---|---|---|
| `order_id` | `str` | yes | The order's ID (bytes32, lowercase hex). The receipt page looks records up by this. |
| `payer` | `addr` | yes | The customer's wallet. "Your receipts" looks records up by this, across every shop. |
| `merchant` | `str` | no | The shop's ID in Till. |
| `event` | `str` | no | `paid` or `refunded`. |
| `merchant_name` | `str` | no | The shop's name, as shown on the receipt. |
| `description` | `str` | no | What was bought. |
| `amount_usd` | `dec` | no | The order's price in USD. |
| `refund_usd` | `dec`, optional | no | On a `refunded` record: how much this refund was. |
| `refunded_usd` | `dec` | no | The order's refunded total after this event. |
| `pay_tx` | `str` | no | The payment's transaction on Whitechain. |
| `refund_tx` | `str`, optional | no | On a `refunded` record: the refund's transaction on Whitechain. |
| `event_time` | `u64` | no | Unix seconds when the payment or refund happened (not when the record was saved). |
| `chain` | `str` | no | Defaults to `whitechain-sepolia:1874`. |
| `token` | `str` | no | Defaults to `USDT`. |
| `arkiv.schema` | `str` | yes | Added by the SDK: `till.receipt`. |

Only `order_id` and `payer` are indexed, because they're the only two things a page filters on.

## The queries we run

```
# The receipt page: every record for one order
arkiv.schema = str('till.receipt') AND order_id = str('<order id>') AND $owner = addr(<writer>)

# "Your receipts": every record for one customer, from any shop
arkiv.schema = str('till.receipt') AND payer = addr(<customer>) AND $owner = addr(<writer>)
```

Both run in the customer's browser, straight against Arkiv's RPC.

## Who owns them

Every record is created and owned by Till's writer wallet, `0xffE2359A07d0e193621419008eeE8D7f57f9a326`. Every read filters on that owner (`.ownedBy(RECEIPT_WRITER)`), because anyone can create an entity that fits this schema. A record from any other wallet never shows on a receipt. Nobody edits records: the server only creates them, never patches.

## When they expire

`ExpirationTime.max()`, the longest Rabdi allows: about 182 days from the save. That covers the period when people actually check a purchase: returns, refunds and disputes. Keeping receipts longer would mean extending each record before it expires (see `friction.md`).
