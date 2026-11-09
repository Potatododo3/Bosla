import type { BandKey, StatusKey } from "../domain/scores.ts";

export interface Curve { x: number[]; y: number[] }
export interface Box { min: number; q1: number; median: number; q3: number; max: number; iqr: number; lower_whisker: number; upper_whisker: number; mean?: number }
export interface Stats { n: number; mean: number; median: number; mode: number; mode_count: number; std: number; variance: number; skewness: number; kurtosis_excess: number; range: number; cv_pct: number; iqr: number; sem: number }
export interface NormTest { statistic: number; p_value: number; sample_n?: number; "normal_at_0.05": boolean }

export interface Analytics {
  cohort: { total_students: number; sitters: number; absent: number; invalid: number };
  status_distribution: { key: StatusKey; count: number; pct: number }[];
  grade_bands_sitters: { key: BandKey; low: number; high: number; count: number; pct: number }[];
  histogram_pct: { bin_edges: number[]; bin_centers: number[]; counts: number[]; total: number };
  density_pct: Curve;
  cdf_pct: Curve;
  box_overall: Box;
  violin_by_status: { key: StatusKey; box: Box; kde: Curve; n: number }[];
  stats_score: Stats;
  stats_pct: Stats;
  percentiles_score: Record<string, number>;
  percentiles_pct: Record<string, number>;
  thresholds: { threshold: number; count_sitters: number; pct_sitters: number; score_needed: number }[];
  frequency_table: { score: number; pct_value: number; count: number; frequency_pct: number; cumulative_count: number; cumulative_pct: number }[];
  normality: {
    shapiro_wilk: NormTest; dagostino_k2: NormTest; jarque_bera: NormTest;
    anderson_darling: { statistic: number; critical_values: number[]; significance_levels: number[] };
  };
  normal_fit_pct: { mu: number; sigma: number };
  clusters: { k: number; sample_n: number; clusters: { cluster: number; center_score: number; center_pct: number; share_pct: number; min_score: number; max_score: number }[] };
  heatmap_band_status: { bands: { key: BandKey }[]; statuses: { key: StatusKey }[]; matrix: number[][] };
  top_100: TopStudent[];
  extremes: { perfect_scores: number; ge_98pct: number; ge_99pct: number };
  gap_analysis: { largest_jump_at_pct: number; largest_jump_delta: number; peak_bin_pct: number; peak_bin_count: number };
}

export interface TopStudent { national_rank: number; seating_no: number; name: string; total_degree: number; percentage: number; performance_index: number }

export interface Quality {
  generated_rows: number;
  cleaning_log: { exact_duplicate_rows_removed: number; status_trailing_ws_fixed: number };
  overall_quality_score: number;
  dimension_scores: { completeness: number; validity: number; uniqueness: number };
  columns: Record<string, { missing: number; missing_pct: number; unique: number; unique_pct: number; dtype: string }>;
  duplicates: { duplicate_seat_rows: number; duplicate_seat_pct: number; duplicate_name_rows: number; distinct_names_shared_by_multiple: number };
  outliers: { lower_fence: number; upper_fence: number; outliers_low: number; outliers_high: number; outliers_total: number; outliers_pct: number };
  invalid: { invalid_rows: number; invalid_pct: number; breakdown: Record<string, number> };
  summary_statistics: Record<"total_degree_all" | "total_degree_sitters", { count: number; mean: number; std: number; min: number; p25: number; median: number; p75: number; max: number }>;
}

export interface StudentRow {
  seating_no: number; name: string; total_degree: number; percentage: number; status: StatusKey; grade_band: BandKey;
  national_rank: number | null; percentile: number | null; performance_index: number | null;
  is_top_1pct?: boolean; is_top_5pct?: boolean; is_top_10pct?: boolean;
}
export interface SearchResponse { mode: "empty" | "seat_exact" | "seat_prefix" | "name"; total: number; page: number; size: number; pages: number; rows: StudentRow[]; demo?: boolean }
export interface StudentProfile extends StudentRow { neighbours: Pick<StudentRow, "seating_no" | "name" | "total_degree" | "percentage" | "national_rank">[]; demo?: boolean }
