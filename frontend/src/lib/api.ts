// Alles, was mit dem Backend spricht, läuft über diese Datei.
// Die Typen spiegeln die Pydantic-Modelle in backend/models/.

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000"

export type Experiment = {
  id: number
  name: string
  environment: string
  description: string | null
}

export type Run = {
  id: number
  experiment_id: number
  controller: string // z. B. "SAC", "PPO", "LQR"
  name: string // Konfiguration; Runs mit gleichem Namen unterscheiden sich nur im Seed
  trains: boolean // false bei Controllern ohne Training (LQR, PID, ...)
  seed: number
  reward: number
  stability_time: number | null // null = nie stabil
  recovery_time: number | null
  num_steps: number | null
  duration: number | null // Rechenzeit in Sekunden
  hyperparameters: Record<string, unknown> | null // Einstellungen der Konfiguration, frei aufgebaut
}

/** Ein Endkennwert eines Runs, z. B. control_effort im Szenario "nominal" */
export type Evaluation = {
  id: number
  run_id: number
  scenario: string // "nominal" oder ein Robustheitstest, z. B. "mass+20%"
  name: string
  value: number
}

/** Pro Run berechnet der Server, wann die Success Rate die Schwelle erreicht hat, plus die Kennwerte */
export type RunSummary = {
  run_id: number
  steps_to_threshold: number | null // null = nie erreicht
  time_to_threshold: number | null
  last_success_rate: number | null
  evaluations: Evaluation[]
}

export type Metric = {
  id: number
  run_id: number
  name: string // z. B. "success_rate"
  step: number
  value: number
  time: number | null // Sekunden seit Start des Runs; null = nicht erfasst
}

/** Fehler mit HTTP-Status, damit die Oberfläche z. B. 404 gezielt behandeln kann. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init)
  if (!res.ok) {
    // FastAPI schickt Fehler als {"detail": "..."}
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? res.statusText)
  }
  // 204 No Content hat keinen Inhalt, den man als JSON lesen könnte
  return (res.status === 204 ? undefined : res.json()) as Promise<T>
}

export const api = {
  experiments: () => request<Experiment[]>("/experiments"),
  experiment: (id: number) => request<Experiment>(`/experiments/${id}`),
  deleteExperiment: (id: number) => request<void>(`/experiments/${id}`, { method: "DELETE" }),
  runs: (experimentId?: number) =>
    request<Run[]>(experimentId === undefined ? "/runs" : `/runs?experiment_id=${experimentId}`),
  deleteRun: (id: number) => request<void>(`/runs/${id}`, { method: "DELETE" }),
  /** Messpunkte einer Metrik, vom Server auf höchstens maxPoints Punkte ausgedünnt */
  metrics: (runId: number, name: string, maxPoints: number) =>
    request<Metric[]>(`/runs/${runId}/metrics?name=${encodeURIComponent(name)}&max_points=${maxPoints}`),
  metricNames: (runId: number) => request<string[]>(`/runs/${runId}/metrics/names`),
  summaries: (experimentId: number | undefined, threshold: number) =>
    request<RunSummary[]>(
      experimentId === undefined
        ? `/summaries?threshold=${threshold}`
        : `/summaries?experiment_id=${experimentId}&threshold=${threshold}`,
    ),
}
