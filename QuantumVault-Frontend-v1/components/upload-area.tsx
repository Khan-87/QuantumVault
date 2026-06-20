"use client"

import { useRef, useState } from "react"
import { UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadAreaProps {
  onUpload: (files: File[]) => void
  uploadFile?: (file: File, onProgress: (pct: number) => void) => Promise<any>
}

export function UploadArea({ onUpload, uploadFile }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [label, setLabel] = useState("")

  async function handleFiles(files: File[]) {
    if (files.length === 0) return

    if (!uploadFile) {
      // Fallback to simulation
      setLabel(files.length === 1 ? files[0].name : `${files.length} files`)
      setProgress(0)
      const start = Date.now()
      const interval = setInterval(() => {
        const elapsed = Date.now() - start
        const pct = Math.min(100, Math.round((elapsed / 1600) * 100))
        setProgress(pct)
        if (pct >= 100) {
          clearInterval(interval)
          onUpload(files)
          setTimeout(() => {
            setProgress(null)
            setLabel("")
          }, 600)
        }
      }, 120)
      return
    }

    // Real S3 Upload Pipeline
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setLabel(`Uploading ${file.name} (${i + 1}/${files.length})`)
        setProgress(0)

        // Upload to S3 with progress tracking
        await uploadFile(file, (pct) => {
          setProgress(Math.round(pct))
        })
      }

      // Trigger callback to refresh file list in dashboard
      onUpload(files)
    } catch (error) {
      console.error("Upload failed:", error)
      alert("Failed to upload file(s) to secure storage.")
    } finally {
      setProgress(null)
      setLabel("")
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:border-ring",
        )}
      >
        <div className="flex size-11 items-center justify-center rounded-lg bg-muted">
          <UploadCloud className="size-5 text-foreground" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm font-medium">Drag and drop files here</p>
        <p className="mt-1 text-xs text-muted-foreground">or click to browse from your device</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {progress !== null && (
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="truncate pr-3 font-medium">{label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
