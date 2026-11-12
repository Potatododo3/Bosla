/**
 * Rebuild the site's statistics from a results CSV.
 *
 *   npm run build-data -- --csv data-private/results-2027.csv --year 2027
 *
 * Options:
 *   --csv <file>        results file (columns: seating_no, arabic_name, total_degree, student_case_desc)
 *   --year <yyyy>       results year shown across the site
 *   --max <n>           maximum total (default 320)
 *   --out <dir>         where to write analytics.json and quality.json (default public/data)
 *   --hide-names        leave student names out of the top-100 list
 *   --compare <file>    also compare the new analytics with an existing analytics.json
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildDataset, loadCsv } from "./dataset.ts";
import { computeAnalytics, computeQuality } from "./analytics.ts";
import { compareAnalytics } from "./compare.ts";

function fail(msg: string): never { console.error(`\n✗ ${msg}\n\nUsage: npm run build-data -- --csv <file> --year <yyyy> [--max 320] [--out public/data] [--hide-names] [--compare <analytics.json>]\n`); process.exit(1); }

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name: string) => args.includes(`--${name}`);

const csv = opt("csv") ?? fail("Missing --csv <file>.");
const year = Number(opt("year") ?? fail("Missing --year <yyyy>."));
const max = Number(opt("max") ?? 320);
const out = resolve(opt("out") ?? "public/data");
if (!Number.isInteger(year) || year < 2000 || year > 2100) fail(`--year must be a four-digit year, got "${opt("year")}".`);
if (!(max > 0)) fail(`--max must be a positive number, got "${opt("max")}".`);
if (!existsSync(csv)) fail(`File not found: ${csv}`);

const n = (v: number) => v.toLocaleString("en-US");
const t0 = Date.now();
console.log(`Reading ${csv} …`);
let ds;
try { ds = buildDataset(loadCsv(csv), false, max); } catch (e) { fail((e as Error).message); }
const L = ds.log;
console.log(`  ${n(L.rows_in)} rows read, ${n(L.exact_duplicate_rows_removed)} exact duplicates removed → ${n(L.rows_out)} students`);
console.log(`  ${n(ds.rankedCount)} in the ranked cohort · ${n(L.invalid_rows)} rows flagged · ${n(L.status_trailing_ws_fixed)} status labels tidied`);
for (const [k, v] of Object.entries(L.invalid_breakdown)) console.log(`      flagged: ${k} × ${n(v ?? 0)}`);

const warnings: string[] = [];
const unknown = Object.entries(L.unknown_status_labels);
if (unknown.length) warnings.push(`${n(unknown.reduce((a, [, v]) => a + v, 0))} rows have a status label that is not recognised and are left out of the ranking: ${unknown.slice(0, 6).map(([k, v]) => `"${k}" × ${n(v)}`).join(", ")}${unknown.length > 6 ? ", …" : ""}`);
if (ds.rankedCount / Math.max(1, L.rows_out) < 0.5) warnings.push("Fewer than half of the students could be ranked — check the status and score columns.");
const topScore = ds.byRank[0]?.total_degree ?? 0;
if (topScore < max * 0.5) warnings.push(`The highest total is ${topScore}, far below the maximum ${max}. Is --max right?`);

let analytics, quality;
try {
  const generatedAt = new Date().toISOString();
  analytics = computeAnalytics(ds, { year, hideNames: flag("hide-names"), generatedAt });
  quality = computeQuality(ds, { year, generatedAt });
} catch (e) { fail((e as Error).message); }

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "analytics.json"), JSON.stringify(analytics));
writeFileSync(join(out, "quality.json"), JSON.stringify(quality));
console.log(`\n✓ ${year} · maximum ${max} · average ${analytics.stats_pct.mean.toFixed(2)}% · median ${analytics.stats_pct.median.toFixed(2)}% · highest total ${topScore}`);
console.log(`✓ Wrote ${join(out, "analytics.json")} and ${join(out, "quality.json")} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const w of warnings) console.log(`\n⚠ ${w}`);

const cmp = opt("compare");
if (cmp) {
  if (!existsSync(cmp)) fail(`--compare file not found: ${cmp}`);
  const res = compareAnalytics(analytics, JSON.parse(readFileSync(cmp, "utf8")));
  console.log(`\nComparison with ${cmp}:`);
  for (const r of res) {
    const mark = r.mismatches === 0 ? "✓" : r.kind === "exact" ? "✗" : "~";
    console.log(`  ${mark} ${r.section.padEnd(28)} ${String(r.compared).padStart(6)} values${r.mismatches ? `, ${r.mismatches} differ — e.g. ${r.worst}` : ""}`);
  }
  const bad = res.filter((r) => r.kind === "exact" && r.mismatches > 0);
  console.log(bad.length === 0
    ? "\n✓ Every exact section matches. (Sections marked ~ use sampling or a different method and may differ slightly.)"
    : `\n✗ ${bad.length} exact section(s) differ: the two files were not built from the same results.`);
  if (bad.length) process.exitCode = 2;
}
console.log("\nNext: edit config/admission.json if needed, then `npm run build`.");
