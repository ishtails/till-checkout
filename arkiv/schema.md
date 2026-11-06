# Schema

Till keeps two kinds of entity on Arkiv:
- a **receipt record** (`till.receipt`), one per payment or refund, below;
- a **merchant listing** (`till.merchant`), one per shop, which agents use to find sellers ([further down](#merchant-listings-tillmerchant)).

## Receipts (`till.receipt`)

Every time an order is paid or refunded, the Till server saves one record. An order paid and then refunded twice has three records: `paid`, `refunded`, `refunded`. Nothing is ever edited, so an order's history only grows.

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

## Merchant listings (`till.merchant`)

One entity per shop, defined in [`packages/receipts/src/registry.ts`](../packages/receipts/src/registry.ts) and kept up to date by the server ([`apps/server/src/registry.ts`](../apps/server/src/registry.ts)). On start, the server creates a shop's listing once, then patches it only when something changed, so the entity key stays the same. Only shops with a public `https` site are listed.

| Field | Type | Indexed | What it is |
|---|---|---|---|
| `merchant_id` | `str` | yes | The shop's ID in Till. The server finds its own listing by this. |
| `category` | `str` | yes | What it sells, e.g. `rent-data`. The agent's `find_sellers` filters on it. |
| `pay_to_evm` | `addr` | yes | The address it's paid at on Whitechain (lowercased). |
| `pay_to_hedera` | `str` | yes | The account it's paid at on Hedera testnet (`0.0.x`). |
| `name` | `str` | no | The shop's name. |
| `site_url` | `str` | no | Its website. |
| `endpoints` | `bytes` | no | Its paid API endpoints as JSON: URL, method, price in USD, description. Stored as bytes because a `str` holds at most 128 bytes. |

The demo shop's listing is entity [`0x2b22…fdc2`](https://rabdi.explorer.arkiv.network/entity-explorer?q=%24key%20%3D%20key(0x2b22a7b395f4d97cef1632c54ea44733bab048ee2e0aae80ec6ea0ff996efdc2)).

```
# Every Till merchant, or one category (the agent's find_sellers)
arkiv.schema = str('till.merchant') AND category = str('rent-data') AND $owner = addr(0xffe2359a07d0e193621419008eee8d7f57f9a326)
```

The same writer wallet owns the listings, and every read filters on it, so a look-alike seller can't list itself. Listings use `ExpirationTime.max()` too.
