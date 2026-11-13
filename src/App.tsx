import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useCore } from "./data/store.tsx";
import { useI18n } from "./i18n/index.tsx";
import { Icon, Loading } from "./components/ui.tsx";
import { Home } from "./pages/Home.tsx";
import { Standing } from "./pages/Standing.tsx";
import type { Dict } from "./i18n/en.ts";

// Analytics pages are split out so the student tools load first on slow connections.
const Admission = lazy(() => import("./pages/Admission.tsx").then((m) => ({ default: m.Admission })));
const Minimums = lazy(() => import("./pages/Admission.tsx").then((m) => ({ default: m.Minimums })));
const Search = lazy(() => import("./pages/Search.tsx").then((m) => ({ default: m.Search })));
const Overview = lazy(() => import("./pages/Analytics.tsx").then((m) => ({ default: m.Overview })));
const Distribution = lazy(() => import("./pages/Analytics.tsx").then((m) => ({ default: m.Distribution })));
const Top = lazy(() => import("./pages/Analytics.tsx").then((m) => ({ default: m.Top })));
const Stats = lazy(() => import("./pages/Analytics.tsx").then((m) => ({ default: m.Stats })));
const QualityPage = lazy(() => import("./pages/Analytics.tsx").then((m) => ({ default: m.QualityPage })));
const About = lazy(() => import("./pages/Site.tsx").then((m) => ({ default: m.About })));
const Methodology = lazy(() => import("./pages/Site.tsx").then((m) => ({ default: m.Methodology })));
const Faq = lazy(() => import("./pages/Site.tsx").then((m) => ({ default: m.Faq })));

type NavKey = keyof Dict["nav"];
const NAV: { group: NavKey; items: { to: string; key: NavKey; icon: string }[] }[] = [
  { group: "groupTools", items: [
    { to: "/", key: "home", icon: "home" },
    { to: "/standing", key: "standing", icon: "target" },
    { to: "/admission", key: "admission", icon: "cap" },
    { to: "/minimums", key: "minimums", icon: "check" },
    { to: "/search", key: "search", icon: "search" },
  ] },
  { group: "groupAnalytics", items: [
    { to: "/overview", key: "overview", icon: "grid" },
    { to: "/distribution", key: "distribution", icon: "bars" },
    { to: "/top", key: "top", icon: "trophy" },
    { to: "/stats", key: "stats", icon: "sigma" },
    { to: "/quality", key: "quality", icon: "flask" },
  ] },
  { group: "groupSite", items: [
    { to: "/methodology", key: "methodology", icon: "book" },
    { to: "/faq", key: "faq", icon: "help" },
    { to: "/about", key: "about", icon: "info" },
  ] },
];

type Theme = "system" | "light" | "dark";
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const s = localStorage.getItem("bosla.theme"); return s === "light" || s === "dark" ? s : "system"; } catch { return "system"; }
  });
  useEffect(() => {
    const d = document.documentElement;
    if (theme === "system") delete d.dataset.theme; else d.dataset.theme = theme;
    try { if (theme === "system") localStorage.removeItem("bosla.theme"); else localStorage.setItem("bosla.theme", theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, () => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system")];
}

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="state">
      <Icon name="compass" size={32} />
      <h1 style={{ fontSize: 22 }}>{t.ui.notFound}</h1>
      <p>{t.ui.notFoundHint}</p>
      <Link className="btn primary" to="/">{t.ui.backHome}</Link>
    </div>
  );
}

export function App() {
  const { t, lang, setLang } = useI18n();
  const [theme, cycleTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const online = useOnline();
  const core = useCore();
  const year = core.state === "ready" ? String(core.data.year) : null;

  // Route change: close the drawer, move focus to the content, set the title.
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
    const item = NAV.flatMap((g) => g.items).find((i) => i.to === loc.pathname);
    document.title = item && item.to !== "/" ? `${t.nav[item.key]} · ${t.brand.name}` : `${t.brand.name} · ${t.brand.tag}`;
  }, [loc.pathname, t]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const themeLabel = theme === "system" ? t.ui.themeSystem : theme === "light" ? t.ui.themeLight : t.ui.themeDark;
  const brand = <span className="brand-mark"><Icon name="compass" size={20} /></span>;

  return (
    <div className="shell">
      <a className="skip" href="#content">{t.nav.skip}</a>
      <aside className={open ? "sidebar open" : "sidebar"} id="sidebar" aria-label={t.nav.menu}>
        <Link className="brand" to="/">{brand}<span className="brand-text"><b>{t.brand.name}</b><span>{t.brand.tag}</span></span></Link>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-group" id={`g-${g.group}`}>{t.nav[g.group]}</div>
              <ul aria-labelledby={`g-${g.group}`}>
                {g.items.map((i) => (
                  <li key={i.to}><NavLink to={i.to} end><Icon name={i.icon} />{t.nav[i.key]}</NavLink></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">{year && <>{t.ui.dataYear(year)}<br /></>}{t.home.eyebrow}</div>
      </aside>
      <button className={open ? "scrim show" : "scrim"} aria-label={t.nav.close} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar no-print">
          <button className="btn ghost icon-only menu-btn" aria-label={t.nav.menu} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
          <Link className="topbar-brand" to="/">{brand}{t.brand.name}</Link>
          <span className="spacer" />
          <button className="btn ghost sm" lang={lang === "ar" ? "en" : "ar"} aria-label={t.ui.languageLabel} onClick={() => setLang(lang === "ar" ? "en" : "ar")}><Icon name="globe" size={17} />{t.ui.language}</button>
          <button className="btn ghost sm" aria-label={`${t.ui.theme}: ${themeLabel}`} title={`${t.ui.theme}: ${themeLabel}`} onClick={cycleTheme}>
            <Icon name={theme === "system" ? "auto" : theme === "light" ? "sun" : "moon"} size={17} /><span className="sr-only">{themeLabel}</span>
          </button>
        </header>
        {!online && <div className="offline" role="status">{t.ui.offline}</div>}
        <main className="content" id="content" tabIndex={-1}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/standing" element={<Standing />} />
              <Route path="/admission" element={<Admission />} />
              <Route path="/minimums" element={<Minimums />} />
              <Route path="/predictions" element={<Navigate to="/minimums" replace />} />
              <Route path="/search" element={<Search />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/distribution" element={<Distribution />} />
              <Route path="/top" element={<Top />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/quality" element={<QualityPage />} />
              <Route path="/about" element={<About />} />
              <Route path="/methodology" element={<Methodology />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="footer">
          <span>{t.brand.name} · {t.home.eyebrow}</span>
          <span>{t.home.trust1}</span>
        </footer>
      </div>
    </div>
  );
}
