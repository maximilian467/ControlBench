import { useCallback, useEffect, useEffectEvent, useState } from "react"

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "success"; data: T }

type Settled<T> = Exclude<AsyncState<T>, { status: "loading" }>

/**
 * Führt eine asynchrone Funktion aus (z. B. einen API-Aufruf) und liefert ihren Zustand:
 * loading -> success mit Daten, oder error. reload() startet sie erneut.
 *
 * key benennt die Anfrage, z. B. "experiment-3". Ändert sich der key, wird neu geladen.
 * Bei reload() bleiben die bisherigen Daten sichtbar, bis die neuen da sind (refreshing = true).
 */
export function useAsync<T>(load: () => Promise<T>, key: string) {
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${key}#${attempt}`

  // Gespeichert wird nur das Ergebnis, zusammen mit der Anfrage, zu der es gehört
  const [result, setResult] = useState<{ key: string; state: Settled<T> } | null>(null)

  // useEffectEvent: liest immer die aktuelle load-Funktion, ohne dass der Effect davon abhängt
  const runLoad = useEffectEvent(load)

  useEffect(() => {
    // Verhindert, dass eine veraltete Antwort (z. B. nach Seitenwechsel) den Zustand überschreibt
    let cancelled = false
    runLoad().then(
      (data) => !cancelled && setResult({ key: requestKey, state: { status: "success", data } }),
      (error: Error) => !cancelled && setResult({ key: requestKey, state: { status: "error", error } }),
    )
    return () => {
      cancelled = true
    }
  }, [requestKey])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const current = result?.key === requestKey
  // Ältere Daten derselben Anfrage (vor reload) dürfen stehen bleiben, Daten einer anderen Seite nicht
  const stale = !current && result?.key.startsWith(`${key}#`) && result.state.status === "success"

  const state: AsyncState<T> = current || stale ? result!.state : { status: "loading" }
  return { ...state, reload, refreshing: Boolean(stale) }
}
