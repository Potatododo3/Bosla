import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/index.tsx";
import { useCore, useScore, type Core } from "../data/store.tsx";
import { parseNumberInput } from "../domain/scores.ts";
import { Card, Icon, OfficialBadge, Ready, Stat } from "../components/ui.tsx";
import { BarList } from "../charts/Parts.tsx";
import { Pending, useFacultyName } from "./Admission.tsx";

export function Home() {
  const core = useCore();
  return <div className="page"><Ready of={core}>{(c) => <HomeBody core={c} />}</Ready></div>;
}

function HomeBody({ core }: { core: Core }) {
  const { t, n, f } = useI18n();
  const { a, year, max, admission } = core;
  const { setScore } = useScore();
  const name = useFacultyName();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = parseNumberInput(text, 0, max);
    if (!p.ok) { setErr(p.error === "above_max" ? t.standing.errors.above_max_score(n(max)) : t.standing.errors[p.error]); return; }
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
    <>
      <section className="hero">
        <div>
          <span className="badge">{t.home.eyebrow}</span>
          <h1>{t.home.title(String(year))}</h1>
          <p className="lead">{t.home.lead(n(a.cohort.sitters))}</p>
          <div className="hero-actions">
            <Link className="btn primary" to="/standing">{t.home.ctaStanding}<Icon name="arrow" flip /></Link>
            <Link className="btn" to="/overview">{t.home.ctaDashboard}</Link>
          </div>
        </div>
        <form className="quick" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="quick-score">{t.home.quickLabel(n(max))}</label>
            <input id="quick-score" className="input" inputMode="decimal" autoComplete="off" dir="ltr" placeholder={String(Math.round(max * 0.895 * 2) / 2)} value={text}
              aria-invalid={err !== null} aria-describedby="quick-msg" onChange={(e) => { setText(e.target.value); setErr(null); }} />
            <div id="quick-msg" aria-live="polite">
              {err ? <span className="err"><Icon name="alert" size={15} />{err}</span> : <span className="hint">{t.standing.privacy}</span>}
            </div>
          </div>
          <button className="btn primary" type="submit">{t.home.quickGo}</button>
        </form>
      </section>

      <div className="grid g4">
        <Stat label={t.home.kTotal} value={n(a.cohort.total_students)} />
        <Stat label={t.home.kRanked} value={n(a.cohort.sitters)} />
        <Stat label={t.home.kMean} value={f(a.stats_pct.mean, 1)} unit="%" />
        <Stat label={t.home.kMax} value={n(max)} />
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
        <Card title={t.home.topCutoffs} right={admission.state === "published" ? <OfficialBadge /> : undefined}>
          {admission.state === "pending" ? <Pending admission={admission} year={year} compact /> : (
            <>
              <BarList max={100} rows={admission.faculties.slice(0, 6).map((x) => ({
                key: x.key, label: name(x), value: x.cutoff, display: `${f(x.cutoff, 1)}%`, note: t.overview.needs(f(x.scoreNeeded, 0), n(max)),
              }))} />
              <p style={{ marginTop: 12 }}><Link to="/minimums">{t.ui.viewAll}</Link></p>
            </>
          )}
        </Card>
        <Card title={t.home.trustT}>
          <ul className="list"><li>{t.home.trust1}</li><li>{t.home.trust2}</li><li>{t.home.trust3}</li></ul>
          <p style={{ marginTop: 12 }}><Link to="/methodology">{t.nav.methodology}</Link></p>
        </Card>
      </div>
    </>
  );
}
