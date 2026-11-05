# Friction

What got in my way building Till's receipts on Arkiv, in the order I hit it. I tried Arkiv first on 29 Oct (SDK 0.8.1 on Tiramisu) and built the real thing at the event (SDK 1.0.1 on Rabdi).

## 1. I built on the old testnet, and nothing told me

I started on Tiramisu with SDK 0.8.1, because that's what I'd tried a week earlier. Everything worked: writes went through, queries came back, and the data explorer showed my records. I only found out it was the wrong network when I reread the prize page to write these files and saw Rabdi and chain ID 7794095.

What I expected: the old RPC to refuse writes, or SDK 0.8.1 to warn that Tiramisu has been replaced. What happened: Tiramisu still accepts writes and answers queries, so nothing tells you you're on a network the prize doesn't count.

To reproduce: install `@arkiv-network/sdk@0.8.1` and call `createEntity` on the `tiramisu` chain. It succeeds today.

Your "Older networks" page explains the move well, and following it got me onto Rabdi. I just didn't know to look for it. Making Tiramisu's RPC refuse writes with an error that names Rabdi and links that page would catch everyone who started early, like me.

## 2. The SDK's API reference still lists Tiramisu, not Rabdi

[docs.arkiv.network/typescript-sdk/api-reference/chains](https://docs.arkiv.network/typescript-sdk/api-reference/chains/) lists `localhost` and `tiramisu`. SDK 1.0.1 exports `localhost` and `rabdi()`, which takes an access key. I read the SDK's source to find out how to call it.

## 3. The data explorer doesn't have Rabdi yet

On [data.arkiv.network](https://data.arkiv.network) the network menu offers Tiramisu or a custom RPC, and `?chain=rabdi` in the URL still shows Tiramisu. My receipt page links to "the same records on Arkiv", so I needed a Rabdi page that takes a query in its URL. The block explorer has one at [rabdi.explorer.arkiv.network/entity-explorer](https://rabdi.explorer.arkiv.network/entity-explorer), and it's very good (it even shows which attributes are indexed), but I only found it by clicking around a transaction page. Linking it from the docs' home page, next to the RPC URL, would help.

## 4. In 0.8, attribute names had to be lowercase, and the error didn't say so

With 0.8.1, an attribute called `orderId` reverted on chain with `Ident32InvalidByte(5, "I")`. The SDK sent it without checking, and viem only showed the raw error data (`0x276f7798…`), so I decoded it by hand against the SDK's error list. 1.0 accepts uppercase names, so this looks fixed. I mention it because it's the kind of rule worth checking in the SDK before sending.

## 5. The data explorer's query box needs typed values, and says "not found" when they're missing

`app = "till"` fails with "Query rejected (parse, -32001): Requested resource not found". `app = str('till')` works. A parse error saying "values need a type, like str('till')" would have saved me a few tries.

## 6. A server wallet can't get test GLM on its own

The faucet needs a browser wallet, so the key my server writes with can't claim. I claimed with my own wallet and sent the tGLM across. For apps where the writer is a backend key, a faucet that takes a pasted address would help.

## 7. Receipts want to live longer than 182 days

Rabdi caps an entity's lifetime at about 182 days, so every receipt expires unless I extend it. For receipts, refunds and tax records, people want years. I can call `extendEntity` on each record, but that means a job that runs forever and touches every record before it expires. A longer cap, or a way to say "keep this until the owner says otherwise, and bill me for it", would fit records like these.

## 8. Anyone can write into my schema

This one is documented: the SDK's README says anyone can write an entity a query matches, and `ownedBy()` makes the fix one line. I list it because it's easy to miss. My first reader didn't filter by owner, so anyone could have added a fake "refunded" record to someone's receipt. I'd put `ownedBy` in the first query example.

## What worked well

- **Reads from the browser.** Rabdi's RPC allows any origin, so the receipt page queries Arkiv itself with no backend of mine in between. I stopped my server and the receipt still loaded.
- **Typed schemas.** I choose which columns are indexed, my reads come back typed, and the SDK refuses a `where` on a column I didn't index.
- **Speed and cost on Rabdi.** A save took about 6 seconds end to end (10 records in 60 seconds) and cost about 0.0005 tGLM (523k gas at 1 gwei). Queries by order or by payer came back in 0.35–1 second.
- **The block explorer's transaction page.** It decodes the create operation into the schema name and every attribute, marked indexed or stored. That's how I checked my schema was what I meant.
