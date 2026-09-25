/**
 * Die Standard-Metriken: dieselben Namen wie STANDARD_METRICS in experiments/example_upload.py.
 * Sie stehen in der Metrik-Auswahl ganz oben; alle anderen findet man über die Suche.
 */
export const STANDARD_METRICS = ["success_rate", "episode_reward", "control_effort", "episode_length", "tracking_error"]

const LABELS: Record<string, string> = {
  success_rate: "Success Rate",
  episode_reward: "Episode Reward",
  control_effort: "Control Effort",
  episode_length: "Episode Length",
  tracking_error: "Tracking Error",
}

/** Anzeigename einer Metrik: für Standard-Metriken ein lesbarer Name, sonst der Name selbst */
export function metricLabel(name: string): string {
  return LABELS[name] ?? name
}

/** Ab dieser Success Rate gilt ein Controller als "funktioniert", z. B. für "Steps bis 90 %" */
export const SUCCESS_THRESHOLD = 0.9

/** Name des Kennwerts für den Stellaufwand: Integral der quadrierten Stellgrößen über eine Episode */
export const CONTROL_EFFORT = "control_effort"

/** Szenario ohne Veränderung; alle anderen Szenarien sind Robustheitstests */
export const NOMINAL = "nominal"

/** Anteile (Namen auf _rate) haben eine feste Achse von 0 bis 100 % */
export function isRateMetric(name: string): boolean {
  return name.endsWith("_rate")
}
