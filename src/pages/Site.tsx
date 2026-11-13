import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { useCore } from "../data/store.tsx";
import { Card, Icon, Note, PageHead, Ready } from "../components/ui.tsx";

export function About() {
  const { t, n, lang } = useI18n();
  const core = useCore();
  const a = t.about;
  return (
    <div className="page">
      <PageHead title={a.title} sub={a.sub} />
      <Ready of={core}>
        {(c) => (
          <div className="grid g2">
            <Card title={a.whatT}><p className="prose">{a.what(String(c.year))}</p></Card>
            <Card title={a.dataT}><ul className="list">{a.data(n(c.a.cohort.total_students), n(c.max)).map((x) => <li key={x}>{x}</li>)}</ul></Card>
            <Card title={a.privacyT}><ul className="list">{a.privacy.map((x) => <li key={x}>{x}</li>)}</ul></Card>
            <Card title={a.limitsT}><ul className="list">{a.limits.map((x) => <li key={x}>{x}</li>)}</ul></Card>
            <Card title={a.creditT}>
              <p className="prose">{a.credit}</p>
              <p style={{ marginTop: 10 }}><a href="https://github.com/omarhamed888/Thanaweya-2026" target="_blank" rel="noopener noreferrer">{a.creditLink}</a></p>
            </Card>
            <Card title={a.versionT}>
              <dl className="formula">
                <dt>{a.vData}</dt><dd data-testid="about-data">{a.vRows(String(c.year), n(c.a.cohort.total_students))}</dd>
                <dt>{a.vAdmission}</dt>
                <dd>{c.admission.state === "published" ? <>{lang === "ar" ? c.admission.config.label_ar : c.admission.config.label_en} · <bdi>{c.admission.config.updated}</bdi></> : a.vAdmissionNone}</dd>
                <dt>{a.vApp}</dt><dd><bdi>2.0.0</bdi></dd>
              </dl>
              <p className="prose" style={{ marginTop: 14 }}><strong>{a.reportT}</strong> {a.report}</p>
            </Card>
          </div>
        )}
      </Ready>
    </div>
  );
}

export function Methodology() {
  const { t, n } = useI18n();
  const core = useCore();
  const m = t.method;
  return (
    <div className="page">
      <PageHead title={m.title} sub={m.sub} />
      <Ready of={core}>
        {(c) => {
          const formulas: [string, string][] = [
            [m.fPct, `percentage = total ÷ ${c.max} × 100`],
            [m.fT, "T = clip( 50 + 10 × (total − μ) ÷ σ , 0 , 100 )"],
            [m.fNeeded, `total needed = minimum % × ${c.max} ÷ 100`],
          ];
          return (
            <>
              <ol className="steps">{m.steps(n(c.max), n(c.a.cohort.sitters)).map((s) => <li key={s.t}><h2>{s.t}</h2><p>{s.d}</p></li>)}</ol>
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
              <Note>{t.adm.note}</Note>
            </>
          );
        }}
      </Ready>
    </div>
  );
}

export function Faq() {
  const { t, n } = useI18n();
  const core = useCore();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="page">
      <PageHead title={t.faq.title} sub={t.faq.sub} />
      <Ready of={core}>
        {(c) => (
          <div className="faq">
            {t.faq.items(String(c.year), n(c.max), n(c.a.cohort.invalid)).map((it, i) => (
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
        )}
      </Ready>
    </div>
  );
}
