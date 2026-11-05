import { Checkout } from "./checkout"
import { Card } from "./ui"

// Three pages, so a path match is enough: no router.
export function App() {
  const [, page, id] = location.pathname.split("/")
  if (page === "checkout" && id) return <Checkout id={id} />
  return (
    <Card>
      <p className="text-stone-500">Nothing here.</p>
    </Card>
  )
}
