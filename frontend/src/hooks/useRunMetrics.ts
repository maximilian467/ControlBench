import { useEffect, useState } from "react"

import { api, type Metric } from "@/lib/api"

// Ein Diagramm ist etwa 1.000 Pixel breit; mehr Punkte pro Kurve sieht man nicht, sie kosten nur Ladezeit
const MAX_POINTS = 1000

type Entry<T> = { status: "success"; data: T } | { status: "error"; error: Error }

/**
 * Lädt für jeden Schlüssel einmal Daten und merkt sie sich.
 * Wird z. B. ein Run abgewählt und wieder ausgewählt, kommt er aus dem Speicher, ohne neue Anfrage.
 * Rückgabe: pro Schlüssel der Eintrag, oder undefined, solange er noch lädt.
 */
export function useCachedLoads<T>(keys: string[], load: (key: string) => Promise<T>) {
  const [cache, setCache] = useState<Record<string, Entry<T>>>({})

  // Als ein String, damit der Effect nur bei einer echten Änderung der Schlüssel neu läuft
  const keysId = keys.join("|")

  useEffect(() => {
    for (const key of keysId ? keysId.split("|") : []) {
      if (key in cache) continue
      load(key).then(
        (data) => setCache((current) => ({ ...current, [key]: { status: "success", data } })),
        (error: Error) => setCache((current) => ({ ...current, [key]: { status: "error", error } })),
      )
    }
    // cache und load absichtlich nicht als Abhängigkeit: jede Antwort würde sonst eine neue Runde auslösen
  }, [keysId]) // eslint-disable-line react-hooks/exhaustive-deps

  return keys.map((key) => cache[key])
}

/** Welche Metriken haben diese Runs zusammen? */
export function useMetricNames(runIds: number[]) {
  const entries = useCachedLoads(runIds.map(String), (id) => api.metricNames(Number(id)))
  const names = [...new Set(entries.flatMap((entry) => (entry?.status === "success" ? entry.data : [])))].sort()
  return { names, loading: entries.some((entry) => entry === undefined) }
}

/** Messpunkte einer Metrik für mehrere Runs, ausgedünnt auf MAX_POINTS pro Run. */
export function useRunMetrics(runIds: number[], name: string | null) {
  const keys = name === null ? [] : runIds.map((id) => `${id}:${name}`)
  const entries = useCachedLoads(keys, (key) => {
    const [id, metricName] = [Number(key.split(":")[0]), key.slice(key.indexOf(":") + 1)]
    return api.metrics(id, metricName, MAX_POINTS)
  })

  const byRun = new Map<number, Entry<Metric[]> | undefined>(runIds.map((id, index) => [id, entries[index]]))
  return { byRun, loading: name !== null && entries.some((entry) => entry === undefined) }
}
