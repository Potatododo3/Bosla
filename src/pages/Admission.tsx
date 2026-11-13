import { Link } from "react-router-dom";
import { useI18n } from "../i18n/index.tsx";
import { useCore, useScore, type Core } from "../data/store.tsx";
import { outlookFor, type AdmissionState, type OfficialMinimum, type Outlook } from "../domain/admissionConfig.ts";
import { percentageOf, round, scoreOfPercentage } from "../domain/scores.ts";
import { Card, DataTable, ExportBar, Icon, Note, OfficialBadge, PageHead, Ready, type Column } from "../components/ui.tsx";
import { ScoreFields } from "../components/ScoreField.tsx";
import { RangeRows } from "../charts/Parts.tsx";

export const OUTLOOK_TONE: Record<Outlook, string> = { above: "good", close: "warn", below: "mute" };
export const OUTLOOK_ICON: Record<Outlook, string> = { above: "✓", close: "!", below: "–" };

export function useFacultyName() {
  const { lang } = useI18n();
  return (f: { name_ar: string; name_en: string }) => (lang === "ar" ? f.name_ar : f.name_en);
}

/** Shown instead of any admission number until this year's official minimums are entered. */
export function Pending({ admission, year, compact }: { admission: Extract<AdmissionState, { state: "pending" }>; year: number; compact?: boolean }) {
  const { t } = useI18n();
  const detail = admission.reason === "wrong_year" && admission.configYear !== null ? t.adm.wrongYear(String(admission.configYear), String(year)) : t.adm.pendingD;
  if (compact) return <p className="muted" data-testid="admission-pending">{t.adm.pendingT(String(year))}</p>;
  return (
    <div className="state" data-testid="admission-pending">
      <Icon name="cap" size={30} />
      <h2>{t.adm.pendingT(String(year))}</h2>
      <p>{detail}</p>
      <Link className="btn primary" to="/standing">{t.search.offCta}</Link>
    </div>
  );
}

function SourceNote({ admission }: { admission: Extract<AdmissionState, { state: "published" }> }) {
  const { t, lang } = useI18n();
  const c = admission.config;
  return (
    <Note title={lang === "ar" ? c.label_ar : c.label_en}>
      {t.adm.note}{" "}
      <a href={c.source} target="_blank" rel="noopener noreferrer">{t.adm.sourceT}</a>
      <span className="muted"> · {t.adm.updated} <bdi>{c.updated}</bdi></span>
    </Note>
  );
}

function useColumns(max: number): Column<OfficialMinimum>[] {
  const { t, n, f } = useI18n();
  const name = useFacultyName();
  return [
    { key: "fac", label: t.col.faculty, cell: (r) => name(r), value: (r) => name(r), strong: true },
    { key: "track", label: t.col.track, cell: (r) => t.track[r.track], value: (r) => t.track[r.track] },
    { key: "cut", label: t.adm.cutoff, cell: (r) => `${f(r.cutoff, 2)}%`, value: (r) => r.cutoff, num: true, strong: true },
    { key: "need", label: t.adm.scoreNeeded, cell: (r) => <bdi>{f(r.scoreNeeded, 1)} / {n(max)}</bdi>, value: (r) => r.scoreNeeded, num: true },
    { key: "n", label: t.adm.clearing, cell: (r) => n(r.clearing), value: (r) => r.clearing, num: true },
    { key: "share", label: t.adm.share, cell: (r) => `${f(r.clearingPct, 2)}%`, value: (r) => r.clearingPct, num: true },
  ];
}

const chartDomain = (facs: OfficialMinimum[]): [number, number] => [Math.max(0, Math.floor((Math.min(...facs.map((x) => x.cutoff)) - 5) / 10) * 10), 100];

/* ======================= Admission explorer ======================= */
export function Admission() {
  const { t } = useI18n();
  const core = useCore();
  return (
    <div className="page">
      <Ready of={core}>
        {(c) => (
          <>
            <PageHead title={t.adm.title} sub={t.adm.sub(String(c.year))} badge={c.admission.state === "published" ? <OfficialBadge /> : undefined} />
            {c.admission.state === "pending" ? <Pending admission={c.admission} year={c.year} /> : <Explorer core={c} admission={c.admission} />}
          </>
        )}
      </Ready>
    </div>
  );
}

function Explorer({ core, admission }: { core: Core; admission: Extract<AdmissionState, { state: "published" }> }) {
  const { t, n, f } = useI18n();
  const name = useFacultyName();
  const { score, setScore } = useScore();
  const pct = score === null ? null : percentageOf(score, core.max);
  const facs = admission.faculties;
  const cols = useColumns(core.max);
  const above = pct === null ? 0 : facs.filter((x) => pct >= x.cutoff).length;

  return (
    <>
      <SourceNote admission={admission} />
      <div className="grid g3">
        <Card title={t.adm.yourPct}>
          <ScoreFields only="pct" max={core.max} />
          <label className="sr-only" htmlFor="pct-range">{t.adm.yourPct}</label>
          <input id="pct-range" type="range" min={0} max={100} step={0.5} value={pct ?? 0} dir="ltr"
            onChange={(e) => setScore(scoreOfPercentage(Number(e.target.value), core.max))} style={{ marginTop: 8 }} />
          {pct !== null && <p className="muted num" style={{ fontSize: 13 }}><bdi>{f(round(score!, 2), 1)} / {n(core.max)}</bdi></p>}
        </Card>
        <Card title={t.adm.outlookT} className="span2">
          {pct === null ? <p className="muted">{t.adm.enterHint}</p> : (
            <>
              <p style={{ marginBottom: 12 }} data-testid="outlook-summary">{t.adm.summary(n(above), n(facs.length))}</p>
              <ul className="outlook">
                {facs.map((x) => {
                  const o = outlookFor(pct, x.cutoff), d = pct - x.cutoff;
                  return (
                    <li key={x.key} data-outlook={o}>
                      <span>{name(x)} <small className="muted">· {f(x.cutoff, 2)}%</small></span>
                      <span className="margin" title={t.adm.margin}><bdi>{d >= 0 ? "+" : "−"}{f(Math.abs(d), 2)}</bdi></span>
                      <span className={`chip chip-${OUTLOOK_TONE[o]}`} title={t.adm.outlookHelp[o]}><span aria-hidden="true">{OUTLOOK_ICON[o]}</span>{t.adm.outlook[o]}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card title={t.adm.chartT} desc={t.adm.chartD}>
        <RangeRows domain={chartDomain(facs)} xFormat={(v) => `${v}%`} marker={pct !== null ? { x: pct, label: t.standing.you } : undefined}
          rows={facs.map((x) => ({ key: x.key, label: name(x), value: `${f(x.cutoff, 1)}%`, lo: x.cutoff, hi: x.cutoff, bandLo: x.cutoff, bandHi: x.cutoff, point: x.cutoff, title: `${name(x)}: ${f(x.cutoff, 2)}%` }))} />
      </Card>

      <Card title={t.adm.tableT}>
        <DataTable columns={cols} rows={facs} rowKey={(r) => r.key} caption={t.adm.tableT} />
        <ExportBar name={`bosla-${core.year}-official-minimums`} sheet={t.adm.tableT} columns={cols} rows={facs} />
      </Card>
    </>
  );
}

/* ======================= Official minimums ======================= */
export function Minimums() {
  const { t, n, f } = useI18n();
  const core = useCore();
  const name = useFacultyName();
  return (
    <div className="page">
      <Ready of={core}>
        {(c) => {
          const adm = c.admission;
          return (
            <>
              <PageHead title={t.adm.minT} sub={t.adm.minSub(String(c.year))} badge={adm.state === "published" ? <OfficialBadge /> : undefined} />
              {adm.state === "pending" ? <Pending admission={adm} year={c.year} /> : (
                <>
                  <SourceNote admission={adm} />
                  <div className="grid g3">
                    {adm.faculties.map((x) => (
                      <article key={x.key} className="card fac" data-faculty={x.key}>
                        <div className="fac-top"><div><h3>{name(x)}</h3><small>{t.track[x.track]}</small></div></div>
                        <div>
                          <div className="muted" style={{ fontSize: 12.5 }}>{t.adm.cutoff}</div>
                          <div className="fac-num"><bdi>{f(x.cutoff, 2)}<small>%</small></bdi></div>
                        </div>
                        <dl className="scen" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                          <div><dt>{t.adm.scoreNeeded}</dt><dd><bdi>{f(x.scoreNeeded, 1)} / {n(c.max)}</bdi></dd></div>
                          <div><dt>{t.adm.clearing}</dt><dd>{n(x.clearing)}<small>{f(x.clearingPct, 2)}%</small></dd></div>
                        </dl>
                      </article>
                    ))}
                  </div>
                  <MinimumsTable core={c} facs={adm.faculties} />
                </>
              )}
            </>
          );
        }}
      </Ready>
    </div>
  );
}

function MinimumsTable({ core, facs }: { core: Core; facs: OfficialMinimum[] }) {
  const { t } = useI18n();
  const cols = useColumns(core.max);
  return (
    <Card title={t.adm.tableT}>
      <DataTable columns={cols} rows={facs} rowKey={(r) => r.key} caption={t.adm.tableT} />
      <ExportBar name={`bosla-${core.year}-official-minimums`} sheet={t.adm.tableT} columns={cols} rows={facs} />
    </Card>
  );
}

