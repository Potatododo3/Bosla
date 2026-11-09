import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { useCore, useScore, type Core } from "../data/store.tsx";
import { outlookFor, type FacultyEstimate, type Outlook } from "../domain/admission.ts";
import { percentageOf, round, scoreOfPercentage } from "../domain/scores.ts";
import { ADMISSION_2026 } from "../rules/admission2026.ts";
import { Card, DataTable, ExportBar, Note, PageHead, Ready, Stat, UnofficialBadge, type Column } from "../components/ui.tsx";
import { ScoreFields } from "../components/ScoreField.tsx";
import { RangeRows, Spark, TrendChart } from "../charts/Parts.tsx";
import { OUTLOOK_ICON, OUTLOOK_TONE } from "./Standing.tsx";

function useFacultyColumns(): Column<FacultyEstimate>[] {
  const { t, n, f } = useI18n();
  return [
    { key: "fac", label: t.col.faculty, cell: (r) => t.faculty[r.key], value: (r) => t.faculty[r.key], strong: true },
    { key: "track", label: t.col.track, cell: (r) => t.track[r.category], value: (r) => t.track[r.category] },
    { key: "exp", label: t.pred.expected, cell: (r) => `${f(r.expected, 2)}%`, value: (r) => r.expected, num: true, strong: true },
    { key: "opt", label: t.pred.optimistic, cell: (r) => `${f(r.optimistic.cutoff, 2)}%`, value: (r) => r.optimistic.cutoff, num: true },
    { key: "pes", label: t.pred.pessimistic, cell: (r) => `${f(r.pessimistic.cutoff, 2)}%`, value: (r) => r.pessimistic.cutoff, num: true },
    { key: "ci", label: t.pred.ci, cell: (r) => <bdi>{f(r.ciLow, 1)}–{f(r.ciHigh, 1)}%</bdi>, value: (r) => `${r.ciLow}-${r.ciHigh}`, num: true },
    { key: "need", label: t.pred.scoreNeeded, cell: (r) => <bdi>{f(r.scoreNeeded, 1)} / 320</bdi>, value: (r) => r.scoreNeeded, num: true },
    { key: "el", label: t.col.count, cell: (r) => n(r.central.eligible), value: (r) => r.central.eligible, num: true },
  ];
}

/* ======================= Admission explorer ======================= */
export function Admission() {
  const { t } = useI18n();
  const core = useCore();
  return (
    <div className="page">
      <PageHead title={t.admission.title} sub={t.admission.sub} badge={<UnofficialBadge />} />
      <Ready of={core}>{(c) => <AdmissionBody core={c} />}</Ready>
    </div>
  );
}

function AdmissionBody({ core }: { core: Core }) {
  const { t, n, f } = useI18n();
  const { score, setScore } = useScore();
  const [sel, setSel] = useState(core.faculties[0]!.key);
  const pct = score === null ? null : percentageOf(score);
  const facs = core.faculties;
  const fac = facs.find((x) => x.key === sel) ?? facs[0]!;
  const cols = useFacultyColumns();
  const counts = { likely: 0, expected: 0, borderline: 0, below: 0 } as Record<Outlook, number>;
  if (pct !== null) for (const x of facs) counts[outlookFor(pct, x)]++;
  const domain: [number, number] = [55, 100];

  return (
    <>
      <div className="grid g3">
        <Card title={t.admission.yourPct}>
          <ScoreFields only="pct" />
          <label className="sr-only" htmlFor="pct-range">{t.admission.yourPct}</label>
          <input id="pct-range" type="range" min={0} max={100} step={0.5} value={pct ?? 0} dir="ltr"
            onChange={(e) => setScore(scoreOfPercentage(Number(e.target.value)))} style={{ marginTop: 8 }} />
          {pct !== null && <p className="muted num" style={{ fontSize: 13 }}><bdi>{f(round(score!, 2), 1)} / 320</bdi></p>}
        </Card>
        <Card title={t.admission.outlookT} className="span2">
          {pct === null ? <p className="muted">{t.admission.enterHint}</p> : (
            <>
              <p style={{ marginBottom: 12 }} data-testid="outlook-summary">{t.admission.summary(n(counts.likely + counts.expected), n(counts.likely), n(facs.length))}</p>
              <ul className="outlook">
                {facs.map((x) => {
                  const o = outlookFor(pct, x), d = pct - x.central.cutoff;
                  return (
                    <li key={x.key} data-outlook={o}>
                      <span>{t.faculty[x.key]} <small className="muted">· {f(x.central.cutoff, 1)}%</small></span>
                      <span className="margin" title={t.admission.margin}><bdi>{d >= 0 ? "+" : "−"}{f(Math.abs(d), 1)}</bdi></span>
                      <span className={`chip chip-${OUTLOOK_TONE[o]}`} title={t.admission.outlookHelp[o]}><span aria-hidden="true">{OUTLOOK_ICON[o]}</span>{t.admission.outlook[o]}</span>
                    </li>
                  );
                })}
              </ul>
              <ul className="chips muted" style={{ marginTop: 12, fontSize: 12.5 }}>
                {(Object.keys(counts) as Outlook[]).map((o) => <li key={o}><b>{t.admission.outlook[o]}:</b> {t.admission.outlookHelp[o]}</li>)}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card title={t.pred.rangeT} desc={t.pred.rangeD}>
        <RangeRows domain={domain} xFormat={(v) => `${v}%`} marker={pct !== null ? { x: pct, label: t.standing.you } : undefined}
          rows={facs.map((x) => ({
            key: x.key, label: t.faculty[x.key], value: `${f(x.expected, 1)}%`, lo: x.ciLow, hi: x.ciHigh, bandLo: x.optimistic.cutoff, bandHi: x.pessimistic.cutoff, point: x.expected,
            title: `${t.faculty[x.key]}: ${f(x.expected, 2)}% (${f(x.ciLow, 1)}–${f(x.ciHigh, 1)}%)`,
          }))} />
      </Card>

      <Card title={t.admission.trendT} desc={t.admission.trendD} right={
        <div className="field" style={{ minWidth: 180 }}>
          <label className="sr-only" htmlFor="fac-select">{t.admission.chooseFaculty}</label>
          <select id="fac-select" className="select" value={sel} onChange={(e) => setSel(e.target.value)} style={{ minHeight: 38, fontSize: 14 }}>
            {facs.map((x) => <option key={x.key} value={x.key}>{t.faculty[x.key]}</option>)}
          </select>
        </div>}>
        <TrendChart history={fac.history} estimate={{ year: ADMISSION_2026.targetYear, value: fac.expected }} lo={fac.ciLow} hi={fac.ciHigh}
          yFormat={(v) => `${f(v, v % 1 ? 1 : 0)}%`} labels={{ historical: t.admission.historical, estimate: t.admission.estimate2026 }} />
        <div className="legend" style={{ marginTop: 8 }}>
          <span className="legend-item"><i className="key-line" style={{ background: "var(--muted-mark)" }} />{t.admission.historical}</span>
          <span className="legend-item"><i className="key-box" style={{ background: "var(--series-1)", borderRadius: "50%" }} />{t.admission.estimate2026} · {t.pred.ci}</span>
        </div>
      </Card>

      <Card title={t.admission.tableT}>
        <DataTable columns={cols} rows={facs} rowKey={(r) => r.key} caption={t.admission.tableT} />
        <ExportBar name="bosla-2026-admission-estimates" sheet={t.admission.tableT} columns={cols} rows={facs} />
      </Card>
      <Note tone="warn">{t.pred.banner}</Note>
    </>
  );
}

/* ======================= Cutoff estimates ======================= */
export function Predictions() {
  const { t, n, f, compact } = useI18n();
  const core = useCore();
  const signed = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${f(Math.abs(v), d)}`;
  return (
    <div className="page">
      <PageHead title={t.pred.title} sub={t.pred.sub} badge={<UnofficialBadge />} />
      <Note tone="warn">{t.pred.banner}</Note>
      <Ready of={core}>
        {({ a, faculties, pressure }) => (
          <>
            <div className="grid g4">
              <Stat label={t.pred.cohortMean} value={f(a.stats_pct.mean, 1)} unit="%" sub={`${t.pred.baseline} ${ADMISSION_2026.baselineMeanPct}%`} />
              <Stat label={t.pred.pressure} value={signed(pressure)} unit={t.pred.pp} sub={pressure < 0 ? t.pred.pressureDown : pressure > 0 ? t.pred.pressureUp : t.pred.pressureFlat} />
              <Stat label={t.pred.calibration} value={signed(ADMISSION_2026.calibrationPP, 1)} unit={t.pred.pp} sub={t.pred.calibrationHint} />
              <Stat label={t.pred.modeled} value={n(faculties.length)} sub={`${compact(a.cohort.sitters)} ${t.ui.students}`} />
            </div>

            <Card title={t.pred.rangeT} desc={t.pred.rangeD}>
              <RangeRows domain={[55, 100]} xFormat={(v) => `${v}%`} rows={faculties.map((x) => ({
                key: x.key, label: t.faculty[x.key], value: `${f(x.expected, 1)}%`, lo: x.ciLow, hi: x.ciHigh, bandLo: x.optimistic.cutoff, bandHi: x.pessimistic.cutoff, point: x.expected,
                title: `${t.faculty[x.key]}: ${f(x.expected, 2)}% (${f(x.ciLow, 1)}–${f(x.ciHigh, 1)}%)`,
              }))} />
            </Card>

            <div className="grid g3">
              {faculties.map((x) => (
                <article key={x.key} className="card fac" data-faculty={x.key}>
                  <div className="fac-top">
                    <div><h3>{t.faculty[x.key]}</h3><small>{t.track[x.category]}</small></div>
                    <Spark values={[...x.history.map((h) => h.cutoff), x.expected]} label={`${t.admission.trendT}: ${x.history.map((h) => `${h.year} ${h.cutoff}%`).join(", ")}, 2026 ${x.expected}%`} />
                  </div>
                  <div className="fac-main">
                    <div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{t.pred.expected}</div>
                      <div className="fac-num"><bdi>{f(x.expected, 1)}<small>%</small></bdi></div>
                      <div className="muted num" style={{ fontSize: 12.5 }}>{t.pred.scoreNeeded}: <bdi>{f(x.scoreNeeded, 1)} / 320</bdi></div>
                    </div>
                    <div style={{ textAlign: "end" }}>
                      <span className="chip chip-mute"><span aria-hidden="true">{x.lastYear.delta > 0 ? "▲" : "▼"}</span><bdi>{signed(x.lastYear.delta, 1)}</bdi> {t.pred.vsLast(x.lastYear.year)}</span>
                      <div className="muted num" style={{ fontSize: 12.5, marginTop: 6 }}>{t.pred.ci}: <bdi>{f(x.ciLow, 1)}–{f(x.ciHigh, 1)}%</bdi></div>
                    </div>
                  </div>
                  <dl className="scen">
                    {([["optimistic", x.optimistic], ["expected", x.central], ["pessimistic", x.pessimistic]] as const).map(([k, s]) => (
                      <div key={k}><dt>{t.pred[k]}</dt><dd>{f(s.cutoff, 1)}%<small>{compact(s.eligible)} {t.pred.eligible}</small></dd></div>
                    ))}
                  </dl>
                  <details className="breakdown">
                    <summary>{t.pred.breakdownT}</summary>
                    <dl>
                      <dt>{t.pred.bTrend}</dt><dd><bdi>{f(x.trendProjection, 2)}%</bdi></dd>
                      <dt>{t.pred.bPressure}</dt><dd><bdi>{signed(x.pressure, 2)}</bdi></dd>
                      <dt>{t.pred.bCalib}</dt><dd><bdi>{signed(x.calibration, 2)}</bdi></dd>
                      <dt className="total">{t.pred.bTotal}</dt><dd className="total"><bdi>{f(x.expected, 2)}%</bdi></dd>
                      <dt>{t.pred.sigma}</dt><dd><bdi>{f(x.sigma, 3)}</bdi></dd>
                      <dt>{t.pred.slope}</dt><dd><bdi>{signed(x.slopePerYear, 2)}</bdi></dd>
                    </dl>
                  </details>
                </article>
              ))}
            </div>

            <Card title={t.pred.assumptionsT}>
              <ul className="list">{t.pred.assumptions.map((s) => <li key={s}>{s}</li>)}</ul>
            </Card>
          </>
        )}
      </Ready>
    </div>
  );
}
