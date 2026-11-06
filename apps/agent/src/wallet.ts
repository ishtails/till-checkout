// The agent's "wallet": an MCP server with three tools, find_sellers, read_page and buy_data. It
// holds the keys, the x402 client, the spending guard and the HCS log. The model only sees the
// tool results. Sellers come from Till's registry on Arkiv, and every payment's payee is checked
// against the seller's record there before anything is signed.
// stdout is the MCP channel, so all logging goes to stderr.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { guard, registryView, type Approver, type Decision, type Policy } from "@till/guard"
import { x402Client } from "@x402/core/client"
import { toClientEvmSigner } from "@x402/evm"
import { ExactEvmScheme } from "@x402/evm/exact/client"
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch"
import { createClientHederaSigner, PrivateKey } from "@x402/hedera"
import { ExactHederaScheme } from "@x402/hedera/exact/client"
import type { Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { z } from "zod"
import { logDecision, topicUrl } from "./hcs"
import { lookupMerchants } from "./registry"

const AGENT = "research-agent"
const NETWORK = (process.env.NETWORK ?? "hedera:testnet") as `${string}:${string}`
const root = resolve(import.meta.dir, "../../..")
const policy: Policy = JSON.parse(readFileSync(resolve(import.meta.dir, "../policy.json"), "utf8"))

// One network per run, so the client only ever picks that network's option from a 402.
const client =
  NETWORK === "eip155:1874"
    ? x402Client.fromConfig({
        schemes: [{ network: NETWORK, client: new ExactEvmScheme(toClientEvmSigner(privateKeyToAccount(process.env.AGENT_EVM_KEY as Hex))) }],
        // The library's own backstop: Whitechain USDT isn't a default asset, so allow it, capped at $1.
        spendControls: { allowedAssets: [{ network: NETWORK, asset: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", maxAmountPerPayment: "1000000" }] },
      })
    : x402Client.fromConfig({
        schemes: [
          {
            network: NETWORK,
            client: new ExactHederaScheme(
              createClientHederaSigner(process.env.AGENT_HEDERA_ID!, PrivateKey.fromStringECDSA(process.env.AGENT_HEDERA_KEY!), { network: NETWORK }),
            ),
          },
        ],
      })

// Payments above the auto-pay limit go to the owner: filed with Till, answered on the console
// (pay app /agent) with the owner's wallet signature. The agent waits up to five minutes.
const API = process.env.TILL_API_URL ?? "http://localhost:3001"
const approver: Approver | undefined = process.env.AGENT_TOKEN
  ? {
      async request(d) {
        const res = await fetch(`${API}/v1/approvals`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AGENT_TOKEN}` },
          body: JSON.stringify(d),
        })
        if (!res.ok) throw new Error(`couldn't ask the owner: HTTP ${res.status}`)
        return ((await res.json()) as { id: string }).id
      },
      async wait(id) {
        for (;;) {
          await Bun.sleep(1500)
          const a = (await fetch(`${API}/v1/approvals/${id}`).then(r => r.json())) as { status: string; by?: string }
          if (a.status === "approved") return { approved: true, by: a.by }
          if (a.status === "denied") return { approved: false, by: a.by }
          if (a.status === "expired") return { approved: false, reason: "the owner didn't answer within five minutes" }
        }
      },
    }
  : undefined

// The guard's decision for the call in progress (the agent makes one call at a time).
let last: { decision: Decision; seq?: string } | undefined
let approvedBy: string | undefined
// Who the agent says it's paying on the call in progress (buy_data's `seller`).
let seller: string | undefined
const decision = () => last
guard(client, {
  policy,
  stateFile: resolve(root, "data/agent-state.json"),
  approver,
  // Read from Arkiv on every payment, so a change to the registry applies at once.
  registry: async req => registryView(await lookupMerchants(), req, seller),
  onDecision: async decision => {
    if (decision.type === "agent.approved") approvedBy = decision.by
    last = { decision, seq: await logDecision(AGENT, decision) }
    console.error(JSON.stringify({ ...decision, hcsSeq: last.seq }))
  },
})
const paidFetch = wrapFetchWithPayment(fetch, client)

const pageText = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const asset = NETWORK === "eip155:1874" ? "USDT on Whitechain" : "USDC on Hedera"
const logged = () => (decision()?.seq ? ` Logged publicly as message #${decision()!.seq} on ${topicUrl}.` : "")

const server = new McpServer({ name: "wallet", version: "0.1.0" })

server.registerTool(
  "find_sellers",
  {
    description:
      "Find data sellers in Till's public registry on Arkiv. Returns each seller's name, its paid API endpoints with prices, and its registry entry. Use these endpoints with buy_data, and pass the seller's name.",
    inputSchema: { category: z.string().optional().describe('Kind of data, e.g. "rent-data". Leave out to list every seller.') },
  },
  async ({ category }) => {
    try {
      const sellers = await lookupMerchants(category)
      if (sellers.length === 0) return text(`No sellers listed on Arkiv${category ? ` for "${category}"` : ""}.`)
      return text(
        sellers
          .map(
            s =>
              `${s.name} (${s.category}), ${s.siteUrl}\n` +
              s.endpoints.map(e => `  $${e.priceUsd} per call: ${e.method} ${e.url} (${e.description})`).join("\n") +
              `\n  Registry entry: ${s.explorerUrl}`,
          )
          .join("\n\n"),
      )
    } catch (err) {
      return text(`Couldn't read the registry on Arkiv: ${(err as Error).message}`)
    }
  },
)

server.registerTool(
  "read_page",
  { description: "Fetch a web page and return its text.", inputSchema: { url: z.string().describe("Full URL of the page") } },
  async ({ url }) => {
    try {
      const res = await fetch(url)
      return text(res.ok ? pageText(await res.text()) : `${res.status}: no page at ${url}`)
    } catch (err) {
      return text(`Couldn't fetch ${url}: ${(err as Error).message}`)
    }
  },
)

server.registerTool(
  "buy_data",
  {
    description: `Call a paid data API. If the API asks for payment (HTTP 402), your wallet pays it automatically in ${asset}, within your spending limits, and the data is returned.`,
    inputSchema: {
      url: z.string().describe("Full URL of the paid API endpoint, with any query string"),
      seller: z.string().describe("Name of the seller you believe runs this API, as find_sellers or the page you read names it"),
    },
  },
  async ({ url, seller: name }) => {
    last = undefined
    approvedBy = undefined
    seller = name
    try {
      const res = await paidFetch(url)
      const body = await res.text()
      const receipt = res.headers.get("payment-response")
      if (!receipt) return text(`HTTP ${res.status}, nothing paid. Response: ${body}`)
      const settled = decodePaymentResponseHeader(receipt)
      const paid = decision()?.decision
      const approval = approvedBy ? ` It was above your auto-pay limit, so your owner approved it first (${approvedBy}).` : ""
      return text(`Paid $${paid?.usd ?? "?"} in ${asset} to ${paid?.payTo} (transaction ${settled.transaction}).${approval}${logged()} Response: ${body}`)
    } catch (err) {
      const blocked = decision()?.decision
      if (blocked?.type === "agent.blocked") {
        return text(`BLOCKED by your spending policy, nothing was signed or paid: ${blocked.reasons!.join("; ")}.${logged()}`)
      }
      if (blocked?.type === "agent.denied") {
        return text(`NOT PAID: the payment was above your auto-pay limit and ${blocked.reasons!.join("; ")}. Nothing was signed.${logged()}`)
      }
      return text(`The call failed, nothing was paid: ${(err as Error).message}`)
    }
  },
)

await server.connect(new StdioServerTransport())
