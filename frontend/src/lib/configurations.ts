import type { Run, RunSummary } from "@/lib/api"
import { CONTROL_EFFORT, NOMINAL } from "@/lib/metrics"

/** Mittelwert, Standardabweichung und Anzahl über die Seeds */
export type Stat = { mean: number; std: number | null; n: number }

/** Alle Runs einer Konfiguration (gleicher Controller, gleicher Name), die sich nur im Seed unterscheiden. */
export type Configuration = {
  key: string
  name: string
  controller: string
  runs: Run[]
  /** false bei Controllern ohne Training (LQR, PID, ...): im Diagramm eine Referenzlinie */
  trains: boolean
  rewardMean: number
  rewardStd: number | null // null bei nur einem Run: Streuung ist dann nicht definiert
  rewardMin: number
  rewardMax: number
  stableCount: number
  stabilityMean: number | null // Mittel über die Runs, die stabil wurden
  durationMean: number | null
  /** Success Rate am Ende: Kennwert success_rate (nominal), sonst der letzte Punkt der Kurve */
  success: Stat | null
  /** Wie viele Seeds die Schwelle (z. B. 90 %) erreicht haben, und im Mittel wann */
  reachedCount: number
  stepsToThreshold: number | null
  timeToThreshold: number | null
  controlEffort: Stat | null
  /** Alle Kennwerte, pro Szenario und Name gemittelt über die Seeds */
  evaluations: Map<string, Map<string, Stat>>
  /** Hyperparameter des ersten Seeds; differ = die Seeds haben unterschiedliche */
  hyperparameters: Record<string, unknown> | null
  hyperparametersDiffer: boolean
  /** Seed mit Episodenverlauf, der am besten abgeschnitten hat; null ohne Verlauf */
  traceRun: { run: Run; signals: string[] } | null
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Stichproben-Standardabweichung (n − 1), wie in der Statistik für wenige Seeds üblich. */
export function std(values: number[]): number | null {
  if (values.length < 2) return null
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1))
}

function present(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => v !== null && v !== undefined)
}

function stat(values: number[]): Stat | null {
  return values.length ? { mean: mean(values), std: std(values), n: values.length } : null
}

/**
 * Reihenfolge der Konfigurationen: Entscheidend ist, ob der Controller funktioniert, nicht der Reward.
 * 1. höhere Success Rate
 * 2. unter trainierenden Controllern: erreicht die Schwelle früher (Rechenzeit, sonst Steps)
 * 3. geringerer Stellaufwand  4. höherer Reward
 */
function compareConfigurations(a: Configuration, b: Configuration): number {
  const successA = a.success?.mean ?? -1
  const successB = b.success?.mean ?? -1
  if (Math.abs(successA - successB) > 1e-9) return successB - successA
  // Controller ohne Training "erreichen" nichts über die Zeit; der Vergleich gilt nur unter Lernenden
  if (a.trains && b.trains) {
    const reachA = a.timeToThreshold ?? a.stepsToThreshold ?? Infinity
    const reachB = b.timeToThreshold ?? b.stepsToThreshold ?? Infinity
    if (reachA !== reachB) return reachA - reachB
  }
  if (a.controlEffort && b.controlEffort && a.controlEffort.mean !== b.controlEffort.mean) {
    return a.controlEffort.mean - b.controlEffort.mean
  }
  return b.rewardMean - a.rewardMean
}

/** Gruppiert Runs nach Konfiguration und sortiert sie, beste zuerst (siehe compareConfigurations). */
export function groupConfigurations(runs: Run[], summaries: RunSummary[] = []): Configuration[] {
  const summaryOf = new Map(summaries.map((summary) => [summary.run_id, summary]))
  const groups = new Map<string, Run[]>()
  for (const run of runs) {
    const key = `${run.controller}\u0000${run.name}`
    groups.set(key, [...(groups.get(key) ?? []), run])
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const rewards = group.map((run) => run.reward)
      const stability = present(group.map((run) => run.stability_time))
      const durations = present(group.map((run) => run.duration))
      const runSummaries = group.map((run) => summaryOf.get(run.id))
      const nominal = (summary: RunSummary | undefined, name: string) =>
        summary?.evaluations.find((e) => e.scenario === NOMINAL && e.name === name)?.value
      const reached = runSummaries.filter((summary) => summary?.steps_to_threshold !== null && summary !== undefined)

      // Kennwerte: Szenario -> Name -> Werte der Seeds
      const values = new Map<string, Map<string, number[]>>()
      for (const summary of runSummaries) {
        for (const e of summary?.evaluations ?? []) {
          const byName = values.get(e.scenario) ?? new Map<string, number[]>()
          byName.set(e.name, [...(byName.get(e.name) ?? []), e.value])
          values.set(e.scenario, byName)
        }
      }
      const evaluations = new Map(
        [...values].map(([scenario, byName]) => [scenario, new Map([...byName].map(([name, v]) => [name, stat(v)!]))]),
      )

      const hyperparameters = group[0].hyperparameters
      // Für den Episodenverlauf: unter den Seeds mit Verlauf der mit der höchsten Success Rate, sonst höchstem Reward
      const withTrace = group
        .map((run) => ({ run, summary: summaryOf.get(run.id) }))
        .filter(({ summary }) => (summary?.trace_signals.length ?? 0) > 0)
        .sort(
          (a, b) =>
            (nominal(b.summary, "success_rate") ?? b.summary?.last_success_rate ?? -1) -
              (nominal(a.summary, "success_rate") ?? a.summary?.last_success_rate ?? -1) ||
            b.run.reward - a.run.reward,
        )
      return {
        key,
        name: group[0].name,
        controller: group[0].controller,
        runs: group,
        trains: group.every((run) => run.trains),
        rewardMean: mean(rewards),
        rewardStd: std(rewards),
        rewardMin: Math.min(...rewards),
        rewardMax: Math.max(...rewards),
        stableCount: stability.length,
        stabilityMean: stability.length ? mean(stability) : null,
        durationMean: durations.length ? mean(durations) : null,
        success: stat(present(runSummaries.map((summary) => nominal(summary, "success_rate") ?? summary?.last_success_rate))),
        reachedCount: reached.length,
        stepsToThreshold: reached.length ? mean(present(reached.map((summary) => summary!.steps_to_threshold))) : null,
        timeToThreshold: present(reached.map((summary) => summary!.time_to_threshold)).length
          ? mean(present(reached.map((summary) => summary!.time_to_threshold)))
          : null,
        controlEffort: stat(present(runSummaries.map((summary) => nominal(summary, CONTROL_EFFORT)))),
        evaluations,
        hyperparameters,
        hyperparametersDiffer: group.some(
          (run) => JSON.stringify(run.hyperparameters) !== JSON.stringify(hyperparameters),
        ),
        traceRun: withTrace.length ? { run: withTrace[0].run, signals: withTrace[0].summary!.trace_signals } : null,
      }
    })
    .sort(compareConfigurations)
}

export type CurvePoint = { x: number; y: number }

const MAX_GRID = 1000
export type BandPoint = { x: number; y: number; low: number; high: number }

/** Linear interpolierter Wert einer sortierten Kurve an der Stelle x. */
function valueAt(curve: CurvePoint[], x: number): number {
  // Binäre Suche nach dem letzten Punkt links von x: bei 1.000 Punkten 10 statt bis zu 1.000 Vergleiche
  let low = 0
  let high = curve.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (curve[mid].x <= x) low = mid
    else high = mid - 1
  }
  const i = low
  const a = curve[i]
  const b = curve[Math.min(i + 1, curve.length - 1)]
  if (b.x === a.x) return a.y
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x)
}

/** Wie das Band um den Mittelwert berechnet wird */
export type BandMode = "range" | "ci"

// Quantile der t-Verteilung für ein zweiseitiges 95-%-Intervall, nach Freiheitsgraden (n − 1)
const T_975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042]

function tQuantile(degreesOfFreedom: number): number {
  if (degreesOfFreedom <= T_975.length) return T_975[degreesOfFreedom - 1]
  return degreesOfFreedom <= 60 ? 2.0 : degreesOfFreedom <= 120 ? 1.98 : 1.96
}

/**
 * Mittelwert und Band über die Werte der Seeds an einer Stelle.
 * range: Minimum bis Maximum. ci: 95-%-Konfidenzintervall des Mittelwerts (t-Verteilung),
 * also der Bereich, in dem der wahre Mittelwert mit 95 % Sicherheit liegt. Bei einem Seed gibt es kein Band.
 */
export function summarize(values: number[], mode: BandMode): { y: number; low: number; high: number } {
  const y = mean(values)
  if (values.length < 2) return { y, low: y, high: y }
  if (mode === "range") return { y, low: Math.min(...values), high: Math.max(...values) }
  const halfWidth = (tQuantile(values.length - 1) * std(values)!) / Math.sqrt(values.length)
  return { y, low: y - halfWidth, high: y + halfWidth }
}

/**
 * Mittelt die Kurven mehrerer Seeds zu einer Kurve mit Band.
 *
 * Die Seeds haben ihre Messpunkte nicht zwingend an denselben Stellen, z. B. über die Rechenzeit,
 * weil jeder Run anders schnell rechnet. Deshalb wird jede Kurve an allen vorkommenden x-Werten
 * interpoliert, aber nur dort, wo alle Seeds Daten haben.
 */
export function aggregateCurves(curves: CurvePoint[][], mode: BandMode = "range"): BandPoint[] {
  const valid = curves.filter((curve) => curve.length > 0)
  if (valid.length === 0) return []
  if (valid.length === 1) return valid[0].map((p) => ({ ...p, low: p.y, high: p.y }))

  // Hat jeder Seed nur einen einzigen Punkt (z. B. ein Endwert), liegen die Stellen meist nicht exakt
  // übereinander. Dann gibt es einen gemeinsamen Punkt an der mittleren Stelle.
  if (valid.every((curve) => curve.length === 1)) {
    const x = mean(valid.map((curve) => curve[0].x))
    return [{ x, ...summarize(valid.map((curve) => curve[0].y), mode) }]
  }

  const start = Math.max(...valid.map((curve) => curve[0].x))
  const end = Math.min(...valid.map((curve) => curve[curve.length - 1].x))
  let xs = [...new Set(valid.flatMap((curve) => curve.map((p) => p.x)))]
    .filter((x) => x >= start && x <= end)
    .sort((a, b) => a - b)
  // Bei vielen Seeds mit unterschiedlichen x-Werten (z. B. Rechenzeit) auf ein festes Raster begrenzen
  if (xs.length > MAX_GRID) xs = Array.from({ length: MAX_GRID }, (_, i) => start + ((end - start) * i) / (MAX_GRID - 1))

  return xs.map((x) => ({ x, ...summarize(valid.map((curve) => valueAt(curve, x)), mode) }))
}

/**
 * Ein Wert für einen Controller ohne Training: pro Seed der Mittelwert seiner Messpunkte,
 * darüber Mittelwert und Band über die Seeds. Wird im Diagramm als waagerechte Linie gezeichnet.
 */
export function aggregateReference(curves: CurvePoint[][], mode: BandMode = "range"): BandPoint | null {
  const perSeed = curves.filter((curve) => curve.length > 0).map((curve) => mean(curve.map((p) => p.y)))
  return perSeed.length ? { x: 0, ...summarize(perSeed, mode) } : null
}
