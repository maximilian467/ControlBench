import { useState } from "react"
import { Link } from "react-router"

import { CategoryBadge } from "@/components/CategoryEditor"
import { ErrorState } from "@/components/ErrorState"
import { Loader } from "@/components/Loader"
import { StatStrip } from "@/components/StatStrip"
import { useAsync } from "@/hooks/useAsync"
import { useCategoryLabel } from "@/hooks/useCategoryLabel"
import { api, type Experiment, type Run, type RunSummary } from "@/lib/api"
import { groupConfigurations, type Configuration } from "@/lib/configurations"
import { useI18n } from "@/lib/i18n"
import { SUCCESS_THRESHOLD } from "@/lib/metrics"
import { cn } from "@/lib/utils"

type ExperimentSummary = {
  experiment: Experiment
  runCount: number
  controllers: string[]
  best: Configuration | null
  lastRun: Run | null
}

/** Fasst die Runs pro Experiment zusammen: Anzahl, Controller, beste Konfiguration, letzter Run. */
function summarize(experiments: Experiment[], runs: Run[], summaries: RunSummary[]): ExperimentSummary[] {
  return experiments
    .map((experiment) => {
      const own = runs.filter((run) => run.experiment_id === experiment.id)
      return {
        experiment,
        runCount: own.length,
        controllers: [...new Set(own.map((run) => run.controller))],
        // Beste Konfiguration = zuverlässigste (Success Rate, siehe groupConfigurations)
        best: groupConfigurations(own, summaries)[0] ?? null,
        // Runs haben noch keinen Zeitstempel; die höchste ID ist der zuletzt gespeicherte
        lastRun: own.reduce<Run | null>((last, run) => (last === null || run.id > last.id ? run : last), null),
      }
    })
    .sort((a, b) => b.experiment.id - a.experiment.id) // neueste Experimente zuerst
}

// Spaltenaufteilung, gemeinsam für Kopfzeile und Zeilen
const COLUMNS =
  "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_4rem_minmax(0,1.5fr)_minmax(0,1.7fr)_1rem] gap-x-6"

// Filterwert für "alle Kategorien"; null steht für "ohne Kategorie"
const ALL = "__all__"

export function ExperimentsPage() {
  const { t, f } = useI18n()
  const label = useCategoryLabel()
  const [filter, setFilter] = useState<string | null>(ALL)
  const result = useAsync(
    () => Promise.all([api.experiments(), api.runs(), api.summaries(undefined, SUCCESS_THRESHOLD)]),
    "experiments-overview",
  )

  if (result.status === "loading") return <Loader label={t.loadingExperiments} />
  if (result.status === "error") return <ErrorState error={result.error} onRetry={result.reload} />

  const [experiments, runs, runSummaries] = result.data
  const summaries = summarize(experiments, runs, runSummaries)
  const categories = [...new Set(experiments.map((e) => e.category ?? null))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : label(a).localeCompare(label(b)),
  )
  const shown = filter === ALL ? summaries : summaries.filter((s) => (s.experiment.category ?? null) === filter)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">{t.experiments}</h1>
        <p className="text-muted-foreground">{t.overviewSubtitle}</p>
      </header>

      {experiments.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <StatStrip
            stats={[
              { label: t.experiments, value: f.integer(experiments.length), numeric: true },
              { label: t.runs, value: f.integer(runs.length), numeric: true },
              { label: t.controllers, value: f.integer(new Set(runs.map((r) => r.controller)).size), numeric: true },
              { label: t.categories, value: f.integer(categories.filter((c) => c !== null).length), numeric: true },
            ]}
          />

          <section className="overflow-hidden rounded-lg border bg-card">
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5 border-b px-5 py-3" role="radiogroup" aria-label={t.category}>
                {[ALL, ...categories].map((category) => {
                  const count =
                    category === ALL
                      ? experiments.length
                      : experiments.filter((e) => (e.category ?? null) === category).length
                  return (
                    <button
                      key={category ?? "none"}
                      type="button"
                      role="radio"
                      aria-checked={filter === category}
                      onClick={() => setFilter(category)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-xs transition-colors",
                        filter === category
                          ? "border-ring bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {category === ALL ? t.allCategories : label(category)}
                      <span className="ml-1.5 font-mono text-faint-foreground">{count}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className={`${COLUMNS} border-b px-5 py-2.5 text-xs text-faint-foreground`}>
              <span>{t.experiment}</span>
              <span>{t.category}</span>
              <span>{t.controllers}</span>
              <span className="text-right">{t.runs}</span>
              <span>{t.bestConfiguration}</span>
              <span>{t.latestRun}</span>
              <span />
            </div>
            <ul>
              {shown.map((summary) => (
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
  const { t, f } = useI18n()

  return (
    <Link
      to={`/experiments/${experiment.id}`}
      className={`${COLUMNS} group items-center px-5 py-3.5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{experiment.name}</p>
        <p className="truncate font-mono text-xs text-faint-foreground">{experiment.environment}</p>
      </div>
      <span className="min-w-0 truncate">
        <CategoryBadge category={experiment.category} />
      </span>
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
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {best.success === null ? `${t.meanShort} ${f.reward(best.rewardMean)}` : f.percent(best.success.mean)}
          </span>
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
  const { t, f } = useI18n()
  if (run === null) return <span className="text-faint-foreground">{t.noRunsYet}</span>

  const stable = run.stability_time !== null
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-xs text-muted-foreground">
        {run.name} <span className="font-mono text-faint-foreground">· seed {run.seed}</span>
      </span>
      <span className="flex items-center gap-3 font-mono text-xs whitespace-nowrap tabular-nums">
        <span>{f.reward(run.reward)}</span>
        <span className={`flex items-center gap-1.5 ${stable ? "text-muted-foreground" : "text-faint-foreground"}`}>
          <span className={`size-1.5 rounded-full ${stable ? "bg-success" : "bg-faint-foreground/50"}`} />
          {stable ? t.stableAfter(f.seconds(run.stability_time)) : t.notStable}
        </span>
      </span>
    </div>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-dashed px-6 py-12">
      <p className="font-medium">{t.noExperimentsYet}</p>
      <p className="max-w-xl text-muted-foreground">{t.emptyStateText}</p>
      <code className="self-start rounded-md border bg-card px-3 py-2 font-mono text-[13px]">
        python experiments/example_upload.py
      </code>
    </section>
  )
}
