"use client"

import { Files, Settings, Shield, HardDrive, LogOut, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatBytes, STORAGE_LIMIT } from "@/lib/mock-data"

export type View = "files" | "settings"

const nav: { id: View; label: string; icon: typeof Files }[] = [
  { id: "files", label: "My Files", icon: Files },
  { id: "settings", label: "Account Settings", icon: Settings },
]

export function Sidebar({
  view,
  onChange,
  used,
  onSignOut,
  open,
  onClose,
}: {
  view: View
  onChange: (v: View) => void
  used: number
  onSignOut: () => void
  open: boolean
  onClose: () => void
}) {
  const pct = Math.min(100, (used / STORAGE_LIMIT) * 100)

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Shield className="size-4 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">QuantumVault</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground md:hidden"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-2">
          {nav.map((item) => {
            const Icon = item.icon
            const active = view === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange(item.id)
                  onClose()
                }}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto p-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">Storage</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatBytes(used)} of {formatBytes(STORAGE_LIMIT)} used
            </p>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
