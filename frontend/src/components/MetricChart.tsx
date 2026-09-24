import { useState, type PointerEvent } from "react"
import { curveMonotoneX } from "@visx/curve"
import { localPoint } from "@visx/event"
import { ParentSize } from "@visx/responsive"
import { scaleLinear } from "@visx/scale"
import { Area, LinePath } from "@visx/shape"

/** low/high: optionales Band um y, z. B. Minimum und Maximum über mehrere Seeds */
export type ChartPoint = { x: number; y: number; low?: number; high?: number }

export type ChartSeries = {
  id: string
  label: string
  color: string
  points: ChartPoint[] // nach x sortiert
}

type MetricChartProps = {
  series: ChartSeries[]
  formatX: (value: number) => string
  formatY: (value: number) => string
  /** Feste y-Achse, z. B. [0, 1] für eine Erfolgsrate. Ohne Angabe: aus den Daten */
  yDomain?: [number, number]
  height?: number
}

const MARGIN = { top: 12, right: 8, bottom: 28, left: 48 }

/** Liniendiagramm mehrerer Runs mit Fadenkreuz und Werten beim Überfahren. */
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

function Chart({ series, formatX, formatY, yDomain, width, height }: MetricChartProps & { width: number; height: number }) {
  const [hoverX, setHoverX] = useState<number | null>(null)

  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom
  const all = series.flatMap((s) => s.points)

  const xScale = scaleLinear({ domain: [0, Math.max(...all.map((p) => p.x))], range: [0, innerWidth], nice: true })
  const yScale = scaleLinear({
    domain: yDomain ?? [Math.min(...all.map((p) => p.low ?? p.y)), Math.max(...all.map((p) => p.high ?? p.y))],
    range: [innerHeight, 0],
    nice: true,
  })

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const point = localPoint(event)
    if (!point) return
    const target = xScale.invert(point.x - MARGIN.left)
    // Einrasten auf den nächsten tatsächlich gemessenen Punkt, über alle Runs
    const candidates = series.map((s) => s.points[nearestIndex(s.points, target)]).filter(Boolean)
    const snapped = candidates.reduce((a, b) => (Math.abs(b.x - target) < Math.abs(a.x - target) ? b : a))
    setHoverX(snapped.x)
  }

  const hovered =
    hoverX === null
      ? []
      : series
          .map((s) => ({ series: s, point: s.points[nearestIndex(s.points, hoverX)] }))
          // Runs, deren Kurve an dieser Stelle schon zu Ende ist, nicht mitzählen
          .filter(({ point }) => point && Math.abs(point.x - hoverX) <= (xScale.domain()[1] / innerWidth) * 12)
          .sort((a, b) => b.point.y - a.point.y)

  const tooltipLeft = hoverX === null ? 0 : MARGIN.left + xScale(hoverX)
  const flip = tooltipLeft > width - 200

  return (
    <div className="relative">
      <svg width={width} height={height} className="block overflow-visible">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Horizontale Hilfslinien mit Beschriftung der y-Achse */}
          {yScale.ticks(5).map((tick) => (
            <g key={tick} transform={`translate(0,${yScale(tick)})`}>
              <line x2={innerWidth} stroke="var(--border)" />
              <text x={-10} dy="0.32em" textAnchor="end" className="fill-faint-foreground font-mono text-[10px]">
                {formatY(tick)}
              </text>
            </g>
          ))}
          {/* Beschriftung der x-Achse */}
          {xScale.ticks(Math.max(2, Math.floor(innerWidth / 110))).map((tick, index, ticks) => (
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

          {/* Bänder zuerst, damit alle Linien darüber liegen */}
          {series.map(
            (s) =>
              s.points.some((p) => p.low !== undefined && p.low !== p.high) && (
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
          {series.map((s) => (
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
          ))}

          {hoverX !== null && (
            <g>
              <line x1={xScale(hoverX)} x2={xScale(hoverX)} y2={innerHeight} stroke="var(--faint-foreground)" strokeDasharray="2 3" />
              {hovered.map(({ series: s, point }) => (
                <circle key={s.id} cx={xScale(point.x)} cy={yScale(point.y)} r={3} fill={s.color} stroke="var(--card)" strokeWidth={1.5} />
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
          className="pointer-events-none absolute top-2 min-w-48 rounded-md border bg-popover px-3 py-2 text-xs shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          style={flip ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
        >
          <p className="mb-1.5 font-mono text-faint-foreground">{formatX(hoverX)}</p>
          {hovered.map(({ series: s, point }) => (
            <p key={s.id} className="flex items-center justify-between gap-4 font-mono tabular-nums">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span>
                {formatY(point.y)}
                {point.low !== undefined && point.high !== undefined && point.low !== point.high && (
                  <span className="ml-2 text-faint-foreground">
                    {formatY(point.low)} – {formatY(point.high)}
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
