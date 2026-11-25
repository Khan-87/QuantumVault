import { describe, it, expect, beforeEach } from "vitest"
import {
  createFolder,
  renameFolder,
  changeFolderColor,
  deleteFolder,
  loadFolders,
  assignFileToFolder,
  loadFileFolderMap,
  FOLDER_COLORS,
} from "./folder-store"

describe("folder-store", () => {
  const testEmail = "tester@quantumvault.io"
  const storageMap = new Map<string, string>()

  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  }

  beforeEach(() => {
    storageMap.clear()
    ;(globalThis as any).window = globalThis
    ;(globalThis as any).localStorage = mockLocalStorage
  })

  it("creates and loads folders", () => {
    const folder = createFolder(testEmail, "Research", "cyan")
    expect(folder.id).toBeDefined()
    expect(folder.name).toBe("Research")
    expect(folder.color).toBe("cyan")

    const all = loadFolders(testEmail)
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe("Research")
  })

  it("supports all 5 color options", () => {
    expect(Object.keys(FOLDER_COLORS)).toEqual(["emerald", "cyan", "violet", "amber", "rose"])
    const f1 = createFolder(testEmail, "F1", "emerald")
    const f2 = createFolder(testEmail, "F2", "amber")
    const f3 = createFolder(testEmail, "F3", "rose")
    const f4 = createFolder(testEmail, "F4", "violet")

    expect(f1.color).toBe("emerald")
    expect(f2.color).toBe("amber")
    expect(f3.color).toBe("rose")
    expect(f4.color).toBe("violet")
  })

  it("renames a folder", () => {
    const folder = createFolder(testEmail, "Old Name", "emerald")
    const updated = renameFolder(testEmail, folder.id, "New Name")
    expect(updated.find((f) => f.id === folder.id)?.name).toBe("New Name")
  })

  it("changes folder color", () => {
    const folder = createFolder(testEmail, "My Vault", "emerald")
    const updated = changeFolderColor(testEmail, folder.id, "rose")
    expect(updated.find((f) => f.id === folder.id)?.color).toBe("rose")
  })

  it("assigns files to folder and unassigns on delete", () => {
    const folder = createFolder(testEmail, "Docs", "cyan")
    assignFileToFolder(testEmail, "file-123", folder.id)

    let map = loadFileFolderMap(testEmail)
    expect(map["file-123"]).toBe(folder.id)

    deleteFolder(testEmail, folder.id)
    map = loadFileFolderMap(testEmail)
    expect(map["file-123"]).toBeUndefined()
  })
})
