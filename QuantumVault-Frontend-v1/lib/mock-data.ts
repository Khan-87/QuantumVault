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

export const mockUser: VaultUser = {
  name: "Alex Mercer",
  email: "alex.mercer@quantumvault.io",
  plan: "Pro",
  memberSince: "2024-03-12",
}

export const STORAGE_LIMIT = 100 * 1024 * 1024 * 1024 // 100 GB

export const mockFiles: VaultFile[] = [
  {
    id: "f1",
    name: "Q4-financial-report.pdf",
    type: "document",
    size: 4_823_104,
    uploadedAt: "2026-06-14T09:24:00Z",
    status: "synced",
  },
  {
    id: "f2",
    name: "product-launch-keynote.mp4",
    type: "video",
    size: 1_284_310_528,
    uploadedAt: "2026-06-13T16:02:00Z",
    status: "synced",
  },
  {
    id: "f3",
    name: "brand-guidelines.fig",
    type: "document",
    size: 18_204_672,
    uploadedAt: "2026-06-12T11:48:00Z",
    status: "synced",
  },
  {
    id: "f4",
    name: "hero-banner-final.png",
    type: "image",
    size: 7_602_176,
    uploadedAt: "2026-06-11T14:31:00Z",
    status: "processing",
  },
  {
    id: "f5",
    name: "api-architecture.ts",
    type: "code",
    size: 42_118,
    uploadedAt: "2026-06-10T08:05:00Z",
    status: "synced",
  },
  {
    id: "f6",
    name: "onboarding-podcast-ep12.mp3",
    type: "audio",
    size: 96_337_920,
    uploadedAt: "2026-06-09T19:17:00Z",
    status: "synced",
  },
  {
    id: "f7",
    name: "design-assets-archive.zip",
    type: "archive",
    size: 524_288_000,
    uploadedAt: "2026-06-08T13:42:00Z",
    status: "synced",
  },
  {
    id: "f8",
    name: "user-research-notes.docx",
    type: "document",
    size: 1_204_224,
    uploadedAt: "2026-06-07T10:09:00Z",
    status: "synced",
  },
  {
    id: "f9",
    name: "team-offsite-photos.zip",
    type: "archive",
    size: 312_557_568,
    uploadedAt: "2026-06-05T17:55:00Z",
    status: "synced",
  },
  {
    id: "f10",
    name: "marketing-budget.xlsx",
    type: "document",
    size: 884_736,
    uploadedAt: "2026-06-03T12:20:00Z",
    status: "synced",
  },
]

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
