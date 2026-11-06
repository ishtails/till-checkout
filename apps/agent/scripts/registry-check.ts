// What an agent sees when it looks sellers up on Arkiv.
//   bun apps/agent/scripts/registry-check.ts [category]
import { lookupMerchants, payToFor, sellerAt } from "../src/registry"

const category = process.argv[2] ?? "rent-data"
const t = performance.now()
const sellers = await lookupMerchants(category)
console.log(`${sellers.length} seller(s) in "${category}" on Arkiv (${Math.round(performance.now() - t)} ms)\n`)
for (const s of sellers) {
  console.log(`${s.name}  ${s.siteUrl}`)
  for (const e of s.endpoints) console.log(`  $${e.priceUsd}  ${e.method} ${e.url}  ${e.description}`)
  for (const [network, to] of Object.entries(s.payTo)) console.log(`  pays to ${to} on ${network}`)
  console.log(`  entity ${s.entityKey}\n  ${s.explorerUrl}\n`)
}

const first = sellers[0]
if (first) {
  const fake = "0x000000000000000000000000000000000000dEaD"
  console.log(`payToFor("${first.name}", "eip155:1874") = ${await payToFor(first.name, "eip155:1874")}`)
  console.log(`sellerAt("eip155:1874", ${first.payTo["eip155:1874"]}) = ${(await sellerAt("eip155:1874", first.payTo["eip155:1874"]))?.name}`)
  console.log(`sellerAt("eip155:1874", ${fake}) = ${(await sellerAt("eip155:1874", fake))?.name ?? "nobody: not a Till merchant"}`)
}
