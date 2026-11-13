# Plan: make Bosla work with next year's results

**Status:** in progress — see the progress list below.
**Goal:** when next year's results CSV arrives, one command recalculates every number on the site, and admission cutoffs come from a file the owner edits by hand.

## Progress

- [x] **Step 2 — statistics engine** (`server/stats.ts`): checked against numpy/scipy on identical data.
- [x] **Step 3 — dataset refactor** (`server/dataset.ts`): max score, all rows kept, cleaning log, numpy rounding.
- [x] **Step 4 — analytics + quality builder** (`server/analytics.ts`).
- [x] **Step 5 — `npm run build-data`** (`server/build-data.ts`, `server/compare.ts`), including `--compare` and `--hide-names`.
- [x] **Step 9 (part) — build tests** (`tests/build-data.test.ts`): matches the reference Python pipeline on synthetic files (≈5,500 and ≈6,200 values, every student's rank) and reproduces the published 2026 figures for the real 884,661-student cohort.
- [x] **Step 1 — `meta.year` / `meta.max_score` in the shipped data** and read by the site.
- [x] **Step 6 — `config/admission.json`** + validator (`src/domain/admissionConfig.ts`, `server/prepare-admission.ts`); admission pages rewritten around official minimums; "not published yet" state. Prediction model removed.
- [x] **Step 7 — remove hard-coded 2026 facts** from the UI text and code (`MAX_SCORE`, counts, year), both languages.
- [x] **Step 8 — server** reads max score from the data and warns when the CSV and the statistics disagree.
- [x] **Step 9 (unit)** — admission config tests; unit and translation tests updated (44 pass).
- [ ] **Step 9 (browser)** — update `e2e/run.cjs` for the new admission pages, the pending state, a published config and a different year / maximum; visual check.
- [ ] **Step 10 — README "Every year" section**; Methodology page lists the three deliberate differences.

Known, intended differences from the reference build: per-status shapes exclude withheld (zero) scores; clusters are the exact optimum over all students; density curves use all students; Anderson–Darling critical values follow the reference's older scipy table.

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
| Tansiq / admission cutoffs | **Edited manually** in `config/admission.json`. The owner enters **the official minimums for the results year, as published by the ministry**. No prediction model, no calibration. |
| Before the ministry publishes | Between results day and the official minimums, the admission pages say "Official minimums for {year} have not been published yet" and show nothing else. Same state if `admission.json` is for a different year than the results, so old numbers are never shown as current. |
| Maximum score | 320 (confirmed for next year). Still a `--max` flag with default 320, stored in the generated data, so a future change needs no code edit. |
| One cutoff per faculty | Kept as today: one number per faculty, with its track shown as a label. No separate per-track rows. |
| Top-100 names | Kept by default (parity with the original); `--hide-names` flag replaces them with seat-only rows. |
| Language / theme / design | Unchanged. |

## The admission config file (`config/admission.json`)

Owner-edited; validated at build time with clear error messages.

```jsonc
{
  "year": 2027,                         // must match the results year
  "published": true,                    // false until the ministry's numbers are entered → "not published yet" state
  "label_ar": "الحد الأدنى للمرحلة الأولى 2027", // what the numbers are, shown on every admission page
  "label_en": "2027 first-phase minimums (Ministry of Higher Education)",
  "source": "https://…",                // where the numbers came from
  "updated": "2027-07-20",
  "faculties": [
    { "key": "medicine", "name_ar": "الطب البشري", "name_en": "Medicine", "track": "science", "cutoff": 94.1 },
    { "key": "engineering", "name_ar": "الهندسة", "name_en": "Engineering", "track": "math", "cutoff": 88.9 }
    // one row per faculty; add / remove faculties freely
  ]
}
```

What the site shows from it: each faculty's official minimum (% and total needed out of 320), how many students in the new results clear it (calculated from the results), and the student's margin and outlook ("above / within 1 point / below"), always labelled with `label_*` and `source`. The 2026 reference prediction model (trend + pressure + the +6 calibration) is removed from the UI along with `src/domain/admission.ts` and `src/rules/admission2026.ts`; the "Cutoff estimates" page becomes "Official minimums".

## Work steps

1. **Year-agnostic data shape.** Add `meta: { year, max_score, generated_at, source_rows }` to `public/data/analytics.json`. Backfill `year: 2026` into the shipped file so the current site keeps working.
2. **Statistics engine — `server/stats.ts`** *(draft exists, untested)*. numpy/scipy-equivalent: `np.round` vs Python `round`, linear percentiles, histogram, linspace, Gaussian KDE (Scott bandwidth, reference used `n_eff = min(n, 60000)`), D'Agostino K², Jarque–Bera, Anderson–Darling, Shapiro–Wilk (AS R94, on a seeded 5,000 sample), exact 1-D k-means (DP, replaces sklearn's sampled k-means), seeded sampling.
3. **Dataset refactor — `server/dataset.ts`.** Take `maxScore`; keep rows with missing seat for totals; keep file order (for top-100 tie order); record the cleaning log (rows in, duplicates removed, status labels whose whitespace was fixed, invalid breakdown); use `np.round` semantics for the 4-dp percentage and percentile.
4. **Analytics builder — `server/analytics.ts`.** Produce every field the pages read, using the reference definitions (see `/pipeline/analytics.py` and `quality.py` in the reference repo):
   cohort, status_distribution, grade_bands_sitters/all, histogram_pct, density_pct, cdf_pct, box_overall, violin_by_status, stats_score/pct, percentiles, thresholds, frequency_table, normality, normal_fit_pct, clusters, heatmap_band_status, top_100, extremes, gap_analysis; and the quality report (columns, duplicates, outliers, invalid, summary_statistics, dimension scores).
   Deliberate differences to document on the Methodology page: violins exclude withheld-zero rows; clusters are exact on all students instead of a 100k sample; KDE uses all students.
5. **CLI — `server/build-data.ts`** + `npm run build-data`. Flags: `--csv`, `--year`, `--max`, `--out public/data`, `--hide-names`, `--compare <old analytics.json>` (prints match/mismatch for every deterministic field). Prints a summary and warnings (unknown status labels, rows flagged, etc.).
6. **Admission config.** Create `config/admission.json` (shipped with `"published": false` and the 14 current faculties, cutoffs empty), a validator (year matches results, every published faculty has a cutoff between 0 and 100, unique keys, required labels and source), and copy it into `public/data/` at build time. Rewrite the Admission explorer, Cutoff estimates page, home "highest cutoffs" card and the outlook list on "Where do I stand?" to read it. Wrong-year state as described above.
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

## Owner's answers (recorded)

1. Next year's maximum total: **320**.
2. Admission numbers: **next year's official minimums, as published by the ministry**, entered by hand.
3. Cutoff granularity: **keep as is**, one number per faculty.
