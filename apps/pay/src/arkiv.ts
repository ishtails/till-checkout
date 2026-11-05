import { receiptReader } from "@till/receipts"

// Receipts read straight from Arkiv in the browser: our server isn't in the path, so they still
// load if Till is down. The access key isn't a secret (Arkiv's SDK says so); it ships with the page.
export const receipts = receiptReader(import.meta.env.VITE_ARKIV_ACCESS_KEY ?? "")
export { arkivExplorer, type ReceiptRecord } from "@till/receipts"
