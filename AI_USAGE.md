# AI usage

ETHGlobal asks projects to say where and how AI tools were used. This is that record.

## Claude Code as coding assistant and R&D tool

I used Claude Code (Anthropic) as my coding assistant and R&D tool.

- **R&D, before the hack:** it read the sponsors' docs and SDKs with me, and ran small throwaway test scripts against Whitechain and Hedera testnet to check what works: the USDT's EIP-712 signing domain, how the x402 facilitators behave, and what a relayed payment costs. None of that script code is in this repo. What we learned is written up in `design/`.
- **During the hack:** it wrote code from my specs in `design/`. I reviewed each step and committed it. The commit history is the order the work happened in.
- **Docs:** it helped draft this README and the other docs from my notes, and I edited them.

| Part | Files | How AI was used |
|---|---|---|
| Spec and design notes | `design/`, `README.md` | Drafted with Claude from my notes and decisions; I edited them |
| Code | everything under `apps/`, `packages/`, `contracts/` | Written with Claude from the specs; reviewed and committed by me step by step |

_(This table is updated as each piece is built.)_

## Claude inside the product

The demo's AI agent is Claude, run headless through the Claude Code CLI with only our MCP wallet server as its tools. It is the payer in the demo, and the spending guard is what stops it when a malicious page sends it to a look-alike API.
