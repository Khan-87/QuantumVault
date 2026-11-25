"use client"

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/mock-data"
import { type TrashItem } from "@/lib/trash-store"
import { loadFolders } from "@/lib/folder-store"

interface DeletedFilesViewProps {
  trashItems: TrashItem[]
  userEmail: string
  onRestore: (item: TrashItem) => void
  onPermanentDelete: (id: string) => Promise<void>
  onRestoreBatch: (items: TrashItem[]) => void
  onEmptyTrash: () => Promise<void>
}

export function DeletedFilesView({
  trashItems,
  userEmail,
  onRestore,
  onPermanentDelete,
  onRestoreBatch,
  onEmptyTrash,
}: DeletedFilesViewProps) {
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [emptyModalOpen, setEmptyModalOpen] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null)
  const [isPurging, setIsPurging] = useState(false)

  // Folders map to show original location name
  const folders = useMemo(() => loadFolders(userEmail), [userEmail])
  const folderNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    folders.forEach((f) => {
      map[f.id] = f.name
    })
    return map
  }, [folders])

  // Filtered trash items
  const filtered = useMemo(() => {
    if (!search.trim()) return trashItems
    const q = search.toLowerCase()
    return trashItems.filter((item) => item.name.toLowerCase().includes(q))
  }, [trashItems, search])

  const totalBytes = useMemo(
    () => trashItems.reduce((acc, item) => acc + item.size, 0),
    [trashItems]
  )

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((item) => item.id)))
    }
  }

  function toggleSelectOne(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  function handleBatchRestore() {
    const itemsToRestore = trashItems.filter((item) => selectedIds.has(item.id))
    onRestoreBatch(itemsToRestore)
    setSelectedIds(new Set())
  }

  async function handleBatchPurge() {
    setIsPurging(true)
    for (const id of Array.from(selectedIds)) {
      await onPermanentDelete(id)
    }
    setSelectedIds(new Set())
    setIsPurging(false)
  }

  async function handleConfirmEmpty() {
    setIsPurging(true)
    await onEmptyTrash()
    setEmptyModalOpen(false)
    setSelectedIds(new Set())
    setIsPurging(false)
  }

  async function handleConfirmPurgeSingle() {
    if (!purgeTarget) return
    setIsPurging(true)
    await onPermanentDelete(purgeTarget.id)
    setPurgeTarget(null)
    setIsPurging(false)
  }

  function getFileBadge(name: string) {
    const ext = name.split(".").pop()?.toUpperCase() ?? "FILE"
    if (["JPG", "JPEG", "PNG", "WEBP", "GIF"].includes(ext)) {
      return (
        <span className="inline-flex items-center justify-center w-9 h-5 rounded-sm bg-jpg-badge text-on-primary font-mono text-label-sm shrink-0">
          JPG
        </span>
      )
    }
    if (ext === "PDF") {
      return (
        <span className="inline-flex items-center justify-center w-9 h-5 rounded-sm bg-pdf-badge text-on-primary font-mono text-label-sm shrink-0">
          PDF
        </span>
      )
    }
    if (["DOC", "DOCX", "TXT", "MD", "RTF"].includes(ext)) {
      return (
        <span className="inline-flex items-center justify-center w-9 h-5 rounded-sm bg-doc-badge text-on-primary font-mono text-label-sm shrink-0">
          DOC
        </span>
      )
    }
    if (["ZIP", "RAR", "7Z", "TAR", "GZ"].includes(ext)) {
      return (
        <span className="inline-flex items-center justify-center w-9 h-5 rounded-sm bg-info-badge text-on-primary font-mono text-label-sm shrink-0">
          ZIP
        </span>
      )
    }
    return (
      <span className="inline-flex items-center justify-center w-9 h-5 rounded-sm bg-surface-container-highest text-on-surface-variant font-mono text-label-sm shrink-0">
        {ext.slice(0, 4)}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with Title, Stats, and Action Buttons */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-error-container/40 border border-error/40 flex items-center justify-center text-error">
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
              delete
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-headline text-headline-lg font-semibold text-on-surface">
                Deleted Files
              </h1>
              {trashItems.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant font-mono text-mono-sm text-on-surface-variant">
                  {trashItems.length}
                </span>
              )}
            </div>
            <p className="font-body text-body-sm text-on-surface-variant mt-0.5">
              Items in trash can be restored to their original location or permanently deleted.
            </p>
          </div>
        </div>

        {trashItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEmptyModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded border border-error/40 bg-error-container/20 text-error hover:bg-error-container/40 font-label text-label-md font-medium transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                delete_forever
              </span>
              <span>Empty Trash</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Multi-Select Toolbar */}
      {trashItems.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Search Input */}
          <div className="relative flex items-center w-full sm:w-72">
            <span
              className="material-symbols-outlined absolute left-3 text-on-surface-variant pointer-events-none"
              style={{ fontSize: "16px" }}
            >
              search
            </span>
            <input
              type="text"
              placeholder="Search in trash..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded border border-outline-variant bg-surface-container-low text-on-surface placeholder:text-on-surface-variant text-body-sm focus:outline-none focus:border-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  close
                </span>
              </button>
            )}
          </div>

          {/* Batch Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-surface-container-high border border-outline-variant px-3 py-1.5 rounded-lg text-body-sm animate-in fade-in">
              <span className="text-on-surface font-medium">
                {selectedIds.size} selected
              </span>
              <div className="h-4 w-px bg-outline-variant mx-1" />
              <button
                type="button"
                onClick={handleBatchRestore}
                className="inline-flex items-center gap-1.5 text-secondary hover:underline font-medium"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  restore_from_trash
                </span>
                Restore
              </button>
              <button
                type="button"
                disabled={isPurging}
                onClick={handleBatchPurge}
                className="inline-flex items-center gap-1.5 text-error hover:underline font-medium ml-2"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  delete_forever
                </span>
                Delete Forever
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Table or Empty State */}
      {trashItems.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low py-16 px-6 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: "30px" }}>
              delete_sweep
            </span>
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <h3 className="font-headline text-headline-md text-on-surface font-semibold">
              Trash is empty
            </h3>
            <p className="font-body text-body-sm text-on-surface-variant">
              Deleted files will appear here until permanently cleared.
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low py-12 px-6 flex flex-col items-center justify-center text-center text-on-surface-variant">
          <span className="font-body text-body-md text-on-surface font-medium">
            No deleted files match &ldquo;{search}&rdquo;
          </span>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-low">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant bg-surface-container select-none">
                <th scope="col" className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all deleted files"
                    className="rounded border-outline-variant bg-surface-container-high text-primary focus:ring-0 cursor-pointer"
                  />
                </th>
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  Name
                </th>
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  Original Location
                </th>
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  Date Deleted
                </th>
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  Size
                </th>
                <th scope="col" className="py-3 px-4 text-right font-label text-label-md">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {filtered.map((item) => {
                const isChecked = selectedIds.has(item.id)
                const folderName = item.originalFolderId
                  ? folderNameMap[item.originalFolderId] || "Folder"
                  : "All Files (Root)"

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "transition-colors duration-150 group",
                      isChecked
                        ? "bg-primary-container/30"
                        : "hover:bg-surface-container"
                    )}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectOne(item.id)}
                        aria-label={`Select ${item.name}`}
                        className="rounded border-outline-variant bg-surface-container-high text-primary focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {getFileBadge(item.name)}
                        <span className="font-body text-body-md text-on-surface font-medium truncate max-w-xs md:max-w-md">
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-secondary" style={{ fontSize: "16px" }}>
                          {item.originalFolderId ? "folder" : "cloud"}
                        </span>
                        <span>{folderName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 tabular-nums">
                      <span className="font-body text-body-md text-on-surface-variant">
                        {new Date(item.deletedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                    <td className="py-3 px-4 tabular-nums">
                      <span className="font-mono text-mono-sm text-on-surface-variant">
                        {formatBytes(item.size)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onRestore(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-outline-variant bg-surface-container hover:bg-surface-container-high text-secondary text-body-sm font-medium transition-colors"
                          title="Restore to original folder"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                            restore_from_trash
                          </span>
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPurgeTarget(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-error/30 bg-error-container/20 hover:bg-error-container/40 text-error text-body-sm font-medium transition-colors"
                          title="Permanently purge from encrypted storage"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                            delete_forever
                          </span>
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DIALOG: Confirm Empty Trash */}
      {emptyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setEmptyModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-error">
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>
                warning
              </span>
              <h3 className="font-headline text-headline-md text-on-surface font-semibold">
                Empty Trash?
              </h3>
            </div>
            <p className="font-body text-body-sm text-on-surface-variant leading-relaxed">
              Are you sure you want to permanently delete all {trashItems.length} files ({formatBytes(totalBytes)})?
              This action <strong className="text-on-surface">cannot be undone</strong> and will completely purge the encrypted ciphertext from AWS S3.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setEmptyModalOpen(false)}
                className="px-4 py-2 rounded text-on-surface-variant hover:text-on-surface font-label text-label-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPurging}
                onClick={handleConfirmEmpty}
                className="px-4 py-2 rounded bg-error hover:bg-error/80 text-on-error font-label text-label-md font-medium transition-colors"
              >
                {isPurging ? "Purging..." : "Yes, Empty Trash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: Confirm Single File Permanent Delete */}
      {purgeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setPurgeTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-error">
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>
                warning
              </span>
              <h3 className="font-headline text-headline-md text-on-surface font-semibold">
                Delete Permanently?
              </h3>
            </div>
            <p className="font-body text-body-sm text-on-surface-variant leading-relaxed">
              Are you sure you want to permanently delete &ldquo;<strong className="text-on-surface">{purgeTarget.name}</strong>&rdquo;?
              The encrypted data will be destroyed from AWS storage immediately.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setPurgeTarget(null)}
                className="px-4 py-2 rounded text-on-surface-variant hover:text-on-surface font-label text-label-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPurging}
                onClick={handleConfirmPurgeSingle}
                className="px-4 py-2 rounded bg-error hover:bg-error/80 text-on-error font-label text-label-md font-medium transition-colors"
              >
                {isPurging ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
