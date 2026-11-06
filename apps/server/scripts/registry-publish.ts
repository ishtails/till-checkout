// Lists the merchants on Arkiv by hand, the same way the server does on start.
// SITE_URL overrides each merchant's site, so a dev machine can publish the live listing:
//   SITE_URL=https://shop.till.ishtails.xyz bun apps/server/scripts/registry-publish.ts
import { publishRegistry } from "../src/registry"

await publishRegistry(process.env.SITE_URL)
