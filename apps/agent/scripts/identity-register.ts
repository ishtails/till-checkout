// Registers the research agent on the ERC-8004 Identity Registry on Hedera testnet, once:
//   1. the owner's EVM wallet gets a little HBAR for gas, sent from the agent's Hedera account;
//   2. the owner registers the agent (the entry is an NFT the owner holds), with the agent's HCS
//      log topic and Hedera account as metadata;
//   3. the agent's Whitechain wallet signs that it belongs to this agent, and the owner records it.
// Run: bun --env-file=../../.env scripts/identity-register.ts   (prints the agent ID for AGENT_ID)
import { AccountId, Client, Hbar, PrivateKey, TransferTransaction } from "@hiero-ledger/sdk"
import { agentWalletTypedData, hederaTestnet, IDENTITY_REGISTRY, identityAbi, readAgent, registryClient } from "@till/identity"
import { createWalletClient, http, parseEventLogs, stringToHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const owner = privateKeyToAccount(process.env.MERCHANT_TEMP_PRIVATE_KEY as Hex) // one of AGENT_OWNER, a key we hold
const agentWallet = privateKeyToAccount(process.env.AGENT_EVM_KEY as Hex) // the wallet it pays from on Whitechain
const hederaAccount = process.env.AGENT_HEDERA_ID!
const topic = process.env.HCS_TOPIC_ID!
const tx = (hash: string) => `https://hashscan.io/testnet/transaction/${hash}`

const reader = registryClient()
const wallet = createWalletClient({ account: owner, chain: hederaTestnet, transport: http() })

// 1. Gas for the owner. Sending HBAR to an EVM address creates its Hedera account if needed.
const balance = await reader.getBalance({ address: owner.address })
if (balance < 2n * 10n ** 18n) {
  const client = Client.forTestnet().setOperator(hederaAccount, PrivateKey.fromStringECDSA(process.env.AGENT_HEDERA_KEY!))
  const send = await new TransferTransaction()
    .addHbarTransfer(hederaAccount, new Hbar(-10))
    .addHbarTransfer(AccountId.fromEvmAddress(0, 0, owner.address), new Hbar(10))
    .execute(client)
  await send.getReceipt(client)
  console.log(`Sent 10 HBAR to the owner ${owner.address}: ${tx(send.transactionId.toString())}`)
  client.close()
  for (let i = 0; i < 10 && (await reader.getBalance({ address: owner.address })) === 0n; i++) await Bun.sleep(2000)
}

// 2. Register. The registration file is a data: URI, so it doesn't depend on our server.
const registration = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "Till research agent",
  description: "Buys data for a small property analytics firm, paying per call over x402, inside limits its owner sets. Every payment and block is logged on Hedera.",
  services: [{ name: "spending-log", endpoint: `https://hashscan.io/testnet/topic/${topic}` }],
  x402Support: true,
}
const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(registration)).toString("base64")}`
const registerHash = await wallet.writeContract({
  address: IDENTITY_REGISTRY,
  abi: identityAbi,
  functionName: "register",
  args: [
    agentURI,
    [
      { metadataKey: "hcsTopic", metadataValue: stringToHex(topic) },
      { metadataKey: "hederaAccount", metadataValue: stringToHex(hederaAccount) },
    ],
  ],
})
const registered = await reader.waitForTransactionReceipt({ hash: registerHash })
const [event] = parseEventLogs({ abi: identityAbi, eventName: "Registered", logs: registered.logs })
const agentId = event.args.agentId
console.log(`Registered agent #${agentId} (owner ${owner.address}): ${tx(registerHash)}`)

// 3. The agent's wallet proves it's this agent's, then the owner records it.
const deadline = BigInt(Math.floor(Date.now() / 1000) + 240)
const signature = await agentWallet.signTypedData(agentWalletTypedData(agentId, agentWallet.address, owner.address, deadline))
const setHash = await wallet.writeContract({
  address: IDENTITY_REGISTRY,
  abi: identityAbi,
  functionName: "setAgentWallet",
  args: [agentId, agentWallet.address, deadline, signature],
})
await reader.waitForTransactionReceipt({ hash: setHash })
console.log(`Agent wallet set to ${agentWallet.address}: ${tx(setHash)}`)

console.log("\nRead back:", await readAgent(agentId))
console.log(`\nAdd to .env: AGENT_ID=${agentId}`)
