import { Fragment, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ThinkingOrb } from "thinking-orbs"

import { ErrorState } from "@/components/ErrorState"
import { HoldToDelete } from "@/components/HoldToDelete"
import { Loader } from "@/components/Loader"
import { LegendSymbol, MetricChart, type ChartSeries } from "@/components/MetricChart"
import { MetricPicker } from "@/components/MetricPicker"
import { RobustnessTable } from "@/components/RobustnessTable"
import { TracePanel } from "@/components/TracePanel"
import { Segmented } from "@/components/Segmented"
import { StatStrip } from "@/components/StatStrip"
import { useAsync } from "@/hooks/useAsync"
import { useMetricNames, useRunMetrics } from "@/hooks/useRunMetrics"
import { api, type Run, type RunSummary } from "@/lib/api"
import {
  aggregateCurves,
  aggregateReference,
  groupConfigurations,
  mean,
  type BandMode,
  type Configuration,
  type Stat,
} from "@/lib/configurations"
import type { Formatters } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import type { Messages } from "@/lib/messages"
import { isRateMetric, NOMINAL, STANDARD_METRICS, SUCCESS_THRESHOLD } from "@/lib/metrics"
import { robustnessMetrics } from "@/lib/robustness"
import { cn } from "@/lib/utils"

const MAX_SELECTED = 5
// Die beste Konfiguration bekommt die Akzentfarbe, alle anderen diese gedämpften Farben.
// chart-2 (Sand) steht am Ende, weil es dem Bernstein-Akzent zu ähnlich ist
const SERIES_COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"]

export function ExperimentPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { t } = useI18n()
  const result = useAsync(
    () => Promise.all([api.experiment(id), api.runs(id), api.summaries(id, SUCCESS_THRESHOLD)]),
    `experiment-${id}`,
  )

  if (result.status === "loading") return <Loader label={t.loadingExperiment} />
  if (result.status === "error") return <ErrorState error={result.error} onRetry={result.reload} />

  const [experiment, runs, summaries] = result.data

  async function deleteExperiment() {
    await api.deleteExperiment(id)
    navigate("/")
  }

  async function deleteRun(runId: number) {
    await api.deleteRun(runId)
    result.reload()
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link to="/" className="self-start text-xs text-faint-foreground transition-colors hover:text-foreground">
          ← {t.experiments}
        </Link>
        <header className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-2xl font-medium tracking-[-0.015em]">{experiment.name}</h1>
            <p className="font-mono text-[13px] text-muted-foreground">{experiment.environment}</p>
            {experiment.description && <p className="text-muted-foreground">{experiment.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {result.refreshing && <ThinkingOrb state="breathing" size={20} theme="dark" aria-label={t.refreshing} />}
            <HoldToDelete
              label={t.deleteExperiment}
              target={experiment.name}
              onConfirm={deleteExperiment}
              className="h-8 w-40"
            />
          </div>
        </header>
      </div>

      {runs.length === 0 ? (
        <section className="rounded-lg border border-dashed px-6 py-12 text-muted-foreground">
          {t.experimentHasNoRuns}
        </section>
      ) : (
        // key: Nach dem Löschen eines Runs bleibt die Auswahl erhalten, bei einem anderen Experiment nicht
        <ExperimentContent key={experiment.id} runs={runs} summaries={summaries} onDeleteRun={deleteRun} />
      )}
    </div>
  )
}

/** Alles, was Runs braucht. Eigene Komponente, damit die Auswahl mit den geladenen Runs starten kann. */
type ContentProps = { runs: Run[]; summaries: RunSummary[]; onDeleteRun: (runId: number) => Promise<void> }

function ExperimentContent({ runs, summaries, onDeleteRun }: ContentProps) {
  const { t, f } = useI18n()
  const configurations = groupConfigurations(runs, summaries)
  const best = configurations[0]

  // Start: alle Konfigurationen im Diagramm (höchstens MAX_SELECTED), denn der Vergleich ist der Sinn der Seite
  const [selected, setSelected] = useState<string[]>(() =>
    configurations.slice(0, MAX_SELECTED).map((configuration) => configuration.key),
  )
  // Konfigurationen, deren letzter Run gelöscht wurde, fallen automatisch aus der Auswahl
  const activeKeys = selected.filter((key) => configurations.some((c) => c.key === key))

  function toggle(key: string) {
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key].slice(-MAX_SELECTED),
    )
  }

  // Farbe pro Konfiguration: beste = Akzent, sonst nach Reihenfolge der Auswahl
  const colors = new Map<string, string>()
  activeKeys
    .filter((key) => key !== best.key)
    .forEach((key, index) => colors.set(key, SERIES_COLORS[index % SERIES_COLORS.length]))
  colors.set(best.key, "var(--accent-signal)")

  const stable = runs.filter((run) => run.stability_time !== null).length
  const durations = runs.flatMap((run) => (run.duration === null ? [] : [run.duration]))

  return (
    <>
      <StatStrip
        stats={[
          { label: t.configurations, value: f.integer(configurations.length), numeric: true },
          { label: t.runs, value: f.integer(runs.length), numeric: true },
          { label: t.controllers, value: [...new Set(runs.map((run) => run.controller))].join(" · ") },
          { label: t.stable, value: `${stable} / ${runs.length}`, numeric: true },
          {
            label: t.avgWallClock,
            value: durations.length ? f.seconds(mean(durations)) : "–",
            numeric: true,
          },
        ]}
      />

      <BestConfigurationCard configuration={best} alone={configurations.length === 1} />

      <MetricsPanel
        configurations={configurations.filter((c) => activeKeys.includes(c.key))}
        colors={colors}
      />

      <ConfigurationTable
        configurations={configurations}
        bestKey={best.key}
        selected={activeKeys}
        colors={colors}
        onToggle={toggle}
      />

      {/* Nur wenn ausgewählte Konfigurationen einen Episodenverlauf haben */}
      {configurations.some((c) => activeKeys.includes(c.key) && c.traceRun !== null) && (
        <TracePanel configurations={configurations.filter((c) => activeKeys.includes(c.key))} colors={colors} />
      )}

      {/* Nur wenn es Kennwerte aus Robustheitstests gibt */}
      {robustnessMetrics(configurations).length > 0 && <RobustnessTable configurations={configurations} />}

      <RunTable runs={runs} onDelete={onDeleteRun} />
    </>
  )
}

function formatMeanStd(configuration: Configuration, f: Formatters): string {
  const meanText = f.reward(configuration.rewardMean)
  return configuration.rewardStd === null ? meanText : `${meanText} ± ${f.reward(configuration.rewardStd)}`
}

/** "96 %" bzw. "96 % ± 3" für eine Success Rate über mehrere Seeds */
function formatSuccess(success: Stat | null, f: Formatters): string {
  if (success === null) return "–"
  // Streuung in Prozentpunkten, ganzzahlig: "96 % ± 3"
  return success.std === null
    ? f.percent(success.mean)
    : `${f.percent(success.mean)} ± ${f.integer(Math.round(success.std * 100))}`
}

/** "30k Steps · 4,2 min" bzw. "nie": wann die Seeds im Mittel die Schwelle erreicht haben */
function formatReach(configuration: Configuration, t: Messages, f: Formatters): string {
  // Ohne Training gibt es keinen Lernverlauf, also auch keinen Zeitpunkt, an dem die Schwelle erreicht wird
  if (!configuration.trains) return "–"
  if (configuration.stepsToThreshold === null) return configuration.success === null ? "–" : t.never
  const parts = [`${f.steps(configuration.stepsToThreshold)} ${t.stepsUnit}`]
  if (configuration.timeToThreshold !== null) parts.push(f.duration(configuration.timeToThreshold))
  return parts.join(" · ")
}

function formatStat(value: Stat | null, f: Formatters): string {
  if (value === null) return "–"
  return value.std === null ? f.value(value.mean) : `${f.value(value.mean)} ± ${f.value(value.std)}`
}

/** Hebt die Konfiguration hervor, die am zuverlässigsten funktioniert (siehe groupConfigurations). */
function BestConfigurationCard({ configuration, alone }: { configuration: Configuration; alone: boolean }) {
  const { t, f } = useI18n()
  const n = configuration.runs.length
  const facts = [
    ["Controller", configuration.controller],
    [t.seeds, String(n)],
    [t.reachesThreshold(f.percent(SUCCESS_THRESHOLD)), formatReach(configuration, t, f)],
    [t.controlEffort, formatStat(configuration.controlEffort, f)],
    [t.rewardMean, formatMeanStd(configuration, f)],
    [t.avgWallClock, f.seconds(configuration.durationMean)],
  ]

  return (
    <section className="flex flex-wrap items-center gap-x-12 gap-y-4 rounded-lg border bg-card px-5 py-4">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs text-accent-signal">
          <span className="size-1.5 rounded-full bg-accent-signal" />
          {alone ? t.configuration : t.bestConfiguration}
        </span>
        <span className="text-lg font-medium">{configuration.name}</span>
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {configuration.success === null
            ? `${t.rewardMean} ${formatMeanStd(configuration, f)}`
            : `${t.successRate} ${formatSuccess(configuration.success, f)}`}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-10 gap-y-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-xs text-faint-foreground">{label}</dt>
            <dd className="font-mono text-sm tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ---------- Diagramm ----------

type Axis = "steps" | "time"
type Budget = "full" | "equal"

function MetricsPanel({ configurations, colors }: { configurations: Configuration[]; colors: Map<string, string> }) {
  const { t, f } = useI18n()
  const runIds = configurations.flatMap((c) => c.runs.map((run) => run.id))
  const [metricName, setMetricName] = useState<string>(STANDARD_METRICS[0])
  const [axis, setAxis] = useState<Axis>("steps")
  const [band, setBand] = useState<BandMode>("range")
  const [budget, setBudget] = useState<Budget>("full")

  // Erst nur die Namen der Metriken, dann nur die angezeigte Metrik laden (ausgedünnt)
  const { names, loading: namesLoading } = useMetricNames(runIds)
  const fallback = STANDARD_METRICS.find((name) => names.includes(name)) ?? names[0] ?? null
  const activeName = names.includes(metricName) ? metricName : fallback
  const { byRun: metricsByRun, loading: metricsLoading } = useRunMetrics(runIds, activeName)
  const loading = namesLoading || metricsLoading
  const isRate = activeName !== null && isRateMetric(activeName)

  const series: ChartSeries[] = []
  const withoutData: string[] = []
  for (const configuration of configurations) {
    // Eine Kurve pro Seed ...
    const curves = configuration.runs.map((run) => {
      const entry = metricsByRun.get(run.id)
      if (entry?.status !== "success") return []
      return entry.data
        .filter((m) => axis === "steps" || m.time !== null)
        .map((m) => ({ x: axis === "steps" ? m.step : (m.time as number), y: m.value }))
        .sort((a, b) => a.x - b.x)
    })
    const base = { id: configuration.key, label: configuration.name, color: colors.get(configuration.key)! }

    // ... Controller ohne Training werden eine Referenzlinie über die volle Breite ...
    if (!configuration.trains) {
      const reference = aggregateReference(curves, band)
      if (reference) series.push({ ...base, kind: "reference", points: [reference] })
      else if (!loading) withoutData.push(configuration.name)
      continue
    }

    // ... gelernte Kurven werden gemittelt. Bleiben nur wenige Punkte, zeigen X-Marker das ehrlicher als eine Linie
    const points = aggregateCurves(curves, band)
    if (points.length) series.push({ ...base, kind: points.length <= 3 ? "markers" : "line", points })
    else if (!loading) withoutData.push(configuration.name)
  }

  // Gleiches Budget: dort abschneiden, wo die kürzeste gelernte Kurve endet
  const lines = series.filter((s) => s.kind === "line")
  const equalBudgetEnd = lines.length > 1 ? Math.min(...lines.map((s) => s.points[s.points.length - 1].x)) : undefined
  const xMax = budget === "equal" ? equalBudgetEnd : undefined
  const shown =
    xMax === undefined
      ? series
      : series.map((s) => ({ ...s, points: s.kind === "reference" ? s.points : s.points.filter((p) => p.x <= xMax) }))

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <MetricPicker names={names} value={activeName} onChange={setMetricName} />
          {loading && series.length > 0 && (
            <ThinkingOrb state="breathing" size={20} theme="dark" aria-label={t.loadingMetrics} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={band}
            onChange={setBand}
            aria-label={t.band}
            options={[
              { value: "range", label: t.bandRange },
              { value: "ci", label: t.bandCi },
            ]}
          />
          {equalBudgetEnd !== undefined && (
            <span title={t.budgetHint}>
              <Segmented
                value={budget}
                onChange={setBudget}
                aria-label={t.budget}
                options={[
                  { value: "full", label: t.budgetFull },
                  { value: "equal", label: t.budgetEqual },
                ]}
              />
            </span>
          )}
          <Segmented
            value={axis}
            onChange={setAxis}
            options={[
              { value: "steps", label: t.steps },
              { value: "time", label: t.wallClock },
            ]}
          />
        </div>
      </header>

      <div className="px-5 pt-4 pb-3">
        {configurations.length === 0 ? (
          <ChartMessage>{t.selectConfigurationsHint}</ChartMessage>
        ) : series.length === 0 && loading ? (
          <div className="flex h-80 flex-col items-center justify-center gap-3">
            <ThinkingOrb state="composing" size={32} theme="dark" aria-label={t.loadingMetrics} />
            <span className="font-mono text-xs text-faint-foreground">{t.loadingMetrics}</span>
          </div>
        ) : series.length === 0 ? (
          <ChartMessage>{axis === "time" ? t.noTimestamps : t.noDataPoints}</ChartMessage>
        ) : (
          <MetricChart
            series={shown}
            yDomain={isRate ? [0, 1] : undefined}
            xMax={xMax}
            formatX={(v) => (axis === "steps" ? f.steps(v) : f.duration(v))}
            formatY={(v) => (isRate ? f.percent(v) : f.value(v))}
            formatYTick={isRate ? undefined : f.tick}
          />
        )}
        {series.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {series.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <LegendSymbol kind={s.kind} color={s.color} />
                  {s.label}
                  {s.kind === "reference" && <span className="text-faint-foreground">{t.noTraining}</span>}
                </li>
              ))}
            </ul>
            <span className="text-xs text-faint-foreground">{band === "ci" ? t.captionCi : t.captionRange}</span>
          </div>
        )}
        {withoutData.length > 0 && series.length > 0 && (
          <p className="mt-2 text-xs text-faint-foreground">
            {axis === "time" ? t.withoutTimestamps : t.withoutDataPoints}: {withoutData.join(", ")}.
          </p>
        )}
      </div>
    </section>
  )
}

function ChartMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">{children}</div>
}

// ---------- Vergleich der Konfigurationen ----------

type ConfigurationTableProps = {
  configurations: Configuration[]
  bestKey: string
  selected: string[]
  colors: Map<string, string>
  onToggle: (key: string) => void
}

function ConfigurationTable({ configurations, bestKey, selected, colors, onToggle }: ConfigurationTableProps) {
  const { t, f } = useI18n()
  const [expanded, setExpanded] = useState<string | null>(null)
  const best = Math.max(...configurations.map((c) => c.success?.mean ?? 0))

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <h2 className="border-b px-5 py-3 text-sm font-medium">{t.configurationComparison}</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-faint-foreground">
          <tr className="border-b">
            <th className="w-12 py-2.5 pl-5 text-left font-normal">
              <span className="sr-only">{t.showInChart}</span>
            </th>
            <th className="py-2.5 text-left font-normal">{t.configuration}</th>
            <th className="py-2.5 text-left font-normal">Controller</th>
            <th className="py-2.5 pr-6 text-right font-normal">{t.seeds}</th>
            <th className="py-2.5 pr-6 text-right font-normal">{t.successRate}</th>
            <th className="py-2.5 pr-6 text-right font-normal">{t.reachesThreshold(f.percent(SUCCESS_THRESHOLD))}</th>
            <th className="py-2.5 pr-6 text-right font-normal">{t.controlEffort}</th>
            <th className="py-2.5 pr-6 text-right font-normal">{t.rewardMeanStd}</th>
            <th className="py-2.5 pr-3 text-right font-normal">{t.avgWallClockTime}</th>
            <th className="w-10 pr-5">
              <span className="sr-only">{t.details}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {configurations.map((configuration) => {
            const isSelected = selected.includes(configuration.key)
            const isBest = configuration.key === bestKey
            const isOpen = expanded === configuration.key
            const n = configuration.runs.length
            return (
              <Fragment key={configuration.key}>
                <tr className="border-b transition-colors last:border-b-0 hover:bg-muted/60">
                  <td className="py-3 pl-5">
                    <SeriesCheckbox
                      checked={isSelected}
                      color={isSelected ? colors.get(configuration.key) : undefined}
                      label={t.showNameInChart(configuration.name)}
                      onChange={() => onToggle(configuration.key)}
                    />
                  </td>
                  <td className={cn("font-medium", isBest && "text-accent-signal")}>{configuration.name}</td>
                  <td>
                    <span className="rounded-sm border px-1.5 py-px font-mono text-xs text-muted-foreground">
                      {configuration.controller}
                    </span>
                    {!configuration.trains && <span className="ml-2 text-xs text-faint-foreground">{t.noTraining}</span>}
                  </td>
                  <td className="pr-6 text-right font-mono text-xs text-muted-foreground tabular-nums">{n}</td>
                  <td className="pr-6 text-right font-mono text-xs tabular-nums">
                    <span className="inline-flex items-center justify-end gap-3">
                      {configuration.success !== null && (
                        <RewardBar share={best > 0 ? configuration.success.mean / best : 0} best={isBest} />
                      )}
                      {formatSuccess(configuration.success, f)}
                    </span>
                  </td>
                  <td className="pr-6 text-right font-mono text-xs tabular-nums">
                    {formatReach(configuration, t, f)}
                    {configuration.trains && configuration.stepsToThreshold !== null && configuration.reachedCount < n && (
                      <span className="ml-1.5 text-faint-foreground">
                        ({configuration.reachedCount}/{n})
                      </span>
                    )}
                  </td>
                  <td className="pr-6 text-right font-mono text-xs tabular-nums">
                    {formatStat(configuration.controlEffort, f)}
                  </td>
                  <td className="pr-6 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {formatMeanStd(configuration, f)}
                  </td>
                  <td className="pr-3 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {f.seconds(configuration.durationMean)}
                  </td>
                  <td className="pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : configuration.key)}
                      aria-expanded={isOpen}
                      aria-label={t.showDetails(configuration.name)}
                      className="inline-flex size-6 items-center justify-center rounded-md text-faint-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <svg
                        viewBox="0 0 10 6"
                        className={cn("h-1.5 w-2.5 transition-transform", isOpen && "rotate-180")}
                        aria-hidden
                      >
                        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b bg-background/40">
                    <td colSpan={10} className="px-5 py-4">
                      <ConfigurationDetails configuration={configuration} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** Aufgeklappte Zeile: Hyperparameter und alle Kennwerte der Konfiguration. */
function ConfigurationDetails({ configuration }: { configuration: Configuration }) {
  const { t, f } = useI18n()
  const nominal = configuration.evaluations.get(NOMINAL) ?? new Map<string, Stat>()
  const n = configuration.runs.length
  const basics: [string, string][] = [
    [t.stable, `${configuration.stableCount} / ${n}`],
    [t.avgTimeToStable, f.seconds(configuration.stabilityMean)],
    [t.range, n > 1 ? `${f.reward(configuration.rewardMin)} … ${f.reward(configuration.rewardMax)}` : "–"],
  ]

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs text-faint-foreground">
          {t.hyperparameters}
          {configuration.hyperparametersDiffer && <span className="ml-2">{t.hyperparametersDiffer}</span>}
        </h3>
        {configuration.hyperparameters === null ? (
          <p className="text-xs text-faint-foreground">{t.noHyperparameters}</p>
        ) : (
          <KeyValueList
            entries={Object.entries(configuration.hyperparameters).map(([key, value]) => [
              key,
              typeof value === "string" ? value : JSON.stringify(value),
            ])}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs text-faint-foreground">{t.kpis}</h3>
        <KeyValueList
          entries={[...basics, ...[...nominal].map(([name, value]): [string, string] => [name, formatStat(value, f)])]}
        />
      </div>
    </div>
  )
}

function KeyValueList({ entries }: { entries: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 font-mono text-xs">
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="truncate text-muted-foreground">{key}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

/** Auswahlkästchen, das im ausgewählten Zustand die Linienfarbe zeigt. */
function SeriesCheckbox({
  checked,
  color,
  label,
  onChange,
}: {
  checked: boolean
  color: string | undefined
  label: string
  onChange: () => void
}) {
  return (
    <label className="relative flex size-4 cursor-pointer items-center justify-center">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="peer sr-only" />
      <span
        aria-hidden
        className="size-3.5 rounded-[3px] border border-input transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
        style={checked ? { background: color, borderColor: color } : undefined}
      />
    </label>
  )
}

/** Schmaler Balken: wo liegt der Wert zwischen schlechtestem und bestem? */
function RewardBar({ share, best }: { share: number; best: boolean }) {
  return (
    <span aria-hidden className="relative h-0.5 w-16 bg-border">
      <span
        className={cn("absolute inset-y-0 left-0", best ? "bg-accent-signal" : "bg-muted-foreground/60")}
        style={{ width: `${Math.max(share, 0.04) * 100}%` }}
      />
    </span>
  )
}

// ---------- Einzelne Runs ----------

type SortKey = "name" | "seed" | "reward" | "stability_time" | "num_steps" | "duration"

type RunColumn = { key: SortKey; label: string; numeric: boolean; format: (run: Run) => string }

function runColumns(t: Messages, f: Formatters): RunColumn[] {
  return [
    { key: "name", label: t.configuration, numeric: false, format: (run) => run.name },
    { key: "seed", label: t.seed, numeric: true, format: (run) => String(run.seed) },
    { key: "reward", label: t.reward, numeric: true, format: (run) => f.reward(run.reward) },
    { key: "stability_time", label: t.stableAfterColumn, numeric: true, format: (run) => f.seconds(run.stability_time) },
    { key: "num_steps", label: t.steps, numeric: true, format: (run) => f.integer(run.num_steps) },
    { key: "duration", label: t.wallClockColumn, numeric: true, format: (run) => f.seconds(run.duration) },
  ]
}

function sortRuns(runs: Run[], key: SortKey, direction: 1 | -1): Run[] {
  return [...runs].sort((a, b) => {
    const x = a[key]
    const y = b[key]
    // Fehlende Werte (null) immer ans Ende, egal in welche Richtung sortiert wird
    if (x === null) return y === null ? 0 : 1
    if (y === null) return -1
    if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y)) * direction
    return (x - y) * direction
  })
}

function RunTable({ runs, onDelete }: { runs: Run[]; onDelete: (runId: number) => Promise<void> }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "name", direction: 1 })
  const { t, f } = useI18n()
  const columns = runColumns(t, f)

  function toggleSort(key: SortKey) {
    // Gleiche Spalte: Richtung umdrehen. Neue Spalte: Reward absteigend, sonst aufsteigend
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 1 ? -1 : 1 }
        : { key, direction: key === "reward" ? -1 : 1 },
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <h2 className="border-b px-5 py-3 text-sm font-medium">
        {t.individualRuns} <span className="font-normal text-faint-foreground">{runs.length}</span>
      </h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-faint-foreground">
          <tr className="border-b">
            <th className="w-20 py-2.5 pl-5 text-left font-normal">{t.run}</th>
            {columns.map((column) => (
              <th
                key={column.key}
                aria-sort={sort.key === column.key ? (sort.direction === 1 ? "ascending" : "descending") : undefined}
                className={cn("py-2.5 font-normal", column.numeric ? "w-32 pr-6 text-right" : "text-left")}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  className={cn(
                    "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                    sort.key === column.key && "text-foreground",
                  )}
                >
                  {/* Pfeil auf der Innenseite, damit die Beschriftung bündig mit den Werten steht */}
                  {column.numeric && <SortArrow active={sort.key === column.key} direction={sort.direction} />}
                  {column.label}
                  {!column.numeric && <SortArrow active={sort.key === column.key} direction={sort.direction} />}
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {sortRuns(runs, sort.key, sort.direction).map((run) => (
            <tr key={run.id} className="group border-b transition-colors last:border-b-0 hover:bg-muted/60">
              <td className="py-2.5 pl-5 font-mono text-xs text-muted-foreground">#{run.id}</td>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    column.numeric ? "pr-6 text-right font-mono text-xs tabular-nums" : "text-sm",
                    run[column.key] === null && "text-faint-foreground",
                  )}
                >
                  {column.format(run)}
                </td>
              ))}
              <td className="pr-4 text-right">
                <HoldToDelete
                  label={t.delete}
                  target={`Run ${run.id}`}
                  onConfirm={() => onDelete(run.id)}
                  className="w-36 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function SortArrow({ active, direction }: { active: boolean; direction: 1 | -1 }) {
  return <span className="w-2 font-mono">{active ? (direction === 1 ? "↑" : "↓") : ""}</span>
}
