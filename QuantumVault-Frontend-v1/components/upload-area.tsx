"use client"

import { useState, useRef } from "react"
import { cn } from "@/lib/utils"

interface UploadAreaProps {
  onUpload: () => void
  uploadFile: (file: File, onProgress: (pct: number) => void) => Promise<unknown>
  fileInputRef?: React.RefObject<HTMLInputElement | null>
}

interface UploadTask {
  name: string
  progress: number
  status: "encrypting" | "uploading" | "done" | "error"
}

export function UploadArea({ onUpload, uploadFile, fileInputRef }: UploadAreaProps) {
  const [dragging, setDragging] = useState(false)
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const internalInputRef = useRef<HTMLInputElement>(null)
  const actualInputRef = fileInputRef || internalInputRef

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)

    const initialTasks: UploadTask[] = files.map((f) => ({
      name: f.name,
      progress: 0,
      status: "encrypting",
    }))
    setTasks(initialTasks)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        setTasks((prev) =>
          prev.map((t, idx) => (idx === i ? { ...t, status: "encrypting", progress: 20 } : t))
        )

        await uploadFile(file, (pct) => {
          setTasks((prev) =>
            prev.map((t, idx) =>
              idx === i ? { ...t, status: "uploading", progress: Math.max(20, pct) } : t
            )
          )
        })

        setTasks((prev) =>
          prev.map((t, idx) => (idx === i ? { ...t, status: "done", progress: 100 } : t))
        )
      } catch (err) {
        console.error("Upload failed for", file.name, err)
        setTasks((prev) =>
          prev.map((t, idx) => (idx === i ? { ...t, status: "error", progress: 0 } : t))
        )
      }
    }

    onUpload()
    setTimeout(() => {
      setTasks([])
    }, 3000)
  }

  return (
    <section aria-label="Upload files" className="flex flex-col gap-3">
      <div
        id="dropzone-area"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => actualInputRef.current?.click()}
        className={cn(
          "w-full rounded-xl border border-dashed bg-surface-container-low transition-colors duration-150 py-10 px-6 flex flex-col items-center justify-center gap-3 cursor-pointer text-center select-none",
          dragging
            ? "border-secondary bg-surface-container"
            : "border-primary/80 hover:border-secondary hover:bg-surface-container"
        )}
      >
        <div className="w-11 h-11 rounded-md bg-surface-container-high border border-outline-variant flex items-center justify-center text-on-surface">
          <span className="material-symbols-outlined text-secondary" style={{ fontSize: "20px" }} aria-hidden="true">
            cloud_upload
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-title text-title-sm text-on-surface font-medium">
            Drag and drop files here
          </span>
          <span className="font-body text-body-sm text-on-surface-variant">
            or click to browse from your device (encrypted with ML-KEM-768)
          </span>
        </div>
        <input
          ref={actualInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {/* Active Upload Tasks Progress */}
      {tasks.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container p-3">
          {tasks.map((task, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-on-surface font-medium truncate max-w-[280px]">
                  {task.name}
                </span>
                <span className="text-on-surface-variant font-mono text-mono-sm">
                  {task.status === "encrypting"
                    ? "ML-KEM Encrypting..."
                    : task.status === "uploading"
                    ? `${task.progress}%`
                    : task.status === "done"
                    ? "Encrypted & Saved"
                    : "Failed"}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-200",
                    task.status === "error"
                      ? "bg-error"
                      : task.status === "done"
                      ? "bg-secondary"
                      : "bg-primary"
                  )}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
