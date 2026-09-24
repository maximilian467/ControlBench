/** Alle Zahlenformate für eine Sprache, z. B. "en-US": 1,234.5 oder "de-DE": 1.234,5 */
export function createFormatters(locale: string) {
  const decimal = (digits: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const [oneDecimal, twoDecimals] = [decimal(1), decimal(2)]
  const integerFormat = new Intl.NumberFormat(locale)
  const short = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 })

  return {
    /** -150.3 -> "−150.3" (echtes Minuszeichen, damit Spalten sauber fluchten) */
    reward: (v: number) => oneDecimal.format(v).replace("-", "−"),

    seconds: (v: number | null) => (v === null ? "–" : `${twoDecimals.format(v)} s`),

    integer: (v: number | null) => (v === null ? "–" : integerFormat.format(v)),

    /** Dauer für Achsen: kurze Zeiten in Sekunden mit Nachkommastellen, lange in Minuten oder Stunden. */
    duration: (seconds: number) => {
      if (seconds < 10) return `${twoDecimals.format(seconds)} s`
      if (seconds < 120) return `${oneDecimal.format(seconds)} s`
      if (seconds < 7200) return `${oneDecimal.format(seconds / 60)} min`
      return `${oneDecimal.format(seconds / 3600)} h`
    },

    /** Steps für Achsen, kurz wie in ML-Tools üblich: 500 -> "500", 2.000 -> "2k", 200.000.000 -> "200M". */
    steps: (steps: number) => {
      if (Math.abs(steps) >= 1e9) return `${short.format(steps / 1e9)}B`
      if (Math.abs(steps) >= 1e6) return `${short.format(steps / 1e6)}M`
      if (Math.abs(steps) >= 1e3) return `${short.format(steps / 1e3)}k`
      return integerFormat.format(steps)
    },

    /** Beliebiger Messwert im Diagramm */
    value: (v: number) => value.format(v),

    /** 0.94 -> "94%" (en) bzw. "94 %" (de) */
    percent: (v: number) => percent.format(v),
  }
}

export type Formatters = ReturnType<typeof createFormatters>
