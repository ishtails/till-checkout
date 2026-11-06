import { registryReader, type ListingRecord } from "@till/receipts/registry"

// Where the agent finds sellers: Till's merchant registry on Arkiv, queried directly (never
// through the Till server), filtered to Till's writer wallet. A link on some web page is only a
// hint; the registry says who the seller is and which address it gets paid at.
const reader = registryReader(process.env.ARKIV_ACCESS_KEY ?? "")

export type Seller = Pick<ListingRecord, "name" | "category" | "siteUrl" | "endpoints" | "payTo" | "entityKey" | "explorerUrl">

const seller = ({ name, category, siteUrl, endpoints, payTo, entityKey, explorerUrl }: ListingRecord): Seller => ({
  name,
  category,
  siteUrl,
  endpoints,
  payTo,
  entityKey,
  explorerUrl,
})

/** Every merchant listed on Till, or only one category (e.g. "rent-data"). */
export async function lookupMerchants(category?: string): Promise<Seller[]> {
  return (await reader.list(category)).map(seller)
}

/** The address a listed merchant is paid at on a network ("eip155:1874" or "hedera:testnet"). */
export async function payToFor(name: string, network: string): Promise<string | undefined> {
  const m = (await reader.list()).find(s => s.name.toLowerCase() === name.toLowerCase())
  return m?.payTo[network as keyof Seller["payTo"]]
}

/** Who the registry lists at this payTo, if anyone: what the guard checks a 402 against. */
export async function sellerAt(network: string, payTo: string): Promise<Seller | undefined> {
  const m = await reader.byPayTo(network, payTo)
  return m && seller(m)
}
