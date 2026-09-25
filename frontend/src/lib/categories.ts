import type { Experiment, Run, RunSummary } from "@/lib/api"
import { groupConfigurations, mean, type Configuration } from "@/lib/configurations"
import { SUCCESS_THRESHOLD } from "@/lib/metrics"

/**
 * Vorgeschlagene Kategorien. Gespeichert wird der Schlüssel; die Oberfläche übersetzt ihn.
 * Eigene Kategorien sind erlaubt und werden unverändert angezeigt.
 */
export const CATEGORY_KEYS = [
  "stabilization",
  "swing-up",
  "positioning",
  "tracking",
  "disturbance-rejection",
  "locomotion",
] as const

/** Ergebnis eines Controllers in einem Experiment: seine beste Konfiguration und ihr Rang unter den Controllern */
export type Placement = {
  configuration: Configuration
  rank: number // 1 = bester Controller in diesem Experiment
  controllers: number // wie viele Controller dort verglichen wurden
  effortRank: number | null // 1 = geringster Stellaufwand; null ohne Stellaufwand
}

/** Wie ein Controller über alle Experimente einer Kategorie abschneidet */
export type Standing = {
  controller: string
  trains: boolean
  experiments: number
  wins: number
  meanRank: number
  /** In wie vielen Experimenten die Success Rate die Schwelle erreicht */
  working: number
  withSuccess: number
  meanSuccess: number | null
  /** Mittlere Rechenzeit bis zur Schwelle, nur über Experimente, in denen sie erreicht wurde */
  meanTimeToThreshold: number | null
  meanEffortRank: number | null
}

export type CategoryReport = {
  key: string | null // null = ohne Kategorie
  experiments: Experiment[]
  standings: Standing[]
  /** Experiment-ID -> Controller -> Platzierung */
  placements: Map<number, Map<string, Placement>>
}

/** Pro Experiment: jeder Controller mit seiner besten Konfiguration, in der Reihenfolge von groupConfigurations */
function placementsFor(runs: Run[], summaries: RunSummary[]): Map<string, Placement> {
  const configurations = groupConfigurations(runs, summaries)
  const best = new Map<string, Configuration>()
  for (const configuration of configurations) {
    if (!best.has(configuration.controller)) best.set(configuration.controller, configuration)
  }
  const ordered = [...best.values()]
  const byEffort = ordered.filter((c) => c.controlEffort !== null).sort((a, b) => a.controlEffort!.mean - b.controlEffort!.mean)

  return new Map(
    ordered.map((configuration, index) => {
      const effortIndex = byEffort.indexOf(configuration)
      return [
        configuration.controller,
        {
          configuration,
          rank: index + 1,
          controllers: ordered.length,
          effortRank: effortIndex < 0 ? null : effortIndex + 1,
        },
      ]
    }),
  )
}

/** Fasst alle Experimente nach Kategorie zusammen; Kategorien mit mehr Experimenten zuerst, "ohne" zuletzt. */
export function categoryReports(experiments: Experiment[], runs: Run[], summaries: RunSummary[]): CategoryReport[] {
  const byCategory = new Map<string | null, Experiment[]>()
  for (const experiment of experiments) {
    const key = experiment.category ?? null
    byCategory.set(key, [...(byCategory.get(key) ?? []), experiment])
  }

  const reports = [...byCategory].map(([key, members]): CategoryReport => {
    const placements = new Map<number, Map<string, Placement>>()
    for (const experiment of members) {
      const own = runs.filter((run) => run.experiment_id === experiment.id)
      if (own.length) placements.set(experiment.id, placementsFor(own, summaries))
    }

    const controllers = new Set([...placements.values()].flatMap((byController) => [...byController.keys()]))
    const standings = [...controllers].map((controller): Standing => {
      const results = [...placements.values()].flatMap((byController) => {
        const placement = byController.get(controller)
        return placement ? [placement] : []
      })
      const successes = results.flatMap((p) => (p.configuration.success ? [p.configuration.success.mean] : []))
      const times = results.flatMap((p) =>
        p.configuration.trains && p.configuration.timeToThreshold !== null ? [p.configuration.timeToThreshold] : [],
      )
      const effortRanks = results.flatMap((p) => (p.effortRank === null ? [] : [p.effortRank]))
      return {
        controller,
        trains: results.every((p) => p.configuration.trains),
        experiments: results.length,
        wins: results.filter((p) => p.rank === 1).length,
        meanRank: mean(results.map((p) => p.rank)),
        working: successes.filter((s) => s >= SUCCESS_THRESHOLD).length,
        withSuccess: successes.length,
        meanSuccess: successes.length ? mean(successes) : null,
        meanTimeToThreshold: times.length ? mean(times) : null,
        meanEffortRank: effortRanks.length ? mean(effortRanks) : null,
      }
    })
    standings.sort((a, b) => b.wins - a.wins || a.meanRank - b.meanRank || (b.meanSuccess ?? -1) - (a.meanSuccess ?? -1))

    return { key, experiments: members, standings, placements }
  })

  return reports.sort((a, b) =>
    a.key === null ? 1 : b.key === null ? -1 : b.experiments.length - a.experiments.length || a.key.localeCompare(b.key),
  )
}
