import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"
import { addr, bytes, defineSchema, str } from "@arkiv-network/sdk/schema"
import { getAddress, hexToString, http, stringToHex, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { RECEIPT_WRITER } from "./index"

// Till's merchant registry on Arkiv: one entity per merchant, kept up to date by the Till server
// (apps/server/src/registry.ts). An agent looks sellers up here, by category, instead of trusting
// whatever link a page hands it, and its guard checks that a 402's payTo is the address the
// registry lists. Same writer wallet as the receipts, and every read is filtered to it, so a
// look-alike seller can't add itself.
export const MerchantListing = defineSchema("till.merchant", {
  // Indexed: what an agent or a guard looks a merchant up by.
  merchant_id: str().indexed(),
  category: str().indexed(),
  pay_to_evm: addr().indexed(), // Whitechain (eip155:1874) payTo
  pay_to_hedera: str().indexed(), // Hedera testnet account, 0.0.x
  // Stored: what the agent reads once it has found the merchant.
  name: str(),
  site_url: str(),
  endpoints: bytes(), // JSON Endpoint[] as UTF-8 (a str holds at most 128 bytes)
})

export const REGISTRY_WRITER: Address = RECEIPT_WRITER

export const NETWORKS = { whitechain: "eip155:1874", hedera: "hedera:testnet" } as const

export type Endpoint = { url: string; method: "GET"; priceUsd: string; description: string }

export type Listing = {
  merchantId: string
  name: string
  category: string
  siteUrl: string
  endpoints: Endpoint[]
  payTo: { "eip155:1874": Address; "hedera:testnet": string }
}

export type ListingRecord = Listing & { entityKey: Hex; explorerUrl: string }

const values = (l: Listing) => ({
  merchant_id: l.merchantId,
  category: l.category,
  // Lowercased so a checksum difference never counts as a change.
  pay_to_evm: addr(l.payTo["eip155:1874"].toLowerCase() as Address),
  pay_to_hedera: l.payTo["hedera:testnet"],
  name: l.name,
  site_url: l.siteUrl,
  endpoints: bytes(stringToHex(JSON.stringify(l.endpoints))),
})

const utf8 = (v: Hex | Uint8Array) => (typeof v === "string" ? hexToString(v) : new TextDecoder().decode(v))

/** Rabdi's entity explorer, opened on one entity. */
export const entityExplorer = (key: string) =>
  `https://rabdi.explorer.arkiv.network/entity-explorer?q=${encodeURIComponent(`$key = ${key}`)}`

/** The query an agent runs, written out for the explorer: every Till merchant, or one category. */
export const registryQuery = (category?: string) =>
  `arkiv.schema = str('till.merchant')${category ? ` AND category = str('${category}')` : ""} AND $owner = addr(${REGISTRY_WRITER.toLowerCase()})`

export const registryExplorer = (category?: string) =>
  `https://rabdi.explorer.arkiv.network/entity-explorer?q=${encodeURIComponent(registryQuery(category))}`

export function registryReader(accessKey: string) {
  const arkiv = createPublicClient({ chain: rabdi({ accessKey }), transport: http() })
  const from = () => arkiv.select().from(MerchantListing)

  const run = async (q: ReturnType<typeof from>) => {
    const page = await q.ownedBy(REGISTRY_WRITER).limit(100).fetch()
    return page.entities.map(
      (e): ListingRecord => ({
        entityKey: e.$key,
        explorerUrl: entityExplorer(e.$key),
        merchantId: e.merchant_id.value,
        name: e.name.value,
        category: e.category.value,
        siteUrl: e.site_url.value,
        endpoints: JSON.parse(utf8(e.endpoints.value)) as Endpoint[],
        payTo: { "eip155:1874": getAddress(e.pay_to_evm.value), "hedera:testnet": e.pay_to_hedera.value },
      }),
    )
  }

  return {
    /** Every Till merchant, or only one category (e.g. "rent-data"). */
    list: (category?: string) => run(category ? from().where(eq("category", category)) : from()),
    /** One merchant by its Till id, if it's listed. */
    byId: async (merchantId: string) => (await run(from().where(eq("merchant_id", merchantId))))[0],
    /** Who, if anyone, the registry lists for a payTo address on a network. */
    byPayTo: async (network: string, payTo: string) =>
      (
        await run(
          network === NETWORKS.whitechain
            ? from().where(eq("pay_to_evm", addr(payTo as Address)))
            : from().where(eq("pay_to_hedera", payTo)),
        )
      )[0],
  }
}

export function registryWriter(privateKey: Hex, accessKey: string) {
  const wallet = createWalletClient({ chain: rabdi({ accessKey }), transport: http(), account: privateKeyToAccount(privateKey) })
  const reader = registryReader(accessKey)

  /**
   * Creates the merchant's entity, or patches the existing one if anything changed, so a merchant
   * is never listed twice. Returns what was done.
   */
  async function publish(l: Listing): Promise<{ action: "created" | "updated" | "unchanged"; entityKey: Hex; txHash?: Hex }> {
    const existing = await reader.byId(l.merchantId)
    if (!existing) {
      const { entityKey, txHash } = await wallet.createEntity(MerchantListing, values(l), { expiration: ExpirationTime.max() })
      return { action: "created", entityKey, txHash }
    }
    const { entityKey: _k, explorerUrl: _e, ...current } = existing
    if (JSON.stringify(values(current)) === JSON.stringify(values(l)))
      return { action: "unchanged", entityKey: existing.entityKey }
    const { txHash } = await wallet.patchEntity(MerchantListing, existing.entityKey, { set: values(l) })
    return { action: "updated", entityKey: existing.entityKey, txHash }
  }

  return { address: wallet.account.address, publish }
}
