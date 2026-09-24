import { Link } from "react-router"

import { ErrorState } from "@/components/ErrorState"
import { Loader } from "@/components/Loader"
import { StatStrip } from "@/components/StatStrip"
import { useAsync } from "@/hooks/useAsync"
import { api, type Experiment, type Run } from "@/lib/api"
import { groupConfigurations, type Configuration } from "@/lib/configurations"
import { formatInteger, formatReward, formatSeconds } from "@/lib/format"

type ExperimentSummary = {
  experiment: Experiment
  runCount: number
  controllers: string[]
  best: Configuration | null
  lastRun: Run | null
}

/** Fasst die Runs pro Experiment zusammen: Anzahl, Controller, beste Konfiguration, letzter Run. */
function summarize(experiments: Experiment[], runs: Run[]): ExperimentSummary[] {
  return experiments
    .map((experiment) => {
      const own = runs.filter((run) => run.experiment_id === experiment.id)
      return {
        experiment,
        runCount: own.length,
        controllers: [...new Set(own.map((run) => run.controller))],
        // Beste Konfiguration = höchster mittlerer Reward über ihre Seeds
        best: groupConfigurations(own)[0] ?? null,
        // Runs haben noch keinen Zeitstempel; die höchste ID ist der zuletzt gespeicherte
        lastRun: own.reduce<Run | null>((last, run) => (last === null || run.id > last.id ? run : last), null),
      }
    })
    .sort((a, b) => b.experiment.id - a.experiment.id) // neueste Experimente zuerst
}

// Spaltenaufteilung, gemeinsam für Kopfzeile und Zeilen
const COLUMNS = "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_4rem_minmax(0,1.5fr)_minmax(0,1.9fr)_1rem] gap-x-6"

export function ExperimentsPage() {
  const result = useAsync(() => Promise.all([api.experiments(), api.runs()]), "experiments-overview")

  if (result.status === "loading") return <Loader label="Lade Experimente" />
  if (result.status === "error") return <ErrorState error={result.error} onRetry={result.reload} />

  const [experiments, runs] = result.data
  const summaries = summarize(experiments, runs)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">Experimente</h1>
        <p className="text-muted-foreground">Reinforcement Learning und klassische Regelung im direkten Vergleich.</p>
      </header>

      {experiments.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <StatStrip
            stats={[
              { label: "Experimente", value: formatInteger(experiments.length), numeric: true },
              { label: "Runs", value: formatInteger(runs.length), numeric: true },
              { label: "Controller", value: [...new Set(runs.map((r) => r.controller))].join(" · ") || "–" },
              { label: "Environments", value: [...new Set(experiments.map((e) => e.environment))].join(" · ") },
            ]}
          />

          <section className="overflow-hidden rounded-lg border bg-card">
            <div className={`${COLUMNS} border-b px-5 py-2.5 text-xs text-faint-foreground`}>
              <span>Experiment</span>
              <span>Environment</span>
              <span>Controller</span>
              <span className="text-right">Runs</span>
              <span>Beste Konfiguration</span>
              <span>Letzter Run</span>
              <span />
            </div>
            <ul>
              {summaries.map((summary) => (
                <li key={summary.experiment.id} className="border-b last:border-b-0">
                  <ExperimentRow summary={summary} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function ExperimentRow({ summary }: { summary: ExperimentSummary }) {
  const { experiment, runCount, controllers, best, lastRun } = summary

  return (
    <Link
      to={`/experiments/${experiment.id}`}
      className={`${COLUMNS} group items-center px-5 py-3.5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{experiment.name}</p>
        {experiment.description && <p className="truncate text-xs text-faint-foreground">{experiment.description}</p>}
      </div>
      <span className="truncate font-mono text-[13px] text-muted-foreground">{experiment.environment}</span>
      <span className="truncate font-mono text-xs text-muted-foreground">
        {controllers.length ? controllers.join(" · ") : <span className="text-faint-foreground">–</span>}
      </span>
      <span className={`text-right font-mono tabular-nums ${runCount ? "text-muted-foreground" : "text-faint-foreground"}`}>
        {runCount}
      </span>
      {best === null ? (
        <span className="text-faint-foreground">–</span>
      ) : (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{best.name}</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">Ø {formatReward(best.rewardMean)}</span>
        </span>
      )}
      <LastRun run={lastRun} />
      <span aria-hidden className="text-faint-foreground transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}

function LastRun({ run }: { run: Run | null }) {
  if (run === null) return <span className="text-faint-foreground">Noch keine Runs</span>

  const stable = run.stability_time !== null
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-xs text-muted-foreground">
        {run.name} <span className="font-mono text-faint-foreground">· seed {run.seed}</span>
      </span>
      <span className="flex items-center gap-3 font-mono text-xs whitespace-nowrap tabular-nums">
        <span>{formatReward(run.reward)}</span>
        <span className={`flex items-center gap-1.5 ${stable ? "text-muted-foreground" : "text-faint-foreground"}`}>
          <span className={`size-1.5 rounded-full ${stable ? "bg-success" : "bg-faint-foreground/50"}`} />
          {stable ? `stabil ${formatSeconds(run.stability_time)}` : "nicht stabil"}
        </span>
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-dashed px-6 py-12">
      <p className="font-medium">Noch keine Experimente</p>
      <p className="max-w-xl text-muted-foreground">
        Experimente und Runs entstehen automatisch, sobald ein Trainings- oder Regelungsskript seine Ergebnisse an die
        API schickt. Zum Ausprobieren im Projektordner:
      </p>
      <code className="self-start rounded-md border bg-card px-3 py-2 font-mono text-[13px]">
        python experiments/example_upload.py
      </code>
    </section>
  )
}
