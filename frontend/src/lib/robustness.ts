import type { Configuration } from "@/lib/configurations"
import { NOMINAL } from "@/lib/metrics"

/** Ab diesem Einbruch gegenüber nominal (in Anteilen, 0.1 = 10 Prozentpunkte) wird eine Zelle hervorgehoben */
export const NOTABLE_DROP = 0.1

/** Kennwerte, die es außer in nominal noch in mindestens einem weiteren Szenario gibt */
export function robustnessMetrics(configurations: Configuration[]): string[] {
  const names = new Set<string>()
  for (const configuration of configurations) {
    for (const [scenario, byName] of configuration.evaluations) {
      if (scenario !== NOMINAL) for (const name of byName.keys()) names.add(name)
    }
  }
  return [...names].sort()
}

/** Szenarien, in denen es für diesen Kennwert Werte gibt; nominal immer zuerst */
export function scenariosFor(configurations: Configuration[], name: string): string[] {
  const scenarios = new Set<string>()
  for (const configuration of configurations) {
    for (const [scenario, byName] of configuration.evaluations) if (byName.has(name)) scenarios.add(scenario)
  }
  return [...scenarios].sort((a, b) => (a === NOMINAL ? -1 : b === NOMINAL ? 1 : a.localeCompare(b)))
}
