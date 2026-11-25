"use client"

import { cn } from "@/lib/utils"
import { formatBytes, STORAGE_LIMIT } from "@/lib/mock-data"

export type NavView =
  | "all-files"
  | "dashboard"
  | "signatures"
  | "send-and-track"
  | "shared"
  | "file-requests"
  | "deleted-files"
  | "settings"

interface SidebarProps {
  view: NavView
  onChange: (v: NavView) => void
  used: number
  onSignOut: () => void
  open: boolean
  onClose: () => void
  onUpgradeStorage?: () => void
}

const navItems: { id: NavView; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid_view" },
  { id: "all-files", label: "All Files", icon: "folder_open" },
  { id: "signatures", label: "Signatures", icon: "draw" },
  { id: "send-and-track", label: "Send and Track", icon: "bar_chart" },
  { id: "shared", label: "Shared", icon: "group" },
  { id: "file-requests", label: "File Requests", icon: "upload_file" },
  { id: "deleted-files", label: "Deleted Files", icon: "delete" },
]

const quickAccessItems = [
  { id: "starred", label: "Starred" },
  { id: "finance", label: "Finance" },
  { id: "report", label: "Report" },
  { id: "event", label: "Event" },
]

export function Sidebar({
  view,
  onChange,
  used,
  onSignOut,
  open,
  onClose,
  onUpgradeStorage,
}: SidebarProps) {
  // Storage limit default is 5 GB or dynamic
  const limit = STORAGE_LIMIT || 5 * 1024 * 1024 * 1024
  const pct = Math.min(100, Math.round((used / limit) * 100))

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 shrink-0 bg-surface-container-lowest border-r border-outline-variant flex flex-col justify-between px-4 py-5 transition-transform duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col gap-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between gap-2 px-2">
            <button
              type="button"
              onClick={() => onChange("all-files")}
              className="flex items-center gap-2 min-w-0 text-left focus:outline-none"
            >
              <span
                className="material-symbols-outlined text-secondary shrink-0"
                style={{ fontSize: "22px", fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                cloud
              </span>
              <span className="font-headline text-title-md text-on-surface tracking-tight truncate font-semibold">
                QuantumVault
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Toggle sidebar"
              className="inline-flex items-center justify-center w-8 h-8 shrink-0 rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors duration-150"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }} aria-hidden="true">
                dock_to_right
              </span>
            </button>
          </div>

          {/* Primary Navigation */}
          <nav aria-label="Main navigation" className="flex flex-col gap-1">
            {navItems.map((item) => {
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
                    "flex items-center gap-3 px-3 py-2 rounded text-left transition-colors duration-150 font-label text-label-md",
                    active
                      ? "bg-primary-container/60 border border-primary/40 text-on-primary-container font-medium"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={cn(
                      "material-symbols-outlined",
                      active ? "text-secondary" : "text-on-surface-variant"
                    )}
                    style={{
                      fontSize: "18px",
                      fontVariationSettings: active ? "'FILL' 1" : undefined,
                    }}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className={cn(active ? "text-on-surface font-medium" : "")}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Quick Access Section */}
          <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/60">
            <div className="flex items-center justify-between px-3">
              <span className="font-label text-label-sm text-on-surface-variant">
                Quick Access
              </span>
              <button
                type="button"
                aria-label="Add quick access folder"
                className="text-on-surface-variant hover:text-secondary p-0.5 rounded transition-colors duration-150"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }} aria-hidden="true">
                  add
                </span>
              </button>
            </div>
            <nav aria-label="Quick access folders" className="flex flex-col gap-0.5">
              {quickAccessItems.map((qa) => (
                <button
                  key={qa.id}
                  type="button"
                  onClick={() => {
                    onChange("all-files")
                    onClose()
                  }}
                  className="px-3 py-1.5 rounded text-left font-label text-label-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors duration-150"
                >
                  {qa.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Bottom Storage & Utility Links */}
        <div className="flex flex-col gap-3 pt-4">
          {/* Storage Meter Card */}
          <article className="rounded-lg border border-outline-variant bg-surface-container-low p-3.5 flex flex-col gap-3">
            <header className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-secondary"
                style={{ fontSize: "18px" }}
                aria-hidden="true"
              >
                cloud
              </span>
              <h3 className="font-title text-title-sm text-on-surface font-medium">Storage</h3>
            </header>
            <div className="flex flex-col gap-1.5">
              <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
              <p className="font-body text-body-sm text-on-surface-variant tabular-nums">
                {formatBytes(used)} of {formatBytes(limit)} used
              </p>
            </div>
            <footer>
              <button
                type="button"
                onClick={onUpgradeStorage}
                className="w-full py-2 px-3 rounded bg-primary hover:bg-secondary text-on-primary hover:text-on-secondary font-label text-label-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                Get More Storage
              </button>
            </footer>
          </article>

          {/* Support and Sign Out */}
          <nav aria-label="Support navigation" className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-3 px-3 py-2 rounded text-left text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors duration-150"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }} aria-hidden="true">
                notifications
              </span>
              <span className="font-label text-label-md">Notification</span>
            </button>
            <button
              type="button"
              onClick={() => onChange("settings")}
              className="flex items-center gap-3 px-3 py-2 rounded text-left text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors duration-150"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }} aria-hidden="true">
                help
              </span>
              <span className="font-label text-label-md">Help and Settings</span>
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-3 px-3 py-2 rounded text-left text-error hover:bg-error-container/30 transition-colors duration-150"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }} aria-hidden="true">
                logout
              </span>
              <span className="font-label text-label-md">Sign Out</span>
            </button>
          </nav>
        </div>
      </aside>
    </>
  )
}
