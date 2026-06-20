"use client"

import { useState } from "react"
import { Download, Trash2, Pencil, Check, X, FileX, Loader2 } from "lucide-react"
import { getFileIcon } from "@/lib/file-icons"
import { formatBytes, formatDate, type VaultFile } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

function StatusBadge({ status }: { status: VaultFile["status"] }) {
  const styles: Record<VaultFile["status"], string> = {
    synced: "bg-primary/15 text-primary",
    uploading: "bg-muted text-muted-foreground",
    processing: "bg-muted text-muted-foreground",
  }
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", styles[status])}>
      {label}
    </span>
  )
}

function FileRow({
  file,
  onRename,
  onDelete,
  onDownload,
}: {
  file: VaultFile
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDownload?: (id: string) => void
}) {
  const Icon = getFileIcon(file.type)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(file.name)
  const [downloading, setDownloading] = useState(false)

  function commit() {
    const next = draft.trim()
    if (next) onRename(file.id, next)
    else setDraft(file.name)
    setEditing(false)
  }

  async function handleDownload() {
    if (!onDownload) return
    setDownloading(true)
    try {
      await onDownload(file.id)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="group grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/40 md:grid-cols-[2.5fr_1fr_1.2fr_1fr_auto] md:px-6">
      {/* Name */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        {editing ? (
          <div className="flex min-w-0 items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit()
                if (e.key === "Escape") {
                  setDraft(file.name)
                  setEditing(false)
                }
              }}
              className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Rename file"
            />
            <button
              type="button"
              onClick={commit}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Confirm rename"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(file.name)
                setEditing(false)
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Cancel rename"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground md:hidden">
              {formatBytes(file.size)} · {formatDate(file.uploadedAt)}
            </p>
          </div>
        )}
      </div>

      {/* Size */}
      <div className="hidden text-sm text-muted-foreground tabular-nums md:block">{formatBytes(file.size)}</div>

      {/* Date */}
      <div className="hidden text-sm text-muted-foreground md:block">{formatDate(file.uploadedAt)}</div>

      {/* Status */}
      <div className="hidden md:block">
        <StatusBadge status={file.status} />
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex items-center justify-end gap-0.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
            aria-label={`Download ${file.name}`}
          >
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label={`Rename ${file.name}`}
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(file.id)}
            className="rounded-md p-2 text-muted-foreground hover:bg-background hover:text-destructive"
            aria-label={`Delete ${file.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export function FileList({
  files,
  onRename,
  onDelete,
  onDownload,
}: {
  files: VaultFile[]
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDownload?: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Column headers (desktop) */}
      <div className="hidden grid-cols-[2.5fr_1fr_1.2fr_1fr_auto] gap-3 border-b border-border px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
        <span>Name</span>
        <span>Size</span>
        <span>Upload date</span>
        <span>Status</span>
        <span className="sr-only">Actions</span>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <FileX className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No files found</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or filters.</p>
        </div>
      ) : (
        files.map((file) => (
          <FileRow key={file.id} file={file} onRename={onRename} onDelete={onDelete} onDownload={onDownload} />
        ))
      )}
    </div>
  )
}
