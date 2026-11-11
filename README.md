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
| `STUDENTS_CSV=path/to/results.csv npm start` | The real results file (see below) |
| `SEARCH_API=off npm start` | No search backend; the page explains this and points to the rank calculator |

A static host (e.g. Vercel, `vercel.json` included) serves everything except student search, which needs the Node server (or any service
implementing the same `/api/health`, `/api/search`, `/api/students`, `/api/student/{seat}` contract; set `VITE_API_BASE` at build time).

## Running with the real results CSV

> **Never commit the CSV.** It contains the names and results of 919,396 students, most of them minors. Keep it only on the machine
> that runs the app. `.gitignore` already blocks `*.csv` files and the `data-private/` folder. Only serve this data publicly if you
> have the right to publish it.

### 1. Check the file

The first line must contain these four column names (any order; extra columns such as a percentage column are ignored):

```
seating_no,arabic_name,total_degree,student_case_desc
```

| Column | Expected content |
|---|---|
| `seating_no` | Seat number (digits) |
| `arabic_name` | Student name |
| `total_degree` | Total out of 320; half marks such as `285.5` are fine |
| `student_case_desc` | One of `ناجح دور أول`, `دور ثان` (or `دور ثانى`), `راسب دور أول`, `غياب كلى دور أول` (or `غياب كلي دور أول`). Extra spaces are fine. |

The file must be saved as **UTF-8**. If Arabic names show up as `???` or garbled characters, re-save it from Excel with
*File → Save As → "CSV UTF-8 (Comma delimited)"*.

### 2. Put it in `data-private/`

```bash
git clone https://github.com/Potatododo3/Bosla.git
cd Bosla
mkdir data-private
# copy your file to data-private/results.csv
```

### 3. Install, build and start

```bash
npm install
npm run build
```

macOS / Linux:

```bash
STUDENTS_CSV=data-private/results.csv npm start
```

Windows PowerShell:

```powershell
$env:STUDENTS_CSV="data-private/results.csv"; npm start
```

Windows Command Prompt:

```bat
set "STUDENTS_CSV=data-private/results.csv" && npm start
```

Then open <http://127.0.0.1:8787>. Use `PORT=3000` (or `$env:PORT="3000"`) to change the port.

### 4. Confirm it loaded the real data

Start-up takes about 10 seconds for the full file. The first log line should read:

```
[api] 919,396 students (884,661 ranked) loaded in … ms — data-private/results.csv
```

- **884,661 ranked** is the published cohort size. If it matches, ranks and percentiles agree with the published statistics.
- The *Student search* page should **not** show the yellow "Demo data" notice.
- If it says `SYNTHETIC DEMO DATA`, the `STUDENTS_CSV` variable was not picked up; check the command for your shell above.
- If it stops with `CSV must have columns: …`, rename the header line as shown in step 1.

### Requirements

- Node.js 20 or newer.
- About **2 GB of free memory**: the whole file is held in memory for fast search (≈1.2 GB measured with 919,396 rows).
  If Node runs out of memory, start it with a larger heap:
  `NODE_OPTIONS=--max-old-space-size=4096 STUDENTS_CSV=data-private/results.csv npm start`

### Hosting it

Static hosts (Vercel, Netlify, GitHub Pages) cannot run the search server. Use any host that runs a Node process with ~2 GB RAM
(a small VPS, Render, Railway, Fly.io and similar), copy the CSV to the server separately (for example with `scp`), never through Git,
and set `STUDENTS_CSV` as an environment variable in the host's settings. The search API is read-only and rate-limited per IP.

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
