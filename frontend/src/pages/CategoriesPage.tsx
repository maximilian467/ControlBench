import { Link } from "react-router"

import { ErrorState } from "@/components/ErrorState"
import { Loader } from "@/components/Loader"
import { useAsync } from "@/hooks/useAsync"
import { useCategoryLabel } from "@/hooks/useCategoryLabel"
import { api } from "@/lib/api"
import { categoryReports, type CategoryReport, type Standing } from "@/lib/categories"
import { useI18n } from "@/lib/i18n"
import { SUCCESS_THRESHOLD } from "@/lib/metrics"
import { cn } from "@/lib/utils"

/**
 * Welcher Controller funktioniert für welche Art von Aufgabe am besten?
 * Rewards sind zwischen Environments nicht vergleichbar, deshalb zählen Ränge pro Experiment und die Success Rate.
 */
export function CategoriesPage() {
  const { t } = useI18n()
  const result = useAsync(
    () => Promise.all([api.experiments(), api.runs(), api.summaries(undefined, SUCCESS_THRESHOLD)]),
    "categories",
  )

  if (result.status === "loading") return <Loader label={t.loadingCategories} />
  if (result.status === "error") return <ErrorState error={result.error} onRetry={result.reload} />

  const reports = categoryReports(...result.data)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">{t.categories}</h1>
        <p className="max-w-3xl text-muted-foreground">{t.categoriesSubtitle}</p>
      </header>
      {reports.length === 0 ? (
        <p className="text-muted-foreground">{t.noExperimentsYet}</p>
      ) : (
        reports.map((report) => <CategorySection key={report.key ?? "none"} report={report} />)
      )}
    </div>
  )
}

function CategorySection({ report }: { report: CategoryReport }) {
  const { t, f } = useI18n()
  const label = useCategoryLabel()
  const leader = report.standings[0]

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b px-5 py-3">
        <h2 className="text-sm font-medium">
          {label(report.key)}
          <span className="ml-2 font-normal text-faint-foreground">{t.experimentsCount(report.experiments.length)}</span>
        </h2>
        {leader && leader.wins > 0 && (
          <span className="flex items-center gap-2 text-xs text-accent-signal">
            <span className="size-1.5 rounded-full bg-accent-signal" />
            {t.categoryLeader(leader.controller)}
          </span>
        )}
      </header>

      {report.standings.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{t.experimentHasNoRuns}</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-xs text-faint-foreground">
              <tr className="border-b">
                <th className="py-2.5 pl-5 text-left font-normal">Controller</th>
                <th className="py-2.5 pr-6 text-right font-normal">{t.experiments}</th>
                <th className="py-2.5 pr-6 text-right font-normal">{t.wins}</th>
                <th className="py-2.5 pr-6 text-right font-normal">{t.meanRank}</th>
                <th className="py-2.5 pr-6 text-right font-normal">{t.works(f.percent(SUCCESS_THRESHOLD))}</th>
                <th className="py-2.5 pr-6 text-right font-normal">{t.meanSuccess}</th>
                <th className="py-2.5 pr-6 text-right font-normal">{t.meanReach(f.percent(SUCCESS_THRESHOLD))}</th>
                <th className="py-2.5 pr-5 text-right font-normal">{t.effortRank}</th>
              </tr>
            </thead>
            <tbody>
              {report.standings.map((standing, index) => (
                <StandingRow key={standing.controller} standing={standing} leading={index === 0 && standing.wins > 0} />
              ))}
            </tbody>
          </table>
          <PlacementMatrix report={report} />
        </>
      )}
    </section>
  )
}

function StandingRow({ standing, leading }: { standing: Standing; leading: boolean }) {
  const { t, f } = useI18n()
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2.5 pl-5">
        <span className={cn("font-mono text-xs", leading && "text-accent-signal")}>{standing.controller}</span>
        {!standing.trains && <span className="ml-2 text-xs text-faint-foreground">{t.noTraining}</span>}
      </td>
      <td className="pr-6 text-right font-mono text-xs text-muted-foreground tabular-nums">{standing.experiments}</td>
      <td className="pr-6 text-right font-mono text-xs tabular-nums">{standing.wins}</td>
      <td className="pr-6 text-right font-mono text-xs tabular-nums">{f.value(standing.meanRank)}</td>
      <td className="pr-6 text-right font-mono text-xs tabular-nums">
        {standing.withSuccess ? `${standing.working} / ${standing.withSuccess}` : "–"}
      </td>
      <td className="pr-6 text-right font-mono text-xs tabular-nums">
        {standing.meanSuccess === null ? "–" : f.percent(standing.meanSuccess)}
      </td>
      <td className="pr-6 text-right font-mono text-xs tabular-nums">
        {standing.trains ? (standing.meanTimeToThreshold === null ? "–" : f.duration(standing.meanTimeToThreshold)) : "–"}
      </td>
      <td className="pr-5 text-right font-mono text-xs tabular-nums">
        {standing.meanEffortRank === null ? "–" : f.value(standing.meanEffortRank)}
      </td>
    </tr>
  )
}

/** Controller × Experiment: Success Rate und Rang, damit man sieht, woraus die Rangliste entsteht */
function PlacementMatrix({ report }: { report: CategoryReport }) {
  const { t, f } = useI18n()
  const experiments = report.experiments.filter((e) => report.placements.has(e.id))

  return (
    <div className="overflow-x-auto border-t">
      <p className="px-5 pt-3 text-xs text-faint-foreground">{t.perExperiment}</p>
      <table className="w-full text-sm">
        <thead className="text-xs text-faint-foreground">
          <tr>
            <th className="py-2 pl-5 text-left font-normal" />
            {experiments.map((experiment) => (
              <th key={experiment.id} className="max-w-48 px-3 py-2 text-right font-normal">
                <Link to={`/experiments/${experiment.id}`} className="block truncate transition-colors hover:text-foreground">
                  {experiment.name}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.standings.map((standing) => (
            <tr key={standing.controller} className="border-t">
              <td className="py-2 pl-5 font-mono text-xs text-muted-foreground">{standing.controller}</td>
              {experiments.map((experiment) => {
                const placement = report.placements.get(experiment.id)!.get(standing.controller)
                return (
                  <td key={experiment.id} className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {placement === undefined ? (
                      <span className="text-faint-foreground">–</span>
                    ) : (
                      <span title={placement.configuration.name}>
                        {placement.configuration.success === null ? "–" : f.percent(placement.configuration.success.mean)}
                        <span className={cn("ml-2", placement.rank === 1 ? "text-accent-signal" : "text-faint-foreground")}>
                          #{placement.rank}
                        </span>
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
