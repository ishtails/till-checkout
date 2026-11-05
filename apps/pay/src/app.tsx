import { Checkout } from "./checkout"
import { Dashboard } from "./dashboard"
import { Receipt } from "./receipt"
import { Receipts } from "./receipts"
import { Card } from "./ui"

// A few pages, so a path match is enough: no router.
export function App() {
  const [, page, id] = location.pathname.split("/")
  if (page === "checkout" && id) return <Checkout id={id} />
  if (page === "receipt" && id) return <Receipt id={id} />
  if (page === "receipts") return <Receipts address={id || undefined} />
  if (page === "dashboard") return <Dashboard />
  return (
    <Card>
      <p className="text-stone-500">Nothing here.</p>
    </Card>
  )
}
