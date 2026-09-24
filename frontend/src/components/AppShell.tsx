import { Link, Outlet } from "react-router"

import { API_URL } from "@/lib/api"

/** Rahmen jeder Seite: Kopfzeile oben, darunter die aktuelle Seite (Outlet). */
export function AppShell() {
  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex h-12 max-w-[1200px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
            <img src="/favicon.svg" alt="" className="size-5" />
            ControlBench
          </Link>
          <span className="font-mono text-xs text-faint-foreground">API {API_URL.replace(/^https?:\/\//, "")}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
