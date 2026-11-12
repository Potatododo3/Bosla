/**
 * Compare two analytics files section by section. "exact" sections must agree
 * (within float noise); "approx" sections legitimately differ a little between
 * builds (sampling or method differences) and are reported for information.
 */
type Json = unknown;
export interface SectionResult { section: string; kind: "exact" | "approx"; compared: number; mismatches: number; worst?: string }

const EXACT = ["cohort", "status_distribution", "grade_bands_sitters", "grade_bands_all", "histogram_pct", "cdf_pct", "box_overall", "stats_score", "stats_pct",
  "percentiles_score", "percentiles_pct", "thresholds", "frequency_table", "normal_fit_pct", "heatmap_band_status", "top_100", "extremes", "gap_analysis",
  "normality.dagostino_k2", "normality.jarque_bera"];
const APPROX = ["density_pct", "violin_by_status", "clusters", "normality.shapiro_wilk", "normality.anderson_darling"];
const IGNORE = /label|note|description|verdict|^low$|^high$|sample_n|size_sample|method/;

const get = (o: Json, path: string): Json => path.split(".").reduce<any>((a, k) => (a == null ? undefined : a[k]), o);

/** Order-insensitive for arrays of {key,…} objects (e.g. the status split). */
function normalise(v: Json): Json {
  if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && "key" in (x as object))) return Object.fromEntries(v.map((x: any) => [x.key, x]));
  return v;
}

function walk(a: Json, b: Json, path: string, tol: number, r: { compared: number; mismatches: number; worst?: string }) {
  a = normalise(a); b = normalise(b);
  if (typeof b === "number" || typeof a === "number") {
    r.compared++;
    if (typeof a !== "number" || typeof b !== "number" || Math.abs(a - b) > tol * Math.max(1, Math.abs(b))) { r.mismatches++; r.worst ??= `${path}: new ${JSON.stringify(a)} vs old ${JSON.stringify(b)}`; }
  } else if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) { r.compared++; r.mismatches++; r.worst ??= `${path}: length ${Array.isArray(a) ? a.length : "?"} vs ${b.length}`; return; }
    b.forEach((v, i) => walk(a[i], v, `${path}[${i}]`, tol, r));
  } else if (b && typeof b === "object") {
    for (const k of Object.keys(b)) { if (IGNORE.test(k)) continue; walk((a as any)?.[k], (b as any)[k], `${path}.${k}`, tol, r); }
  } else if (typeof b === "string" || typeof b === "boolean") {
    r.compared++;
    if (a !== b) { r.mismatches++; r.worst ??= `${path}: new ${JSON.stringify(a)} vs old ${JSON.stringify(b)}`; }
  }
}

export function compareAnalytics(fresh: Json, old: Json): SectionResult[] {
  const out: SectionResult[] = [];
  for (const [list, kind, tol] of [[EXACT, "exact", 2e-6], [APPROX, "approx", 0.05]] as const) {
    for (const section of list) {
      const r = { compared: 0, mismatches: 0 } as { compared: number; mismatches: number; worst?: string };
      const o = get(old, section);
      if (o === undefined) continue;
      walk(get(fresh, section), o, section, tol, r);
      out.push({ section, kind, ...r });
    }
  }
  return out;
}
