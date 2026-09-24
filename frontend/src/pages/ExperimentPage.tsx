import { useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ThinkingOrb } from "thinking-orbs"

import { ErrorState } from "@/components/ErrorState"
import { HoldToDelete } from "@/components/HoldToDelete"
import { Loader } from "@/components/Loader"
import { MetricChart, type ChartSeries } from "@/components/MetricChart"
import { StatStrip } from "@/components/StatStrip"
import { useAsync } from "@/hooks/useAsync"
import { useMetricNames, useRunMetrics } from "@/hooks/useRunMetrics"
import { api, type Run } from "@/lib/api"
import { aggregateCurves, groupConfigurations, mean, type Configuration } from "@/lib/configurations"
import { formatDuration, formatInteger, formatReward, formatSeconds, formatSteps } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX_SELECTED = 5
// Die beste Konfiguration bekommt die Akzentfarbe, alle anderen diese gedämpften Farben.
// chart-2 (Sand) steht am Ende, weil es dem Bernstein-Akzent zu ähnlich ist
const SERIES_COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"]

export function ExperimentPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const result = useAsync(() => Promise.all([api.experiment(id), api.runs(id)]), `experiment-${id}`)

  if (result.status === "loading") return <Loader label="Lade Experiment" />
  if (result.status === "error") return <ErrorState error={result.error} onRetry={result.reload} />

  const [experiment, runs] = result.data

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
          ← Experimente
        </Link>
        <header className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-2xl font-medium tracking-[-0.015em]">{experiment.name}</h1>
            <p className="font-mono text-[13px] text-muted-foreground">{experiment.environment}</p>
            {experiment.description && <p className="text-muted-foreground">{experiment.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {result.refreshing && <ThinkingOrb state="breathing" size={20} theme="dark" aria-label="Aktualisiere" />}
            <HoldToDelete
              label="Experiment löschen"
              target={experiment.name}
              onConfirm={deleteExperiment}
              className="h-8 w-40"
            />
          </div>
        </header>
      </div>

      {runs.length === 0 ? (
        <section className="rounded-lg border border-dashed px-6 py-12 text-muted-foreground">
          Dieses Experiment hat noch keine Runs.
        </section>
      ) : (
        // key: Nach dem Löschen eines Runs bleibt die Auswahl erhalten, bei einem anderen Experiment nicht
        <ExperimentContent key={experiment.id} runs={runs} onDeleteRun={deleteRun} />
      )}
    </div>
  )
}

/** Alles, was Runs braucht. Eigene Komponente, damit die Auswahl mit den geladenen Runs starten kann. */
function ExperimentContent({ runs, onDeleteRun }: { runs: Run[]; onDeleteRun: (runId: number) => Promise<void> }) {
  const configurations = groupConfigurations(runs)
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
          { label: "Konfigurationen", value: formatInteger(configurations.length), numeric: true },
          { label: "Runs", value: formatInteger(runs.length), numeric: true },
          { label: "Controller", value: [...new Set(runs.map((run) => run.controller))].join(" · ") },
          { label: "Stabil", value: `${stable} / ${runs.length}`, numeric: true },
          {
            label: "Ø Rechenzeit",
            value: durations.length ? formatSeconds(mean(durations)) : "–",
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

      <RunTable runs={runs} onDelete={onDeleteRun} />
    </>
  )
}

function formatMeanStd(configuration: Configuration): string {
  const meanText = formatReward(configuration.rewardMean)
  return configuration.rewardStd === null ? meanText : `${meanText} ± ${formatReward(configuration.rewardStd)}`
}

/** Hebt die Konfiguration mit dem höchsten mittleren Reward hervor. */
function BestConfigurationCard({ configuration, alone }: { configuration: Configuration; alone: boolean }) {
  const n = configuration.runs.length
  const facts = [
    ["Controller", configuration.controller],
    ["Seeds", String(n)],
    ["Spannweite", n > 1 ? `${formatReward(configuration.rewardMin)} … ${formatReward(configuration.rewardMax)}` : "–"],
    ["Stabil", `${configuration.stableCount} / ${n}`],
    ["Ø stabil nach", formatSeconds(configuration.stabilityMean)],
    ["Ø Rechenzeit", formatSeconds(configuration.durationMean)],
  ]

  return (
    <section className="flex flex-wrap items-center gap-x-12 gap-y-4 rounded-lg border bg-card px-5 py-4">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs text-accent-signal">
          <span className="size-1.5 rounded-full bg-accent-signal" />
          {alone ? "Konfiguration" : "Beste Konfiguration"}
        </span>
        <span className="text-lg font-medium">{configuration.name}</span>
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          Reward Ø {formatMeanStd(configuration)}
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

const METRIC_LABELS: Record<string, string> = {
  success_rate: "Success Rate",
  episode_reward: "Episode Reward",
}

const valueFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 })

function MetricsPanel({ configurations, colors }: { configurations: Configuration[]; colors: Map<string, string> }) {
  const runIds = configurations.flatMap((c) => c.runs.map((run) => run.id))
  const [metricName, setMetricName] = useState("success_rate")
  const [axis, setAxis] = useState<Axis>("steps")

  // Erst nur die Namen der Metriken, dann nur die angezeigte Metrik laden (ausgedünnt)
  const { names, loading: namesLoading } = useMetricNames(runIds)
  const activeName = names.includes(metricName) ? metricName : (names[0] ?? null)
  const { byRun: metricsByRun, loading: metricsLoading } = useRunMetrics(runIds, activeName)
  const loading = namesLoading || metricsLoading
  const isRate = activeName?.endsWith("_rate") ?? false

  const series: ChartSeries[] = []
  const withoutData: string[] = []
  for (const configuration of configurations) {
    // Eine Kurve pro Seed, dann gemittelt
    const curves = configuration.runs.map((run) => {
      const entry = metricsByRun.get(run.id)
      if (entry?.status !== "success") return []
      return entry.data
        .filter((m) => axis === "steps" || m.time !== null)
        .map((m) => ({ x: axis === "steps" ? m.step : (m.time as number), y: m.value }))
        .sort((a, b) => a.x - b.x)
    })
    const points = aggregateCurves(curves)
    if (points.length) {
      series.push({ id: configuration.key, label: configuration.name, color: colors.get(configuration.key)!, points })
    } else if (!loading) {
      withoutData.push(configuration.name)
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          {names.length > 1 ? (
            <select
              value={activeName}
              onChange={(event) => setMetricName(event.target.value)}
              aria-label="Metrik"
              className="h-7 rounded-md border border-input bg-transparent px-2 text-sm font-medium outline-none focus-visible:border-ring"
            >
              {names.map((name) => (
                <option key={name} value={name} className="bg-popover">
                  {METRIC_LABELS[name] ?? name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="text-sm font-medium">
              {activeName === null ? "Metriken" : (METRIC_LABELS[activeName] ?? activeName)}
            </h2>
          )}
          <span className="text-xs text-faint-foreground">Mittelwert über die Seeds, Band: Minimum bis Maximum</span>
          {loading && series.length > 0 && (
            <ThinkingOrb state="breathing" size={20} theme="dark" aria-label="Lade Metriken" />
          )}
        </div>
        <Segmented
          value={axis}
          onChange={setAxis}
          options={[
            { value: "steps", label: "Steps" },
            { value: "time", label: "Rechenzeit" },
          ]}
        />
      </header>

      <div className="px-5 pt-4 pb-3">
        {configurations.length === 0 ? (
          <ChartMessage>Konfigurationen in der Tabelle unten auswählen, um ihre Kurven zu vergleichen.</ChartMessage>
        ) : series.length === 0 && loading ? (
          <div className="flex h-80 flex-col items-center justify-center gap-3">
            <ThinkingOrb state="composing" size={32} theme="dark" aria-label="Lade Metriken" />
            <span className="font-mono text-xs text-faint-foreground">Lade Metriken</span>
          </div>
        ) : series.length === 0 ? (
          <ChartMessage>
            {axis === "time"
              ? "Die ausgewählten Konfigurationen haben keine Zeitstempel. Über die Steps sind sie sichtbar, falls sie Messpunkte haben."
              : "Die ausgewählten Konfigurationen haben keine Messpunkte."}
          </ChartMessage>
        ) : (
          <MetricChart
            series={series}
            yDomain={isRate ? [0, 1] : undefined}
            formatX={(v) => (axis === "steps" ? formatSteps(v) : formatDuration(v))}
            formatY={(v) => (isRate ? `${Math.round(v * 100)} %` : valueFormat.format(v))}
          />
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
        {withoutData.length > 0 && series.length > 0 && (
          <p className="mt-2 text-xs text-faint-foreground">
            Ohne {axis === "time" ? "Zeitstempel" : "Messpunkte"}: {withoutData.join(", ")}.
          </p>
        )}
      </div>
    </section>
  )
}

function ChartMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">{children}</div>
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-md border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-6 rounded-[4px] px-2.5 text-xs transition-colors",
            value === option.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
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
  const means = configurations.map((c) => c.rewardMean)
  const [min, max] = [Math.min(...means), Math.max(...means)]

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <h2 className="border-b px-5 py-3 text-sm font-medium">Vergleich der Konfigurationen</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-faint-foreground">
          <tr className="border-b">
            <th className="w-12 py-2.5 pl-5 text-left font-normal">
              <span className="sr-only">Im Diagramm zeigen</span>
            </th>
            <th className="py-2.5 text-left font-normal">Konfiguration</th>
            <th className="py-2.5 text-left font-normal">Controller</th>
            <th className="py-2.5 pr-6 text-right font-normal">Seeds</th>
            <th className="py-2.5 pr-6 text-right font-normal">Reward Ø ± Std</th>
            <th className="py-2.5 pr-6 text-right font-normal">Spannweite</th>
            <th className="py-2.5 pr-6 text-right font-normal">Stabil</th>
            <th className="py-2.5 pr-6 text-right font-normal">Ø stabil nach</th>
            <th className="py-2.5 pr-5 text-right font-normal">Ø Rechenzeit</th>
          </tr>
        </thead>
        <tbody>
          {configurations.map((configuration) => {
            const isSelected = selected.includes(configuration.key)
            const isBest = configuration.key === bestKey
            const n = configuration.runs.length
            return (
              <tr key={configuration.key} className="border-b transition-colors last:border-b-0 hover:bg-muted/60">
                <td className="py-3 pl-5">
                  <SeriesCheckbox
                    checked={isSelected}
                    color={isSelected ? colors.get(configuration.key) : undefined}
                    label={`${configuration.name} im Diagramm zeigen`}
                    onChange={() => onToggle(configuration.key)}
                  />
                </td>
                <td className={cn("font-medium", isBest && "text-accent-signal")}>{configuration.name}</td>
                <td>
                  <span className="rounded-sm border px-1.5 py-px font-mono text-xs text-muted-foreground">
                    {configuration.controller}
                  </span>
                </td>
                <td className="pr-6 text-right font-mono text-xs text-muted-foreground tabular-nums">{n}</td>
                <td className="pr-6 text-right font-mono text-xs tabular-nums">
                  <span className="inline-flex items-center justify-end gap-3">
                    <RewardBar share={max === min ? 1 : (configuration.rewardMean - min) / (max - min)} best={isBest} />
                    {formatMeanStd(configuration)}
                  </span>
                </td>
                <td className="pr-6 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {n > 1 ? `${formatReward(configuration.rewardMin)} … ${formatReward(configuration.rewardMax)}` : "–"}
                </td>
                <td className="pr-6 text-right font-mono text-xs tabular-nums">
                  {configuration.stableCount} / {n}
                </td>
                <td className="pr-6 text-right font-mono text-xs tabular-nums">
                  {formatSeconds(configuration.stabilityMean)}
                </td>
                <td className="pr-5 text-right font-mono text-xs tabular-nums">
                  {formatSeconds(configuration.durationMean)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
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

const RUN_COLUMNS: { key: SortKey; label: string; numeric: boolean; format: (run: Run) => string }[] = [
  { key: "name", label: "Konfiguration", numeric: false, format: (run) => run.name },
  { key: "seed", label: "Seed", numeric: true, format: (run) => String(run.seed) },
  { key: "reward", label: "Reward", numeric: true, format: (run) => formatReward(run.reward) },
  { key: "stability_time", label: "Stabil nach", numeric: true, format: (run) => formatSeconds(run.stability_time) },
  { key: "num_steps", label: "Steps", numeric: true, format: (run) => formatInteger(run.num_steps) },
  { key: "duration", label: "Rechenzeit", numeric: true, format: (run) => formatSeconds(run.duration) },
]

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
        Einzelne Runs <span className="font-normal text-faint-foreground">{runs.length}</span>
      </h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-faint-foreground">
          <tr className="border-b">
            <th className="w-20 py-2.5 pl-5 text-left font-normal">Run</th>
            {RUN_COLUMNS.map((column) => (
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
              {RUN_COLUMNS.map((column) => (
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
                  label="Löschen"
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
