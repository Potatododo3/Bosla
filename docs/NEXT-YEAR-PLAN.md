# Plan: make Bosla work with next year's results

**Status:** planned, not started (except a draft of `server/stats.ts`, see step 2).
**Goal:** when next year's results CSV arrives, one command recalculates every number on the site, and admission cutoffs come from a file the owner edits by hand.

## What the owner will do next year (target workflow)

```bash
# 1. put the CSV in data-private/ (never committed)
# 2. recalculate everything from it
npm run build-data -- --csv data-private/results-2027.csv --year 2027
# 3. edit the tansiq file by hand: config/admission.json
# 4. build and run
npm run build
STUDENTS_CSV=data-private/results-2027.csv npm start
```

## Decisions already made

| Topic | Decision |
|---|---|
| Statistics, ranks, charts, data quality | Recalculated from the CSV by `build-data`. Nothing about the year hard-coded in the site. |
| Tansiq / admission cutoffs | **Edited manually** in `config/admission.json`. No automatic trend model by default; the owner types the numbers (e.g. last year's official minimums or the new official ones once published). |
| Wrong-year safety | If `admission.json` is for a different year than the results, the admission pages show "not updated for {year} yet" instead of stale numbers. |
| Maximum score | Taken from `--max` (default 320) and stored in the generated data, since the total may change in future years. |
| Top-100 names | Kept by default (parity with the original); `--hide-names` flag replaces them with seat-only rows. |
| Language / theme / design | Unchanged. |

## The admission config file (`config/admission.json`)

Owner-edited; validated at build time with clear error messages.

```jsonc
{
  "year": 2027,                         // must match the results year
  "kind": "official",                   // "official" | "estimate" — controls the label shown on the site
  "label_ar": "الحد الأدنى للمرحلة الأولى 2026", // what the numbers are, shown on every admission page
  "label_en": "2026 first-phase minimums",
  "source": "https://…",                // where the numbers came from
  "updated": "2027-07-20",
  "faculties": [
    { "key": "medicine", "name_ar": "الطب البشري", "name_en": "Medicine", "track": "science", "cutoff": 94.1 },
    { "key": "engineering", "name_ar": "الهندسة", "name_en": "Engineering", "track": "math", "cutoff": 88.9 }
    // add / remove faculties freely; optional "low"/"high" for a range
  ]
}
```

What the site shows from it: each faculty's cutoff (% and total needed out of max), how many students in the new results clear it (calculated from the results), and the student's margin and outlook ("above / within 1 point / below"). The current 2026 reference model (trend + pressure + the +6 calibration) is removed from the default UI; its code can stay in `src/domain/admission.ts` behind `"kind": "estimate"` only if the owner later wants it.

## Work steps

1. **Year-agnostic data shape.** Add `meta: { year, max_score, generated_at, source_rows }` to `public/data/analytics.json`. Backfill `year: 2026` into the shipped file so the current site keeps working.
2. **Statistics engine — `server/stats.ts`** *(draft exists, untested)*. numpy/scipy-equivalent: `np.round` vs Python `round`, linear percentiles, histogram, linspace, Gaussian KDE (Scott bandwidth, reference used `n_eff = min(n, 60000)`), D'Agostino K², Jarque–Bera, Anderson–Darling, Shapiro–Wilk (AS R94, on a seeded 5,000 sample), exact 1-D k-means (DP, replaces sklearn's sampled k-means), seeded sampling.
3. **Dataset refactor — `server/dataset.ts`.** Take `maxScore`; keep rows with missing seat for totals; keep file order (for top-100 tie order); record the cleaning log (rows in, duplicates removed, status labels whose whitespace was fixed, invalid breakdown); use `np.round` semantics for the 4-dp percentage and percentile.
4. **Analytics builder — `server/analytics.ts`.** Produce every field the pages read, using the reference definitions (see `/pipeline/analytics.py` and `quality.py` in the reference repo):
   cohort, status_distribution, grade_bands_sitters/all, histogram_pct, density_pct, cdf_pct, box_overall, violin_by_status, stats_score/pct, percentiles, thresholds, frequency_table, normality, normal_fit_pct, clusters, heatmap_band_status, top_100, extremes, gap_analysis; and the quality report (columns, duplicates, outliers, invalid, summary_statistics, dimension scores).
   Deliberate differences to document on the Methodology page: violins exclude withheld-zero rows; clusters are exact on all students instead of a 100k sample; KDE uses all students.
5. **CLI — `server/build-data.ts`** + `npm run build-data`. Flags: `--csv`, `--year`, `--max`, `--out public/data`, `--hide-names`, `--compare <old analytics.json>` (prints match/mismatch for every deterministic field). Prints a summary and warnings (unknown status labels, rows flagged, etc.).
6. **Admission config.** Create `config/admission.json` (pre-filled with the 2026 numbers the site shows today, labelled "estimate"), a validator, and copy it into `public/data/` at build time. Rewrite the Admission explorer, Cutoff estimates page, home "highest cutoffs" card and the outlook list on "Where do I stand?" to read it. Wrong-year state as described above.
7. **Remove hard-coded facts from the UI.** `MAX_SCORE` → from data; i18n strings containing 2026 / 919,396 / 884,661 / 320 / 30,284 / 14 become functions of the data; page title, README, About page.
8. **Server.** Read `max_score` and expected cohort size from `analytics.json`; warn at start-up if the CSV's ranked count differs from `analytics.json` (means the site's statistics weren't rebuilt from this file).
9. **Tests.**
   - Real-data check: the 2026 score-frequency table fully determines the ranked cohort's scores, so rebuild stats/percentiles/histogram/CDF/box/thresholds/frequency table/K² /JB/clusters from it and compare with the published 2026 values.
   - Parity check: run the reference Python pipeline (numpy/pandas/scipy) on a synthetic CSV, save its output as a small fixture, and compare the TypeScript build against it field by field.
   - Owner check (needs the real CSV, run once by the owner): `npm run build-data -- --csv data-private/<2026 file>.csv --year 2026 --out /tmp/check --compare public/data/analytics.json` → expect all deterministic fields to match.
   - Admission config validator tests; existing unit, API and browser tests updated (e.g. wrong-year state, different max score).
10. **Docs.** README "Every year" section: the four commands above, how to fill `admission.json`, what to check in the build output.

## Size estimate

Roughly as large as the original build: about 2,000 lines touched across ~20 files, plus verification runs. Steps 2–5 and 9 are the bulk; steps 6–7 are mostly mechanical.

## Open questions for the owner (answer before starting if possible)

1. Next year's maximum total — still 320?
2. Which numbers will you put in `admission.json` at results time: last year's official minimums, or your own estimates? (Changes only the label.)
3. Per-track cutoffs (science / maths / literary) as separate rows, or one number per faculty like today?
