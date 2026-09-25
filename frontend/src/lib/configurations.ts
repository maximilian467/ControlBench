import type { Run } from "@/lib/api"

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

function present(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null)
}

/** Gruppiert Runs nach Konfiguration und sortiert nach mittlerem Reward, beste zuerst. */
export function groupConfigurations(runs: Run[]): Configuration[] {
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
      }
    })
    .sort((a, b) => b.rewardMean - a.rewardMean)
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
