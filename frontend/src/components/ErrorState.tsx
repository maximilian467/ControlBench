import { Link } from "react-router"

import { Button, buttonVariants } from "@/components/ui/button"
import { API_URL, ApiError } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

type ErrorStateProps = {
  error: Error
  onRetry: () => void
}

/** Fehleranzeige mit konkretem Hinweis, was zu tun ist. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // fetch wirft einen TypeError, wenn der Server gar nicht antwortet; ApiError heißt: er antwortet mit Fehler
  const apiError = error instanceof ApiError ? error : null
  const offline = apiError === null
  const { t } = useI18n()

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-24">
      <p className="text-sm font-medium">
        {offline ? t.noConnection : t.apiError(apiError.status)}
      </p>
      <p className="text-sm text-muted-foreground">
        {offline ? <OfflineHint template={t.offlineHint} /> : error.message}
      </p>
      {apiError?.status === 404 ? (
        // Nochmal versuchen hilft nicht, wenn es die Seite nicht gibt
        <Link to="/" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
          {t.backToOverview}
        </Link>
      ) : (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          {t.retry}
        </Button>
      )}
    </div>
  )
}

const OFFLINE_VALUES: Record<string, string> = {
  api: API_URL,
  folder: "backend/",
  command: "uvicorn main:app --reload",
}

/** Setzt Adresse, Ordner und Befehl in Monospace in den übersetzten Satz ein. */
function OfflineHint({ template }: { template: string }) {
  return template.split(/\{(\w+)\}/).map((part, index) =>
    // split mit Klammergruppe: ungerade Indizes sind die Platzhalternamen
    index % 2 === 1 ? (
      <span key={index} className="font-mono text-foreground">
        {OFFLINE_VALUES[part]}
      </span>
    ) : (
      part
    ),
  )
}
