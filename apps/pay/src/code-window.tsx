import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useState, type ReactNode } from "react"

// A tiny TypeScript highlighter: enough for a short snippet, no extra dependency.
const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|const|async|await|return|if|new|export)\b|\b([A-Za-z_]\w*)(?=\()|\b([A-Z]\w*)\b|(=>|===)/g

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > last) out.push(code.slice(last, m.index))
    const [text, comment, string, keyword, fn, type] = m
    const cls = comment
      ? "text-white/35 italic"
      : string
        ? "text-emerald-300"
        : keyword
          ? "text-violet-300"
          : fn
            ? "text-sky-300"
            : type
              ? "text-amber-200"
              : "text-violet-300"
    out.push(
      <span key={m.index} className={cls}>
        {text}
      </span>,
    )
    last = m.index + text.length
  }
  out.push(code.slice(last))
  return out
}

/** A code snippet in a window frame, with a copy button. */
export function CodeWindow({ code, filename }: { code: string; filename: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // Some browsers block the async clipboard API; fall back to a hidden textarea.
      const area = Object.assign(document.createElement("textarea"), { value: code })
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.append(area)
      area.select()
      document.execCommand("copy")
      area.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="overflow-hidden rounded-xl bg-[#16181d] shadow-lg ring-1 ring-black/10">
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="flex-1 truncate text-center font-mono text-xs text-white/45">{filename}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <CheckIcon className="size-3.5 text-emerald-300" weight="bold" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-white/85">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  )
}
