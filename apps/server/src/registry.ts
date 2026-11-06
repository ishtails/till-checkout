import { entityExplorer, registryExplorer, registryWriter, type Listing } from "@till/receipts/registry"
import { Hono } from "hono"
import { config } from "./config"
import { allMerchants, type Merchant } from "./merchants"

// The merchant registry on Arkiv: Till lists every merchant (name, category, paid endpoints with
// prices, payTo per network) so an agent can find sellers there instead of trusting a page's
// link, and its guard can check a 402's payTo against it. Schema and reader: packages/receipts.
//
// Only merchants with a public https site are listed: a dev server on localhost would otherwise
// overwrite the live listing with localhost URLs, since both write with the same wallet.

// What each merchant sells. Kept here rather than in merchants.json, which is server-only config.
const CATALOG: Record<string, { category: string; endpoints: { path: string; priceUsd: string; description: string }[] }> = {
  "data-shop": {
    category: "rent-data",
    endpoints: [
      { path: "/api/data", priceUsd: "0.05", description: "Median rent for one Mumbai neighbourhood" },
      { path: "/api/report", priceUsd: "0.25", description: "The whole Mumbai Rent Index, every neighbourhood" },
    ],
  },
}

export function listingFor(m: Merchant, siteUrl = m.siteUrl): Listing | undefined {
  const c = CATALOG[m.id]
  if (!c || !siteUrl?.startsWith("https://")) return undefined
  const base = siteUrl.replace(/\/$/, "")
  return {
    merchantId: m.id,
    name: m.name,
    category: c.category,
    siteUrl: base,
    endpoints: c.endpoints.map(e => ({ url: base + e.path, method: "GET", priceUsd: e.priceUsd, description: e.description })),
    payTo: { "eip155:1874": m.evmAddress, "hedera:testnet": m.hederaAccountId },
  }
}

const writer = config.arkivKey ? registryWriter(config.arkivKey, config.arkivAccessKey) : undefined
const published = new Map<string, { entityKey: string; explorerUrl: string; action: string; at: number }>()

/** Lists every public merchant on Arkiv: creates it once, then patches it only when it changes. */
export async function publishRegistry(siteUrlOverride?: string) {
  if (!writer) return
  for (const m of allMerchants()) {
    const listing = listingFor(m, siteUrlOverride ?? m.siteUrl)
    if (!listing) {
      console.log(`registry: ${m.id} not listed (no catalog entry or no https site)`)
      continue
    }
    try {
      const r = await writer.publish(listing)
      const explorerUrl = entityExplorer(r.entityKey)
      published.set(m.id, { entityKey: r.entityKey, explorerUrl, action: r.action, at: Date.now() })
      console.log(`registry: ${m.id} ${r.action} -> entity ${r.entityKey}${r.txHash ? ` tx ${r.txHash}` : ""}`)
    } catch (err) {
      console.warn(`registry: ${m.id} failed:`, (err as Error).message)
    }
  }
}

export const registry = new Hono()

registry.get("/v1/registry", c =>
  c.json({
    query: registryExplorer(),
    merchants: allMerchants().map(m => ({ merchantId: m.id, name: m.name, ...published.get(m.id) })),
  }),
)
