# Why Arkiv

## What users would lose with Postgres

A receipt in a shop's own database is just the shop's word. If the shop says you were refunded, you have to trust its screen. With Till's receipts on Arkiv, three things change for the customer.

**They can check it themselves.** Every payment and refund for an order is its own public record, owned by Till's writer wallet and never edited. The receipt page reads them from Arkiv in the customer's browser, and links to Arkiv's explorer with the same query, so anyone can see the same records without asking us. In Postgres, only we could see them, and we could change them without anyone noticing.

**Their receipts don't depend on us staying up.** The receipt page asks Arkiv, not our server, for the payment and refund lines. If Till's server is down, or Till shuts down, the records are still there and any app can read them with the query in `schema.md`.

**They get one purchase history across every shop.** "Your receipts" lists everything one wallet bought from any shop that uses Till, with one query by `payer`. With Postgres, that list only exists if one company keeps every shop's sales in its own database, and the customer can only see it if that company builds them a page. On Arkiv, it's a filter anyone can run.

**Agents get a list of sellers no page can fake.** Till lists every shop on Arkiv with its prices and the address it's paid at. The AI agent finds sellers there instead of following links, and its spending guard blocks any payment to an address that doesn't match the seller's listing. In Postgres, that list would only be readable through our API, and an agent built by someone else would have to trust us to serve it. On Arkiv, any agent can query it directly, and see who wrote each entry.

## What I kept off Arkiv, and why

- **The money.** Payments and refunds settle in USDT on Whitechain, and the Checkout contract enforces the rules (a refund can't exceed what was paid). Arkiv records point to those transactions; they don't replace them.
- **Unpaid orders.** An order that's never paid expires after 30 minutes and proves nothing, so it stays in the server's file.
- **Anything private.** No emails, names or addresses go on Arkiv, only the wallet address that paid. The shop's API keys and webhook secrets stay on the server. Since records are public, a shop shouldn't put personal details in an order's description, and the README says so.
- **The agent's spending log.** The AI agent's payments and blocked attempts go to a Hedera Consensus Service topic, where each message gets a consensus timestamp and order. That log is about the agent's behaviour, not the customer's receipts.

Arkiv holds the one thing a customer wants to keep and check later: what they paid, what came back, and the transactions that prove it.
