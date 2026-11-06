# AI usage

**How I worked.** I made each product and design decision and wrote it into the specs in [`design/`](design/). Claude Code (Anthropic), my coding assistant and R&D tool, wrote the code from those specs. I tested each piece live on testnet and reviewed every step before committing it, in small commits, as the history shows.

## What I did
- The product and the design calls (see the README's decisions log): what Till is, the two halves, the three chains and what each one is for, what's in and out of scope.
- The specs in `design/`, which Claude worked from.
- Wallets and funding: the testnet accounts on Whitechain, Hedera and Arkiv, faucets, and the Privy email wallets for the customer and the merchant.
- Live testing: buying the report with an email wallet, signing in as the merchant, the one-click and partial refunds, and the agent runs.
- Reviewing each change before it was committed.

## What Claude Code did, by folder

| Folder | What's in it | How it was made |
|---|---|---|
| `contracts/` | `Checkout.sol` (pay, refund capped at what was paid) and its Foundry tests | Claude wrote it from my spec; I reviewed it, and it's deployed and verified on Whitechain |
| `apps/server/` | Orders API, relayer, x402 facilitator for Whitechain and Hedera, webhooks, Arkiv writer | Claude wrote it from my spec; I tested it live |
| `apps/pay/` | Landing page, docs page, checkout, receipt, "Your receipts", merchant dashboard and agent console | Claude wrote it; I tested every flow in the browser, including approving the agent's payments on the console |
| `apps/shop/` | The demo shop that uses only the SDK | Claude wrote it; the integration is the ~20 lines between the `Till` markers |
| `apps/agent/` | The demo agent: Claude on the `claude` CLI, with a wallet tool server, and the ERC-8004 registration script | Claude wrote it; I ran the attack, the real payment and the approval |
| `apps/attacker/` | The review page and look-alike API for the demo attack | Claude wrote it from my attack design |
| `packages/sdk`, `packages/guard`, `packages/receipts`, `packages/identity` | Merchant SDK, the agent's spending rules and signed limits, the Arkiv receipt and registry schemas, the ERC-8004 reader | Claude wrote them from my spec; the guard's limits are mine, set in `apps/agent/policy.json` and signed on the console |
| `README.md`, `arkiv/`, `WHITECHAIN_FEEDBACK.md` | Docs and sponsor files | Claude drafted them from what we built; I edited them in my own words |

**R&D:** Claude read the sponsors' docs and SDKs with me and ran small test scripts on testnet to check what works: the test USDT's signing domain, facilitator behaviour on expiry and retries, fees, and Arkiv writes and reads. What we learned is in the specs and the feedback files.

**Prompts.** The specs in `design/` are what Claude worked from. The chat prompts weren't saved as files.

## Reused, not written by us
- Libraries: x402 v2 (`@x402/*`), Privy, viem, shadcn/ui components on Base UI, Phosphor icons, Inter, the Hiero (Hedera) SDK, the Arkiv SDK, the Model Context Protocol SDK, Hono, React, Vite, Tailwind CSS, zod, Foundry and forge-std.
- The official test USDT on Whitechain, which we call but didn't write.

## Assets
- The demo video is recorded in my own voice. No AI voice and no text-to-speech.
- The logo was generated with Google Gemini from my brief (a till drawer, flat deep green), then resized.
- The cover and screenshots are real captures of the live site and HashScan; the cover was laid out in HTML by Claude Code from those captures.

## Claude inside the product
The demo's AI agent is Claude, run headless on the `claude` CLI with only our three wallet tools. The spending guard (`packages/guard`) sits below the model, in the wallet, and stops it when a page tricks it.
