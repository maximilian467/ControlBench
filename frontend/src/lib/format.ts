const decimal = (digits: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })

const integer = new Intl.NumberFormat("de-DE")

/** -150.3 -> "−150,3" (echtes Minuszeichen, damit Spalten sauber fluchten) */
export function formatReward(value: number): string {
  return decimal(1).format(value).replace("-", "−")
}

export function formatSeconds(value: number | null): string {
  return value === null ? "–" : `${decimal(2).format(value)} s`
}

export function formatInteger(value: number | null): string {
  return value === null ? "–" : integer.format(value)
}

/** Dauer für Achsen: kurze Zeiten in Sekunden mit Nachkommastellen, lange in Minuten oder Stunden. */
export function formatDuration(seconds: number): string {
  if (seconds < 10) return `${decimal(2).format(seconds)} s`
  if (seconds < 120) return `${decimal(1).format(seconds)} s`
  if (seconds < 7200) return `${decimal(1).format(seconds / 60)} min`
  return `${decimal(1).format(seconds / 3600)} h`
}

/** Steps für Achsen, kurz wie in ML-Tools üblich: 500 -> "500", 2.000 -> "2k", 200.000.000 -> "200M". */
export function formatSteps(steps: number): string {
  const short = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 })
  if (Math.abs(steps) >= 1e9) return `${short.format(steps / 1e9)}B`
  if (Math.abs(steps) >= 1e6) return `${short.format(steps / 1e6)}M`
  if (Math.abs(steps) >= 1e3) return `${short.format(steps / 1e3)}k`
  return integer.format(steps)
}
