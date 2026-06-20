"use client"

import { Search, Menu } from "lucide-react"
import type { FileType } from "@/lib/mock-data"

export type SortKey = "name" | "size" | "date"
export type FilterKey = "all" | FileType

const filters: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "document", label: "Documents" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "archive", label: "Archives" },
  { value: "code", label: "Code" },
]

const sorts: { value: SortKey; label: string }[] = [
  { value: "date", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
]

const selectClass =
  "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"

export function Topbar({
  search,
  onSearch,
  filter,
  onFilter,
  sort,
  onSort,
  onMenu,
}: {
  search: string
  onSearch: (v: string) => void
  filter: FilterKey
  onFilter: (v: FilterKey) => void
  sort: SortKey
  onSort: (v: SortKey) => void
  onMenu: () => void
}) {
  return (
    <header className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-6">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <div className="relative flex-1 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search files…"
          className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Search files"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value as FilterKey)}
          className={`${selectClass} hidden sm:block`}
          aria-label="Filter by type"
        >
          {filters.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className={selectClass}
          aria-label="Sort files"
        >
          {sorts.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}
