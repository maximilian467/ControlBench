import { useState, type PointerEvent, type ReactNode } from "react"
import { curveMonotoneX } from "@visx/curve"
import { localPoint } from "@visx/event"
import { ParentSize } from "@visx/responsive"
import { scaleLinear } from "@visx/scale"
import { Area, LinePath } from "@visx/shape"

/** low/high: optionales Band um y, z. B. Minimum und Maximum über mehrere Seeds */
export type ChartPoint = { x: number; y: number; low?: number; high?: number }

/**
 * line:      Lernkurve, gemittelt über die Seeds, mit Band
 * markers:   nur einzelne Messpunkte (z. B. Endwerte) als große X mit Fehlerbalken statt einer Linie
 * reference: Controller ohne Training (LQR, PID, ...) als waagerechte, gestrichelte Linie über die volle Breite
 */
export type SeriesKind = "line" | "markers" | "reference"

export type ChartSeries = {
  id: string
  label: string
  color: string
  kind: SeriesKind
  points: ChartPoint[] // nach x sortiert; bei reference genau ein Punkt (x wird ignoriert)
}

type MetricChartProps = {
  series: ChartSeries[]
  formatX: (value: number) => string
  formatY: (value: number) => string
  /** Beschriftung der y-Achse, bekommt zusätzlich den Abstand der Striche. Ohne Angabe: formatY */
  formatYTick?: (value: number, step: number) => string
  /** Feste y-Achse, z. B. [0, 1] für eine Erfolgsrate. Ohne Angabe: aus den Daten */
  yDomain?: [number, number]
  /** Rechtes Ende der x-Achse, z. B. für "gleiches Budget". Ohne Angabe: aus den Daten */
  xMax?: number
  height?: number
}

const MARGIN = { top: 12, right: 8, bottom: 28, left: 48 }
const MARKER_SIZE = 6 // halbe Kantenlänge des X in Pixeln

/** Liniendiagramm mehrerer Konfigurationen mit Fadenkreuz und Werten beim Überfahren. */
export function MetricChart(props: MetricChartProps) {
  const height = props.height ?? 320
  return (
    <div style={{ height }}>
      <ParentSize>{({ width }) => (width > 0 ? <Chart {...props} width={width} height={height} /> : null)}</ParentSize>
    </div>
  )
}

/** Index des Punkts, dessen x am nächsten an target liegt (binäre Suche, Punkte sind sortiert). */
function nearestIndex(points: ChartPoint[], target: number): number {
  let low = 0
  let high = points.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (points[mid].x < target) low = mid + 1
    else high = mid
  }
  if (low > 0 && Math.abs(points[low - 1].x - target) < Math.abs(points[low].x - target)) return low - 1
  return low
}

function hasBand(point: ChartPoint): boolean {
  return point.low !== undefined && point.high !== undefined && point.low !== point.high
}

function Chart({
  series,
  formatX,
  formatY,
  formatYTick,
  yDomain,
  xMax,
  width,
  height,
}: MetricChartProps & { width: number; height: number }) {
  const [hoverX, setHoverX] = useState<number | null>(null)

  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom
  const trained = series.filter((s) => s.kind !== "reference")
  const references = series.filter((s) => s.kind === "reference")
  const all = series.flatMap((s) => s.points)

  // Gibt es nur Referenzen oder nur Punkte bei x = 0, braucht die Achse trotzdem eine Breite
  const dataMax = Math.max(0, ...trained.flatMap((s) => s.points.map((p) => p.x)))
  const xScale = scaleLinear({ domain: [0, xMax ?? (dataMax || 1)], range: [0, innerWidth], nice: xMax === undefined })
  const yScale = scaleLinear({
    domain: yDomain ?? [Math.min(...all.map((p) => p.low ?? p.y)), Math.max(...all.map((p) => p.high ?? p.y))],
    range: [innerHeight, 0],
    nice: true,
  })

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const point = localPoint(event)
    if (!point) return
    const target = xScale.invert(point.x - MARGIN.left)
    // Einrasten auf den nächsten tatsächlich gemessenen Punkt; ohne gelernte Kurven einfach die Mausposition
    const candidates = trained.map((s) => s.points[nearestIndex(s.points, target)]).filter(Boolean)
    const snapped = candidates.length
      ? candidates.reduce((a, b) => (Math.abs(b.x - target) < Math.abs(a.x - target) ? b : a)).x
      : target
    setHoverX(snapped)
  }

  const yTicks = yScale.ticks(5)
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1

  // Beschriftungen der Referenzlinien: liegen zwei Linien nah beieinander, weichen die Texte nach unten aus
  // (nach oben ginge am oberen Rand nicht). Von oben nach unten, jede mindestens 12 Pixel unter der vorigen.
  const labelY = new Map<string, number>()
  let previous = -Infinity
  for (const s of [...references].sort((a, b) => yScale(a.points[0].y) - yScale(b.points[0].y))) {
    const y = Math.max(yScale(s.points[0].y) - 6, previous + 12, 4)
    labelY.set(s.id, y)
    previous = y
  }
  // Referenzwerte eine Stelle genauer als die Achse, damit nahe Linien unterscheidbar bleiben
  const formatReference = (v: number) => (formatYTick ? formatYTick(v, yStep / 10) : formatY(v))

  const tolerance = (xScale.domain()[1] / innerWidth) * 12 // 12 Pixel
  const hovered =
    hoverX === null
      ? []
      : [
          ...trained
            .map((s) => ({ series: s, point: s.points[nearestIndex(s.points, hoverX)] }))
            // Kurven, die an dieser Stelle schon zu Ende sind, nicht mitzählen
            .filter(({ point }) => point && Math.abs(point.x - hoverX) <= tolerance),
          // Referenzlinien gelten überall
          ...references.map((s) => ({ series: s, point: s.points[0] })),
        ].sort((a, b) => b.point.y - a.point.y)

  const tooltipLeft = hoverX === null ? 0 : MARGIN.left + xScale(hoverX)
  const flip = tooltipLeft > width - 220

  return (
    <div className="relative">
      <svg width={width} height={height} className="block overflow-visible">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Horizontale Hilfslinien mit Beschriftung der y-Achse */}
          {yTicks.map((tick) => (
            <g key={tick} transform={`translate(0,${yScale(tick)})`}>
              <line x2={innerWidth} stroke="var(--border)" />
              <text x={-10} dy="0.32em" textAnchor="end" className="fill-faint-foreground font-mono text-[10px]">
                {formatYTick ? formatYTick(tick, yStep) : formatY(tick)}
              </text>
            </g>
          ))}
          {/* Beschriftung der x-Achse, nur wenn es gelernte Kurven gibt */}
          {trained.length > 0 &&
            xScale.ticks(Math.max(2, Math.floor(innerWidth / 110))).map((tick, index, ticks) => (
              <text
                key={tick}
                x={xScale(tick)}
                y={innerHeight + 18}
                // Äußere Beschriftungen nach innen ausrichten, damit sie nicht abgeschnitten werden
                textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}
                className="fill-faint-foreground font-mono text-[10px]"
              >
                {formatX(tick)}
              </text>
            ))}

          {/* Referenzlinien zuerst, damit die Lernkurven darüber liegen */}
          {references.map((s) => {
            const point = s.points[0]
            return (
              <g key={s.id}>
                {hasBand(point) && (
                  <rect
                    x={0}
                    width={innerWidth}
                    y={yScale(point.high!)}
                    height={Math.max(1, yScale(point.low!) - yScale(point.high!))}
                    fill={s.color}
                    fillOpacity={0.08}
                  />
                )}
                <line
                  x2={innerWidth}
                  y1={yScale(point.y)}
                  y2={yScale(point.y)}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
                <text
                  x={innerWidth - 4}
                  y={labelY.get(s.id)}
                  textAnchor="end"
                  fill={s.color}
                  className="font-mono text-[10px]"
                >
                  {s.label} {formatReference(point.y)}
                </text>
              </g>
            )
          })}

          {/* Bänder der Lernkurven, damit alle Linien darüber liegen */}
          {trained.map(
            (s) =>
              s.kind === "line" &&
              s.points.some(hasBand) && (
                <Area
                  key={s.id}
                  data={s.points}
                  x={(p) => xScale(p.x)}
                  y0={(p) => yScale(p.low ?? p.y)}
                  y1={(p) => yScale(p.high ?? p.y)}
                  curve={curveMonotoneX}
                  fill={s.color}
                  fillOpacity={0.1}
                />
              ),
          )}
          {trained.map((s) =>
            s.kind === "line" ? (
              <LinePath
                key={s.id}
                data={s.points}
                x={(p) => xScale(p.x)}
                y={(p) => yScale(p.y)}
                curve={curveMonotoneX}
                stroke={s.color}
                strokeWidth={1.5}
                strokeOpacity={hoverX === null ? 1 : 0.85}
              />
            ) : (
              <g key={s.id}>
                {s.points.map((p) => (
                  <Marker key={p.x} x={xScale(p.x)} y={yScale(p.y)} color={s.color}>
                    {hasBand(p) && (
                      <ErrorBar x={xScale(p.x)} top={yScale(p.high!)} bottom={yScale(p.low!)} color={s.color} />
                    )}
                  </Marker>
                ))}
              </g>
            ),
          )}

          {hoverX !== null && (
            <g>
              <line
                x1={xScale(hoverX)}
                x2={xScale(hoverX)}
                y2={innerHeight}
                stroke="var(--faint-foreground)"
                strokeDasharray="2 3"
              />
              {hovered
                .filter(({ series: s }) => s.kind === "line")
                .map(({ series: s, point }) => (
                  <circle
                    key={s.id}
                    cx={xScale(point.x)}
                    cy={yScale(point.y)}
                    r={3}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />
                ))}
            </g>
          )}

          {/* Unsichtbare Fläche, die die Mausbewegung einfängt */}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHoverX(null)}
          />
        </g>
      </svg>

      {hoverX !== null && hovered.length > 0 && (
        <div
          className="pointer-events-none absolute top-2 min-w-52 rounded-md border bg-popover px-3 py-2 text-xs shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          style={flip ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
        >
          {trained.length > 0 && <p className="mb-1.5 font-mono text-faint-foreground">{formatX(hoverX)}</p>}
          {hovered.map(({ series: s, point }) => (
            <p key={s.id} className="flex items-center justify-between gap-4 font-mono tabular-nums">
              <span className="flex items-center gap-2 text-muted-foreground">
                <LegendSymbol kind={s.kind} color={s.color} />
                {s.label}
              </span>
              <span>
                {formatY(point.y)}
                {hasBand(point) && (
                  <span className="ml-2 text-faint-foreground">
                    {formatY(point.low!)} – {formatY(point.high!)}
                  </span>
                )}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function Marker({ x, y, color, children }: { x: number; y: number; color: string; children?: ReactNode }) {
  return (
    <g>
      {children}
      <path
        d={`M${x - MARKER_SIZE},${y - MARKER_SIZE}L${x + MARKER_SIZE},${y + MARKER_SIZE}M${x - MARKER_SIZE},${y + MARKER_SIZE}L${x + MARKER_SIZE},${y - MARKER_SIZE}`}
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
      />
    </g>
  )
}

/** Senkrechter Balken mit Endstrichen: Band eines Einzelpunkts */
function ErrorBar({ x, top, bottom, color }: { x: number; top: number; bottom: number; color: string }) {
  return (
    <path
      d={`M${x},${top}L${x},${bottom}M${x - 4},${top}L${x + 4},${top}M${x - 4},${bottom}L${x + 4},${bottom}`}
      stroke={color}
      strokeOpacity={0.55}
      strokeWidth={1.25}
    />
  )
}

/** Kleines Symbol für Legende und Tooltip, passend zur Darstellungsart */
export function LegendSymbol({ kind, color }: { kind: SeriesKind; color: string }) {
  if (kind === "markers") {
    return (
      <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
        <path d="M1,1L9,9M1,9L9,1" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 14 2" className="h-0.5 w-3.5" aria-hidden>
      <line x2={14} y1={1} y2={1} stroke={color} strokeWidth={2} strokeDasharray={kind === "reference" ? "4 2" : undefined} />
    </svg>
  )
}
