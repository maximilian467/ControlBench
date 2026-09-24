import { ThinkingOrb, type OrbState } from "thinking-orbs"

type LoaderProps = {
  label: string
  state?: OrbState
}

/** Ladeanzeige für ganze Bereiche: Thinking Orb mit kurzer Beschriftung. */
export function Loader({ label, state = "searching" }: LoaderProps) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-4 py-24">
      <ThinkingOrb state={state} size={64} theme="dark" aria-label={label} />
      <p className="font-mono text-xs text-faint-foreground">{label}</p>
    </div>
  )
}
