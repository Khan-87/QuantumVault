"use client"

import { useState } from "react"
import { User, Mail, Calendar, BadgeCheck, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDate, type VaultUser } from "@/lib/mock-data"

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}

export function AccountSettings({ user }: { user: VaultUser }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!current || !next || !confirm) {
      setMessage("Please fill in all fields.")
      return
    }
    if (next !== confirm) {
      setMessage("New passwords do not match.")
      return
    }
    setMessage("Password updated successfully.")
    setCurrent("")
    setNext("")
    setConfirm("")
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Account Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your profile and password.</p>

      {/* User info */}
      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-2 text-sm font-semibold">Profile</h2>
        <InfoRow icon={User} label="Name" value={user.name} />
        <InfoRow icon={Mail} label="Email" value={user.email} />
        <InfoRow icon={BadgeCheck} label="Plan" value={`${user.plan} plan`} />
        <InfoRow icon={Calendar} label="Member since" value={formatDate(user.memberSince)} />
      </section>

      {/* Change password */}
      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Change password</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="current" className="text-sm font-medium">
              Current password
            </label>
            <input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new" className="text-sm font-medium">
                New password
              </label>
              <input
                id="new"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-sm font-medium">
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
          </div>

          {message && (
            <p
              className={
                message.includes("success") ? "text-sm text-primary" : "text-sm text-destructive"
              }
              role="status"
            >
              {message}
            </p>
          )}

          <div>
            <Button type="submit">Update password</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
