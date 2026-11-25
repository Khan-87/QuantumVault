export type FolderColor = "emerald" | "cyan" | "violet" | "amber" | "rose"

export interface Folder {
  id: string
  name: string
  color: FolderColor
  createdAt: string
  updatedAt: string
}

export interface ColorConfig {
  id: FolderColor
  label: string
  hex: string
  bg: string
  border: string
  text: string
  badge: string
  ring: string
  gradient: string
}

export const FOLDER_COLORS: Record<FolderColor, ColorConfig> = {
  emerald: {
    id: "emerald",
    label: "Emerald",
    hex: "#10b981",
    bg: "bg-emerald-500/10 hover:bg-emerald-500/15",
    border: "border-emerald-500/30 hover:border-emerald-500/50",
    text: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    ring: "ring-emerald-500",
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  cyan: {
    id: "cyan",
    label: "Cyber Cyan",
    hex: "#06b6d4",
    bg: "bg-cyan-500/10 hover:bg-cyan-500/15",
    border: "border-cyan-500/30 hover:border-cyan-500/50",
    text: "text-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    ring: "ring-cyan-500",
    gradient: "from-cyan-500/20 via-cyan-500/5 to-transparent",
  },
  violet: {
    id: "violet",
    label: "Neon Violet",
    hex: "#a855f7",
    bg: "bg-purple-500/10 hover:bg-purple-500/15",
    border: "border-purple-500/30 hover:border-purple-500/50",
    text: "text-purple-400",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    ring: "ring-purple-500",
    gradient: "from-purple-500/20 via-purple-500/5 to-transparent",
  },
  amber: {
    id: "amber",
    label: "Warm Amber",
    hex: "#f59e0b",
    bg: "bg-amber-500/10 hover:bg-amber-500/15",
    border: "border-amber-500/30 hover:border-amber-500/50",
    text: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    ring: "ring-amber-500",
    gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
  },
  rose: {
    id: "rose",
    label: "Crimson Rose",
    hex: "#f43f5e",
    bg: "bg-rose-500/10 hover:bg-rose-500/15",
    border: "border-rose-500/30 hover:border-rose-500/50",
    text: "text-rose-400",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    ring: "ring-rose-500",
    gradient: "from-rose-500/20 via-rose-500/5 to-transparent",
  },
}

export const COLOR_LIST: FolderColor[] = ["emerald", "cyan", "violet", "amber", "rose"]

function getFolderKey(email: string): string {
  return `qv_folders_${email.toLowerCase().trim()}`
}

function getMappingKey(email: string): string {
  return `qv_file_folder_map_${email.toLowerCase().trim()}`
}

export function loadFolders(email: string): Folder[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(getFolderKey(email))
    if (!raw) return []
    return JSON.parse(raw)
  } catch (e) {
    console.error("Failed to load folders from localStorage:", e)
    return []
  }
}

export function saveFolders(email: string, folders: Folder[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(getFolderKey(email), JSON.stringify(folders))
  } catch (e) {
    console.error("Failed to save folders to localStorage:", e)
  }
}

export function loadFileFolderMap(email: string): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(getMappingKey(email))
    if (!raw) return {}
    return JSON.parse(raw)
  } catch (e) {
    console.error("Failed to load file-folder map:", e)
    return {}
  }
}

export function saveFileFolderMap(email: string, map: Record<string, string>): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(getMappingKey(email), JSON.stringify(map))
  } catch (e) {
    console.error("Failed to save file-folder map:", e)
  }
}

export function createFolder(email: string, name: string, color: FolderColor): Folder {
  const folders = loadFolders(email)
  const newFolder: Folder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim(),
    color,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  folders.push(newFolder)
  saveFolders(email, folders)
  return newFolder
}

export function renameFolder(email: string, folderId: string, newName: string): Folder[] {
  const folders = loadFolders(email)
  const updated = folders.map((f) =>
    f.id === folderId ? { ...f, name: newName.trim(), updatedAt: new Date().toISOString() } : f
  )
  saveFolders(email, updated)
  return updated
}

export function changeFolderColor(email: string, folderId: string, newColor: FolderColor): Folder[] {
  const folders = loadFolders(email)
  const updated = folders.map((f) =>
    f.id === folderId ? { ...f, color: newColor, updatedAt: new Date().toISOString() } : f
  )
  saveFolders(email, updated)
  return updated
}

export function deleteFolder(email: string, folderId: string): Folder[] {
  const folders = loadFolders(email)
  const updated = folders.filter((f) => f.id !== folderId)
  saveFolders(email, updated)

  // Unassign files that were in this folder
  const map = loadFileFolderMap(email)
  let changed = false
  for (const [fileId, assignedFolderId] of Object.entries(map)) {
    if (assignedFolderId === folderId) {
      delete map[fileId]
      changed = true
    }
  }
  if (changed) saveFileFolderMap(email, map)

  return updated
}

export function assignFileToFolder(email: string, fileId: string, folderId: string | null): Record<string, string> {
  const map = loadFileFolderMap(email)
  if (folderId) {
    map[fileId] = folderId
  } else {
    delete map[fileId]
  }
  saveFileFolderMap(email, map)
  return { ...map }
}

export function assignBatchFilesToFolder(email: string, fileIds: string[], folderId: string | null): Record<string, string> {
  const map = loadFileFolderMap(email)
  for (const fileId of fileIds) {
    if (folderId) {
      map[fileId] = folderId
    } else {
      delete map[fileId]
    }
  }
  saveFileFolderMap(email, map)
  return { ...map }
}
