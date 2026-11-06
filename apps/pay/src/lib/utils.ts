import { clsx, type ClassValue } from "clsx"
import { useEffect, useState } from "react"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/** Wait before showing spinners so sub-second work does not flash loading UI. */
export function useDelayedLoading(active: boolean, delayMs = 400): boolean {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!active) {
      setShow(false)
      return
    }
    const timer = window.setTimeout(() => setShow(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [active, delayMs])
  return show
}
