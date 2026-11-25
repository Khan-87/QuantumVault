"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { Sidebar, type NavView } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { QuickActions } from "@/components/quick-actions"
import { UploadArea } from "@/components/upload-area"
import { FileTable } from "@/components/file-table"
import { AccountSettings } from "@/components/account-settings"
import { DeletedFilesView } from "@/components/deleted-files-view"
import { type VaultFile, type FileType } from "@/lib/mock-data"
import { fetchUserFiles, uploadEncryptedFile, downloadEncryptedFile, deleteFile, type FileRecord } from "@/lib/api"
import { deriveDeterministicUUID } from "@/lib/crypto"
import { type UserSession } from "@/app/page"
import { createFolder, loadFileFolderMap, assignFileToFolder } from "@/lib/folder-store"
import {
  loadTrash,
  addToTrash,
  removeFromTrash,
  emptyTrash,
  type TrashItem,
} from "@/lib/trash-store"

function inferType(name: string): FileType {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image"
  if (["mp4", "mov", "webm", "avi"].includes(ext)) return "video"
  if (["mp3", "wav", "flac", "aac"].includes(ext)) return "audio"
  if (["zip", "rar", "tar", "gz"].includes(ext)) return "archive"
  if (["ts", "js", "tsx", "jsx", "py", "go", "rs", "json"].includes(ext)) return "code"
  return "document"
}

function mapRecordToFile(record: FileRecord): VaultFile & { iv: string } {
  return {
    id: record.fileId,
    name: record.fileName,
    type: inferType(record.fileName),
    size: record.fileSize,
    uploadedAt: record.uploadTimestamp,
    status: record.fileStatus === "uploaded" ? "synced" : "processing",
    iv: record.iv || "",
  }
}

export function Dashboard({
  session,
  onSignOut,
}: {
  session: UserSession
  onSignOut: () => void
}) {
  const [view, setView] = useState<NavView>("all-files")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [files, setFiles] = useState<(VaultFile & { iv: string })[]>([])
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const ownerId = useMemo(() => deriveDeterministicUUID(session.email), [session.email])

  const user = useMemo(
    () => ({
      name: session.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      email: session.email,
      plan: "Enterprise Quantum Pro",
      memberSince: new Date().toLocaleDateString("en-US"),
    }),
    [session.email]
  )

  // Fetch files from DynamoDB and load local trash on mount
  useEffect(() => {
    async function loadFiles() {
      try {
        setLoading(true)
        const records = await fetchUserFiles(session.token)
        const loadedTrash = loadTrash(session.email)
        setTrashItems(loadedTrash)

        // Filter out items that are currently in trash
        const trashIdSet = new Set(loadedTrash.map((t) => t.id))
        setFiles(records.filter((r) => !trashIdSet.has(r.fileId)).map(mapRecordToFile))
      } catch (error) {
        console.error("Failed to load files:", error)
      } finally {
        setLoading(false)
      }
    }
    loadFiles()
  }, [session.token, session.email])

  const used = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

  async function handleRefresh() {
    try {
      const records = await fetchUserFiles(session.token)
      const loadedTrash = loadTrash(session.email)
      const trashIdSet = new Set(loadedTrash.map((t) => t.id))
      setFiles(records.filter((r) => !trashIdSet.has(r.fileId)).map(mapRecordToFile))
    } catch (error) {
      console.error("Failed to refresh files:", error)
    }
  }

  async function handleDownload(id: string) {
    const file = files.find((f) => f.id === id)
    if (!file) return

    try {
      showToast(`Decrypting "${file.name}" with ML-KEM-768 key...`)
      await downloadEncryptedFile(
        session.token,
        file.id,
        file.name,
        session.kyberPrivateKey,
        ownerId,
        session.vaultKey
      )
      showToast(`"${file.name}" decrypted and downloaded.`)
    } catch (error) {
      console.error("Download failed:", error)
      showToast("Failed to download and decrypt file.")
    }
  }

  function handleRename(id: string, name: string) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
    showToast(`Renamed to "${name}"`)
  }

  // Soft delete: moves to Trash store
  async function handleDelete(id: string) {
    const fileToDelete = files.find((f) => f.id === id)
    if (!fileToDelete) return

    const folderMap = loadFileFolderMap(session.email)
    const originalFolderId = folderMap[id] || null

    const updatedTrash = addToTrash(session.email, {
      id: fileToDelete.id,
      name: fileToDelete.name,
      type: fileToDelete.type,
      size: fileToDelete.size,
      uploadedAt: fileToDelete.uploadedAt,
      originalFolderId,
      iv: fileToDelete.iv,
    })

    setTrashItems(updatedTrash)
    setFiles((prev) => prev.filter((f) => f.id !== id))
    showToast(`Moved "${fileToDelete.name}" to Trash.`)
  }

  // Restore single item from trash
  function handleRestore(item: TrashItem) {
    const restoredFile: VaultFile & { iv: string } = {
      id: item.id,
      name: item.name,
      type: item.type,
      size: item.size,
      uploadedAt: item.uploadedAt,
      status: "synced",
      iv: item.iv || "",
    }

    setFiles((prev) => [restoredFile, ...prev])
    if (item.originalFolderId) {
      assignFileToFolder(session.email, item.id, item.originalFolderId)
    }
    const updated = removeFromTrash(session.email, item.id)
    setTrashItems(updated)
    showToast(`Restored "${item.name}" to your files.`)
  }

  // Restore multiple items
  function handleRestoreBatch(items: TrashItem[]) {
    const restoredFiles = items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      size: item.size,
      uploadedAt: item.uploadedAt,
      status: "synced" as const,
      iv: item.iv || "",
    }))

    items.forEach((item) => {
      if (item.originalFolderId) {
        assignFileToFolder(session.email, item.id, item.originalFolderId)
      }
      removeFromTrash(session.email, item.id)
    })

    setFiles((prev) => [...restoredFiles, ...prev])
    setTrashItems(loadTrash(session.email))
    showToast(`Restored ${items.length} items.`)
  }

  // Permanent delete from AWS S3 & DynamoDB
  async function handlePermanentDelete(id: string) {
    try {
      await deleteFile(session.token, id)
      const updated = removeFromTrash(session.email, id)
      setTrashItems(updated)
      showToast("File permanently deleted from storage.")
    } catch (error) {
      console.error("Permanent delete failed:", error)
      showToast("Failed to delete file from AWS storage.")
    }
  }

  // Empty entire trash
  async function handleEmptyTrash() {
    for (const item of trashItems) {
      try {
        await deleteFile(session.token, item.id)
      } catch (err) {
        console.error("Failed to purge item from AWS:", item.id, err)
      }
    }
    emptyTrash(session.email)
    setTrashItems([])
    showToast("Trash emptied permanently.")
  }

  function showToast(msg: string) {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3500)
  }

  function handleTriggerUpload() {
    fileInputRef.current?.click()
  }

  function handleCreateFolderPrompt() {
    const name = window.prompt("Enter new folder name:")
    if (name && name.trim()) {
      createFolder(session.email, name.trim(), "cyan")
      showToast(`Created folder "${name.trim()}"`)
      handleRefresh()
    }
  }

  return (
    <div className="min-h-screen flex bg-surface text-on-surface">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-primary/50 bg-primary-container/90 backdrop-blur-md px-4 py-2.5 text-on-primary-container font-label text-label-md shadow-xl animate-in fade-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}

      {/* Navigation Sidebar */}
      <Sidebar
        view={view}
        onChange={setView}
        used={used}
        onSignOut={onSignOut}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onUpgradeStorage={() => showToast("Storage upgrade plans: 1 TB, 5 TB, and Unlimited.")}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col bg-surface">
        <Topbar
          search={search}
          onSearch={setSearch}
          userEmail={session.email}
          onOpenSidebar={() => setSidebarOpen(true)}
          onInviteMembers={() => showToast("Member invitation sent to email.")}
        />

        <main className="flex-1 px-4 lg:px-6 py-6 flex flex-col gap-6 max-w-7xl w-full">
          {view === "all-files" ? (
            <>
              {/* Quick Action Tiles */}
              <QuickActions
                onTriggerUpload={handleTriggerUpload}
                onCreateFolder={handleCreateFolderPrompt}
                onActionNotice={showToast}
              />

              {/* Drag and Drop Upload Zone */}
              <UploadArea
                onUpload={handleRefresh}
                fileInputRef={fileInputRef}
                uploadFile={(file, onProgress) =>
                  uploadEncryptedFile(
                    session.token,
                    file,
                    session.kyberPublicKey,
                    ownerId,
                    session.vaultKey,
                    onProgress
                  )
                }
              />

              {/* Interactive File Table */}
              <FileTable
                files={files}
                searchQuery={search}
                userEmail={session.email}
                loading={loading}
                onDownloadFile={handleDownload}
                onDeleteFile={handleDelete}
                onRenameFile={handleRename}
                onRefresh={handleRefresh}
              />
            </>
          ) : view === "deleted-files" ? (
            <DeletedFilesView
              trashItems={trashItems}
              userEmail={session.email}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
              onRestoreBatch={handleRestoreBatch}
              onEmptyTrash={handleEmptyTrash}
            />
          ) : view === "dashboard" ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "28px" }}>
                  grid_view
                </span>
                <h1 className="font-headline text-headline-lg font-semibold">Dashboard Overview</h1>
              </div>
              <p className="font-body text-body-md text-on-surface-variant">
                Quantum security telemetry and storage distribution.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-4 flex flex-col gap-1">
                  <span className="font-label text-label-sm text-on-surface-variant">Active Files</span>
                  <span className="font-headline text-headline-md font-semibold text-on-surface">{files.length}</span>
                </div>
                <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-4 flex flex-col gap-1">
                  <span className="font-label text-label-sm text-on-surface-variant">Files in Trash</span>
                  <span className="font-headline text-headline-md font-semibold text-secondary">{trashItems.length}</span>
                </div>
                <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-4 flex flex-col gap-1">
                  <span className="font-label text-label-sm text-on-surface-variant">Security Protocol</span>
                  <span className="font-headline text-headline-md font-semibold text-on-surface">ML-KEM-768</span>
                </div>
              </div>
            </div>
          ) : view === "signatures" ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "28px" }}>
                  draw
                </span>
                <h1 className="font-headline text-headline-lg font-semibold">Signatures & Approvals</h1>
              </div>
              <p className="font-body text-body-md text-on-surface-variant">
                Quantum-signed documents and tamper-evident digital signature workflows.
              </p>
              <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-6 text-center text-on-surface-variant">
                No pending signature requests. Upload a document or PDF above to request a quantum signature.
              </div>
            </div>
          ) : view === "send-and-track" ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "28px" }}>
                  bar_chart
                </span>
                <h1 className="font-headline text-headline-lg font-semibold">Send and Track</h1>
              </div>
              <p className="font-body text-body-md text-on-surface-variant">
                Real-time tracking for encrypted file shares, download receipts, and recipient audit logs.
              </p>
              <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-6 text-center text-on-surface-variant">
                No active tracking links yet.
              </div>
            </div>
          ) : view === "shared" ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "28px" }}>
                  group
                </span>
                <h1 className="font-headline text-headline-lg font-semibold">Shared with Me</h1>
              </div>
              <p className="font-body text-body-md text-on-surface-variant">
                Vault files shared securely with your ML-KEM-768 public key.
              </p>
              <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-6 text-center text-on-surface-variant">
                No files have been shared with your vault yet.
              </div>
            </div>
          ) : view === "file-requests" ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "28px" }}>
                  upload_file
                </span>
                <h1 className="font-headline text-headline-lg font-semibold">File Requests</h1>
              </div>
              <p className="font-body text-body-md text-on-surface-variant">
                Collect encrypted files securely from external clients or team members.
              </p>
              <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-6 text-center text-on-surface-variant">
                No active file requests.
              </div>
            </div>
          ) : (
            <AccountSettings user={user} />
          )}
        </main>
      </div>
    </div>
  )
}
