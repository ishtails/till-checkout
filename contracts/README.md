# Contracts

`Checkout.sol`: on-chain receipts and capped refunds for Till orders on Whitechain Sepolia (chain 1874).

Deployed and verified: [`0xa4eBC27F8ba275d765DE0aECa7Fa1C09204dEeb6`](https://explorer.testnet.whitechain.io/address/0xa4eBC27F8ba275d765DE0aECa7Fa1C09204dEeb6)

```bash
git submodule update --init
forge test --root .                                                  # unit tests on a mock EIP-3009 token
forge test --root . --match-contract CheckoutFork --fork-url whitechain  # against the real USDT
```

Deploy and verify (from this folder, with `../.env` loaded). Keep `--constructor-args` last: it takes every argument after it.

```bash
forge create --root . src/Checkout.sol:Checkout --rpc-url $WHITECHAIN_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ --constructor-args $USDT_ADDRESS
```
