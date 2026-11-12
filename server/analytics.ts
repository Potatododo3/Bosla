/**
 * Builds the two precomputed data files the site reads (analytics + data
 * quality) from a cleaned Dataset. Definitions follow the reference pipeline;
 * the three deliberate differences are marked DIFF below.
 */
import { GRADE_BANDS, type BandKey, type StatusKey } from "../src/domain/scores.ts";
import type { CleanRow, Dataset } from "./dataset.ts";
import * as S from "./stats.ts";

export interface BuildOptions { year: number; hideNames?: boolean; generatedAt?: string }

const PCT_THRESHOLDS = [95, 90, 85, 80, 75, 70, 65, 60, 50];
const REPORTED_PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99];
const SITTER_STATUSES: StatusKey[] = ["pass_r1", "round2", "fail_r1"];
const ALL_STATUSES: StatusKey[] = ["pass_r1", "round2", "fail_r1", "absent"];
const KDE_MAX_N = 60000; // the reference estimated densities on at most this many students

function boxStats(v: Float64Array) {
  const q1 = S.percentile(v, 25), median = S.percentile(v, 50), q3 = S.percentile(v, 75);
  const iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const below = S.countLT(v, lo), atOrBelowHi = S.countLE(v, hi);
  return {
    min: v[0]!, q1, median, q3, max: v[v.length - 1]!, iqr, lower_fence: lo, upper_fence: hi,
    lower_whisker: below < v.length ? v[below]! : v[0]!,
    upper_whisker: atOrBelowHi > 0 ? v[atOrBelowHi - 1]! : v[v.length - 1]!,
    outliers_low: below, outliers_high: v.length - atOrBelowHi, mean: S.mean(v),
  };
}

function centralTendency(v: Float64Array) {
  const g = S.groups(v);
  let mi = 0;
  for (let i = 1; i < g.w.length; i++) if (g.w[i]! > g.w[mi]!) mi = i;
  const m = S.moments(v), n = v.length, sd = Math.sqrt((m.m2 * n) / (n - 1));
  return {
    n, mean: m.mean, median: S.percentile(v, 50), mode: g.x[mi]!, mode_count: g.w[mi]!,
    std: sd, variance: (m.m2 * n) / (n - 1), skewness: m.m3 / m.m2 ** 1.5, kurtosis_excess: m.m4 / (m.m2 * m.m2) - 3,
    range: v[n - 1]! - v[0]!, cv_pct: m.mean ? (sd / m.mean) * 100 : null, iqr: S.percentile(v, 75) - S.percentile(v, 25), sem: sd / Math.sqrt(n),
  };
}

function kdeCurve(v: Float64Array, points: number) {
  const g = S.groups(v), grid = S.linspace(0, 100, points);
  // DIFF: all students are used (the reference drew a random subsample), with the same bandwidth rule.
  const y = S.kde(g.x, g.w, grid, Math.min(v.length, KDE_MAX_N));
  return { x: grid.map((x) => S.npRound(x, 4)), y: y.map((d) => S.npRound(d, 8)) };
}

function cdf(v: Float64Array, points = 200) {
  const xs = S.linspace(v[0]!, v[v.length - 1]!, points);
  return { x: xs.map((x) => S.npRound(x, 4)), y: xs.map((x) => S.npRound((S.countLE(v, x) / v.length) * 100, 4)) };
}

function hist(v: Float64Array, bins: number, lo: number, hi: number) {
  const h = S.histogram(v, bins, lo, hi);
  return {
    bin_edges: h.edges, bin_centers: h.edges.slice(0, -1).map((e, i) => S.npRound((e + h.edges[i + 1]!) / 2, 4)),
    counts: h.counts, total: h.counts.reduce((a, b) => a + b, 0),
  };
}

/** Round every non-integer number to 6 dp, like the reference's JSON serialiser. */
function native<T>(o: T): T {
  if (typeof o === "number") return (Number.isInteger(o) ? o : S.pyRound(o, 6)) as T;
  if (Array.isArray(o)) return o.map(native) as T;
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, native(v)])) as T;
  return o;
}

const sortedF64 = (xs: number[]) => Float64Array.from(xs).sort();

export function computeAnalytics(ds: Dataset, opt: BuildOptions) {
  const rows = ds.rows, nTotal = rows.length, max = ds.maxScore;
  const rankedRows = rows.filter((r) => r.ranked);
  const n = rankedRows.length;
  if (n < 20) throw new Error(`Only ${n} rankable students found — check the status labels and the score column.`);
  const scores = sortedF64(rankedRows.map((r) => r.score!));
  const pcts = sortedF64(rankedRows.map((r) => r.pct!));

  // status distribution (largest first)
  const stCount = new Map<StatusKey, number>();
  for (const r of rows) stCount.set(r.status, (stCount.get(r.status) ?? 0) + 1);
  const status_distribution = [...stCount.entries()].sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, pct: S.pyRound((count / nTotal) * 100, 4) }));

  const bandDist = (frame: CleanRow[]) => {
    const c = new Map<BandKey, number>();
    for (const r of frame) c.set(r.band, (c.get(r.band) ?? 0) + 1);
    return GRADE_BANDS.map((b) => ({
      key: b.key, low: Number.isFinite(b.low) ? b.low : 0, high: Number.isFinite(b.high) ? b.high : 100,
      count: c.get(b.key) ?? 0, pct: S.pyRound(((c.get(b.key) ?? 0) / frame.length) * 100, 4),
    }));
  };
  const grade_bands_sitters = bandDist(rankedRows);

  // DIFF: per-status shapes use ranked students only, so withheld (zero) scores do not appear as a bump at 0%.
  const violin_by_status = SITTER_STATUSES.map((k) => {
    const v = sortedF64(rankedRows.filter((r) => r.status === k).map((r) => r.pct!));
    return v.length < 2 ? null : { key: k, box: boxStats(v), kde: kdeCurve(v, 120), n: v.length };
  }).filter((x) => x !== null);

  const allPcts = sortedF64(rows.filter((r) => r.pct !== null).map((r) => r.pct!));
  const thresholds = PCT_THRESHOLDS.map((t) => {
    const cs = n - S.countLT(pcts, t), ca = allPcts.length - S.countLT(allPcts, t);
    return { threshold: t, count_sitters: cs, pct_sitters: S.pyRound((cs / n) * 100, 4), count_all: ca, pct_all: S.pyRound((ca / nTotal) * 100, 4), score_needed: S.pyRound((t / 100) * max, 2) };
  });

  const g = S.groups(scores);
  let cum = 0;
  const frequency_table = g.x.map((score, i) => {
    cum += g.w[i]!;
    return {
      score: S.pyRound(score, 1), pct_value: S.pyRound((score / max) * 100, 3), count: g.w[i]!,
      frequency_pct: S.pyRound((g.w[i]! / n) * 100, 5), cumulative_count: cum, cumulative_pct: S.pyRound((cum / n) * 100, 4),
    };
  });

  // normality: two tests on a fixed-seed sample of 5,000, two on everyone
  const sample = n <= 5000 ? Array.from(pcts) : S.sampleWithoutReplacement(pcts, 5000, 7);
  const sw = S.shapiroWilk(sample), k2 = S.dagostinoK2(pcts), jb = S.jarqueBera(pcts);
  const normality = {
    shapiro_wilk: { ...sw, sample_n: sample.length, "normal_at_0.05": sw.p_value > 0.05 },
    dagostino_k2: { ...k2, "normal_at_0.05": k2.p_value > 0.05 },
    jarque_bera: { ...jb, "normal_at_0.05": jb.p_value > 0.05 },
    anderson_darling: S.andersonNorm(sample),
  };

  // DIFF: clusters are the exact optimum over all students (the reference ran k-means on a 100k sample).
  const km = S.kmeans1d(g.x, g.w, 5);
  const clusters = {
    k: km.length, sample_n: n, method: "exact",
    clusters: km.map((c, i) => ({
      cluster: i + 1, center_score: S.pyRound(c.center, 2), center_pct: S.pyRound((c.center / max) * 100, 2),
      size_sample: c.weight, share_pct: S.pyRound((c.weight / n) * 100, 2), min_score: S.pyRound(g.x[c.from]!, 1), max_score: S.pyRound(g.x[c.to]!, 1),
    })),
  };

  const matrix = GRADE_BANDS.map((b) => ALL_STATUSES.map((s) => rows.reduce((a, r) => a + (r.band === b.key && r.status === s ? 1 : 0), 0)));

  // top 100: highest totals; ties keep the order of the source file
  const top_100 = [...rankedRows].sort((a, b) => b.score! - a.score! || a.index - b.index).slice(0, 100).map((r) => ({
    national_rank: r.student!.national_rank!, seating_no: r.seat!, name: opt.hideNames ? "" : r.name!,
    total_degree: r.score!, percentage: r.pct!, performance_index: r.student!.performance_index!,
  }));

  const gapH = S.histogram(pcts, 100, 0, 100);
  let gi = 0, peak = 0;
  for (let i = 1; i < 99; i++) if (Math.abs(gapH.counts[i + 1]! - gapH.counts[i]!) > Math.abs(gapH.counts[gi + 1]! - gapH.counts[gi]!)) gi = i;
  for (let i = 1; i < 100; i++) if (gapH.counts[i]! > gapH.counts[peak]!) peak = i;

  return native({
    meta: { year: opt.year, max_score: max, generated_at: opt.generatedAt ?? new Date().toISOString(), source_rows: ds.log.rows_in, generator: "bosla build-data", names_hidden: !!opt.hideNames },
    cohort: { total_students: nTotal, sitters: n, absent: stCount.get("absent") ?? 0, invalid: rows.filter((r) => r.invalid !== null).length },
    status_distribution,
    grade_bands_sitters,
    grade_bands_all: bandDist(rows),
    histogram_pct: hist(pcts, 50, 0, 100),
    histogram_score: hist(scores, 64, 0, max),
    density_pct: kdeCurve(pcts, 200),
    cdf_pct: cdf(pcts),
    cdf_score: cdf(scores),
    box_overall: boxStats(pcts),
    violin_by_status,
    stats_score: centralTendency(scores),
    stats_pct: centralTendency(pcts),
    percentiles_score: Object.fromEntries(REPORTED_PERCENTILES.map((p) => [String(p), S.pyRound(S.percentile(scores, p), 3)])),
    percentiles_pct: Object.fromEntries(REPORTED_PERCENTILES.map((p) => [String(p), S.pyRound(S.percentile(pcts, p), 3)])),
    thresholds,
    frequency_table,
    normality,
    normal_fit_pct: { mu: S.mean(pcts), sigma: S.std(pcts, 1) },
    clusters,
    heatmap_band_status: { bands: GRADE_BANDS.map((b) => ({ key: b.key })), statuses: ALL_STATUSES.map((key) => ({ key })), matrix },
    top_100,
    extremes: {
      max_score: scores[n - 1]!, min_sitter_score: scores[0]!, perfect_scores: n - S.countLT(scores, max),
      ge_98pct: n - S.countLT(pcts, 98), ge_99pct: n - S.countLT(pcts, 99), count_at_max: n - S.countLT(scores, scores[n - 1]!),
      bottom_decile_ceiling: S.pyRound(S.percentile(scores, 10), 2),
    },
    gap_analysis: {
      largest_jump_at_pct: S.pyRound(gapH.edges[gi + 1]!, 1), largest_jump_delta: gapH.counts[gi + 1]! - gapH.counts[gi]!,
      peak_bin_pct: S.pyRound(gapH.edges[peak]!, 1), peak_bin_count: gapH.counts[peak]!,
    },
  });
}

export function computeQuality(ds: Dataset, opt: BuildOptions) {
  const rows = ds.rows, n = rows.length, max = ds.maxScore;
  const profile = <T,>(vals: (T | null)[], dtype: string) => {
    const present = vals.filter((v) => v !== null) as T[];
    const unique = new Set(present).size;
    return { count: present.length, missing: n - present.length, missing_pct: n ? S.pyRound(((n - present.length) / n) * 100, 4) : 0, unique, unique_pct: n ? S.pyRound((unique / n) * 100, 4) : 0, dtype };
  };
  const columns = {
    seating_no: profile(rows.map((r) => r.seat), "Int64"),
    name: profile(rows.map((r) => r.name), "string"),
    total_degree: profile(rows.map((r) => r.score), "float64"),
    percentage: profile(rows.map((r) => r.pct), "float64"),
    status: profile(rows.map((r) => r.status), "object"),
  };

  // rows whose value occurs more than once (missing values count as equal to each other)
  const dupRows = <T,>(vals: T[]) => {
    const c = new Map<T, number>();
    for (const v of vals) c.set(v, (c.get(v) ?? 0) + 1);
    let rowsDup = 0, groups = 0;
    for (const [k, v] of c) if (v > 1) { rowsDup += v; if (k !== null) groups++; }
    return { rowsDup, groups };
  };
  const dSeat = dupRows(rows.map((r) => r.seat)), dName = dupRows(rows.map((r) => r.name));
  const duplicates = {
    exact_duplicate_rows_removed: ds.log.exact_duplicate_rows_removed,
    duplicate_seat_rows: dSeat.rowsDup, duplicate_seat_pct: n ? S.pyRound((dSeat.rowsDup / n) * 100, 4) : 0,
    duplicate_name_rows: dName.rowsDup, duplicate_name_pct: n ? S.pyRound((dName.rowsDup / n) * 100, 4) : 0,
    distinct_names_shared_by_multiple: dName.groups,
  };

  const sit = sortedF64(rows.filter((r) => r.sitter && r.score !== null).map((r) => r.score!));
  const sitPct = sortedF64(rows.filter((r) => r.sitter && r.pct !== null).map((r) => r.pct!));
  const all = sortedF64(rows.filter((r) => r.score !== null).map((r) => r.score!));
  const q1 = S.percentile(sit, 25), q3 = S.percentile(sit, 75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const outLow = S.countLT(sit, lo), outHigh = sit.length - S.countLE(sit, hi);
  const outliers = {
    method: "IQR (1.5×) on exam-sitter total_degree", q1, q3, iqr, lower_fence: lo, upper_fence: hi,
    outliers_low: outLow, outliers_high: outHigh, outliers_total: outLow + outHigh, outliers_pct: S.pyRound(((outLow + outHigh) / sit.length) * 100, 4),
  };
  const invalid = { invalid_rows: ds.log.invalid_rows, invalid_pct: n ? S.pyRound((ds.log.invalid_rows / n) * 100, 4) : 0, breakdown: ds.log.invalid_breakdown };
  const block = (v: Float64Array) => ({
    count: v.length, mean: S.pyRound(S.mean(v), 4), std: S.pyRound(S.std(v, 1), 4), min: v[0]!,
    p25: S.percentile(v, 25), median: S.percentile(v, 50), p75: S.percentile(v, 75), max: v[v.length - 1]!,
  });
  const stCount = new Map<StatusKey, number>();
  for (const r of rows) stCount.set(r.status, (stCount.get(r.status) ?? 0) + 1);

  const completeness = 100 - Math.max(...Object.values(columns).map((c) => c.missing_pct));
  const validity = 100 - invalid.invalid_pct, uniqueness = 100 - duplicates.duplicate_seat_pct;
  return {
    meta: { year: opt.year, max_score: max, generated_at: opt.generatedAt ?? new Date().toISOString() },
    generated_rows: n, raw_rows: ds.log.rows_in,
    cleaning_log: ds.log,
    overall_quality_score: S.pyRound((completeness + validity + uniqueness) / 3, 2),
    dimension_scores: { completeness: S.pyRound(completeness, 4), validity: S.pyRound(validity, 4), uniqueness: S.pyRound(uniqueness, 4) },
    columns, duplicates, outliers, invalid,
    summary_statistics: { total_degree_all: block(all), total_degree_sitters: block(sit), percentage_sitters: block(sitPct) },
    status_distribution: Object.fromEntries([...stCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { count: v, pct: S.pyRound((v / n) * 100, 4) }])),
  };
}
