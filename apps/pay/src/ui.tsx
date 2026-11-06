import { ArrowUpRightIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { Card } from "./components/ui/card"
import { cn } from "./lib/utils"

export { Badge } from "./components/ui/badge"
export { Button } from "./components/ui/button"
export { Card } from "./components/ui/card"

/** An outbound link to a public record (explorer, HashScan, Arkiv). */
export function RecordLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={cn("inline-flex items-center gap-0.5 text-xs font-medium text-brand hover:underline", className)} href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRightIcon className="size-3" weight="bold" />
    </a>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img src="/logo.png" alt="" className="size-8 scale-150 mix-blend-multiply" />
      <span className="text-base font-semibold tracking-tight">Till</span>
    </span>
  )
}

/** The frame for the customer pages: one card centred on the page, with Till's mark under it. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col px-4 py-8 sm:py-14">
      <Card className="gap-0 p-6 sm:p-8">{children}</Card>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <img src="/logo.png" alt="" className="size-5 scale-150 mix-blend-multiply" />
        Checkout by Till
      </p>
    </main>
  )
}

export function Money({ usd, className = "" }: { usd: string | number; className?: string }) {
  return <p className={cn("font-semibold tracking-tight tabular-nums", className)}>${Number(usd).toFixed(2)}</p>
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
}
