import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  File,
  type LucideIcon,
} from "lucide-react"
import type { FileType } from "@/lib/mock-data"

const map: Record<FileType, LucideIcon> = {
  document: FileText,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  code: FileCode,
  other: File,
}

export function getFileIcon(type: FileType): LucideIcon {
  return map[type] ?? File
}
