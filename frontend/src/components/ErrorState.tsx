import { Link } from "react-router"

import { Button, buttonVariants } from "@/components/ui/button"
import { API_URL, ApiError } from "@/lib/api"

type ErrorStateProps = {
  error: Error
  onRetry: () => void
}

/** Fehleranzeige mit konkretem Hinweis, was zu tun ist. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // fetch wirft einen TypeError, wenn der Server gar nicht antwortet; ApiError heißt: er antwortet mit Fehler
  const apiError = error instanceof ApiError ? error : null
  const offline = apiError === null

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-24">
      <p className="text-sm font-medium">
        {offline ? "Keine Verbindung zur API" : `Die API hat mit Fehler ${apiError.status} geantwortet`}
      </p>
      <p className="text-sm text-muted-foreground">
        {offline ? (
          <>
            Unter <span className="font-mono text-foreground">{API_URL}</span> antwortet kein Server. Starte das
            Backend im Ordner <span className="font-mono text-foreground">backend/</span> mit{" "}
            <span className="font-mono text-foreground">uvicorn main:app --reload</span>.
          </>
        ) : (
          error.message
        )}
      </p>
      {apiError?.status === 404 ? (
        // Nochmal versuchen hilft nicht, wenn es die Seite nicht gibt
        <Link to="/" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
          Zur Übersicht
        </Link>
      ) : (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          Erneut versuchen
        </Button>
      )}
    </div>
  )
}
