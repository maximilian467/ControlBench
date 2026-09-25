import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { useI18n } from "@/lib/i18n"
import { metricLabel, STANDARD_METRICS } from "@/lib/metrics"
import { cn } from "@/lib/utils"

type MetricPickerProps = {
  /** Alle Metriken, die die ausgewählten Runs haben */
  names: string[]
  value: string | null
  onChange: (name: string) => void
}

/**
 * Auswahl der angezeigten Metrik: oben die Standard-Metriken, darunter alle übrigen mit Suche.
 * Ein Experiment kann hunderte Metriken haben; die Standard-Metriken sind die, die man fast immer will.
 */
export function MetricPicker({ names, value, onChange }: MetricPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  const standard = STANDARD_METRICS.filter((name) => names.includes(name))
  const others = names.filter((name) => !STANDARD_METRICS.includes(name))
  const needle = query.trim().toLowerCase()
  const matches = others.filter((name) => name.toLowerCase().includes(needle))

  // Schließen bei Klick außerhalb
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function toggle() {
    setOpen((current) => !current)
    setQuery("")
    // Nach dem Öffnen direkt ins Suchfeld tippen können
    requestAnimationFrame(() => search.current?.focus())
  }

  function choose(name: string) {
    onChange(name)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") setOpen(false)
    // Enter im Suchfeld übernimmt den ersten Treffer
    if (event.key === "Enter" && event.target === search.current && matches.length) choose(matches[0])
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.metric}
        className="inline-flex h-7 max-w-72 items-center gap-2 rounded-md border border-input px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:border-ring"
      >
        <span className="truncate">{value === null ? t.metrics : metricLabel(value)}</span>
        <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 shrink-0 text-faint-foreground" aria-hidden>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-9 left-0 z-20 w-80 rounded-lg border bg-popover shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
          {standard.length > 0 && (
            <div className="border-b p-1">
              <p className="px-2 pt-1.5 pb-1 text-[11px] text-faint-foreground">{t.standardMetrics}</p>
              {standard.map((name) => (
                <Option key={name} selected={name === value} onClick={() => choose(name)}>
                  {metricLabel(name)}
                </Option>
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="p-1">
              <input
                ref={search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.searchMetrics(others.length)}
                aria-label={t.searchMetrics(others.length)}
                className="mb-1 h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-faint-foreground focus-visible:border-ring"
              />
              <div role="listbox" className="max-h-64 overflow-y-auto">
                {matches.map((name) => (
                  <Option key={name} selected={name === value} onClick={() => choose(name)} mono>
                    {name}
                  </Option>
                ))}
                {matches.length === 0 && <p className="px-2 py-2 text-xs text-faint-foreground">{t.noMetricsFound}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Option({
  selected,
  onClick,
  mono,
  children,
}: {
  selected: boolean
  onClick: () => void
  mono?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        mono ? "font-mono text-xs" : "text-sm",
        selected ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{children}</span>
      {selected && <span className="size-1.5 shrink-0 rounded-full bg-accent-signal" aria-hidden />}
    </button>
  )
}
