/**
 * "Where do I stand?" — exact rank / percentile / T-score for any score,
 * derived from the published score-frequency table. No student record is
 * needed, so this works fully in the browser with no personal data.
 *
 * Definitions (identical to the reference methodology):
 *  - Ranked cohort: exam-sitters with a valid score.
 *  - National rank: competition ranking ("1224"), 1 = highest; ties share the best rank.
 *  - Percentile: share of the ranked cohort scoring ≤ this score, 0–100.
 *  - Performance index: T-score 50 + 10·(score − μ)/σ, clipped to 0–100.
 */
import { MAX_SCORE, gradeBand, percentageOf, round, type BandKey } from "./scores.ts";

export interface FrequencyRow {
  score: number;
  count: number;
  cumulative_count: number;
}

export interface CohortIndex {
  /** maximum total for this results year */
  max: number;
  n: number;
  mean: number;
  std: number;
  scores: Float64Array; // ascending
  counts: Int32Array;
  cumulative: Int32Array; // students with score ≤ scores[i]
}

export function buildCohortIndex(rows: ReadonlyArray<FrequencyRow>, mean: number, std: number, max: number = MAX_SCORE): CohortIndex {
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const scores = new Float64Array(sorted.length);
  const counts = new Int32Array(sorted.length);
  const cumulative = new Int32Array(sorted.length);
  let run = 0;
  sorted.forEach((r, i) => {
    run += r.count;
    scores[i] = r.score;
    counts[i] = r.count;
    cumulative[i] = run;
  });
  return { max, n: run, mean, std: std === 0 ? 1 : std, scores, counts, cumulative };
}

/** Index of the last entry with score ≤ x, or -1. */
function upperIndex(ix: CohortIndex, x: number): number {
  let lo = 0, hi = ix.scores.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ix.scores[mid]! <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Students scoring ≤ score. */
export function countAtOrBelow(ix: CohortIndex, score: number): number {
  const i = upperIndex(ix, score);
  return i < 0 ? 0 : ix.cumulative[i]!;
}

/** Students scoring strictly below score. */
export function countBelow(ix: CohortIndex, score: number): number {
  const i = upperIndex(ix, score);
  if (i < 0) return 0;
  return ix.scores[i] === score ? ix.cumulative[i]! - ix.counts[i]! : ix.cumulative[i]!;
}

/** Students whose percentage is ≥ cutoffPct (how many "clear" a cutoff). */
export function countClearing(ix: CohortIndex, cutoffPct: number): number {
  // Compare on percentages computed exactly as the pipeline does (score / max × 100).
  let lo = 0, hi = ix.scores.length; // first index with pct >= cutoff
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (percentageOf(ix.scores[mid]!, ix.max) < cutoffPct) lo = mid + 1; else hi = mid;
  }
  const below = lo === 0 ? 0 : ix.cumulative[lo - 1]!;
  return ix.n - below;
}

export interface Standing {
  score: number;
  percentage: number;
  band: BandKey;
  rank: number; // 1 = best
  percentile: number; // 0–100, 4 dp
  ahead: number; // students strictly above
  tied: number; // students with exactly this score (per the table)
  below: number; // students strictly below
  performanceIndex: number; // T-score, 2 dp
  top1: boolean;
  top5: boolean;
  top10: boolean;
  cohort: number;
}

export function standingFor(ix: CohortIndex, score: number): Standing {
  const atOrBelow = countAtOrBelow(ix, score);
  const below = countBelow(ix, score);
  const ahead = ix.n - atOrBelow;
  const percentile = round((atOrBelow / ix.n) * 100, 4);
  const t = 50 + (10 * (score - ix.mean)) / ix.std;
  const percentage = percentageOf(score, ix.max);
  return {
    score,
    percentage,
    band: gradeBand(percentage),
    rank: ahead + 1,
    percentile,
    ahead,
    tied: atOrBelow - below,
    below,
    performanceIndex: round(Math.min(100, Math.max(0, t)), 2),
    top1: percentile >= 99,
    top5: percentile >= 95,
    top10: percentile >= 90,
    cohort: ix.n,
  };
}
