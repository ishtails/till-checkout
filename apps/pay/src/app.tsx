import { RESEARCH_AGENT_ID } from "@till/identity"
import { AgentConsole } from "./agent"
import { Checkout } from "./checkout"
import { Dashboard } from "./dashboard"
import { Receipt } from "./receipt"
import { Account, Receipts } from "./receipts"
import { SignIn } from "./signin"
import { Muted, Shell } from "./ui"

// A few pages, so a path match is enough: no router.
export function App() {
  const [, page, id] = location.pathname.split("/")
  if (page === "checkout" && id) return <Checkout id={id} />
  if (page === "receipt" && id) return <Receipt id={id} />
  // The customer's dashboard. /receipts (the old name) forwards to it; /receipts/<address> is any wallet's.
  if (page === "account" || (page === "receipts" && !id)) {
    if (page === "receipts") history.replaceState(null, "", "/account")
    return <Account />
  }
  if (page === "receipts") return <Receipts address={id} />
  // One URL per merchant and per agent. The bare paths forward to the demo's own.
  if (page === "dashboard") {
    const merchant = id || new URLSearchParams(location.search).get("merchant") || "data-shop"
    if (!id) history.replaceState(null, "", `/dashboard/${merchant}`)
    return <Dashboard merchantId={merchant} />
  }
  if (page === "signin") return <SignIn />
  if (page === "agent") {
    if (!id) history.replaceState(null, "", `/agent/${RESEARCH_AGENT_ID}`)
    return <AgentConsole agentId={id || RESEARCH_AGENT_ID} />
  }
  return (
    <Shell>
      <Muted>Nothing here.</Muted>
    </Shell>
  )
}
