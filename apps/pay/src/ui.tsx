import type { ReactNode } from "react"

export function Card({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto mt-16 max-w-md px-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">{children}</div>
      <p className="mt-4 text-center text-xs text-stone-400">Checkout by Till</p>
    </main>
  )
}

export function Money({ usd, className = "" }: { usd: string; className?: string }) {
  return <p className={`font-semibold tabular-nums ${className}`}>${Number(usd).toFixed(2)}</p>
}
