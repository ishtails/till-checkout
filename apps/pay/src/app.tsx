import { AgentConsole } from "./agent"
import { Checkout } from "./checkout"
import { Dashboard } from "./dashboard"
import { Receipt } from "./receipt"
import { Receipts } from "./receipts"
import { SignIn } from "./signin"
import { Muted, Shell } from "./ui"

// A few pages, so a path match is enough: no router.
export function App() {
  const [, page, id] = location.pathname.split("/")
  if (page === "checkout" && id) return <Checkout id={id} />
  if (page === "receipt" && id) return <Receipt id={id} />
  if (page === "receipts") return <Receipts address={id || undefined} />
  if (page === "dashboard") return <Dashboard />
  if (page === "signin") return <SignIn />
  if (page === "agent") return <AgentConsole />
  return (
    <Shell>
      <Muted>Nothing here.</Muted>
    </Shell>
  )
}
