import { useId, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/index.tsx";
import type { Async } from "../data/store.tsx";
import { toCSV, toXLSX, type Cell } from "../domain/exporters.ts";
import type { StatusKey } from "../domain/scores.ts";

/* ---- icons (inline, decorative unless labelled by the parent) ----------- */
const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z",
  cap: "M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3-5-5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  bars: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 20h8",
  sigma: "M18 5H6l6 7-6 7h12",
  shield: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zM9 12l2 2 4-4",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-9v.5",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.7m0 3v.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  x: "M6 6l12 12M18 6 6 18",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  auto: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  alert: "M12 4 2.5 20h19zM12 10v5m0 2.5v.5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  print: "M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  arrow: "M5 12h14m0 0-5-5m5 5-5 5",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  copy: "M9 9h10v11H9zM5 15V4h10",
  chevron: "M6 9l6 6 6-6",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9",
};
export function Icon({ name, size = 18, flip = false }: { name: keyof typeof PATHS | string; size?: number; flip?: boolean }) {
  return (
    <svg className={flip ? "icon flip" : "icon"} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

/* ---- layout primitives -------------------------------------------------- */
export function PageHead({ title, sub, badge }: { title: string; sub: string; badge?: ReactNode }) {
  return (
    <header className="page-head">
      <div><h1>{title}</h1><p>{sub}</p></div>
      {badge}
    </header>
  );
}

export function Card({ title, desc, right, children, className = "" }: { title?: string; desc?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          <div>{title && <h2>{title}</h2>}{desc && <p>{desc}</p>}</div>
          {right && <div className="card-actions">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value"><bdi>{value}</bdi>{unit && <span className="stat-unit">{unit}</span>}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Note({ tone = "info", children, title }: { tone?: "info" | "warn" | "lock"; children: ReactNode; title?: string }) {
  return (
    <div className={`note note-${tone}`} role={tone === "warn" ? "note" : undefined}>
      <Icon name={tone === "warn" ? "alert" : tone === "lock" ? "lock" : "info"} />
      <div>{title && <strong>{title}</strong>}<div>{children}</div></div>
    </div>
  );
}

export function OfficialBadge() {
  const { t } = useI18n();
  return <span className="badge badge-info"><Icon name="check" size={14} />{t.adm.badge}</span>;
}
export function YearBadge({ year }: { year: number }) {
  const { t } = useI18n();
  return <span className="badge">{t.ui.dataYear(String(year))}</span>;
}

const STATUS_TONE: Record<StatusKey, string> = { pass_r1: "good", round2: "warn", fail_r1: "bad", absent: "mute", unknown: "mute" };
const STATUS_ICON: Record<StatusKey, string> = { pass_r1: "✓", round2: "↻", fail_r1: "✕", absent: "–", unknown: "?" };
export function StatusChip({ status }: { status: StatusKey }) {
  const { t } = useI18n();
  return <span className={`chip chip-${STATUS_TONE[status]}`}><span aria-hidden="true">{STATUS_ICON[status]}</span>{t.status[status]}</span>;
}
export const STATUS_COLOR: Record<StatusKey, string> = { pass_r1: "var(--good)", round2: "var(--warning)", fail_r1: "var(--critical)", absent: "var(--muted-mark)", unknown: "var(--muted-mark)" };

/* ---- async states ------------------------------------------------------- */
export function Loading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="loading">
      <span className="sr-only">{t.ui.loading}</span>
      <div className="grid g4">{[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 96 }} />)}</div>
      <div className="grid g2">{[0, 1].map((i) => <div key={i} className="sk" style={{ height: 280 }} />)}</div>
    </div>
  );
}
export function ErrorState({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="state" role="alert">
      <Icon name="alert" size={28} />
      <h2>{t.ui.loadError}</h2>
      <p>{t.ui.loadErrorHint}</p>
      <button className="btn primary" onClick={retry}>{t.ui.retry}</button>
    </div>
  );
}
/** Renders children once data is ready; otherwise the loading / error state. */
export function Ready<T>({ of, children }: { of: Async<T>; children: (data: T) => ReactNode }) {
  if (of.state === "loading") return <Loading />;
  if (of.state === "error") return <ErrorState retry={of.retry} />;
  return <>{children(of.data)}</>;
}

/* ---- data table + chart table toggle ------------------------------------ */
export interface Column<R> { key: string; label: string; cell: (r: R) => ReactNode; value: (r: R) => Cell; num?: boolean; strong?: boolean }

export function DataTable<R>({ columns, rows, rowKey, caption, empty, highlight, stack }: {
  columns: Column<R>[]; rows: R[]; rowKey: (r: R) => string | number; caption: string; empty?: string; highlight?: (r: R) => boolean;
  /** on narrow screens, show each row as a labelled card instead of a wide table */
  stack?: boolean;
}) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className={stack ? "table stack" : "table"}>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? "num" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length} className="table-empty">{empty}</td></tr>
            : rows.map((r) => (
              <tr key={rowKey(r)} className={highlight?.(r) ? "hl" : ""}>
                {columns.map((c) => <td key={c.key} data-label={c.label} className={`${c.num ? "num" : ""} ${c.strong ? "strong" : ""} ${c.key === "name" || c.label === "" ? "wide" : ""}`}>{c.cell(r)}</td>)}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function download(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ExportBar<R>({ name, sheet, columns, rows }: { name: string; sheet: string; columns: Column<R>[]; rows: R[] }) {
  const { t, lang } = useI18n();
  if (rows.length === 0) return null;
  const header = columns.map((c) => c.label);
  const data = () => rows.map((r) => columns.map((c) => c.value(r)));
  return (
    <div className="exportbar no-print" role="group" aria-label={t.ui.export}>
      <button className="btn sm" onClick={() => download(toCSV(header, data()), "text/csv;charset=utf-8", `${name}.csv`)}><Icon name="download" size={15} />{t.ui.exportCsv}</button>
      <button className="btn sm" onClick={() => download(toXLSX({ name: sheet, header, rows: data(), rtl: lang === "ar" }) as unknown as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${name}.xlsx`)}><Icon name="download" size={15} />{t.ui.exportXlsx}</button>
      <button className="btn sm" onClick={() => window.print()}><Icon name="print" size={15} />{t.ui.print}</button>
    </div>
  );
}

/** Chart card with a "show data table" toggle — the accessible alternative. */
export function ChartCard({ title, desc, legend, children, table }: {
  title: string; desc?: string; legend?: ReactNode; children: ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Card title={title} desc={desc} right={
      <button className="btn sm ghost no-print" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Icon name="table" size={15} />{open ? t.ui.hideTable : t.ui.showTable}
      </button>}>
      {legend}
      {children}
      <div id={id} hidden={!open}>
        {open && (
          <div className="table-wrap mini" tabIndex={0} role="region" aria-label={title}>
            <table className="table">
              <thead><tr>{table.head.map((h) => <th key={h} scope="col" className="num">{h}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="num">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const { t, n } = useI18n();
  return (
    <nav className="pager no-print" aria-label={t.ui.page}>
      <span className="muted">{n(total)} {t.ui.results}</span>
      <div>
        <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t.ui.prev}</button>
        <span className="muted" aria-live="polite">{t.ui.page} {n(page)} / {n(Math.max(1, pages))}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t.ui.next}</button>
      </div>
    </nav>
  );
}
