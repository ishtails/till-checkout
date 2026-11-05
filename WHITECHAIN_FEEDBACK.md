# Whitechain feedback

Notes from building Till on Whitechain Sepolia (chain 1874) at ETHGlobal Mumbai, 5–7 Nov 2026.

## What worked well
- **Test USDT already supports EIP-3009.** It's TetherTokenV2 behind a verified proxy, so a customer signs a transfer and anyone can submit it. That gave me gasless payments without a smart account, a bundler or a paymaster, and the x402 `exact` scheme worked on it unchanged.
- **Deploying and verifying took one command.** `forge create … --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/`, straight from your guide. The contract showed as verified a few seconds later.
- **Gas is cheap and predictable.** A relayed USDT transfer was about 85k gas (0.0004 WBT), and a full checkout payment through my contract about 180k gas (0.0009 WBT). The L1 data fee was effectively zero, and receipts came back in about a second.
- **Wallets just worked.** Privy's email wallets ran on chain 1874 as a custom chain with no extra setup, and signed with no pop-up.

## Where I got stuck
- **The test USDT has no `version()` or `eip712Domain()`.** Both revert, so anything that reads the signing domain from the token (wallets, the x402 libraries' checks) gets nothing. I had to recompute `DOMAIN_SEPARATOR` to find it: `{ name: "Tether USD", version: "1", chainId: 1874, verifyingContract: 0xcedf…55a7 }`. Every builder doing signed transfers will hit this.
- **Getting test USDT was confusing.** The faucet gives WBT only. On the testnet DEX, the right token (`0xcedf…55a7`, the one on the prize page) shows as "Unverified", while the verified "Tether USD" is the bridged USDT.e `0xaa79…8f46`, and there's also a "Mock USDT". It's easy to swap into the wrong one.
- **The faucet's 0.5 WBT a day** is fine for one developer, but a relayer paying everyone's gas runs through it in a few hundred payments. A higher-limit faucet, or a documented way to get more for a hackathon demo, would help.

## What the docs could add
- The official test USDT address, its EIP-712 domain, and a note that `version()` reverts, on one page.
- A short guide to gasless USDT payments with EIP-3009 (sign, then relay). It's the most useful thing the token supports, and it isn't mentioned.
- Which tokens on the testnet DEX are the official ones.
- Whether there's (or will be) any native gas sponsorship, paymaster or bundler. I looked and found none, so I ran my own relayer.
