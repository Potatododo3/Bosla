/**
 * Admission-cutoff estimation model (unofficial). Pure and deterministic.
 *
 *   trend      = least-squares line over (year → cutoff), projected to target year
 *   σ          = sample std of the fit residuals (ddof 1), floored
 *   pressure   = clip(k × (cohortMean% − baseline%), ±clip)
 *   expected   = clip(trend + pressure + calibration, min, max)
 *   scenarios  = expected ∓ 0.9σ      CI95 = expected ± 1.96σ
 */
import { MAX_SCORE, round } from "./scores.ts";
import { countClearing, type CohortIndex } from "./standing.ts";
import type { AdmissionRuleSet, FacultyAnchor, FacultyCategory } from "../rules/admission2026.ts";

const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface TrendFit { slope: number; intercept: number; projected: number; sigma: number }

export function fitTrend(years: number[], cutoffs: number[], targetYear: number, sigmaFloor: number): TrendFit {
  const n = years.length;
  if (n < 2 || n !== cutoffs.length) throw new Error("fitTrend needs ≥ 2 matching points");
  const mx = years.reduce((a, b) => a + b, 0) / n;
  const my = cutoffs.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (years[i]! - mx) * (cutoffs[i]! - my); sxx += (years[i]! - mx) ** 2; }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sigma: number;
  if (n > 2) {
    const res = years.map((x, i) => cutoffs[i]! - (slope * x + intercept));
    const mr = res.reduce((a, b) => a + b, 0) / n;
    sigma = Math.sqrt(res.reduce((a, r) => a + (r - mr) ** 2, 0) / (n - 1));
  } else {
    sigma = 0; // a single difference has zero spread
  }
  return { slope, intercept, projected: my + slope * (targetYear - mx), sigma: Math.max(sigma, sigmaFloor) };
}

export function pressureAdjustment(rules: AdmissionRuleSet, cohortMeanPct: number): number {
  return clip(rules.pressureK * (cohortMeanPct - rules.baselineMeanPct), -rules.pressureClip, rules.pressureClip);
}

export interface Scenario { cutoff: number; eligible: number; eligiblePct: number }

export interface FacultyEstimate {
  key: string;
  category: FacultyCategory;
  history: { year: number; cutoff: number }[];
  slopePerYear: number;
  trendProjection: number;
  pressure: number;
  calibration: number;
  sigma: number;
  expected: number;
  scoreNeeded: number;
  optimistic: Scenario;
  central: Scenario;
  pessimistic: Scenario;
  ciLow: number;
  ciHigh: number;
  lastYear: { year: number; cutoff: number; delta: number };
}

export function estimateFaculty(rules: AdmissionRuleSet, f: FacultyAnchor, cohort: CohortIndex, cohortMeanPct: number): FacultyEstimate {
  const years = Object.keys(f.history).map(Number).sort((a, b) => a - b);
  const cutoffs = years.map((y) => f.history[y]!);
  const fit = fitTrend(years, cutoffs, rules.targetYear, rules.sigmaFloor);
  const pressure = pressureAdjustment(rules, cohortMeanPct);
  const bound = (v: number) => clip(v, rules.cutoffMin, rules.cutoffMax);
  const expected = bound(fit.projected + pressure + rules.calibrationPP);
  const scenario = (raw: number): Scenario => {
    const eligible = countClearing(cohort, raw);
    return { cutoff: round(raw, 2), eligible, eligiblePct: round((eligible / cohort.n) * 100, 3) };
  };
  const lastYear = years[years.length - 1]!;
  const lastCut = f.history[lastYear]!;
  return {
    key: f.key,
    category: f.category,
    history: years.map((y, i) => ({ year: y, cutoff: cutoffs[i]! })),
    slopePerYear: round(fit.slope, 4),
    trendProjection: round(fit.projected, 2),
    pressure: round(pressure, 3),
    calibration: rules.calibrationPP,
    sigma: round(fit.sigma, 3),
    expected: round(expected, 2),
    scoreNeeded: round((expected / 100) * MAX_SCORE, 1),
    optimistic: scenario(bound(expected - rules.scenarioZ * fit.sigma)),
    central: scenario(expected),
    pessimistic: scenario(bound(expected + rules.scenarioZ * fit.sigma)),
    ciLow: round(bound(expected - rules.ciZ * fit.sigma), 2),
    ciHigh: round(bound(expected + rules.ciZ * fit.sigma), 2),
    lastYear: { year: lastYear, cutoff: lastCut, delta: round(expected - lastCut, 2) },
  };
}

/** All faculties, highest expected cutoff first. */
export function estimateAll(rules: AdmissionRuleSet, cohort: CohortIndex, cohortMeanPct: number): FacultyEstimate[] {
  return rules.faculties
    .map((f) => estimateFaculty(rules, f, cohort, cohortMeanPct))
    .sort((a, b) => b.expected - a.expected);
}

/**
 * Where a student's percentage sits relative to a faculty's scenario band.
 *  - "likely":     at or above the pessimistic (harder) cutoff
 *  - "expected":   at or above the central estimate
 *  - "borderline": only clears the optimistic (easier) cutoff
 *  - "below":      under all three
 */
export type Outlook = "likely" | "expected" | "borderline" | "below";

export function outlookFor(pct: number, f: FacultyEstimate): Outlook {
  if (pct >= f.pessimistic.cutoff) return "likely";
  if (pct >= f.central.cutoff) return "expected";
  if (pct >= f.optimistic.cutoff) return "borderline";
  return "below";
}
