"use client"

import { useState } from "react"
import { type VaultUser, formatDate } from "@/lib/mock-data"

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
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface font-semibold">
          Account Settings
        </h1>
        <p className="font-body text-body-sm text-on-surface-variant mt-1">
          Manage your profile, quantum security parameters, and account settings.
        </p>
      </div>

      {/* User profile card */}
      <section className="rounded-xl border border-outline-variant bg-surface-container-low p-6 flex flex-col gap-4">
        <h2 className="font-headline text-title-md text-on-surface font-semibold">
          Profile Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-3 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">Name</span>
            <span className="font-body text-body-md text-on-surface font-medium">{user.name}</span>
          </div>
          <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-3 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">Email Address</span>
            <span className="font-body text-body-md text-on-surface font-medium">{user.email}</span>
          </div>
          <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-3 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">Subscription Plan</span>
            <span className="font-body text-body-md text-secondary font-medium">Enterprise Quantum Pro</span>
          </div>
          <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-3 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">Cryptography</span>
            <span className="font-body text-body-md text-on-surface font-medium">
              ML-KEM-768 + AES-256-GCM
            </span>
          </div>
        </div>
      </section>

      {/* Password Change */}
      <section className="rounded-xl border border-outline-variant bg-surface-container-low p-6 flex flex-col gap-4">
        <h2 className="font-headline text-title-md text-on-surface font-semibold">
          Change Password
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="font-label text-label-sm text-on-surface-variant mb-1 block">
              Current Password
            </label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full px-3.5 py-2 rounded border border-outline-variant bg-surface-container text-on-surface text-body-md focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="font-label text-label-sm text-on-surface-variant mb-1 block">
              New Password
            </label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full px-3.5 py-2 rounded border border-outline-variant bg-surface-container text-on-surface text-body-md focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="font-label text-label-sm text-on-surface-variant mb-1 block">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3.5 py-2 rounded border border-outline-variant bg-surface-container text-on-surface text-body-md focus:outline-none focus:border-primary"
            />
          </div>

          {message && (
            <p className="font-body text-body-sm text-secondary mt-1">{message}</p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-primary hover:bg-secondary text-on-primary font-label text-label-md font-medium transition-colors"
            >
              Update Password
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
