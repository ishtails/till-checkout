# Reach

## Who it's for, and would they use it

Till is for small online sellers who want to be paid in USDT: people selling reports, data, courses or API calls. The Arkiv part is for their customers.

Someone paying in stablecoins today gets a transaction hash, not a receipt. It shows money moved, but not what it was for or whether part of it came back. Their history is split across every shop they bought from, and each shop's copy is only as good as that shop's database. Till's receipt page turns the order into a readable receipt (what was bought, what was paid, what was refunded), each line linked to its transaction. "Your receipts" puts every Till purchase from one wallet in one list.

Would they use it? The customer never has to know Arkiv is there. They open the receipt link from the shop, like any receipt, and it's already reading from Arkiv. The merchant doesn't have to do anything either: receipts are saved for every order, with no setup on the shop's side.

## Can they try it today

Yes, on testnet, from the README's setup steps: run the server, the pay app and the demo shop, buy the $5 report with an email, then open the receipt and "Your receipts". The records the demo wrote are on Rabdi now:

- [One order's records](https://rabdi.explorer.arkiv.network/entity-explorer?q=arkiv.schema%20%3D%20str('till.receipt')%20AND%20order_id%20%3D%20str('0x1b44530319fbffb44ec51e0cec380d6bb019806795a05c064ba28d412a40f0b4')%20AND%20%24owner%20%3D%20addr(0xffe2359a07d0e193621419008eee8d7f57f9a326)): paid $5, then refunded $2 and $3.
- [One customer's records](https://rabdi.explorer.arkiv.network/entity-explorer?q=arkiv.schema%20%3D%20str('till.receipt')%20AND%20payer%20%3D%20addr(0x4d0bb1b811810df38344602c0ff2bac8b9bee300)%20AND%20%24owner%20%3D%20addr(0xffe2359a07d0e193621419008eee8d7f57f9a326)): 4 purchases, 7 records.

There's no hosted version yet, so trying it means running it locally.

## After Mumbai

_(Kartik: will you keep building Till after the event, and what's next for it? One or two sentences in your words.)_
