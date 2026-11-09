import type { ReactNode } from "react";
import { useWidth } from "./XYChart.tsx";

/** Horizontal bar list — label · bar · value. Plain HTML, so it mirrors correctly in RTL. */
export function BarList({ rows, max, color = "var(--series-1)" }: {
  rows: { key: string; label: ReactNode; value: number; display: string; note?: string }[];
  max?: number; color?: string;
}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="bl-label">{r.label}</span>
          <span className="bl-track" aria-hidden="true"><i style={{ inlineSize: `${Math.max(0.5, (r.value / top) * 100)}%`, background: color }} /></span>
          <span className="bl-value"><b><bdi>{r.display}</bdi></b>{r.note && <small><bdi>{r.note}</bdi></small>}</span>
        </li>
      ))}
    </ul>
  );
}

/** One whole split into labelled parts (replaces a donut). */
export function SegmentBar({ parts }: { parts: { key: string; label: string; value: number; display: string; share: string; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="segbar" aria-hidden="true">
        {parts.map((p) => <i key={p.key} style={{ flexGrow: p.value / total, background: p.color }} title={`${p.label}: ${p.share}`} />)}
      </div>
      <ul className="seglegend">
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{p.share}</b>
            <small>{p.display}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Linear meter with an optional marker. */
export function Meter({ value, max = 100, tone = "var(--primary)", label }: { value: number; max?: number; tone?: string; label: string }) {
  const p = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <i style={{ inlineSize: `${p}%`, background: tone }} />
    </div>
  );
}

export function Spark({ values, label }: { values: number[]; label: string }) {
  const w = 96, h = 30, pad = 4;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pt = (v: number, i: number): [number, number] => [pad + (i / (values.length - 1)) * (w - 2 * pad), h - pad - ((v - min) / rng) * (h - 2 * pad)];
  const pts = values.map(pt);
  const hist = pts.slice(0, -1), last = pts[pts.length - 1]!, prev = pts[pts.length - 2]!;
  return (
    <svg width={w} height={h} role="img" aria-label={label} className="spark">
      <polyline points={hist.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--muted-mark)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={prev[0]} y1={prev[1]} x2={last[0]} y2={last[1]} stroke="var(--series-1)" strokeWidth={2} strokeDasharray="3 3" />
      <circle cx={last[0]} cy={last[1]} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

/** Violin (mirrored density) with an inner box (IQR bar + median tick) per row. */
export function ViolinRows({ rows, domain = [0, 100], xFormat }: {
  rows: { key: string; label: string; sub: string; color: string; kde: { x: number[]; y: number[] }; q1: number; median: number; q3: number; lo: number; hi: number }[];
  domain?: [number, number]; xFormat: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rowH = 64, axisH = 22, h = rows.length * rowH + axisH;
  const sx = (v: number) => ((v - domain[0]) / (domain[1] - domain[0])) * Math.max(10, width - 36) + 18;
  const ticks = [0, 25, 50, 75, 100];
  return (
    <div className="violin">
      <div className="violin-labels" style={{ gridTemplateRows: `repeat(${rows.length}, ${rowH}px)` }}>
        {rows.map((r) => <div key={r.key}><b><i style={{ background: r.color }} />{r.label}</b><small>{r.sub}</small></div>)}
      </div>
      <div ref={ref} dir="ltr" style={{ height: h, minWidth: 0 }}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label={rows.map((r) => `${r.label}: ${r.sub}`).join("; ")} style={{ display: "block" }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={sx(t)} x2={sx(t)} y1={0} y2={h - axisH} className="ch-grid" />
                <text x={sx(t)} y={h - 6} textAnchor="middle" className="ch-tick">{xFormat(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cy = i * rowH + rowH / 2, maxD = Math.max(...r.kde.y) || 1, amp = rowH / 2 - 8;
              // Draw only where there is visible density, so empty ranges are not outlined.
              const runs: number[][] = [];
              r.kde.y.forEach((d, k) => { if (d / maxD > 0.004) { const last = runs[runs.length - 1]; if (last && last[last.length - 1] === k - 1) last.push(k); else runs.push([k]); } });
              const P = (k: number, sign: 1 | -1) => `${sx(r.kde.x[k]!).toFixed(1)},${(cy + sign * (r.kde.y[k]! / maxD) * amp).toFixed(1)}`;
              return (
                <g key={r.key}>
                  {runs.filter((run) => run.length > 1).map((run) => (
                    <polygon key={run[0]} points={[...run.map((k) => P(k, -1)), ...[...run].reverse().map((k) => P(k, 1))].join(" ")} fill={r.color} fillOpacity={0.22} stroke={r.color} strokeWidth={1.5} strokeLinejoin="round" />
                  ))}
                  <line x1={sx(r.lo)} x2={sx(r.hi)} y1={cy} y2={cy} stroke="var(--ink-2)" strokeWidth={1} />
                  <rect x={sx(r.q1)} y={cy - 5} width={Math.max(2, sx(r.q3) - sx(r.q1))} height={10} rx={3} fill="var(--ink-2)" />
                  <line x1={sx(r.median)} x2={sx(r.median)} y1={cy - 9} y2={cy + 9} stroke="var(--surface)" strokeWidth={3} />
                  <line x1={sx(r.median)} x2={sx(r.median)} y1={cy - 9} y2={cy + 9} stroke="var(--ink)" strokeWidth={1.5} />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

/** Dot + interval rows: thin = 95% interval, thick = scenario band, dot = estimate. */
export function RangeRows({ rows, domain, xFormat, marker }: {
  rows: { key: string; label: ReactNode; value: string; lo: number; hi: number; bandLo: number; bandHi: number; point: number; title: string }[];
  domain: [number, number]; xFormat: (v: number) => string; marker?: { x: number; label: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rowH = 34, axisH = 22, topH = marker ? 18 : 0, h = rows.length * rowH + axisH + topH;
  const sx = (v: number) => ((v - domain[0]) / (domain[1] - domain[0])) * Math.max(10, width - 36) + 18;
  const ticks: number[] = [];
  for (let t = Math.ceil(domain[0] / 10) * 10; t <= domain[1]; t += 10) ticks.push(t);
  return (
    <div className="ranges">
      <div className="ranges-labels" style={{ gridTemplateRows: `repeat(${rows.length}, ${rowH}px)`, paddingBlockStart: topH }}>
        {rows.map((r) => <div key={r.key}>{r.label}</div>)}
      </div>
      <div ref={ref} dir="ltr" style={{ height: h, minWidth: 0 }}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label={rows.map((r) => r.title).join("; ")} style={{ display: "block" }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={sx(t)} x2={sx(t)} y1={topH} y2={h - axisH} className="ch-grid" />
                <text x={sx(t)} y={h - 6} textAnchor="middle" className="ch-tick">{xFormat(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cy = topH + i * rowH + rowH / 2;
              return (
                <g key={r.key}>
                  <title>{r.title}</title>
                  <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill="transparent" />
                  <line x1={sx(r.lo)} x2={sx(r.hi)} y1={cy} y2={cy} stroke="var(--series-1)" strokeWidth={2} opacity={0.45} strokeLinecap="round" />
                  <line x1={sx(r.bandLo)} x2={sx(r.bandHi)} y1={cy} y2={cy} stroke="var(--series-1)" strokeWidth={8} opacity={0.5} strokeLinecap="round" />
                  <circle cx={sx(r.point)} cy={cy} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
                </g>
              );
            })}
            {marker && marker.x >= domain[0] && marker.x <= domain[1] && (
              <g>
                <line x1={sx(marker.x)} x2={sx(marker.x)} y1={topH - 2} y2={h - axisH} className="ch-marker" />
                <text x={Math.min(Math.max(sx(marker.x), 16), width - 16)} y={11} textAnchor="middle" className="ch-marker-label">{marker.label}</text>
              </g>
            )}
          </svg>
        )}
      </div>
      <div className="ranges-values" style={{ gridTemplateRows: `repeat(${rows.length}, ${rowH}px)`, paddingBlockStart: topH }}>
        {rows.map((r) => <div key={r.key}>{r.value}</div>)}
      </div>
    </div>
  );
}

/** Trend: historical anchors (line) + estimate (dot with interval whisker). */
export function TrendChart({ history, estimate, lo, hi, yFormat, labels }: {
  history: { year: number; cutoff: number }[]; estimate: { year: number; value: number }; lo: number; hi: number;
  yFormat: (v: number) => string; labels: { historical: string; estimate: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 240, m = { l: 46, r: 46, t: 14, b: 26 };
  const iw = Math.max(10, width - m.l - m.r), ih = height - m.t - m.b;
  const years = [...history.map((p) => p.year), estimate.year];
  const vals = [...history.map((p) => p.cutoff), lo, hi];
  const y0 = Math.floor(Math.min(...vals) - 1), y1 = Math.ceil(Math.max(...vals) + 1);
  const sx = (y: number) => m.l + ((y - years[0]!) / (years[years.length - 1]! - years[0]!)) * iw;
  const sy = (v: number) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const step = Math.max(1, Math.round((y1 - y0) / 4));
  const ticks: number[] = [];
  for (let v = y0; v <= y1; v += step) ticks.push(v);
  const lastH = history[history.length - 1]!;
  return (
    <div className="chart" ref={ref} style={{ height }} dir="ltr">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${labels.historical}: ${history.map((p) => `${p.year} ${yFormat(p.cutoff)}`).join(", ")}. ${labels.estimate}: ${yFormat(estimate.value)} (${yFormat(lo)}–${yFormat(hi)})`} style={{ display: "block" }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} className="ch-grid" />
              <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" className="ch-tick">{yFormat(v)}</text>
            </g>
          ))}
          {years.map((y) => <text key={y} x={sx(y)} y={height - 8} textAnchor="middle" className="ch-tick">{y}</text>)}
          <polyline points={history.map((p) => `${sx(p.year)},${sy(p.cutoff)}`).join(" ")} fill="none" stroke="var(--muted-mark)" strokeWidth={2} strokeLinejoin="round" />
          <line x1={sx(lastH.year)} y1={sy(lastH.cutoff)} x2={sx(estimate.year)} y2={sy(estimate.value)} stroke="var(--series-1)" strokeWidth={2} strokeDasharray="5 4" />
          {history.map((p) => <circle key={p.year} cx={sx(p.year)} cy={sy(p.cutoff)} r={4} fill="var(--muted-mark)" stroke="var(--surface)" strokeWidth={2}><title>{`${p.year}: ${yFormat(p.cutoff)}`}</title></circle>)}
          <line x1={sx(estimate.year)} x2={sx(estimate.year)} y1={sy(hi)} y2={sy(lo)} stroke="var(--series-1)" strokeWidth={2} opacity={0.5} />
          <line x1={sx(estimate.year) - 5} x2={sx(estimate.year) + 5} y1={sy(hi)} y2={sy(hi)} stroke="var(--series-1)" strokeWidth={2} opacity={0.5} />
          <line x1={sx(estimate.year) - 5} x2={sx(estimate.year) + 5} y1={sy(lo)} y2={sy(lo)} stroke="var(--series-1)" strokeWidth={2} opacity={0.5} />
          <circle cx={sx(estimate.year)} cy={sy(estimate.value)} r={5.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          <text x={sx(estimate.year) + 9} y={sy(estimate.value) + 4} className="ch-value">{yFormat(estimate.value)}</text>
        </svg>
      )}
    </div>
  );
}
