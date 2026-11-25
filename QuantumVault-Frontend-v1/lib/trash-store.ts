import { type FileType } from "@/lib/mock-data"

export interface TrashItem {
  id: string
  name: string
  type: FileType
  size: number
  uploadedAt: string
  deletedAt: string
  originalFolderId?: string | null
  iv?: string
}

function getTrashKey(email: string): string {
  return `qv_trash_${email.toLowerCase().trim()}`
}

export function loadTrash(email: string): TrashItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(getTrashKey(email))
    if (!raw) return []
    return JSON.parse(raw)
  } catch (e) {
    console.error("Failed to load trash from localStorage:", e)
    return []
  }
}

export function saveTrash(email: string, items: TrashItem[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(getTrashKey(email), JSON.stringify(items))
  } catch (e) {
    console.error("Failed to save trash to localStorage:", e)
  }
}

export function addToTrash(email: string, item: Omit<TrashItem, "deletedAt">): TrashItem[] {
  const current = loadTrash(email)
  const newItem: TrashItem = {
    ...item,
    deletedAt: new Date().toISOString(),
  }
  // Avoid duplicate entries
  const filtered = current.filter((t) => t.id !== item.id)
  const updated = [newItem, ...filtered]
  saveTrash(email, updated)
  return updated
}

export function removeFromTrash(email: string, id: string): TrashItem[] {
  const current = loadTrash(email)
  const updated = current.filter((t) => t.id !== id)
  saveTrash(email, updated)
  return updated
}

export function emptyTrash(email: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(getTrashKey(email))
  } catch (e) {
    console.error("Failed to empty trash:", e)
  }
}
