import { useState } from "react"
import { ThinkingOrb } from "thinking-orbs"

import { MetricChart, type ChartSeries } from "@/components/MetricChart"
import { MetricPicker } from "@/components/MetricPicker"
import { useCachedLoads } from "@/hooks/useRunMetrics"
import { api } from "@/lib/api"
import type { Configuration } from "@/lib/configurations"
import { useI18n } from "@/lib/i18n"

// Eine Episode hat selten mehr als ein paar tausend Zeitschritte; 1.000 Punkte reichen für jede Bildschirmbreite
const MAX_POINTS = 1000

/**
 * Verlauf einer Test-Episode: ein Signal (z. B. Winkel oder Stellgröße u_0) über die simulierte Zeit.
 * Pro Konfiguration ein repräsentativer Seed, damit man sieht, wie ruhig oder unruhig ein Controller regelt.
 */
export function TracePanel({ configurations, colors }: { configurations: Configuration[]; colors: Map<string, string> }) {
  const { t, f } = useI18n()
  const withTrace = configurations.filter((c) => c.traceRun !== null)
  const signals = [...new Set(withTrace.flatMap((c) => c.traceRun!.signals))].sort()
  const [chosen, setChosen] = useState<string | null>(null)
  const signal = chosen !== null && signals.includes(chosen) ? chosen : (signals[0] ?? null)

  const shown = withTrace.filter((c) => signal !== null && c.traceRun!.signals.includes(signal))
  const entries = useCachedLoads(
    shown.map((c) => `${c.traceRun!.run.id}:${signal}`),
    (key) => {
      const [runId, name] = [Number(key.split(":")[0]), key.slice(key.indexOf(":") + 1)]
      return api.trace(runId, name, MAX_POINTS)
    },
  )
  const loading = entries.some((entry) => entry === undefined)

  const series: ChartSeries[] = shown.flatMap((configuration, index) => {
    const entry = entries[index]
    if (entry?.status !== "success" || entry.data.length === 0) return []
    return [
      {
        id: configuration.key,
        label: `${configuration.name} · ${t.seed} ${configuration.traceRun!.run.seed}`,
        color: colors.get(configuration.key) ?? "var(--chart-1)",
        kind: "line" as const,
        points: entry.data.map((point) => ({ x: point.t, y: point.value })),
      },
    ]
  })

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">{t.episodeTrace}</h2>
          <MetricPicker names={signals} value={signal} onChange={setChosen} />
          {loading && series.length > 0 && <ThinkingOrb state="breathing" size={20} theme="dark" aria-label={t.loadingTrace} />}
        </div>
        <span className="text-xs text-faint-foreground">{t.episodeTraceCaption}</span>
      </header>
      <div className="px-5 pt-4 pb-3">
        {series.length === 0 && loading ? (
          <div className="flex h-72 flex-col items-center justify-center gap-3">
            <ThinkingOrb state="composing" size={32} theme="dark" aria-label={t.loadingTrace} />
            <span className="font-mono text-xs text-faint-foreground">{t.loadingTrace}</span>
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">{t.noTraceForSelection}</div>
        ) : (
          <MetricChart series={series} height={288} formatX={f.duration} formatY={f.value} formatYTick={f.tick} />
        )}
        {series.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {series.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
