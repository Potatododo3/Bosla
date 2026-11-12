import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildDataset, type RawRow } from "../server/dataset.ts";
import { computeAnalytics, computeQuality } from "../server/analytics.ts";
import { compareAnalytics } from "../server/compare.ts";
import * as S from "../server/stats.ts";
import { messyRows } from "./fixtures/messy.ts";

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const LABEL: Record<string, string> = { pass_r1: "ناجح دور أول", round2: "دور ثان", fail_r1: "راسب دور أول", absent: "غياب كلى دور أول" };

/** Deep-compare ours against the reference output; returns the paths that differ. */
function diff(ours: any, ref: any, skip: RegExp, tol = 2e-6, path = "", out: string[] = []): string[] {
  if (skip.test(path)) return out;
  if (typeof ref === "number") { if (typeof ours !== "number" || Math.abs(ours - ref) > tol * Math.max(1, Math.abs(ref))) out.push(`${path}: ${ours} vs ${ref}`); }
  else if (Array.isArray(ref)) { if (!Array.isArray(ours) || ours.length !== ref.length) out.push(`${path}: length`); else ref.forEach((v, i) => diff(ours[i], v, skip, tol, `${path}[${i}]`, out)); }
  else if (ref && typeof ref === "object") { for (const k of Object.keys(ref)) { if (ours?.[k] === undefined) { if (!/label|note|description|verdict|rules|method/.test(k)) out.push(`${path}.${k}: missing`); } else diff(ours[k], ref[k], skip, tol, `${path}.${k}`, out); } }
  else if (ref !== null && ours !== ref) out.push(`${path}: ${ours} vs ${ref}`);
  return out;
}
function rowDiffs(ds: ReturnType<typeof buildDataset>, refRows: any[][]): number {
  const ref = new Map<string, any[]>();
  for (const r of refRows) ref.set(`${r[0]}|${r[1]}`, r);
  let bad = 0, seen = 0;
  for (const r of ds.rows) {
    const x = ref.get(`${r.seat}|${r.name}`);
    if (!x) continue;
    seen++;
    const s = r.student;
    const ok = x[2] === r.status && x[3] === r.band && x[4] === r.pct && (x[5] ?? null) === (r.ranked ? s!.national_rank : null)
      && (x[6] ?? null) === (r.ranked ? s!.percentile : null) && Math.abs((x[7] ?? -1) - (r.ranked ? s!.performance_index! : -1)) < 0.011 && x[8] === (r.invalid === null);
    if (!ok) bad++;
  }
  expect(seen).toBeGreaterThan(refRows.length * 0.95);
  return bad;
}

describe("data build vs the reference Python pipeline (synthetic rows)", () => {
  // Known, documented differences: Anderson–Darling table (scipy version), exact clusters, a dtype label.
  const KNOWN = /anderson_darling\.critical_values|\.clusters|grade_bands_\w+\[6\]\.low|columns\.status\.dtype/;

  it("messy file: every statistic, the quality report and every student's rank match", () => {
    const ref = json("./fixtures/reference-messy.json");
    const ds = buildDataset(messyRows(), false, 320);
    // the reference cannot draw per-status shapes when a score is missing; ours can (checked on the clean file)
    expect(diff(computeAnalytics(ds, { year: 2026 }), ref.analytics, new RegExp(`${KNOWN.source}|violin_by_status`))).toEqual([]);
    expect(diff(computeQuality(ds, { year: 2026 }), ref.quality, KNOWN)).toEqual([]);
    expect(rowDiffs(ds, ref.rows)).toBe(0);
    expect(ds.log).toMatchObject({ rows_in: 4027, exact_duplicate_rows_removed: 15, rows_out: 4012, invalid_rows: 165 });
    expect(ds.log.unknown_status_labels).toEqual({ "منسحب": 12, "(empty)": 8 });
  });

  it("clean file: also per-status box/violin shapes and density curves match", () => {
    const ref = json("./fixtures/reference-clean.json");
    const src = buildDataset(messyRows(4000, 5), false, 320);
    const seen = new Set<number>();
    const clean: RawRow[] = src.rows.filter((r) => r.invalid === null && r.status !== "unknown" && !seen.has(r.seat!) && seen.add(r.seat!))
      .map((r) => ({ seat: r.seat, name: r.name, score: r.score, status: LABEL[r.status]! }));
    const ds = buildDataset(clean, false, 320);
    const A = computeAnalytics(ds, { year: 2026 });
    expect(diff(A, ref.analytics, KNOWN)).toEqual([]);
    expect(diff(computeQuality(ds, { year: 2026 }), ref.quality, KNOWN)).toEqual([]);
    expect(rowDiffs(ds, ref.rows)).toBe(0);
    expect(A.violin_by_status.length).toBe(3);
  });

  it("exact clusters are at least as tight as the reference's k-means", () => {
    const ref = json("./fixtures/reference-messy.json");
    const ds = buildDataset(messyRows(), false, 320);
    const scores = ds.rows.filter((r) => r.ranked).map((r) => r.score!);
    const sse = (cl: { min_score: number; max_score: number }[]) => cl.reduce((acc, c) => {
      const v = scores.filter((x) => x >= c.min_score && x <= c.max_score), m = v.reduce((a, b) => a + b, 0) / v.length;
      return acc + v.reduce((a, b) => a + (b - m) ** 2, 0);
    }, 0);
    const ours = computeAnalytics(ds, { year: 2026 }).clusters.clusters;
    expect(ours.reduce((a, c) => a + c.size_sample, 0)).toBe(scores.length);
    expect(sse(ours)).toBeLessThanOrEqual(sse(ref.analytics.clusters.clusters) + 1e-6);
  });
});

describe("data build vs the published 2026 statistics (real cohort)", () => {
  it("rebuilding from the published score-frequency table reproduces the published figures", () => {
    const pub = json("../public/data/analytics.json");
    const rows: RawRow[] = [];
    let seat = 1000000;
    for (const f of pub.frequency_table) for (let i = 0; i < f.count; i++) rows.push({ seat: seat++, name: "طالب تجريبي", score: f.score, status: "راسب دور أول" });
    const ds = buildDataset(rows, false, 320);
    expect(ds.rankedCount).toBe(884661);
    const A = computeAnalytics(ds, { year: 2026 });
    const scoreOnly = new Set(["grade_bands_sitters", "histogram_pct", "cdf_pct", "box_overall", "stats_score", "stats_pct", "percentiles_score", "percentiles_pct",
      "frequency_table", "normal_fit_pct", "extremes", "gap_analysis", "normality.dagostino_k2", "normality.jarque_bera"]);
    const res = compareAnalytics(A, pub).filter((r) => scoreOnly.has(r.section));
    expect(res.length).toBe(scoreOnly.size);
    for (const r of res) expect(r.mismatches, `${r.section}: ${r.worst}`).toBe(0);
    A.thresholds.forEach((t, i) => expect([t.count_sitters, t.pct_sitters, t.score_needed]).toEqual([pub.thresholds[i].count_sitters, pub.thresholds[i].pct_sitters, pub.thresholds[i].score_needed]));
    // density uses everyone instead of a random 60k sample: same curve within sampling noise
    const peak = Math.max(...pub.density_pct.y);
    A.density_pct.y.forEach((y, i) => expect(Math.abs(y - pub.density_pct.y[i])).toBeLessThan(peak * 0.04));
    // cluster boundaries within a few marks of the sampled k-means
    A.clusters.clusters.forEach((c, i) => expect(Math.abs(c.max_score - pub.clusters.clusters[i].max_score)).toBeLessThanOrEqual(3));
  }, 120_000);
});

describe("numerical helpers", () => {
  it("rounding follows numpy and Python exactly", () => {
    expect(S.npRound(0.15625, 4)).toBe(0.1562);   // tie → even
    expect(S.npRound(47.03125, 4)).toBe(47.0312);
    expect(S.npRound(99.84375, 4)).toBe(99.8438);
    expect(S.pyRound(2.5, 0)).toBe(2);
    expect(S.pyRound(3.5, 0)).toBe(4);
    expect(S.pyRound(2.675, 2)).toBe(2.67);       // 2.675 is stored just below the tie
    expect(S.pyRound(0.15625, 3)).toBe(0.156);
    expect(S.pyRound(-1.0005, 3)).toBe(-1);
  });
  it("percentile, histogram edges, normal distribution", () => {
    const v = Float64Array.from([1, 2, 3, 4, 10]);
    expect(S.percentile(v, 50)).toBe(3);
    expect(S.percentile(v, 25)).toBe(2);
    expect(S.percentile(v, 90)).toBeCloseTo(7.6, 12);
    expect(S.histogram([0, 1.999, 2, 99.9, 100], 50, 0, 100).counts.slice(0, 2)).toEqual([2, 1]);
    expect(S.histogram([100], 50, 0, 100).counts[49]).toBe(1);
    expect(S.normCdf(0)).toBe(0.5);
    expect(S.normCdf(1.959963984540054)).toBeCloseTo(0.975, 12);
    expect(S.normPpf(0.975)).toBeCloseTo(1.959963984540054, 10);
    expect(S.normLogCdf(-30)).toBeCloseTo(-454.321244, 5);
  });
  it("k-means on obvious groups, sampling is deterministic", () => {
    const km = S.kmeans1d([1, 2, 3, 50, 51, 100], [1, 1, 1, 2, 2, 5], 3);
    expect(km.map((c) => [c.from, c.to, c.weight])).toEqual([[0, 2, 3], [3, 4, 4], [5, 5, 5]]);
    const a = S.sampleWithoutReplacement([...Array(100).keys()], 10, 7);
    expect(a).toEqual(S.sampleWithoutReplacement([...Array(100).keys()], 10, 7));
    expect(new Set(a).size).toBe(10);
  });
});
