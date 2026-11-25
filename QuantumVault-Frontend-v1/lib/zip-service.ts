import JSZip from "jszip"
import { getDecryptedFileBuffer } from "./api"
import { type VaultFile } from "./mock-data"

export type ZipProgressCallback = (percent: number, message: string) => void

export async function downloadFolderAsZip({
  folderName,
  files,
  token,
  kyberPrivateKey,
  ownerId,
  vaultKey,
  onProgress,
}: {
  folderName: string
  files: VaultFile[]
  token: string
  kyberPrivateKey: Uint8Array
  ownerId: string
  vaultKey?: CryptoKey
  onProgress?: ZipProgressCallback
}): Promise<void> {
  if (files.length === 0) {
    throw new Error("Folder is empty. Add files before downloading.")
  }

  const zip = new JSZip()
  const usedNames = new Set<string>()

  function sanitizeFileName(original: string): string {
    let name = original.replace(/[/\\]/g, "_")
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }

    const dotIndex = name.lastIndexOf(".")
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name
    const ext = dotIndex > 0 ? name.slice(dotIndex) : ""

    let counter = 1
    let candidate = `${base} (${counter})${ext}`
    while (usedNames.has(candidate)) {
      counter++
      candidate = `${base} (${counter})${ext}`
    }
    usedNames.add(candidate)
    return candidate
  }

  // Decrypt each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const stepPercent = Math.round(((i + 1) / files.length) * 75)
    if (onProgress) {
      onProgress(stepPercent, `Decrypting ${file.name} (${i + 1}/${files.length})...`)
    }

    try {
      const { data, fileName } = await getDecryptedFileBuffer(
        token,
        file.id,
        file.name,
        kyberPrivateKey,
        ownerId,
        vaultKey
      )

      const finalName = sanitizeFileName(fileName || file.name)
      zip.file(finalName, data)
    } catch (err) {
      console.error(`Failed to decrypt ${file.name}, adding placeholder`, err)
      const fallbackName = sanitizeFileName(file.name)
      zip.file(
        fallbackName,
        `QuantumVault Protected File: ${file.name}\nSize: ${file.size} bytes\nCreated: ${file.uploadedAt}`
      )
    }
  }

  if (onProgress) {
    onProgress(85, "Compressing folder archive...")
  }

  // Generate ZIP blob
  const zipBlob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        const compPercent = 85 + Math.round((metadata.percent / 100) * 14)
        onProgress(Math.min(99, compPercent), `Packaging ZIP (${Math.round(metadata.percent)}%)...`)
      }
    }
  )

  if (onProgress) {
    onProgress(100, "Download starting...")
  }

  // Trigger browser download
  const safeTitle = folderName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_") || "Folder"
  const downloadUrl = URL.createObjectURL(zipBlob)
  const a = document.createElement("a")
  a.href = downloadUrl
  a.download = `${safeTitle}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(downloadUrl)
}
