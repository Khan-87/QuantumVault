"use client"

import { useState } from "react"

interface QuickActionsProps {
  onTriggerUpload: () => void
  onCreateFolder: () => void
  onActionNotice?: (msg: string) => void
}

export function QuickActions({
  onTriggerUpload,
  onCreateFolder,
  onActionNotice,
}: QuickActionsProps) {
  const [createMenuOpen, setCreateMenuOpen] = useState(false)

  function handleNotice(action: string) {
    if (onActionNotice) {
      onActionNotice(`${action} will be available in the next release!`)
    } else {
      alert(`${action} will be available in the next release!`)
    }
  }

  return (
    <section aria-label="Quick actions" className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 items-stretch">
      {/* 1. Create Tile (Primary Blue) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setCreateMenuOpen(!createMenuOpen)}
          className="w-full h-full rounded-lg bg-primary text-on-primary p-4 flex flex-col justify-between gap-5 hover:bg-secondary hover:text-on-secondary transition-colors duration-150 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary min-h-[100px]"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }} aria-hidden="true">
            add
          </span>
          <span className="font-label text-label-md font-medium">Create</span>
        </button>

        {/* Dropdown Menu for Create */}
        {createMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setCreateMenuOpen(false)}
            />
            <div className="absolute left-0 top-full mt-2 w-48 rounded-lg border border-outline-variant bg-surface-container-high shadow-xl p-1 z-40 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setCreateMenuOpen(false)
                  onTriggerUpload()
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-left font-label text-label-md text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "18px" }}>
                  upload_file
                </span>
                Upload File
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateMenuOpen(false)
                  onCreateFolder()
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-left font-label text-label-md text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "18px" }}>
                  create_new_folder
                </span>
                New Folder
              </button>
            </div>
          </>
        )}
      </div>

      {/* 2. Upload or Drop */}
      <button
        type="button"
        onClick={onTriggerUpload}
        className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low text-on-surface p-4 flex flex-col justify-between gap-5 hover:border-secondary hover:bg-surface-container transition-colors duration-150 text-left cursor-pointer min-h-[100px]"
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "20px" }} aria-hidden="true">
          upload
        </span>
        <span className="font-label text-label-md font-medium">Upload or Drop</span>
      </button>

      {/* 3. Create Folder */}
      <button
        type="button"
        onClick={onCreateFolder}
        className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low text-on-surface p-4 flex flex-col justify-between gap-5 hover:border-secondary hover:bg-surface-container transition-colors duration-150 text-left cursor-pointer min-h-[100px]"
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "20px" }} aria-hidden="true">
          create_new_folder
        </span>
        <span className="font-label text-label-md font-medium">Create Folder</span>
      </button>

      {/* 4. Edit PDF */}
      <button
        type="button"
        onClick={() => handleNotice("PDF Editor")}
        className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low text-on-surface p-4 flex flex-col justify-between gap-5 hover:border-secondary hover:bg-surface-container transition-colors duration-150 text-left cursor-pointer min-h-[100px]"
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "20px" }} aria-hidden="true">
          edit
        </span>
        <span className="font-label text-label-md font-medium">Edit PDF</span>
      </button>

      {/* 5. Get Signatures */}
      <button
        type="button"
        onClick={() => handleNotice("Signature Request")}
        className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low text-on-surface p-4 flex flex-col justify-between gap-5 hover:border-secondary hover:bg-surface-container transition-colors duration-150 text-left cursor-pointer min-h-[100px]"
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "20px" }} aria-hidden="true">
          draw
        </span>
        <span className="font-label text-label-md font-medium">Get Signatures</span>
      </button>

      {/* 6. Sign Yourself */}
      <button
        type="button"
        onClick={() => handleNotice("Self-Signing Tool")}
        className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low text-on-surface p-4 flex flex-col justify-between gap-5 hover:border-secondary hover:bg-surface-container transition-colors duration-150 text-left cursor-pointer min-h-[100px]"
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "20px" }} aria-hidden="true">
          ink_pen
        </span>
        <span className="font-label text-label-md font-medium">Sign Yourself</span>
      </button>
    </section>
  )
}
