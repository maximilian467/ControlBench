import { useState } from "react"

import { MetricPicker } from "@/components/MetricPicker"
import type { Configuration, Stat } from "@/lib/configurations"
import { useI18n } from "@/lib/i18n"
import { isRateMetric, NOMINAL } from "@/lib/metrics"
import { NOTABLE_DROP, robustnessMetrics, scenariosFor } from "@/lib/robustness"
import { cn } from "@/lib/utils"

/**
 * Robustheit: derselbe Kennwert unter veränderten Bedingungen.
 * Zeilen = Konfigurationen, Spalten = Szenarien; rechts das schlechteste Szenario und der Einbruch gegenüber nominal.
 */
export function RobustnessTable({ configurations }: { configurations: Configuration[] }) {
  const { t, f } = useI18n()
  const names = robustnessMetrics(configurations)
  const [chosen, setChosen] = useState("success_rate")
  const name = names.includes(chosen) ? chosen : names[0]
  const scenarios = scenariosFor(configurations, name)
  const isRate = isRateMetric(name)
  const format = (value: number) => (isRate ? f.percent(value) : f.value(value))

  // Ohne bekannte Richtung (ist mehr besser?) gibt es kein "schlechtestes Szenario"; bei Anteilen ist mehr besser
  const rows = configurations
    .map((configuration) => {
      const values = scenarios.map((scenario) => configuration.evaluations.get(scenario)?.get(name) ?? null)
      const nominal = values[0] !== null && scenarios[0] === NOMINAL ? values[0] : null
      const others = values.slice(scenarios[0] === NOMINAL ? 1 : 0).filter((v): v is Stat => v !== null)
      const worst = isRate && others.length ? others.reduce((a, b) => (b.mean < a.mean ? b : a)) : null
      const worstScenario = worst ? scenarios[values.indexOf(worst)] : null
      return { configuration, values, nominal, worst, worstScenario }
    })
    .filter((row) => row.values.some((v) => v !== null))

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">{t.robustness}</h2>
          <MetricPicker names={names} value={name} onChange={setChosen} />
        </div>
        <span className="text-xs text-faint-foreground">{t.robustnessCaption}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-faint-foreground">
            <tr className="border-b">
              <th className="py-2.5 pl-5 text-left font-normal">{t.configuration}</th>
              {scenarios.map((scenario) => (
                <th key={scenario} className="px-3 py-2.5 text-right font-mono font-normal">
                  {scenario}
                </th>
              ))}
              {isRate && (
                <>
                  <th className="border-l px-3 py-2.5 text-right font-normal">{t.worstScenario}</th>
                  <th className="py-2.5 pr-5 pl-3 text-right font-normal">{t.dropVsNominal}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ configuration, values, nominal, worst, worstScenario }) => (
              <tr key={configuration.key} className="border-b last:border-b-0">
                <td className="py-2.5 pr-3 pl-5 font-medium whitespace-nowrap">{configuration.name}</td>
                {values.map((value, index) => (
                  <td
                    key={scenarios[index]}
                    className="px-3 py-2.5 text-right font-mono text-xs tabular-nums"
                    // Einbrüche gegenüber nominal hervorheben: je größer, desto kräftiger rot
                    style={cellStyle(isRate, nominal, value, index === 0 && scenarios[0] === NOMINAL)}
                  >
                    {value === null ? <span className="text-faint-foreground">–</span> : format(value.mean)}
                  </td>
                ))}
                {isRate && (
                  <>
                    <td className="border-l px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                      {worstScenario ?? "–"}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 pr-5 pl-3 text-right font-mono text-xs tabular-nums",
                        nominal && worst && nominal.mean - worst.mean > 0.1 && "text-destructive",
                      )}
                    >
                      {nominal && worst
                        ? `${nominal.mean - worst.mean > 0 ? "−" : "+"}${f.integer(Math.round(Math.abs(nominal.mean - worst.mean) * 100))} ${t.percentPoints}`
                        : "–"}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function cellStyle(isRate: boolean, nominal: Stat | null, value: Stat | null, isNominalColumn: boolean) {
  if (!isRate || nominal === null || value === null || isNominalColumn) return undefined
  const drop = nominal.mean - value.mean
  if (drop <= NOTABLE_DROP) return undefined
  // 10 Pp. Einbruch -> schwach, ab 50 Pp. -> kräftig
  const strength = Math.round(10 + Math.min(1, (drop - NOTABLE_DROP) / 0.4) * 25)
  return { background: `color-mix(in oklab, var(--destructive) ${strength}%, transparent)` }
}
