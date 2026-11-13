import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/index.tsx";
import { api, ApiError, checkHealth, type ApiHealth } from "../data/store.tsx";
import type { SearchResponse, StudentProfile, StudentRow } from "../data/types.ts";
import { planQuery, type SearchBy } from "../domain/search.ts";
import { Card, DataTable, ExportBar, Icon, Loading, Note, PageHead, Pager, Stat, StatusChip, type Column } from "../components/ui.tsx";
import { Meter } from "../charts/Parts.tsx";

type Result = { state: "idle" } | { state: "too_short" } | { state: "loading" } | { state: "error" } | { state: "ready"; data: SearchResponse };

export function Search() {
  const { t, n, f, g } = useI18n();
  const [health, setHealth] = useState<ApiHealth>({ state: "checking" });
  const [q, setQ] = useState("");
  const [by, setBy] = useState<SearchBy>("auto");
  const [res, setRes] = useState<Result>({ state: "idle" });
  const [profile, setProfile] = useState<{ state: "loading" } | { state: "missing" } | { state: "error" } | { state: "ready"; data: StudentProfile } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const timer = useRef<number>(0);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkHealth().then(setHealth); }, []);
  useEffect(() => () => { ctl.current?.abort(); clearTimeout(timer.current); }, []);

  function run(query: string, mode: SearchBy, page: number) {
    ctl.current?.abort();
    clearTimeout(timer.current);
    const plan = planQuery(query, mode);
    if (plan.kind === "empty") return setRes({ state: "idle" });
    if (plan.kind === "too_short" || (plan.kind === "seat" && plan.digits.length === 0)) return setRes({ state: "too_short" });
    const c = new AbortController();
    ctl.current = c;
    setRes({ state: "loading" });
    api.search(query.trim(), mode, page, c.signal).then(
      (data) => setRes({ state: "ready", data }),
      (e) => { if ((e as Error).name !== "AbortError") setRes({ state: "error" }); },
    );
  }
  const onType = (v: string) => { setQ(v); clearTimeout(timer.current); timer.current = window.setTimeout(() => run(v, by, 1), 350); };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); run(q, by, 1); };

  function open(seat: number) {
    setProfile({ state: "loading" });
    api.student(seat).then(
      (data) => setProfile({ state: "ready", data }),
      (e) => setProfile({ state: e instanceof ApiError && e.status === 404 ? "missing" : "error" }),
    );
    requestAnimationFrame(() => profileRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  const cols: Column<StudentRow>[] = [
    { key: "seat", label: t.col.seat, cell: (r) => <bdi>{r.seating_no}</bdi>, value: (r) => r.seating_no, num: true },
    { key: "name", label: t.col.name, cell: (r) => r.name, value: (r) => r.name, strong: true },
    { key: "score", label: t.col.score, cell: (r) => g(r.total_degree, 1), value: (r) => r.total_degree, num: true },
    { key: "pct", label: t.col.percentage, cell: (r) => `${f(r.percentage, 2)}%`, value: (r) => r.percentage, num: true, strong: true },
    { key: "status", label: t.col.status, cell: (r) => <StatusChip status={r.status} />, value: (r) => t.status[r.status] },
    { key: "rank", label: t.col.rank, cell: (r) => (r.national_rank === null ? <span className="muted">{t.search.unranked}</span> : n(r.national_rank)), value: (r) => r.national_rank, num: true },
  ];
  const viewCol: Column<StudentRow> = {
    key: "view", label: "", value: () => null,
    cell: (r) => <button className="btn sm" onClick={() => open(r.seating_no)} aria-label={`${t.search.view}: ${r.name}`}>{t.search.view}</button>,
  };

  if (health.state === "checking") return <div className="page"><PageHead title={t.search.title} sub={t.search.sub} /><Loading /></div>;
  if (health.state === "off") {
    return (
      <div className="page">
        <PageHead title={t.search.title} sub={t.search.sub} />
        <div className="state" data-testid="search-off">
          <Icon name="lock" size={30} />
          <h2>{t.search.offT}</h2>
          <p>{t.search.offD}</p>
          <Link className="btn primary" to="/standing">{t.search.offCta}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title={t.search.title} sub={t.search.sub} />
      {health.demo && <Note tone="warn" title={t.search.demoT}>{t.search.demoD}</Note>}

      <Card>
        <form onSubmit={onSubmit} role="search">
          <div className="searchbar">
            <div className="field">
              <label htmlFor="q">{t.search.label}</label>
              <input id="q" className="input" type="search" value={q} placeholder={t.search.placeholder} autoComplete="off" maxLength={100}
                aria-describedby="q-hint" onChange={(e) => onType(e.target.value)} />
            </div>
            <button className="btn primary" type="submit" style={{ minHeight: 46 }}><Icon name="search" />{t.search.submit}</button>
          </div>
          <div className="searchrow">
            <div className="seg" role="group" aria-label={t.search.by}>
              {(["auto", "seat", "name"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={by === k} onClick={() => { setBy(k); run(q, k, 1); }}>{t.search[k]}</button>
              ))}
            </div>
          </div>
          <p id="q-hint" className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t.search.hint}</p>
        </form>
      </Card>

      <div ref={profileRef} style={{ scrollMarginTop: 72 }}>
        {profile && (
          <Card className="profile">
            {profile.state === "loading" && <div className="sk" style={{ height: 160 }} role="status" aria-label={t.ui.loading} />}
            {profile.state === "missing" && <p role="alert">{t.search.notFoundProfile}</p>}
            {profile.state === "error" && <p role="alert">{t.search.failD}</p>}
            {profile.state === "ready" && <Profile s={profile.data} max={health.state === "on" ? health.max : 320} />}
            <div className="exportbar no-print"><button className="btn sm" onClick={() => setProfile(null)}><Icon name="x" size={15} />{t.search.closeProfile}</button></div>
          </Card>
        )}
      </div>

      <div aria-live="polite">
        {res.state === "idle" && <div className="state"><Icon name="search" size={28} /><p>{t.search.idle}</p></div>}
        {res.state === "too_short" && <div className="state"><p>{t.search.tooShort}</p></div>}
        {res.state === "loading" && <div className="sk" style={{ height: 220 }} role="status" aria-label={t.ui.loading} />}
        {res.state === "error" && (
          <div className="state" role="alert"><Icon name="alert" size={28} /><h2>{t.search.failT}</h2><p>{t.search.failD}</p>
            <button className="btn primary" onClick={() => run(q, by, 1)}>{t.ui.retry}</button></div>
        )}
        {res.state === "ready" && (res.data.total === 0
          ? <div className="state" data-testid="no-results"><h2>{t.search.none}</h2><p>{t.search.noneHint}</p></div>
          : (
            <Card title={`${n(res.data.total)} ${t.ui.results}`} desc={t.search.mode[res.data.mode]}>
              <DataTable stack columns={[...cols, viewCol]} rows={res.data.rows} rowKey={(r) => r.seating_no} caption={t.search.title} />
              {res.data.pages > 1 && <Pager page={res.data.page} pages={res.data.pages} total={res.data.total} onPage={(p) => run(q, by, p)} />}
              <ExportBar name="bosla-search-results" sheet={t.search.title} columns={cols} rows={res.data.rows} />
              <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t.search.privacy}</p>
            </Card>
          ))}
      </div>
    </div>
  );
}

function Profile({ s, max }: { s: StudentProfile; max: number }) {
  const { t, n, f, g } = useI18n();
  const tier = s.is_top_1pct ? t.standing.tier.top1 : s.is_top_5pct ? t.standing.tier.top5 : s.is_top_10pct ? t.standing.tier.top10 : null;
  return (
    <div data-testid="profile">
      <div className="profile-head">
        <div><h2>{s.name}</h2><p className="muted num">{t.col.seat} <bdi>{s.seating_no}</bdi></p></div>
        <StatusChip status={s.status} />
      </div>
      <div className="grid g4" style={{ margin: "14px 0" }}>
        <Stat label={t.standing.rank} value={s.national_rank === null ? "—" : n(s.national_rank)} sub={s.percentile === null ? t.search.unrankedWhy : t.search.aheadOf(f(s.percentile, 1))} />
        <Stat label={t.col.score} value={g(s.total_degree, 1)} sub={t.ui.outOf(n(max))} />
        <Stat label={t.col.percentage} value={f(s.percentage, 2)} unit="%" />
        <Stat label={t.col.perf} value={s.performance_index === null ? "—" : f(s.performance_index, 1)} />
      </div>
      <Meter value={s.percentage} label={t.col.percentage} />
      <div className="chips" style={{ marginTop: 12 }}>
        <span className="chip chip-mute">{t.band[s.grade_band]}</span>
        {tier && <span className="chip chip-good"><span aria-hidden="true">★</span>{tier}</span>}
      </div>
      {s.neighbours.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "18px 0 8px" }}>{t.search.nearby}</h3>
          <DataTable caption={t.search.nearby} rows={s.neighbours} rowKey={(r) => r.seating_no} highlight={(r) => r.seating_no === s.seating_no}
            columns={[
              { key: "r", label: t.col.rank, cell: (r) => n(r.national_rank), value: (r) => r.national_rank, num: true },
              { key: "n", label: t.col.name, cell: (r) => r.name, value: (r) => r.name },
              { key: "s", label: t.col.score, cell: (r) => g(r.total_degree, 1), value: (r) => r.total_degree, num: true },
              { key: "p", label: t.col.percentage, cell: (r) => `${f(r.percentage, 2)}%`, value: (r) => r.percentage, num: true },
            ]} />
        </>
      )}
    </div>
  );
}
