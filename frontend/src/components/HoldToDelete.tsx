import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { ThinkingOrb } from "thinking-orbs"

import { cn } from "@/lib/utils"

const HOLD_MS = 3000

type HoldToDeleteProps = {
  /** Wird aufgerufen, wenn der Button HOLD_MS lang gedrückt wurde */
  onConfirm: () => Promise<void>
  label: string
  /** Beschreibt für Screenreader, was gelöscht wird, z. B. "Run 12" */
  target: string
  className?: string
}

type Phase = "idle" | "holding" | "deleting" | "hint" | "failed"

/**
 * Löschen erst nach 3 Sekunden Gedrückthalten (Maus, Touch oder Leertaste/Enter).
 * Loslassen vorher bricht ab. Ein kurzer Klick zeigt einen Hinweis statt zu löschen.
 */
export function HoldToDelete({ onConfirm, label, target, className }: HoldToDeleteProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Beim Verlassen der Seite keinen Timer weiterlaufen lassen
  useEffect(() => () => clearTimeout(timer.current), [])

  function start() {
    if (phase === "deleting") return
    setPhase("holding")
    timer.current = setTimeout(async () => {
      setPhase("deleting")
      try {
        await onConfirm()
      } catch {
        setPhase("failed")
        timer.current = setTimeout(() => setPhase("idle"), 2000)
      }
    }, HOLD_MS)
  }

  function cancel() {
    if (phase !== "holding") return
    clearTimeout(timer.current)
    // Zu früh losgelassen: kurz erklären, wie es geht
    setPhase("hint")
    timer.current = setTimeout(() => setPhase("idle"), 1600)
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    start()
  }

  function onKeyDown(event: KeyboardEvent) {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault()
      start()
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.key === " " || event.key === "Enter") cancel()
  }

  const text = {
    idle: label,
    holding: "Halten …",
    deleting: "Lösche",
    hint: "3 s gedrückt halten",
    failed: "Fehlgeschlagen",
  }[phase]

  return (
    <button
      type="button"
      aria-label={`${label}: ${target}. Zum Löschen 3 Sekunden gedrückt halten.`}
      aria-busy={phase === "deleting"}
      disabled={phase === "deleting"}
      onPointerDown={onPointerDown}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={cancel}
      // Ein normaler Klick löscht nie, nur das Halten
      onClick={(event) => event.preventDefault()}
      className={cn(
        "relative inline-flex h-7 touch-none items-center justify-center gap-1.5 overflow-hidden rounded-md border px-2.5 text-xs whitespace-nowrap select-none",
        "text-muted-foreground transition-colors hover:border-destructive/40 hover:text-foreground",
        "focus-visible:border-ring focus-visible:outline-none",
        phase === "holding" && "border-destructive/60 text-foreground",
        (phase === "hint" || phase === "failed") && "text-destructive",
        className,
      )}
    >
      {/* Füllung: wächst in genau HOLD_MS von links nach rechts, springt beim Loslassen zurück */}
      <span
        aria-hidden
        className="absolute inset-0 origin-left bg-destructive/25"
        style={{
          transform: `scaleX(${phase === "holding" || phase === "deleting" ? 1 : 0})`,
          transition: phase === "holding" ? `transform ${HOLD_MS}ms linear` : "transform 180ms ease-out",
        }}
      />
      {phase === "deleting" && <ThinkingOrb state="breathing" size={20} theme="dark" className="relative -my-1" />}
      <span className="relative">{text}</span>
    </button>
  )
}
