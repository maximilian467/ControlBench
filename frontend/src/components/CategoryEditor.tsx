import { useEffect, useRef, useState, type FormEvent } from "react"

import { useCategoryLabel } from "@/hooks/useCategoryLabel"
import { CATEGORY_KEYS } from "@/lib/categories"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Kategorie als kleines Etikett */
export function CategoryBadge({ category }: { category: string | null }) {
  const label = useCategoryLabel()
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-1.5 py-px text-xs",
        category === null ? "border-dashed text-faint-foreground" : "text-muted-foreground",
      )}
    >
      {label(category)}
    </span>
  )
}

type CategoryEditorProps = {
  category: string | null
  onSave: (category: string | null) => Promise<void>
}

/** Kategorie eines Experiments wählen: Vorschläge oder eine eigene, jederzeit änderbar */
export function CategoryEditor({ category, onSave }: CategoryEditorProps) {
  const { t } = useI18n()
  const label = useCategoryLabel()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState("")
  const [saving, setSaving] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  async function save(value: string | null) {
    setSaving(true)
    try {
      await onSave(value)
      setOpen(false)
      setCustom("")
    } finally {
      setSaving(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (custom.trim()) save(custom.trim())
  }

  return (
    <div ref={root} className="relative" onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.category}
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs transition-colors hover:bg-muted",
          category === null ? "border-dashed text-faint-foreground" : "text-muted-foreground",
        )}
      >
        {category === null ? t.setCategory : label(category)}
      </button>

      {open && (
        <div className="absolute top-8 left-0 z-20 w-72 rounded-lg border bg-popover p-1 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
          <div role="listbox">
            {CATEGORY_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={key === category}
                disabled={saving}
                onClick={() => save(key)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  key === category ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label(key)}
                {key === category && <span className="size-1.5 rounded-full bg-accent-signal" aria-hidden />}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-1 flex gap-1 border-t pt-2">
            <input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={t.customCategory}
              aria-label={t.customCategory}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-faint-foreground focus-visible:border-ring"
            />
            <button
              type="submit"
              disabled={saving || !custom.trim()}
              className="h-8 rounded-md border px-2.5 text-xs transition-colors hover:bg-muted disabled:opacity-40"
            >
              {t.save}
            </button>
          </form>
          {category !== null && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(null)}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-faint-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t.removeCategory}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
