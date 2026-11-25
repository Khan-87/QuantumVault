"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { Sidebar, type NavView } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { QuickActions } from "@/components/quick-actions"
import { UploadArea } from "@/components/upload-area"
import { FileTable } from "@/components/file-table"
import { AccountSettings } from "@/components/account-settings"
import { type VaultFile, type FileType, formatBytes } from "@/lib/mock-data"
import { fetchUserFiles, uploadEncryptedFile, downloadEncryptedFile, deleteFile, type FileRecord } from "@/lib/api"
import { deriveDeterministicUUID } from "@/lib/crypto"
import { type UserSession } from "@/app/page"
import { createFolder } from "@/lib/folder-store"

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
  const [deletedFiles, setDeletedFiles] = useState<(VaultFile & { iv: string })[]>([])
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

  // Fetch files from DynamoDB on mount
  useEffect(() => {
    async function loadFiles() {
      try {
        setLoading(true)
        const records = await fetchUserFiles(session.token)
        setFiles(records.map(mapRecordToFile))
      } catch (error) {
        console.error("Failed to load files:", error)
      } finally {
        setLoading(false)
      }
    }
    loadFiles()
  }, [session.token])

  const used = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

  async function handleRefresh() {
    try {
      const records = await fetchUserFiles(session.token)
      setFiles(records.map(mapRecordToFile))
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

  async function handleDelete(id: string) {
    const fileToDelete = files.find((f) => f.id === id)
    try {
      await deleteFile(session.token, id)
      if (fileToDelete) {
        setDeletedFiles((prev) => [fileToDelete, ...prev])
      }
      setFiles((prev) => prev.filter((f) => f.id !== id))
      showToast("File deleted successfully.")
    } catch (error) {
      console.error("Delete failed:", error)
      showToast("Failed to delete file.")
    }
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
          {view === "all-files" || view === "dashboard" ? (
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
          ) : view === "deleted-files" ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-error" style={{ fontSize: "28px" }}>
                    delete
                  </span>
                  <h1 className="font-headline text-headline-lg font-semibold">Deleted Files</h1>
                </div>
                {deletedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDeletedFiles([])}
                    className="px-3 py-1.5 rounded text-body-sm text-error border border-error/30 hover:bg-error-container/30"
                  >
                    Empty Trash
                  </button>
                )}
              </div>
              <p className="font-body text-body-md text-on-surface-variant">
                Items deleted from your vault.
              </p>
              {deletedFiles.length === 0 ? (
                <div className="rounded-lg border border-outline-variant/60 bg-surface-container p-6 text-center text-on-surface-variant">
                  Trash is empty.
                </div>
              ) : (
                <div className="w-full overflow-x-auto rounded-lg border border-outline-variant bg-surface-container">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant text-on-surface-variant text-body-sm">
                        <th className="py-2.5 px-4">Name</th>
                        <th className="py-2.5 px-4">Size</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/60">
                      {deletedFiles.map((file) => (
                        <tr key={file.id} className="text-body-md text-on-surface">
                          <td className="py-2.5 px-4">{file.name}</td>
                          <td className="py-2.5 px-4 font-mono text-mono-sm">{formatBytes(file.size)}</td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setFiles((prev) => [file, ...prev])
                                setDeletedFiles((prev) => prev.filter((f) => f.id !== file.id))
                                showToast(`Restored "${file.name}"`)
                              }}
                              className="text-secondary hover:underline text-body-sm"
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <AccountSettings user={user} />
          )}
        </main>
      </div>
    </div>
  )
}
