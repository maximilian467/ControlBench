import { cn } from "@/lib/utils"

type SegmentedProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  "aria-label"?: string
}

/** Umschalter zwischen wenigen Optionen, z. B. Steps / Rechenzeit oder EN / DE. */
export function Segmented<T extends string>({ value, onChange, options, "aria-label": ariaLabel }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-md border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-6 rounded-[4px] px-2.5 text-xs transition-colors",
            value === option.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
