import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/index.tsx";
import { useCore, useScore } from "../data/store.tsx";
import { MAX_SCORE, parseNumberInput } from "../domain/scores.ts";
import { Card, Icon, Ready, Stat, UnofficialBadge } from "../components/ui.tsx";
import { BarList } from "../charts/Parts.tsx";

export function Home() {
  const { t, n, f } = useI18n();
  const core = useCore();
  const { setScore } = useScore();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = parseNumberInput(text, 0, MAX_SCORE);
    if (!p.ok) { setErr(p.error === "above_max" ? t.standing.errors.above_max_score : t.standing.errors[p.error]); return; }
    setScore(p.value);
    nav("/standing");
  }

  const features = [
    { to: "/standing", icon: "target", title: t.home.fStandingT, desc: t.home.fStandingD },
    { to: "/admission", icon: "cap", title: t.home.fAdmissionT, desc: t.home.fAdmissionD },
    { to: "/overview", icon: "bars", title: t.home.fAnalyticsT, desc: t.home.fAnalyticsD },
    { to: "/search", icon: "search", title: t.home.fSearchT, desc: t.home.fSearchD },
  ];

  return (
    <div className="page">
      <section className="hero">
        <div>
          <span className="badge">{t.home.eyebrow}</span>
          <h1>{t.home.title}</h1>
          <p className="lead">{t.home.lead}</p>
          <div className="hero-actions">
            <Link className="btn primary" to="/standing">{t.home.ctaStanding}<Icon name="arrow" flip /></Link>
            <Link className="btn" to="/overview">{t.home.ctaDashboard}</Link>
          </div>
        </div>
        <form className="quick" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="quick-score">{t.home.quickLabel}</label>
            <input id="quick-score" className="input" inputMode="decimal" autoComplete="off" dir="ltr" placeholder="286.5" value={text}
              aria-invalid={err !== null} aria-describedby="quick-msg" onChange={(e) => { setText(e.target.value); setErr(null); }} />
            <div id="quick-msg" aria-live="polite">
              {err ? <span className="err"><Icon name="alert" size={15} />{err}</span> : <span className="hint">{t.standing.privacy}</span>}
            </div>
          </div>
          <button className="btn primary" type="submit">{t.home.quickGo}</button>
        </form>
      </section>

      <Ready of={core}>
        {({ a, faculties }) => (
          <>
            <div className="grid g4">
              <Stat label={t.home.kTotal} value={n(a.cohort.total_students)} />
              <Stat label={t.home.kRanked} value={n(a.cohort.sitters)} />
              <Stat label={t.home.kMean} value={f(a.stats_pct.mean, 1)} unit="%" />
              <Stat label={t.home.kFaculties} value={n(faculties.length)} />
            </div>
            <div className="grid g2">
              {features.map((x) => (
                <Link key={x.to} to={x.to} className="feature">
                  <span className="ficon"><Icon name={x.icon} size={20} /></span>
                  <div><h3>{x.title}</h3><p>{x.desc}</p></div>
                </Link>
              ))}
            </div>
            <div className="grid g2">
              <Card title={t.home.topCutoffs} right={<UnofficialBadge />}>
                <BarList max={100} rows={faculties.slice(0, 6).map((x) => ({
                  key: x.key, label: t.faculty[x.key] ?? x.key, value: x.expected, display: `${f(x.expected, 1)}%`, note: t.overview.needs(f(x.scoreNeeded, 0)),
                }))} />
                <p style={{ marginTop: 12 }}><Link to="/predictions">{t.ui.viewAll}</Link></p>
              </Card>
              <Card title={t.home.trustT}>
                <ul className="list">
                  <li>{t.home.trust1}</li><li>{t.home.trust2}</li><li>{t.home.trust3}</li>
                </ul>
                <p style={{ marginTop: 12 }}><Link to="/methodology">{t.nav.methodology}</Link></p>
              </Card>
            </div>
          </>
        )}
      </Ready>
    </div>
  );
}
