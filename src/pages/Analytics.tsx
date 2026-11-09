import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/index.tsx";
import { useCore, useQuality } from "../data/store.tsx";
import type { TopStudent } from "../data/types.ts";
import { ADMISSION_2026 } from "../rules/admission2026.ts";
import { nameKey } from "../domain/search.ts";
import { normalizeDigits } from "../domain/scores.ts";
import { Card, ChartCard, DataTable, ExportBar, Note, PageHead, Ready, STATUS_COLOR, Stat, YearBadge, type Column } from "../components/ui.tsx";
import { Legend, XYChart } from "../charts/XYChart.tsx";
import { BarList, Meter, SegmentBar, ViolinRows } from "../charts/Parts.tsx";

const kfmt = (v: number) => (v >= 1000 ? `${v / 1000}K` : String(v));
const rankClass = (r: number) => (r <= 3 ? `rank r${r}` : "rank");

function useTopColumns(): Column<TopStudent>[] {
  const { t, n, f, g } = useI18n();
  return [
    { key: "rank", label: t.col.rank, cell: (r) => <span className={rankClass(r.national_rank)}>{n(r.national_rank)}</span>, value: (r) => r.national_rank, num: true },
    { key: "name", label: t.col.name, cell: (r) => r.name, value: (r) => r.name, strong: true },
    { key: "seat", label: t.col.seat, cell: (r) => <bdi className="muted">{r.seating_no}</bdi>, value: (r) => r.seating_no, num: true },
    { key: "score", label: t.col.score, cell: (r) => g(r.total_degree, 1), value: (r) => r.total_degree, num: true },
    { key: "pct", label: t.col.percentage, cell: (r) => `${f(r.percentage, 2)}%`, value: (r) => r.percentage, num: true, strong: true },
    { key: "perf", label: t.col.perf, cell: (r) => f(r.performance_index, 1), value: (r) => r.performance_index, num: true },
  ];
}

/* ============================ Overview ============================ */
export function Overview() {
  const { t, n, f } = useI18n();
  const core = useCore();
  const topCols = useTopColumns();
  return (
    <div className="page">
      <PageHead title={t.overview.title} sub={t.overview.sub} badge={<YearBadge />} />
      <Ready of={core}>
        {({ a }) => {
          const pass = a.status_distribution.find((s) => s.key === "pass_r1")!;
          const t90 = a.thresholds.find((x) => x.threshold === 90)!, t95 = a.thresholds.find((x) => x.threshold === 95)!;
          const I = t.overview.insights;
          const insights = [
            I.cohort(n(a.cohort.total_students), n(a.cohort.sitters), n(a.cohort.absent)),
            I.center(f(a.stats_pct.mean, 2), f(a.stats_pct.median, 2), n(a.stats_score.mode), f(a.stats_pct.std, 2)),
            I.shape(f(a.stats_pct.skewness, 2), f(a.stats_pct.kurtosis_excess, 2)),
            I.high(n(t90.count_sitters), f(t90.pct_sitters, 2), n(t95.count_sitters), f(t95.pct_sitters, 2)),
            I.pass(f(pass.pct, 1)),
            I.pile(n(a.gap_analysis.largest_jump_at_pct)),
            I.pressure(f(a.stats_pct.mean, 1), n(ADMISSION_2026.baselineMeanPct)),
          ];
          return (
            <>
              <div className="grid g4">
                <Stat label={t.overview.kTotal} value={n(a.cohort.total_students)} sub={t.overview.kSitters(n(a.cohort.sitters))} />
                <Stat label={t.overview.kPass} value={f(pass.pct, 1)} unit="%" sub={`${n(pass.count)} ${t.ui.students}`} />
                <Stat label={t.overview.kMean} value={f(a.stats_pct.mean, 1)} unit="%" sub={t.overview.kMedian(f(a.stats_pct.median, 1))} />
                <Stat label={t.overview.k90} value={n(t90.count_sitters)} sub={`${f(t90.pct_sitters, 2)}% · ${t.overview.k95(n(t95.count_sitters))}`} />
              </div>
              <div className="grid g2">
                <Card title={t.overview.statusT} desc={t.overview.statusD}>
                  <SegmentBar parts={a.status_distribution.map((s) => ({ key: s.key, label: t.status[s.key], value: s.count, display: n(s.count), share: `${f(s.pct, 1)}%`, color: STATUS_COLOR[s.key] }))} />
                </Card>
                <Card title={t.overview.bandsT} desc={t.overview.bandsD}>
                  <BarList rows={a.grade_bands_sitters.map((b) => ({ key: b.key, label: t.band[b.key], value: b.count, display: n(b.count), note: `${f(b.pct, 1)}%` }))} />
                </Card>
              </div>
              <div className="grid g2">
                <Card title={t.overview.thrT} desc={t.overview.thrD}>
                  <BarList rows={a.thresholds.map((x) => ({ key: String(x.threshold), label: <bdi>≥ {x.threshold}% · {t.overview.needs(n(x.score_needed))}</bdi>, value: x.count_sitters, display: n(x.count_sitters), note: `${f(x.pct_sitters, 1)}%` }))} />
                </Card>
                <Card title={t.overview.insightsT}>
                  <ul className="list">{insights.map((s) => <li key={s}>{s}</li>)}</ul>
                </Card>
              </div>
              <Card title={t.overview.leaderT} right={<Link className="btn sm" to="/top">{t.ui.viewAll}</Link>}>
                <DataTable columns={topCols.slice(0, 5)} rows={a.top_100.slice(0, 5)} rowKey={(r) => r.seating_no} caption={t.overview.leaderT} />
              </Card>
            </>
          );
        }}
      </Ready>
    </div>
  );
}

/* ========================= Distribution ========================= */
export function Distribution() {
  const { t, n, f } = useI18n();
  const core = useCore();
  return (
    <div className="page">
      <PageHead title={t.dist.title} sub={t.dist.sub} badge={<YearBadge />} />
      <Ready of={core}>
        {({ a }) => {
          const H = a.histogram_pct, { mu, sigma } = a.normal_fit_pct;
          const binW = H.bin_edges[1]! - H.bin_edges[0]!;
          const normal = H.bin_centers.map((x) => (H.total * binW * Math.exp(-0.5 * ((x - mu) / sigma) ** 2)) / (sigma * Math.sqrt(2 * Math.PI)));
          const D = a.density_pct, C = a.cdf_pct, F = a.frequency_table;
          const pctTicks = [0, 20, 40, 60, 80, 100], pf = (v: number) => `${v}%`;
          const step = (arr: number[], k: number) => arr.filter((_, i) => i % k === 0);
          return (
            <>
              <div className="grid g4">
                <Stat label={t.dist.mean} value={f(a.stats_pct.mean, 2)} unit="%" />
                <Stat label={t.dist.median} value={f(a.stats_pct.median, 2)} unit="%" />
                <Stat label={t.dist.sd} value={f(a.stats_pct.std, 2)} unit={t.pred.pp} />
                <Stat label={t.dist.iqr} value={f(a.stats_pct.iqr, 2)} unit={t.pred.pp} sub={<bdi>{f(a.box_overall.q1, 1)}% – {f(a.box_overall.q3, 1)}%</bdi>} />
              </div>
              <ChartCard title={t.dist.histT} desc={t.dist.histD(n(H.total))}
                legend={<Legend items={[{ name: t.dist.hist, color: "var(--series-1)" }, { name: t.dist.normal, color: "var(--series-2)", line: true, dashed: true }]} />}
                table={{ head: [t.col.percentage, t.col.count, t.dist.normal], rows: H.bin_centers.map((c, i) => [`${c - 1}–${c + 1}%`, n(H.counts[i]!), n(normal[i]!)]) }}>
                <XYChart height={300} ariaLabel={t.dist.histT} xDomain={[0, 100]} xTicks={pctTicks} xFormat={pf} yFormat={kfmt}
                  series={[
                    { kind: "bar", name: t.dist.hist, color: "var(--series-1)", x: H.bin_centers, y: H.counts, width: binW },
                    { kind: "line", name: t.dist.normal, color: "var(--series-2)", x: H.bin_centers, y: normal, dashed: true },
                  ]}
                  tooltip={(i) => ({ title: `${H.bin_centers[i]! - 1}–${H.bin_centers[i]! + 1}%`, rows: [
                    { label: t.dist.hist, value: n(H.counts[i]!), color: "var(--series-1)" }, { label: t.dist.normal, value: n(normal[i]!), color: "var(--series-2)" }] })} />
              </ChartCard>
              <div className="grid g2">
                <ChartCard title={t.dist.densT} desc={t.dist.densD}
                  table={{ head: [t.col.percentage, t.dist.density], rows: step(D.x, 10).map((x, i) => [`${f(x, 1)}%`, f(D.y[i * 10]!, 5)]) }}>
                  <XYChart ariaLabel={t.dist.densT} xDomain={[0, 100]} xTicks={pctTicks} xFormat={pf} yFormat={(v) => f(v, 3)}
                    series={[{ kind: "area", name: t.dist.density, color: "var(--series-1)", x: D.x, y: D.y }]}
                    tooltip={(i) => ({ title: `${f(D.x[i]!, 1)}%`, rows: [{ label: t.dist.density, value: f(D.y[i]!, 4) }] })} />
                </ChartCard>
                <ChartCard title={t.dist.cdfT} desc={t.dist.cdfD}
                  table={{ head: [t.col.percentage, t.dist.cumulative], rows: step(C.x, 10).map((x, i) => [`${f(x, 1)}%`, `${f(C.y[i * 10]!, 1)}%`]) }}>
                  <XYChart ariaLabel={t.dist.cdfT} xDomain={[0, 100]} yMax={100} xTicks={pctTicks} xFormat={pf} yFormat={pf}
                    series={[{ kind: "area", name: t.dist.cumulative, color: "var(--series-1)", x: C.x, y: C.y }]}
                    tooltip={(i) => ({ title: `${f(C.x[i]!, 1)}%`, rows: [{ label: t.dist.cumulative, value: `${f(C.y[i]!, 1)}%` }] })} />
                </ChartCard>
              </div>
              <ChartCard title={t.dist.violinT} desc={t.dist.violinD}
                table={{ head: [t.col.status, t.dist.n, t.dist.q1, t.dist.med, t.dist.q3], rows: a.violin_by_status.map((v) => [t.status[v.key], n(v.n), `${f(v.box.q1, 1)}%`, `${f(v.box.median, 1)}%`, `${f(v.box.q3, 1)}%`]) }}>
                <ViolinRows xFormat={pf} rows={a.violin_by_status.map((v) => ({
                  key: v.key, label: t.status[v.key], sub: `${t.dist.med} ${f(v.box.median, 1)}%`, color: STATUS_COLOR[v.key], kde: v.kde,
                  q1: v.box.q1, median: v.box.median, q3: v.box.q3, lo: v.box.lower_whisker, hi: v.box.upper_whisker,
                }))} />
              </ChartCard>
              <ChartCard title={t.dist.freqT} desc={t.dist.freqD(n(F.length))}
                table={{ head: [t.col.score, t.col.percentage, t.col.count, t.col.cumulative], rows: F.map((r) => [r.score, `${f(r.pct_value, 2)}%`, n(r.count), `${f(r.cumulative_pct, 2)}%`]) }}>
                <XYChart ariaLabel={t.dist.freqT} xDomain={[0, 320]} xTicks={[0, 80, 160, 240, 320]} xFormat={String} yFormat={kfmt}
                  series={[{ kind: "bar", name: t.col.count, color: "var(--series-1)", x: F.map((r) => r.score), y: F.map((r) => r.count), width: 0.5 }]}
                  tooltip={(i) => ({ title: `${F[i]!.score} / 320 · ${f(F[i]!.pct_value, 2)}%`, rows: [{ label: t.ui.students, value: n(F[i]!.count) }, { label: t.dist.cumulative, value: `${f(F[i]!.cumulative_pct, 2)}%` }] })} />
              </ChartCard>
            </>
          );
        }}
      </Ready>
    </div>
  );
}

/* ============================== Top ============================== */
export function Top() {
  const { t, n, f, g } = useI18n();
  const core = useCore();
  const cols = useTopColumns();
  const [filter, setFilter] = useState("");
  return (
    <div className="page">
      <PageHead title={t.top.title} sub={t.top.sub} badge={<YearBadge />} />
      <Ready of={core}>
        {({ a }) => {
          const key = nameKey(filter), digits = normalizeDigits(filter).replace(/\D/g, "");
          const rows = !filter.trim() ? a.top_100 : a.top_100.filter((r) =>
            (digits !== "" && String(r.seating_no).includes(digits)) || (key !== "" && nameKey(r.name).includes(key)));
          const P = a.percentiles_pct, N = a.cohort.sitters;
          return (
            <>
              <div className="grid g3">
                {a.top_100.slice(0, 3).map((p, i) => (
                  <div className="card podium" key={p.seating_no}>
                    <span className={`rank r${i + 1}`}>{n(p.national_rank)}</span>
                    <b>{p.name}</b>
                    <small><bdi>{g(p.total_degree, 1)} / 320 · {f(p.percentage, 2)}%</bdi></small>
                  </div>
                ))}
              </div>
              <div className="grid g4">
                <Stat label={t.top.perfect} value={n(a.extremes.perfect_scores)} sub={<bdi>320 / 320</bdi>} />
                <Stat label={t.top.top1} value={n(Math.round(N * 0.01))} sub={t.top.from(f(P["99"]!, 1))} />
                <Stat label={t.top.top5} value={n(Math.round(N * 0.05))} sub={t.top.from(f(P["95"]!, 1))} />
                <Stat label={t.top.top10} value={n(Math.round(N * 0.1))} sub={t.top.from(f(P["90"]!, 1))} />
              </div>
              <Card title={t.top.leaderT} right={
                <div className="field no-print" style={{ minWidth: 220 }}>
                  <label className="sr-only" htmlFor="top-filter">{t.top.filter}</label>
                  <input id="top-filter" className="input" type="search" style={{ minHeight: 38, fontSize: 14 }} placeholder={t.top.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>}>
                <DataTable stack columns={cols} rows={rows} rowKey={(r) => r.seating_no} caption={t.top.leaderT} empty={t.top.filterNone} />
                <ExportBar name="bosla-2026-top-100" sheet={t.top.leaderT} columns={cols} rows={rows} />
              </Card>
            </>
          );
        }}
      </Ready>
    </div>
  );
}

/* ============================= Stats ============================= */
export function Stats() {
  const { t, n, f, compact } = useI18n();
  const core = useCore();
  return (
    <div className="page">
      <PageHead title={t.stats.title} sub={t.stats.sub} badge={<YearBadge />} />
      <Ready of={core}>
        {({ a }) => {
          const s = a.stats_pct, S = t.stats.s;
          const tiles: [string, string, string?][] = [
            [S.mean, f(s.mean, 3), "%"], [S.median, f(s.median, 3), "%"], [S.mode, `${n(a.stats_score.mode)} / 320`], [S.std, f(s.std, 3)],
            [S.variance, f(s.variance, 2)], [S.skew, f(s.skewness, 3)], [S.kurt, f(s.kurtosis_excess, 3)], [S.range, f(s.range, 1), "%"],
            [S.iqr, f(s.iqr, 2), "%"], [S.cv, f(s.cv_pct, 2), "%"], [S.sem, f(s.sem, 4)], [S.n, n(s.n)],
          ];
          const pk = Object.keys(a.percentiles_pct).sort((x, y) => Number(x) - Number(y));
          const cl = a.clusters.clusters;
          const hm = a.heatmap_band_status, hmax = Math.max(...hm.matrix.flat());
          const N = a.normality, ad = N.anderson_darling;
          const ad5 = ad.critical_values[ad.significance_levels.indexOf(5)] ?? ad.critical_values[2]!;
          const tests: [string, typeof N.shapiro_wilk][] = [["Shapiro–Wilk", N.shapiro_wilk], ["D'Agostino K²", N.dagostino_k2], ["Jarque–Bera", N.jarque_bera]];
          const pareto = [...a.grade_bands_sitters].sort((x, y) => y.count - x.count);
          let run = 0;
          return (
            <>
              <Card title={t.stats.descT} desc={t.stats.descD}>
                <div className="grid g4">{tiles.map(([k, v, u]) => <Stat key={k} label={k} value={v} unit={u} />)}</div>
              </Card>
              <div className="grid g2">
                <Card title={t.stats.pctT} desc={t.stats.pctD}>
                  <BarList max={100} rows={pk.map((k) => ({ key: k, label: <bdi>P{k}</bdi>, value: a.percentiles_pct[k]!, display: `${f(a.percentiles_pct[k]!, 1)}%`, note: `${f(a.percentiles_score[k]!, 1)} / 320` }))} />
                </Card>
                <Card title={t.stats.clT} desc={t.stats.clD(a.clusters.k, compact(a.clusters.sample_n))}>
                  <BarList rows={cl.map((c) => ({ key: String(c.cluster), label: <span>{t.stats.cluster(c.cluster)} <small className="muted"><bdi>{f(c.min_score, 0)}–{f(c.max_score, 0)}</bdi></small></span>, value: c.share_pct, display: `${f(c.share_pct, 1)}%`, note: `${t.stats.centre} ${f(c.center_pct, 1)}%` }))} />
                </Card>
              </div>
              <div className="grid g2">
                <Card title={t.stats.paretoT} desc={t.stats.paretoD}>
                  <BarList rows={pareto.map((b) => { run += b.pct; return { key: b.key, label: t.band[b.key], value: b.count, display: n(b.count), note: `${t.col.cumulative} ${f(Math.min(100, run), 1)}%` }; })} />
                </Card>
                <Card title={t.stats.heatT} desc={t.stats.heatD}>
                  <div style={{ overflowX: "auto" }}>
                    <table className="heat">
                      <thead><tr><th />{hm.statuses.map((st) => <th key={st.key} scope="col">{t.status[st.key]}</th>)}</tr></thead>
                      <tbody>
                        {hm.bands.map((b, i) => (
                          <tr key={b.key}>
                            <th scope="row">{t.band[b.key]}</th>
                            {hm.matrix[i]!.map((v, j) => {
                              const k = Math.sqrt(v / hmax);
                              return <td key={j} style={{ background: `rgba(var(--heat), ${0.06 + k * 0.9})`, color: k > 0.55 ? "#fff" : "var(--ink)" }}>{v === 0 ? "·" : compact(v)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
              <Card title={t.stats.normT} desc={t.stats.normD}>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th scope="col">{t.stats.test}</th><th scope="col" className="num">{t.stats.statistic}</th><th scope="col" className="num">{t.stats.pvalue}</th><th scope="col">{t.stats.normalQ}</th></tr></thead>
                    <tbody>
                      {tests.map(([name, r]) => (
                        <tr key={name}>
                          <td className="strong"><bdi>{name}</bdi>{r.sample_n ? <small className="muted"> · {t.stats.sample(n(r.sample_n))}</small> : null}</td>
                          <td className="num">{f(r.statistic, 3)}</td>
                          <td className="num"><bdi>{r.p_value < 1e-6 ? "< 0.000001" : f(r.p_value, 4)}</bdi></td>
                          <td><span className={`chip ${r["normal_at_0.05"] ? "chip-good" : "chip-mute"}`}>{r["normal_at_0.05"] ? t.stats.yes : t.stats.no}</span></td>
                        </tr>
                      ))}
                      <tr>
                        <td className="strong">{t.stats.ad}</td>
                        <td className="num">{f(ad.statistic, 3)}</td>
                        <td className="num muted">{t.stats.adNote(f(ad.statistic, 2), f(ad5, 3))}</td>
                        <td><span className={`chip ${ad.statistic < ad5 ? "chip-good" : "chip-mute"}`}>{ad.statistic < ad5 ? t.stats.yes : t.stats.no}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>{t.stats.verdict}</p>
              </Card>
            </>
          );
        }}
      </Ready>
    </div>
  );
}

/* ============================ Quality ============================ */
const RULES = ["missing_seat", "missing_or_short_name", "missing_score", "score_below_zero", "score_above_max", "passing_but_zero_score"];

export function QualityPage() {
  const { t, n, f } = useI18n();
  const q = useQuality();
  return (
    <div className="page">
      <PageHead title={t.quality.title} sub={t.quality.sub} badge={<YearBadge />} />
      <Ready of={q}>
        {(d) => {
          const dims: [string, number][] = [[t.quality.completeness, d.dimension_scores.completeness], [t.quality.validity, d.dimension_scores.validity], [t.quality.uniqueness, d.dimension_scores.uniqueness]];
          const sum = [[t.quality.all, d.summary_statistics.total_degree_all], [t.quality.sitters, d.summary_statistics.total_degree_sitters]] as const;
          return (
            <>
              <div className="grid g3">
                <Card title={t.quality.score}>
                  <div className="stat-value" style={{ fontSize: 40, fontWeight: 700 }}><bdi>{f(d.overall_quality_score, 1)}</bdi><span className="stat-unit">%</span></div>
                  <div style={{ marginTop: 12 }}><Meter value={d.overall_quality_score} tone="var(--good)" label={t.quality.score} /></div>
                </Card>
                <Card title={t.quality.dims} className="span2">
                  <BarList max={100} rows={dims.map(([k, v]) => ({ key: k, label: k, value: v, display: `${f(v, 1)}%` }))} />
                </Card>
              </div>
              <div className="grid g4">
                <Stat label={t.quality.rows} value={n(d.generated_rows)} />
                <Stat label={t.quality.dupSeat} value={n(d.duplicates.duplicate_seat_rows)} sub={`${f(d.duplicates.duplicate_seat_pct, 2)}%`} />
                <Stat label={t.quality.outliers} value={n(d.outliers.outliers_low)} sub={`${f(d.outliers.outliers_pct, 2)}%`} />
                <Stat label={t.quality.flagged} value={n(d.invalid.invalid_rows)} sub={`${f(d.invalid.invalid_pct, 2)}%`} />
              </div>
              <div className="grid g2">
                <Card title={t.quality.colsT}>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th scope="col">{t.quality.column}</th><th scope="col" className="num">{t.quality.missing}</th><th scope="col" className="num">{t.quality.unique}</th><th scope="col">{t.quality.type}</th></tr></thead>
                      <tbody>
                        {Object.entries(d.columns).map(([name, p]) => (
                          <tr key={name}><td className="strong">{t.quality.colName[name] ?? name}</td><td className="num">{f(p.missing_pct, 2)}%</td><td className="num">{n(p.unique)}</td><td className="muted"><bdi>{p.dtype}</bdi></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card title={t.quality.rulesT} desc={t.quality.rulesD}>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th scope="col">#</th><th scope="col">{t.quality.rulesT}</th><th scope="col" className="num">{t.quality.flaggedCount}</th></tr></thead>
                      <tbody>{RULES.map((r, i) => <tr key={r}><td className="num muted">{i + 1}</td><td>{t.quality.rule[r]}</td><td className="num strong">{n(d.invalid.breakdown[r] ?? 0)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </Card>
              </div>
              <Card title={t.quality.summaryT}>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th scope="col" />{[t.dist.n, t.dist.mean, t.dist.sd, t.quality.min, t.quality.p25, t.dist.median, t.quality.p75, t.quality.max].map((h) => <th key={h} scope="col" className="num">{h}</th>)}</tr></thead>
                    <tbody>{sum.map(([label, s]) => (
                      <tr key={label}><td className="strong">{label}</td><td className="num">{n(s.count)}</td><td className="num">{f(s.mean, 2)}</td><td className="num">{f(s.std, 2)}</td><td className="num">{f(s.min, 1)}</td><td className="num">{f(s.p25, 1)}</td><td className="num">{f(s.median, 1)}</td><td className="num">{f(s.p75, 1)}</td><td className="num">{f(s.max, 1)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </Card>
              <Card title={t.quality.notesT}>
                <ul className="list">
                  <li>{t.quality.nWs(n(d.cleaning_log.status_trailing_ws_fixed))}</li>
                  <li>{t.quality.nDup(n(d.duplicates.duplicate_name_rows), n(d.duplicates.distinct_names_shared_by_multiple))}</li>
                  <li>{t.quality.nZero(n(d.invalid.breakdown.passing_but_zero_score ?? 0))}</li>
                  <li>{t.quality.nOut(n(d.outliers.outliers_low), f(d.outliers.lower_fence, 2))}</li>
                </ul>
              </Card>
              <Note>{t.method.verify}</Note>
            </>
          );
        }}
      </Ready>
    </div>
  );
}
