"use client"

import { useState } from "react"

interface TopbarProps {
  search: string
  onSearch: (q: string) => void
  userEmail: string
  onOpenSidebar: () => void
  onInviteMembers?: () => void
}

export function Topbar({
  search,
  onSearch,
  userEmail,
  onOpenSidebar,
  onInviteMembers,
}: TopbarProps) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteSent, setInviteSent] = useState(false)

  // Derive friendly display name from email (e.g. "alex" -> "Alex")
  const displayName = userEmail
    ? userEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Member"

  const userInitial = displayName.charAt(0).toUpperCase()

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail) return
    setInviteSent(true)
    setTimeout(() => {
      setInviteSent(false)
      setInviteEmail("")
      setInviteModalOpen(false)
    }, 1500)
  }

  return (
    <>
      <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur-md border-b border-outline-variant px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open sidebar"
          className="inline-flex items-center justify-center w-9 h-9 rounded border border-outline-variant bg-surface-container-low text-on-surface-variant hover:text-on-surface lg:hidden"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
            menu
          </span>
        </button>

        {/* Search Bar */}
        <form
          role="search"
          className="relative flex items-center w-full max-w-2xl"
          onSubmit={(e) => e.preventDefault()}
        >
          <span
            className="material-symbols-outlined absolute left-3.5 text-on-surface-variant pointer-events-none"
            style={{ fontSize: "18px" }}
            aria-hidden="true"
          >
            search
          </span>
          <input
            id="file-search-input"
            type="search"
            aria-label="Search files and folders"
            placeholder="Search files and folders..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2 rounded border border-outline-variant bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="absolute right-3 text-on-surface-variant hover:text-on-surface"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                close
              </span>
            </button>
          )}
        </form>

        {/* Right Header Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (onInviteMembers) onInviteMembers()
              else setInviteModalOpen(true)
            }}
            className="hidden sm:inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded border border-outline-variant bg-surface-container-low text-on-surface font-label text-label-md hover:bg-surface-container-high hover:border-secondary/60 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            <span
              className="material-symbols-outlined text-secondary"
              style={{ fontSize: "18px" }}
              aria-hidden="true"
            >
              person_add
            </span>
            <span>Invite Members</span>
          </button>

          <div className="flex items-center gap-2.5 pl-1 sm:pl-2">
            <div className="w-9 h-9 rounded-full bg-primary-container border border-primary/40 flex items-center justify-center text-secondary font-headline text-title-sm font-semibold select-none">
              {userInitial}
            </div>
            <div className="hidden md:flex flex-col leading-tight">
              <span className="font-title text-title-sm text-on-surface font-medium truncate max-w-[120px]">
                {displayName}
              </span>
              <span className="font-body text-body-sm text-on-surface-variant">Admin</span>
            </div>
          </div>
        </div>
      </header>

      {/* Invite Members Dialog */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setInviteModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "22px" }}>
                  person_add
                </span>
                <h3 className="font-headline text-headline-md text-on-surface font-semibold">
                  Invite Members
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body text-body-sm text-on-surface-variant mb-4">
              Share quantum-safe access with your team members by inviting their email address.
            </p>
            {inviteSent ? (
              <div className="rounded-lg bg-primary-container/60 border border-primary/40 p-4 text-center text-on-primary-container font-label text-label-md">
                Invitation sent successfully!
              </div>
            ) : (
              <form onSubmit={handleInvite} className="flex flex-col gap-4">
                <input
                  type="email"
                  placeholder="collaborator@example.com"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded border border-outline-variant bg-surface-container text-on-surface placeholder:text-on-surface-variant text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-4 py-2 rounded text-on-surface-variant hover:text-on-surface font-label text-label-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-primary hover:bg-secondary text-on-primary hover:text-on-secondary font-label text-label-md font-medium transition-colors"
                  >
                    Send Invite
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
