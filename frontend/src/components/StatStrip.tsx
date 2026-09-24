import type { CSSProperties } from "react"

export type Stat = {
  label: string
  value: string
  /** Zahlen in Monospace und größer, Text normal */
  numeric?: boolean
}

/** Leiste mit Kennzahlen, durch Haarlinien getrennt. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl
      className="grid grid-cols-2 divide-x rounded-lg border md:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      style={{ "--cols": stats.length } as CSSProperties}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-w-0 flex-col gap-1 px-5 py-4">
          <dt className="text-xs text-faint-foreground">{stat.label}</dt>
          <dd className={`truncate ${stat.numeric ? "font-mono text-lg tabular-nums" : "pt-1 text-sm"}`}>{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}
