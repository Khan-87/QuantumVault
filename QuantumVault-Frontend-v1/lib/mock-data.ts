export type FileStatus = "synced" | "uploading" | "processing"

export type FileType = "document" | "image" | "video" | "audio" | "archive" | "code" | "other"

export interface VaultFile {
  id: string
  name: string
  type: FileType
  size: number // bytes
  uploadedAt: string // ISO date
  status: FileStatus
}

export interface VaultUser {
  name: string
  email: string
  plan: string
  memberSince: string
}

export const STORAGE_LIMIT = 5 * 1024 * 1024 * 1024 // 5 GB

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
