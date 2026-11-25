"use client"

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { formatBytes, type VaultFile } from "@/lib/mock-data"
import {
  type Folder,
  loadFolders,
  loadFileFolderMap,
  createFolder,
  renameFolder,
  deleteFolder,
  assignFileToFolder,
} from "@/lib/folder-store"

interface FileTableProps {
  files: (VaultFile & { iv?: string })[]
  searchQuery: string
  userEmail: string
  loading: boolean
  onDownloadFile: (id: string) => Promise<void>
  onDeleteFile: (id: string) => Promise<void>
  onRenameFile: (id: string, newName: string) => void
  onRefresh: () => void
}

export function FileTable({
  files,
  searchQuery,
  userEmail,
  loading,
  onDownloadFile,
  onDeleteFile,
  onRenameFile,
  onRefresh,
}: FileTableProps) {
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // Dialog States
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; isFolder: boolean } | null>(null)
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [moveTarget, setMoveTarget] = useState<{ fileId: string; fileName: string } | null>(null)

  // Folders and mapping from store
  const folders = useMemo(() => loadFolders(userEmail), [userEmail, currentFolderId, newFolderModalOpen])
  const fileFolderMap = useMemo(() => loadFileFolderMap(userEmail), [userEmail, currentFolderId, moveTarget])

  const currentFolder = folders.find((f) => f.id === currentFolderId)

  // Visible files in current view
  const visibleFiles = useMemo(() => {
    let result = files

    // Filter by folder if not searching
    if (!searchQuery) {
      if (currentFolderId) {
        result = result.filter((f) => fileFolderMap[f.id] === currentFolderId)
      } else {
        result = result.filter((f) => !fileFolderMap[f.id])
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((f) => f.name.toLowerCase().includes(q))
    }

    return result
  }, [files, currentFolderId, fileFolderMap, searchQuery])

  // Visible folders (only at root when not searching)
  const visibleFolders = useMemo(() => {
    if (searchQuery.trim() || currentFolderId) return []
    return folders
  }, [folders, currentFolderId, searchQuery])

  function getFileBadge(name: string) {
    const ext = name.split(".").pop()?.toUpperCase() ?? "FILE"
    if (["JPG", "JPEG", "PNG", "WEBP", "GIF", "SVG"].includes(ext)) {
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

  function handleCreateFolderSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    createFolder(userEmail, newFolderName.trim(), "cyan")
    setNewFolderName("")
    setNewFolderModalOpen(false)
    onRefresh()
  }

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!renameTarget || !renameTarget.name.trim()) return

    if (renameTarget.isFolder) {
      renameFolder(userEmail, renameTarget.id, renameTarget.name.trim())
    } else {
      onRenameFile(renameTarget.id, renameTarget.name.trim())
    }
    setRenameTarget(null)
    onRefresh()
  }

  const ownerName = userEmail ? userEmail.split("@")[0] : "Me"

  return (
    <section aria-labelledby="suggested-files-heading" className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {currentFolderId ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentFolderId(null)}
                className="inline-flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-body-md"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                  arrow_back
                </span>
                <span>All Files</span>
              </button>
              <span className="text-outline-variant">/</span>
              <h2 className="font-headline text-headline-md text-on-surface font-semibold truncate">
                {currentFolder?.name ?? "Folder"}
              </h2>
            </div>
          ) : (
            <h2 id="suggested-files-heading" className="font-headline text-headline-md text-on-surface font-semibold">
              {searchQuery ? `Search Results for "${searchQuery}"` : "Suggested Files"}
            </h2>
          )}
        </div>

        {/* View Toggle & Folder Actions */}
        <div className="flex items-center gap-2">
          {!currentFolderId && (
            <button
              type="button"
              onClick={() => setNewFolderModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container text-body-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: "16px" }}>
                create_new_folder
              </span>
              <span>New Folder</span>
            </button>
          )}

          <div className="inline-flex items-center rounded border border-outline-variant bg-surface-container-low p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-sm transition-colors",
                viewMode === "list"
                  ? "bg-primary-container text-secondary font-medium"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              {viewMode === "list" && <span className="w-1.5 h-1.5 rounded-full bg-secondary" />}
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }} aria-hidden="true">
                format_list_bulleted
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={cn(
                "inline-flex items-center px-2 py-1 rounded-sm transition-colors",
                viewMode === "grid"
                  ? "bg-primary-container text-secondary font-medium"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              {viewMode === "grid" && <span className="w-1.5 h-1.5 rounded-full bg-secondary mr-1" />}
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }} aria-hidden="true">
                grid_view
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="w-full h-48 rounded-lg border border-outline-variant bg-surface-container-low flex flex-col items-center justify-center gap-2 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-secondary" style={{ fontSize: "28px" }}>
            progress_activity
          </span>
          <span className="font-body text-body-sm">Loading secure files...</span>
        </div>
      ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
        <div className="w-full h-48 rounded-lg border border-outline-variant bg-surface-container-low flex flex-col items-center justify-center gap-2 text-on-surface-variant">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: "36px" }}>
            folder_off
          </span>
          <span className="font-body text-body-md text-on-surface">No files or folders found</span>
          <span className="font-body text-body-sm">Upload files or drag them above to get started</span>
        </div>
      ) : viewMode === "list" ? (
        /* TABLE LIST VIEW */
        <div className="w-full overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-low">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant bg-surface-container select-none">
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  Name
                </th>
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  Owner
                </th>
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: "16px" }} aria-hidden="true">
                      arrow_drop_down
                    </span>
                    <span>Date Added</span>
                  </div>
                </th>
                <th scope="col" className="py-3 px-4 font-label text-label-md">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "15px" }} aria-hidden="true">
                      swap_vert
                    </span>
                    <span>File Size</span>
                  </div>
                </th>
                <th scope="col" className="py-3 px-3 w-10 text-right">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "18px" }}>
                    more_vert
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {/* Folders */}
              {visibleFolders.map((folder) => {
                const isSelected = selectedId === folder.id
                return (
                  <tr
                    key={folder.id}
                    onClick={() => setSelectedId(folder.id)}
                    onDoubleClick={() => setCurrentFolderId(folder.id)}
                    className={cn(
                      "transition-colors duration-150 cursor-pointer select-none",
                      isSelected
                        ? "bg-primary-container/35 hover:bg-primary-container/50"
                        : "hover:bg-surface-container"
                    )}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="material-symbols-outlined text-secondary shrink-0"
                          style={{ fontSize: "20px", fontVariationSettings: "'FILL' 1" }}
                          aria-hidden="true"
                        >
                          folder
                        </span>
                        <span className="font-body text-body-md text-on-surface font-medium hover:underline">
                          {folder.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-xs font-medium text-secondary">
                          {ownerName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-body text-body-md text-on-surface-variant">Me</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 tabular-nums">
                      <span className="font-body text-body-md text-on-surface-variant">
                        {new Date(folder.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 tabular-nums">
                      <span className="font-mono text-mono-sm text-on-surface-variant">—</span>
                    </td>
                    <td className="py-2.5 px-3 text-right relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMenuId(activeMenuId === folder.id ? null : folder.id)
                        }}
                        aria-label="Folder options"
                        className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                          more_vert
                        </span>
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuId === folder.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setActiveMenuId(null)} />
                          <div className="absolute right-3 top-full mt-1 w-44 rounded-lg border border-outline-variant bg-surface-container-high shadow-xl p-1 z-40 text-left flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                setCurrentFolderId(folder.id)
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-body-sm text-on-surface hover:bg-surface-container"
                            >
                              <span className="material-symbols-outlined text-secondary" style={{ fontSize: "16px" }}>
                                folder_open
                              </span>
                              Open Folder
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                setRenameTarget({ id: folder.id, name: folder.name, isFolder: true })
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-body-sm text-on-surface hover:bg-surface-container"
                            >
                              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "16px" }}>
                                edit
                              </span>
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                deleteFolder(userEmail, folder.id)
                                onRefresh()
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-body-sm text-error hover:bg-error-container/30"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                delete
                              </span>
                              Delete Folder
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Files */}
              {visibleFiles.map((file) => {
                const isSelected = selectedId === file.id
                return (
                  <tr
                    key={file.id}
                    onClick={() => setSelectedId(file.id)}
                    className={cn(
                      "transition-colors duration-150 cursor-pointer select-none",
                      isSelected
                        ? "bg-primary-container/35 hover:bg-primary-container/50"
                        : "hover:bg-surface-container"
                    )}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-3">
                        {getFileBadge(file.name)}
                        <span className="font-body text-body-md text-on-surface truncate max-w-xs md:max-w-md">
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-xs font-medium text-secondary">
                          {ownerName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-body text-body-md text-on-surface-variant">Me</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 tabular-nums">
                      <span className="font-body text-body-md text-on-surface-variant">
                        {new Date(file.uploadedAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 tabular-nums">
                      <span className="font-mono text-mono-sm text-on-surface-variant">
                        {formatBytes(file.size)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMenuId(activeMenuId === file.id ? null : file.id)
                        }}
                        aria-label="File options"
                        className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                          more_vert
                        </span>
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuId === file.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setActiveMenuId(null)} />
                          <div className="absolute right-3 top-full mt-1 w-48 rounded-lg border border-outline-variant bg-surface-container-high shadow-xl p-1 z-40 text-left flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                onDownloadFile(file.id)
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-body-sm text-on-surface hover:bg-surface-container"
                            >
                              <span className="material-symbols-outlined text-secondary" style={{ fontSize: "16px" }}>
                                download
                              </span>
                              Download & Decrypt
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                setRenameTarget({ id: file.id, name: file.name, isFolder: false })
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-body-sm text-on-surface hover:bg-surface-container"
                            >
                              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "16px" }}>
                                edit
                              </span>
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                setMoveTarget({ fileId: file.id, fileName: file.name })
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-body-sm text-on-surface hover:bg-surface-container"
                            >
                              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "16px" }}>
                                drive_file_move
                              </span>
                              Move to Folder
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                onDeleteFile(file.id)
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-body-sm text-error hover:bg-error-container/30"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                delete
                              </span>
                              Delete File
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {/* Folders in Grid */}
          {visibleFolders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => setSelectedId(folder.id)}
              onDoubleClick={() => setCurrentFolderId(folder.id)}
              className={cn(
                "rounded-lg border border-outline-variant bg-surface-container-low p-4 flex flex-col gap-3 cursor-pointer transition-colors duration-150",
                selectedId === folder.id
                  ? "border-secondary bg-primary-container/30"
                  : "hover:bg-surface-container hover:border-outline"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className="material-symbols-outlined text-secondary"
                  style={{ fontSize: "28px", fontVariationSettings: "'FILL' 1" }}
                >
                  folder
                </span>
                <span className="text-on-surface-variant text-body-sm">Folder</span>
              </div>
              <span className="font-body text-body-md text-on-surface font-medium truncate">
                {folder.name}
              </span>
            </div>
          ))}

          {/* Files in Grid */}
          {visibleFiles.map((file) => (
            <div
              key={file.id}
              onClick={() => setSelectedId(file.id)}
              className={cn(
                "rounded-lg border border-outline-variant bg-surface-container-low p-4 flex flex-col justify-between gap-3 cursor-pointer transition-colors duration-150",
                selectedId === file.id
                  ? "border-secondary bg-primary-container/30"
                  : "hover:bg-surface-container hover:border-outline"
              )}
            >
              <div className="flex items-center justify-between">
                {getFileBadge(file.name)}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDownloadFile(file.id)
                  }}
                  title="Download & Decrypt"
                  className="text-on-surface-variant hover:text-secondary p-1 rounded"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    download
                  </span>
                </button>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-body text-body-md text-on-surface font-medium truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="font-mono text-mono-sm text-on-surface-variant">
                  {formatBytes(file.size)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Create New Folder */}
      {newFolderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setNewFolderModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline text-headline-md text-on-surface font-semibold mb-2">
              Create New Folder
            </h3>
            <form onSubmit={handleCreateFolderSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Folder name"
                required
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded border border-outline-variant bg-surface-container text-on-surface text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewFolderModalOpen(false)}
                  className="px-4 py-2 rounded text-on-surface-variant hover:text-on-surface font-label text-label-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-primary hover:bg-secondary text-on-primary font-label text-label-md font-medium"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Rename */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setRenameTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline text-headline-md text-on-surface font-semibold mb-2">
              Rename {renameTarget.isFolder ? "Folder" : "File"}
            </h3>
            <form onSubmit={handleRenameSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                required
                autoFocus
                value={renameTarget.name}
                onChange={(e) => setRenameTarget({ ...renameTarget, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded border border-outline-variant bg-surface-container text-on-surface text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-4 py-2 rounded text-on-surface-variant hover:text-on-surface font-label text-label-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-primary hover:bg-secondary text-on-primary font-label text-label-md font-medium"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Move to Folder */}
      {moveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setMoveTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline text-headline-md text-on-surface font-semibold mb-2">
              Move &ldquo;{moveTarget.fileName}&rdquo;
            </h3>
            <p className="font-body text-body-sm text-on-surface-variant mb-4">
              Choose a folder to place this file in:
            </p>
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto mb-4">
              <button
                type="button"
                onClick={() => {
                  assignFileToFolder(userEmail, moveTarget.fileId, null)
                  setMoveTarget(null)
                  onRefresh()
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-left hover:bg-surface-container font-label text-label-md text-on-surface"
              >
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "18px" }}>
                  home
                </span>
                Root / All Files
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    assignFileToFolder(userEmail, moveTarget.fileId, f.id)
                    setMoveTarget(null)
                    onRefresh()
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded text-left hover:bg-surface-container font-label text-label-md text-on-surface"
                >
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: "18px" }}>
                    folder
                  </span>
                  {f.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="px-4 py-2 rounded text-on-surface-variant hover:text-on-surface font-label text-label-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
