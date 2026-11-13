/**
 * Read-only JSON API over a Dataset. Contract-compatible with the reference:
 *   GET /api/health · /api/search · /api/students · /api/student/{seat}
 */
import type { Dataset, Student } from "./dataset.ts";
import { nameMatches, planQuery, seatPrefixRange, type SearchBy } from "../src/domain/search.ts";
import { GRADE_BANDS } from "../src/domain/scores.ts";

export interface ApiResult { status: number; body: unknown }
const ok = (body: unknown): ApiResult => ({ status: 200, body });
const err = (status: number, detail: string): ApiResult => ({ status, body: { detail } });

const intParam = (v: string | null, def: number, min: number, max: number): number | null => {
  if (v === null || v === "") return def;
  if (!/^-?\d+$/.test(v)) return null;
  return Math.min(max, Math.max(min, Number(v)));
};

const SORTS: Record<string, (s: Student) => number | string | null> = {
  rank: (s) => s.national_rank, seat: (s) => s.seating_no, name: (s) => s.name, score: (s) => s.total_degree,
  percentage: (s) => s.percentage, percentile: (s) => s.percentile, performance_index: (s) => s.performance_index,
};
const STATUSES = new Set(["pass_r1", "round2", "fail_r1", "absent"]);
const BANDS = new Set<string>(GRADE_BANDS.map((b) => b.key));

const paged = (rows: Student[], page: number, size: number) => rows.slice((page - 1) * size, page * size);
const byRankNullsLast = (a: Student, b: Student) =>
  (a.national_rank === null ? 1 : 0) - (b.national_rank === null ? 1 : 0) || (a.national_rank ?? 0) - (b.national_rank ?? 0) || a.seating_no - b.seating_no;

export function handleApi(ds: Dataset, pathname: string, q: URLSearchParams, info: { year?: number | null } = {}): ApiResult {
  if (pathname === "/api/health") return ok({ status: "ok", database: true, students: ds.students.length, ranked: ds.rankedCount, demo: ds.demo, max_score: ds.maxScore, year: info.year ?? null });

  if (pathname === "/api/search") {
    const page = intParam(q.get("page"), 1, 1, 1e9), size = intParam(q.get("size"), 25, 1, 100);
    const by = (q.get("by") ?? "auto") as SearchBy;
    if (page === null || size === null) return err(422, "page and size must be integers");
    if (!["auto", "seat", "name"].includes(by)) return err(422, "by must be auto, seat or name");
    const raw = q.get("q") ?? "";
    if (raw.length > 100) return err(422, "query too long");
    const plan = planQuery(raw, by);
    const base = { page, size, demo: ds.demo };
    if (plan.kind === "empty") return ok({ mode: "empty", total: 0, pages: 0, rows: [], ...base });
    if (plan.kind === "too_short") return ok({ mode: "name", total: 0, pages: 0, rows: [], ...base });
    if (plan.kind === "seat") {
      const exact = plan.digits && plan.digits.length <= 15 ? ds.bySeat.get(Number(plan.digits)) : undefined;
      if (exact) return ok({ mode: "seat_exact", total: 1, pages: 1, rows: [exact], ...base, page: 1 });
      const range = seatPrefixRange(plan.digits);
      if (!range) return ok({ mode: "seat_prefix", total: 0, pages: 0, rows: [], ...base });
      // students are sorted by seat → binary search the range
      const lower = (x: number) => { let lo = 0, hi = ds.students.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ds.students[m]!.seating_no < x) lo = m + 1; else hi = m; } return lo; };
      const a = lower(range.lo), b = lower(range.hi + 1);
      return ok({ mode: "seat_prefix", total: b - a, pages: Math.ceil((b - a) / size), rows: ds.students.slice(a + (page - 1) * size, Math.min(b, a + page * size)), ...base });
    }
    const hits: Student[] = [];
    for (let i = 0; i < ds.students.length; i++) if (nameMatches(ds.keys[i]!, plan.tokens)) hits.push(ds.students[i]!);
    hits.sort(byRankNullsLast);
    return ok({ mode: "name", query_key: plan.key, total: hits.length, pages: Math.ceil(hits.length / size), rows: paged(hits, page, size), ...base });
  }

  if (pathname === "/api/students") {
    const page = intParam(q.get("page"), 1, 1, 1e9), size = intParam(q.get("size"), 25, 1, 200);
    if (page === null || size === null) return err(422, "page and size must be integers");
    const sort = q.get("sort") ?? "rank", order = (q.get("order") ?? "asc").toLowerCase();
    if (!SORTS[sort]) return err(422, `sort must be one of ${Object.keys(SORTS).join(", ")}`);
    if (order !== "asc" && order !== "desc") return err(422, "order must be asc or desc");
    const status = q.get("status"), band = q.get("band");
    if (status && !STATUSES.has(status)) return err(422, "unknown status");
    if (band && !BANDS.has(band)) return err(422, "unknown band");
    const num = (k: string) => { const v = q.get(k); if (v === null || v === "") return undefined; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN; };
    const minPct = num("min_pct"), maxPct = num("max_pct");
    if (Number.isNaN(minPct) || Number.isNaN(maxPct)) return err(422, "min_pct / max_pct must be between 0 and 100");
    const sittersOnly = ["1", "true"].includes((q.get("sitters_only") ?? "").toLowerCase());
    let rows = ds.students.filter((s) =>
      (!status || s.status === status) && (!band || s.grade_band === band) &&
      (minPct === undefined || s.percentage >= minPct) && (maxPct === undefined || s.percentage <= maxPct) &&
      (!sittersOnly || s.status !== "absent"));
    const key = SORTS[sort]!, dir = order === "desc" ? -1 : 1;
    rows = rows.sort((a, b) => {
      const x = key(a), y = key(b);
      if (x === null || y === null) return (x === null ? 1 : 0) - (y === null ? 1 : 0) || a.seating_no - b.seating_no; // nulls always last
      const c = typeof x === "string" ? x.localeCompare(y as string, "ar") : (x as number) - (y as number);
      return c * dir || a.seating_no - b.seating_no;
    });
    return ok({ page, size, total: rows.length, pages: Math.ceil(rows.length / size), rows: paged(rows, page, size), demo: ds.demo });
  }

  const m = /^\/api\/student\/([^/]+)$/.exec(pathname);
  if (m) {
    const raw = decodeURIComponent(m[1]!);
    if (!/^\d{1,15}$/.test(raw)) return err(422, "invalid seat number");
    const s = ds.bySeat.get(Number(raw));
    if (!s) return err(404, `No student with seat number ${raw}`);
    let neighbours: Pick<Student, "seating_no" | "name" | "total_degree" | "percentage" | "national_rank">[] = [];
    if (s.national_rank !== null) {
      const lo = Math.max(1, s.national_rank - 5), hi = s.national_rank + 5;
      neighbours = ds.byRank.filter((x) => x.national_rank! >= lo && x.national_rank! <= hi).slice(0, 11)
        .map(({ seating_no, name, total_degree, percentage, national_rank }) => ({ seating_no, name, total_degree, percentage, national_rank }));
    }
    return ok({ ...s, neighbours, demo: ds.demo });
  }
  return err(404, "Not found");
}
