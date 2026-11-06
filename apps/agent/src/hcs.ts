import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk"
import type { Decision } from "@till/guard"
import { REGISTRY_ID, RESEARCH_AGENT_ID } from "@till/identity"

// The agent's public spending log: every payment and every blocked attempt, one HCS message each.
// The topic's submit key is the agent's key, so only this agent can write to it.
const topicId = process.env.HCS_TOPIC_ID!
const client = Client.forTestnet().setOperator(
  process.env.AGENT_HEDERA_ID!,
  PrivateKey.fromStringECDSA(process.env.AGENT_HEDERA_KEY!),
)

/** The agent's ERC-8004 ID on Hedera testnet, on every message, so anyone can check whose log this is. */
export const AGENT_ID = process.env.AGENT_ID ?? RESEARCH_AGENT_ID

export const topicUrl = `https://hashscan.io/testnet/topic/${topicId}`

/** Writes one decision to the topic and returns its sequence number. A failure is reported, never thrown. */
export async function logDecision(agent: string, decision: Decision): Promise<string | undefined> {
  const message = JSON.stringify({ v: 1, ts: new Date().toISOString(), agent, agentId: AGENT_ID, agentRegistry: REGISTRY_ID, ...decision })
  try {
    const tx = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client)
    const receipt = await tx.getReceipt(client)
    return receipt.topicSequenceNumber?.toString()
  } catch (err) {
    console.error("HCS log failed:", (err as Error).message)
  }
}
