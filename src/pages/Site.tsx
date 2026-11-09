import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ADMISSION_2026 } from "../rules/admission2026.ts";
import { Card, Icon, Note, PageHead } from "../components/ui.tsx";

export function About() {
  const { t } = useI18n();
  const a = t.about;
  return (
    <div className="page">
      <PageHead title={a.title} sub={a.sub} />
      <div className="grid g2">
        <Card title={a.whatT}><p className="prose">{a.what}</p></Card>
        <Card title={a.dataT}><ul className="list">{a.data.map((x) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title={a.privacyT}><ul className="list">{a.privacy.map((x) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title={a.limitsT}><ul className="list">{a.limits.map((x) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title={a.creditT}>
          <p className="prose">{a.credit}</p>
          <p style={{ marginTop: 10 }}><a href="https://github.com/omarhamed888/Thanaweya-2026" target="_blank" rel="noopener noreferrer">{a.creditLink}</a></p>
        </Card>
        <Card title={a.versionT}>
          <dl className="formula">
            <dt>{a.vData}</dt><dd><bdi>2026 · 919,396</bdi></dd>
            <dt>{a.vModel}</dt><dd><bdi>{ADMISSION_2026.id} v{ADMISSION_2026.version}</bdi> · {t.ui.unofficial}</dd>
            <dt>{a.vApp}</dt><dd><bdi>1.0.0</bdi></dd>
          </dl>
          <p className="prose" style={{ marginTop: 14 }}><strong>{a.reportT}</strong> {a.report}</p>
        </Card>
      </div>
    </div>
  );
}

export function Methodology() {
  const { t } = useI18n();
  const m = t.method, R = ADMISSION_2026;
  const formulas: [string, string][] = [
    [m.fPct, "percentage = total ÷ 320 × 100"],
    [m.fT, "T = clip( 50 + 10 × (total − μ) ÷ σ , 0 , 100 )"],
    [m.fPressure, `pressure = clip( ${R.pressureK} × (mean% − ${R.baselineMeanPct}) , −${R.pressureClip} , +${R.pressureClip} )`],
    [m.fExpected, `estimate = clip( trend₂₀₂₆ + pressure + ${R.calibrationPP} , ${R.cutoffMin} , ${R.cutoffMax} )`],
    [m.fScen, `estimate ∓ ${R.scenarioZ} × σ   (σ ≥ ${R.sigmaFloor})`],
    [m.fCi, `estimate ± ${R.ciZ} × σ`],
  ];
  return (
    <div className="page">
      <PageHead title={m.title} sub={m.sub} />
      <ol className="steps">{m.steps.map((s) => <li key={s.t}><h2>{s.t}</h2><p>{s.d}</p></li>)}</ol>
      <Card title={m.formulasT}>
        <dl className="formula">
          <dt>{m.fRank}</dt><dd>{m.rankDef}</dd>
          <dt>{m.fPercentile}</dt><dd>{m.percentileDef}</dd>
          {formulas.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={`${k}v`}><code>{v}</code></dd>])}
        </dl>
      </Card>
      <div className="grid g2">
        <Card title={m.verifyT}><p className="prose">{m.verify}</p></Card>
        <Card title={m.differT}><ul className="list">{m.differ.map((x) => <li key={x}>{x}</li>)}</ul></Card>
      </div>
      <Note tone="warn">{t.pred.banner}</Note>
    </div>
  );
}

export function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="page">
      <PageHead title={t.faq.title} sub={t.faq.sub} />
      <div className="faq">
        {t.faq.items.map((it, i) => (
          <div className="faq-item" key={i}>
            <h2>
              <button aria-expanded={open === i} aria-controls={`faq-${i}`} id={`faq-b-${i}`} onClick={() => setOpen(open === i ? null : i)}>
                {it.q}<Icon name="chevron" />
              </button>
            </h2>
            <div id={`faq-${i}`} role="region" aria-labelledby={`faq-b-${i}`} hidden={open !== i} className="answer">{it.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
