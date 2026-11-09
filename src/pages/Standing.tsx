import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/index.tsx";
import { useCore, useScore, type Core } from "../data/store.tsx";
import { standingFor } from "../domain/standing.ts";
import { outlookFor, type Outlook } from "../domain/admission.ts";
import { Card, ChartCard, Icon, Note, PageHead, Ready, Stat, UnofficialBadge, YearBadge } from "../components/ui.tsx";
import { ScoreFields } from "../components/ScoreField.tsx";
import { XYChart } from "../charts/XYChart.tsx";
import { Meter } from "../charts/Parts.tsx";

export const OUTLOOK_TONE: Record<Outlook, string> = { likely: "good", expected: "info", borderline: "warn", below: "mute" };
export const OUTLOOK_ICON: Record<Outlook, string> = { likely: "✓", expected: "≈", borderline: "!", below: "–" };

export function Standing() {
  const { t } = useI18n();
  const core = useCore();
  return (
    <div className="page">
      <PageHead title={t.standing.title} sub={t.standing.sub} badge={<YearBadge />} />
      <Card>
        <ScoreFields />
        <p className="muted" style={{ fontSize: 13, marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}><Icon name="lock" size={15} />{t.standing.privacy}</p>
      </Card>
      <Ready of={core}>{(c) => <Result core={c} />}</Ready>
    </div>
  );
}

function Result({ core }: { core: Core }) {
  const { t, n, f, g } = useI18n();
  const { score, setScore } = useScore();
  const [copied, setCopied] = useState(false);
  const st = useMemo(() => (score === null ? null : standingFor(core.cohort, score)), [core, score]);
  const H = core.a.histogram_pct;

  if (!st) return <div className="state"><Icon name="target" size={30} /><p>{t.standing.empty}</p></div>;

  const tier = st.top1 ? t.standing.tier.top1 : st.top5 ? t.standing.tier.top5 : st.top10 ? t.standing.tier.top10 : null;
  const summary = t.standing.summary(g(st.score, 2), f(st.percentage, 2), n(st.rank), n(st.cohort), f(st.percentile, 2));
  const copy = async () => {
    try { await navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };

  return (
    <>
      <div className="grid g4" aria-live="polite">
        <div className="stat hero span2">
          <div className="stat-label">{t.standing.rank}</div>
          <div className="stat-value" data-testid="rank"><bdi>{n(st.rank)}</bdi></div>
          <div className="stat-sub">{t.standing.rankOf(n(st.cohort))}</div>
        </div>
        <Stat label={t.standing.percentile} value={<span data-testid="percentile">{f(st.percentile, 2)}</span>} sub={t.standing.percentileHint(f(st.percentile, 1))} />
        <Stat label={t.standing.perf} value={<span data-testid="tscore">{f(st.performanceIndex, 1)}</span>} sub={t.standing.perfHint} />
      </div>

      <Card>
        <div className="chips" style={{ marginBottom: 12 }}>
          <span className="chip chip-info">{g(st.score, 2)} / 320</span>
          <span className="chip chip-info">{f(st.percentage, 2)}%</span>
          <span className="chip chip-mute">{t.standing.band}: {t.band[st.band]}</span>
          {tier && <span className="chip chip-good"><span aria-hidden="true">★</span>{tier}</span>}
        </div>
        <Meter value={st.percentile} label={t.standing.percentile} />
        <div className="grid g3" style={{ marginTop: 16 }}>
          <Stat label={t.standing.ahead} value={n(st.ahead)} />
          <Stat label={t.standing.tied} value={n(st.tied)} />
          <Stat label={t.standing.behind} value={n(st.below)} />
        </div>
        {st.tied === 0 && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{t.standing.tiedNone} {t.standing.halfMarkNote}</p>}
        <div className="exportbar no-print">
          <button className="btn sm" onClick={copy}><Icon name={copied ? "check" : "copy"} size={15} />{copied ? t.ui.copied : t.ui.copy}</button>
          <button className="btn sm" onClick={() => window.print()}><Icon name="print" size={15} />{t.ui.print}</button>
          <button className="btn sm ghost" onClick={() => setScore(null)}>{t.ui.reset}</button>
        </div>
      </Card>

      <ChartCard title={t.standing.chartT} desc={t.standing.chartD}
        table={{ head: [t.col.percentage, t.col.count], rows: H.bin_centers.map((c, i) => [`${c - 1}–${c + 1}%`, n(H.counts[i]!)]) }}>
        <XYChart ariaLabel={t.standing.chartT} xDomain={[0, 100]} xTicks={[0, 20, 40, 60, 80, 100]} xFormat={(v) => `${v}%`} yFormat={(v) => (v >= 1000 ? `${v / 1000}K` : String(v))}
          series={[{ kind: "bar", name: t.dist.hist, color: "var(--series-1)", x: H.bin_centers, y: H.counts, width: 2 }]}
          markers={[{ x: st.percentage, label: t.standing.you }]}
          tooltip={(i) => ({ title: `${H.bin_centers[i]! - 1}–${H.bin_centers[i]! + 1}%`, rows: [{ label: t.ui.students, value: n(H.counts[i]!) }] })} />
      </ChartCard>

      <Card title={t.standing.facT} desc={t.standing.facD} right={<UnofficialBadge />}>
        <ul className="outlook">
          {core.faculties.map((x) => {
            const o = outlookFor(st.percentage, x), d = st.percentage - x.central.cutoff;
            return (
              <li key={x.key}>
                <span>{t.faculty[x.key]}</span>
                <span className="margin"><bdi>{d >= 0 ? "+" : "−"}{f(Math.abs(d), 1)}</bdi></span>
                <span className={`chip chip-${OUTLOOK_TONE[o]}`}><span aria-hidden="true">{OUTLOOK_ICON[o]}</span>{t.admission.outlook[o]}</span>
              </li>
            );
          })}
        </ul>
        <p style={{ marginTop: 12 }}><Link to="/admission">{t.standing.facLink}</Link></p>
      </Card>
      <Note tone="warn">{t.home.trust1}</Note>
    </>
  );
}
