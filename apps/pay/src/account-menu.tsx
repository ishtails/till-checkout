import { Menu } from "@base-ui/react/menu"
import { CopyIcon, ReceiptIcon, SignOutIcon, UserSwitchIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { toast } from "sonner"

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// The signed-in account, as an avatar: click it to see the email, the wallet and its role here,
// and to switch account or sign out.
export function AccountMenu({
  email,
  address,
  role,
  details,
  onSwitch,
  onSignOut,
}: {
  email?: string
  address?: string
  role?: { label: string; ok: boolean }
  details?: ReactNode
  onSwitch: () => void
  onSignOut: () => void
}) {
  const initial = (email ?? address ?? "?").replace(/^0x/, "").charAt(0).toUpperCase()
  const item = "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account"
        className="relative grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-white outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand"
      >
        {initial}
        {role && <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card ${role.ok ? "bg-emerald-500" : "bg-destructive"}`} />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="w-72 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-medium">{email ?? "Signed in"}</p>
              {address && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{short(address)}</p>}
              {role && (
                <p className={`mt-1.5 text-xs font-medium ${role.ok ? "text-brand" : "text-destructive"}`}>{role.label}</p>
              )}
              {details && <div className="mt-1 text-xs text-muted-foreground">{details}</div>}
            </div>
            <div className="my-1 h-px bg-border" />
            {address && (
              <Menu.Item
                className={item}
                onClick={() => navigator.clipboard.writeText(address).then(() => toast.success("Wallet address copied"))}
              >
                <CopyIcon className="size-4" /> Copy wallet address
              </Menu.Item>
            )}
            <Menu.Item className={item} onClick={() => location.assign("/receipts")}>
              <ReceiptIcon className="size-4" /> Your receipts
            </Menu.Item>
            <Menu.Item className={item} onClick={onSwitch}>
              <UserSwitchIcon className="size-4" /> Switch account
            </Menu.Item>
            <Menu.Item className={item} onClick={onSignOut}>
              <SignOutIcon className="size-4" /> Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
