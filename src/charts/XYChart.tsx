import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface Series {
  kind: "bar" | "line" | "area";
  name: string;
  color: string; // CSS colour (usually a var())
  x: number[];
  y: number[];
  /** bar width in x-units (bars only) */
  width?: number;
  dashed?: boolean;
}
export interface Marker { x: number; label: string }

interface Props {
  series: Series[];
  xDomain: [number, number];
  yMax?: number;
  height?: number;
  xTicks?: number[];
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  /** rows shown in the hover tooltip for the nearest x of the first series */
  tooltip?: (index: number) => { title: string; rows: { label: string; value: string; color?: string }[] };
  markers?: Marker[];
  ariaLabel: string;
}

export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.round(e[0]!.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Numeric X/Y chart: bars, lines, areas. Always drawn LTR (numeric axis). */
export function XYChart({ series, xDomain, yMax, height = 260, xTicks, xFormat, yFormat, tooltip, markers = [], ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 44, r: 20, t: markers.length ? 22 : 10, b: 26 };
  const iw = Math.max(10, width - m.l - m.r), ih = height - m.t - m.b;
  const dataMax = useMemo(() => Math.max(...series.flatMap((s) => s.y), 0), [series]);
  const ticksY = niceTicks(yMax ?? dataMax, 4);
  const top = Math.max(yMax ?? dataMax, ticksY[ticksY.length - 1]!);
  const sx = (v: number) => m.l + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * iw;
  const sy = (v: number) => m.t + ih - (v / (top || 1)) * ih;
  const tx = xTicks ?? Array.from({ length: 6 }, (_, i) => xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / 5);
  const first = series[0];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!first || !tooltip) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xv = xDomain[0] + ((e.clientX - rect.left - m.l) / iw) * (xDomain[1] - xDomain[0]);
    let best = 0, bd = Infinity;
    for (let i = 0; i < first.x.length; i++) { const d = Math.abs(first.x[i]! - xv); if (d < bd) { bd = d; best = i; } }
    setHover(best);
  }
  const tip = hover !== null && tooltip ? tooltip(hover) : null;
  const hx = hover !== null && first ? sx(first.x[hover]!) : 0;

  let body: ReactNode = null;
  if (width > 0) {
    body = (
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y", display: "block" }}>
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} className={v === 0 ? "ch-axis" : "ch-grid"} />
            <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" className="ch-tick">{yFormat(v)}</text>
          </g>
        ))}
        {tx.map((v) => <text key={v} x={sx(v)} y={height - 8} textAnchor="middle" className="ch-tick">{xFormat(v)}</text>)}
        {series.map((s) => {
          if (s.kind === "bar") {
            const bw = Math.max(1, ((s.width ?? 1) / (xDomain[1] - xDomain[0])) * iw - (iw / s.x.length > 6 ? 2 : 0.5));
            return (
              <g key={s.name} fill={s.color}>
                {s.x.map((x, i) => {
                  const y = sy(s.y[i]!), h = m.t + ih - y;
                  return h <= 0 ? null : <rect key={i} x={sx(x) - bw / 2} y={y} width={bw} height={h} rx={Math.min(3, bw / 2, h)} opacity={hover === null || hover === i || s !== first ? 1 : 0.55} />;
                })}
              </g>
            );
          }
          const d = s.x.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(s.y[i]!).toFixed(1)}`).join("");
          return (
            <g key={s.name}>
              {s.kind === "area" && <path d={`${d}L${sx(s.x[s.x.length - 1]!)},${sy(0)}L${sx(s.x[0]!)},${sy(0)}Z`} fill={s.color} opacity={0.12} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
            </g>
          );
        })}
        {markers.map((mk) => (
          <g key={mk.label}>
            <line x1={sx(mk.x)} x2={sx(mk.x)} y1={m.t - 4} y2={m.t + ih} className="ch-marker" />
            <text x={Math.min(Math.max(sx(mk.x), m.l + 14), m.l + iw - 14)} y={m.t - 9} textAnchor="middle" className="ch-marker-label">{mk.label}</text>
          </g>
        ))}
        {tip && first && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={m.t} y2={m.t + ih} className="ch-cross" />
            {series.filter((s) => s.kind !== "bar").map((s) => <circle key={s.name} cx={hx} cy={sy(s.y[hover!] ?? 0)} r={4} fill={s.color} className="ch-dot" />)}
          </g>
        )}
      </svg>
    );
  }
  return (
    <div className="chart" ref={ref} style={{ height }} dir="ltr">
      {body}
      {tip && (
        <div className="ch-tip" style={{ left: Math.min(Math.max(hx, 80), Math.max(80, width - 80)), top: m.t }} role="status">
          <div className="ch-tip-title">{tip.title}</div>
          {tip.rows.map((r) => (
            <div key={r.label} className="ch-tip-row">
              {r.color && <i style={{ background: r.color }} />}<span>{r.label}</span><b>{r.value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string; line?: boolean; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name} className="legend-item">
          <i className={i.line ? "key-line" : "key-box"} style={i.dashed ? { background: `repeating-linear-gradient(90deg, ${i.color} 0 5px, transparent 5px 9px)` } : { background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
