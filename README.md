# Bosla · بوصلة

An independent, bilingual (Arabic / English) companion for the Egyptian **Thanaweya Amma 2026** results (new system, totals out of 320).
It is a from-scratch rebuild of the open [Thanaweya-2026](https://github.com/omarhamed888/Thanaweya-2026) analytics project: same data, same
calculations (verified by tests), new design, new code.

> Unofficial. Admission figures are statistical estimates, not coordination-office (tansiq) results.

## Run it

```bash
npm install
npm run build
npm start          # http://127.0.0.1:8787  (app + search API with SYNTHETIC demo students)
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server + API with hot reload |
| `npm test` | Unit tests: formulas, model, search rules, API contract, translations |
| `npm run e2e` | Browser tests (needs `npm start` running and Playwright available) |
| `npm run typecheck` | Strict TypeScript check |

### Student search data

| Setting | Result |
|---|---|
| *(default)* | 5,000 synthetic students — invented names and seat numbers, clearly labelled in the UI |
| `STUDENTS_CSV=/path/results.csv npm start` | Real dataset. CSV header: `seating_no,arabic_name,total_degree,student_case_desc`. The server cleans, validates, ranks and indexes it at start-up. **Only do this if you have the right to publish that data.** |
| `SEARCH_API=off npm start` | No search backend; the page explains this and points to the rank calculator |

A static host (e.g. Vercel, `vercel.json` included) serves everything except student search, which needs the Node server (or any service
implementing the same `/api/health`, `/api/search`, `/api/students`, `/api/student/{seat}` contract; set `VITE_API_BASE` at build time).

## What's inside

```
src/domain/     pure, tested logic: percentage, bands, rank/percentile/T-score, admission model, search rules, CSV/XLSX export
src/rules/      versioned rule set for the 2026 estimation model (all tunable constants in one file)
src/i18n/       Arabic + English dictionaries (structurally identical — enforced by a test)
src/charts/     small dependency-free SVG/HTML charts
src/pages/      13 routes
server/         dataset pipeline (clean → validate → rank), API, synthetic demo generator, static server
public/data/    precomputed aggregate statistics from the reference project
tests/, e2e/    unit tests and browser tests
```

## Pages

For students: Home · Where do I stand? *(new)* · Admission explorer · Cutoff estimates · Student search
Analytics: Overview · Score distribution · Top performers · Statistical analysis · Data quality
About: Methodology · FAQ · About

## Accuracy

`npm test` recomputes, from the published score-frequency table and the model's constants, and requires exact equality with the reference
project's published output for: band counts, threshold counts, the rank and performance index of all top-100 students, and every figure
(estimate, σ, interval, three scenarios, eligible counts) for all 14 faculties.

## Deliberate differences from the reference

- **Where do I stand?** — exact national rank / percentile from a total, computed in the browser with no personal data.
- The reference model's **+6-point manual calibration** is kept (so numbers match) but disclosed and itemised per faculty.
- Eligibility is shown against all three scenarios, not just the central one.
- No dual-axis Pareto chart; no donut charts; every chart has a data-table view.
- Real `.xlsx` export (the reference wrote an HTML file with an `.xls` extension).
- Western digits in both languages; language switch never discards input.
- ~90 KB of gzipped JavaScript instead of a 4.5 MB charting bundle.
- Reference branding, credits pop-up and logo are not reused.

## Privacy

No accounts, analytics or third-party requests. The student's score stays in memory in the browser. Only language and theme are stored
(`localStorage`). Search queries go to the configured API only.
