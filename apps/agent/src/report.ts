import { existsSync, readFileSync } from "node:fs"
import { currentPolicy } from "./policy"
import { resolve } from "node:path"
import type { Decision, Spent } from "@till/guard"

// The spend report printed after a run: what the agent paid, what was blocked and the budget left.
// It reads the run's entries back from Hedera's public mirror node, not from the agent's own memory,
// so each line is something anyone can check.
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"
const topic = process.env.HCS_TOPIC_ID!
const root = resolve(import.meta.dir, "../../..")

type Entry = Decision & { agent: string; ts: string; seq: number }

async function entriesSince(startSeconds: number): Promise<Entry[]> {
  const res = await fetch(`${MIRROR}/topics/${topic}/messages?timestamp=gte:${startSeconds}&order=asc&limit=100`)
  const { messages = [] } = (await res.json()) as { messages?: { sequence_number: number; message: string }[] }
  return messages.map(m => ({ ...JSON.parse(Buffer.from(m.message, "base64").toString()), seq: m.sequence_number }))
}

/** Waits for the mirror node to catch up (about 3 s), then prints the report. */
export async function spendReport(startMs: number, agent: string) {
  const start = Math.floor(startMs / 1000)
  let entries: Entry[] = []
  for (let i = 0; i < 6 && entries.length === 0; i++) {
    await Bun.sleep(2000)
    entries = (await entriesSince(start)).filter(e => e.agent === agent)
  }

  const policy = await currentPolicy()
  const stateFile = resolve(root, "data/agent-state.json")
  const today = new Date().toISOString().slice(0, 10)
  const state: Spent | undefined = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : undefined
  const spentToday = state?.day === today ? state.total : 0

  const link = (seq: number) => `${MIRROR}/topics/${topic}/messages/${seq}`
  const paid = entries.filter(e => e.type === "agent.paid")
  const blocked = entries.filter(e => e.type === "agent.blocked" || e.type === "agent.denied")
  const approved = entries.filter(e => e.type === "agent.approved")
  console.log("\nSpend report (read back from the public log on Hedera)")
  for (const e of paid) console.log(`  Paid     $${e.usd} to ${e.payTo} on ${e.network}\n           ${link(e.seq)}`)
  for (const e of approved) console.log(`  Approved $${e.usd} to ${e.merchant ?? e.payTo} by the owner ${e.by}\n           ${link(e.seq)}`)
  for (const e of blocked) {
    console.log(`  Blocked  $${e.usd} to ${e.payTo}: ${e.reasons?.join("; ")}\n           ${link(e.seq)}`)
  }
  if (entries.length === 0) console.log("  No payments or blocked attempts in this run.")
  const runTotal = paid.reduce((a, e) => a + Number(e.usd), 0)
  console.log(
    `  This run: $${runTotal.toFixed(2)} paid, ${blocked.length} blocked. Today: $${spentToday.toFixed(2)} of the $${policy.dailyBudgetUsd.toFixed(2)} budget, $${(policy.dailyBudgetUsd - spentToday).toFixed(2)} left.`,
  )
}
