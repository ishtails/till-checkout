# AI usage

Kartik owns the idea, the design decisions and the outcomes. Claude Code (Anthropic) was his coding assistant and R&D tool.

- **Code:** Claude wrote code from Kartik's specs (in [`design/`](design/)). He reviewed each step and committed it in small pieces, as the history shows.
- **R&D:** reading sponsor docs and SDKs, and small test scripts on Whitechain, Hedera and Arkiv testnet to check what works (the USDT signing domain, facilitator behaviour, fees, Arkiv reads).
- **Testing:** contract tests (`contracts/test`) and live checks against testnet.

Claude also runs inside the product: the demo's AI agent (`apps/agent`) is Claude on the `claude` CLI, with only our wallet tools. The spending guard (`packages/guard`) is what stops it when a page tricks it.
