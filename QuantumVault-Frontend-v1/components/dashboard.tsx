"use client"

import { useMemo, useState, useEffect } from "react"
import { Sidebar, type View } from "@/components/sidebar"
import { Topbar, type SortKey, type FilterKey } from "@/components/topbar"
import { FileList } from "@/components/file-list"
import { UploadArea } from "@/components/upload-area"
import { AccountSettings } from "@/components/account-settings"
import { type VaultFile, type FileType } from "@/lib/mock-data"
import { fetchUserFiles, uploadEncryptedFile, downloadEncryptedFile, type FileRecord } from "@/lib/api"
import { encryptFile, decryptFile, uint8ToBase64, base64ToUint8 } from "@/lib/crypto"
import { type UserSession } from "@/app/page"

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
    iv: record.iv,
  }
}

export function Dashboard({ session, onSignOut }: { session: UserSession; onSignOut: () => void }) {
  const [view, setView] = useState<View>("files")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [files, setFiles] = useState<(VaultFile & { iv: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterKey>("all")
  const [sort, setSort] = useState<SortKey>("date")

  const user = useMemo(
    () => ({
      name: session.email.split("@")[0],
      email: session.email,
      plan: "Pro",
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

  const visible = useMemo(() => {
    let list = files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    if (filter !== "all") list = list.filter((f) => f.type === filter)
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name)
      if (sort === "size") return b.size - a.size
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    })
  }, [files, search, filter, sort])

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
      await downloadEncryptedFile(
        session.token,
        file.id,
        file.name,
        file.iv,
        session.kyberPrivateKey,
        decryptFile,
        base64ToUint8
      )
    } catch (error) {
      console.error("Download failed:", error)
      alert("Failed to download and decrypt file.")
    }
  }

  function handleRename(id: string, name: string) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
  }

  function handleDelete(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        view={view}
        onChange={setView}
        used={used}
        onSignOut={onSignOut}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {view === "files" ? (
          <>
            <Topbar
              search={search}
              onSearch={setSearch}
              filter={filter}
              onFilter={setFilter}
              sort={sort}
              onSort={setSort}
              onMenu={() => setSidebarOpen(true)}
            />
            <main className="flex-1 overflow-auto px-4 py-6 md:px-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">My Files</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {loading
                      ? "Loading..."
                      : `${files.length} ${files.length === 1 ? "file" : "files"} stored`}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <UploadArea
                  onUpload={handleRefresh}
                  uploadFile={(file, onProgress) =>
                    uploadEncryptedFile(
                      session.token,
                      file,
                      session.kyberPublicKey,
                      encryptFile,
                      uint8ToBase64,
                      onProgress
                    )
                  }
                />
              </div>

              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Retrieving secure vault items...
                </div>
              ) : (
                <FileList
                  files={visible}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                />
              )}
            </main>
          </>
        ) : (
          <>
            <header className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-6">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                aria-label="Open menu"
              >
                <span className="sr-only">Open menu</span>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
                </svg>
              </button>
              <span className="text-sm font-medium text-muted-foreground">Settings</span>
            </header>
            <main className="flex-1 overflow-auto px-4 py-6 md:px-6">
              <AccountSettings user={user} />
            </main>
          </>
        )}
      </div>
    </div>
  )
}
