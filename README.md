# Bosla · بوصلة

An independent, bilingual (Arabic / English) companion for the Egyptian **Thanaweya Amma** results.
Students enter a total and see their exact national rank; the site also shows the score distribution, statistics, a data-quality report,
student search, and the ministry's official admission minimums once they are published.

Everything on the site is recalculated from one results file, so it can be rebuilt each year. It currently ships with the 2026 statistics.

> Unofficial. Not affiliated with the Ministry of Education or the coordination office.

## What visitors can do

There are no accounts or sign-ups; everything is open to any visitor.

### For students

**Where do I stand?** — type your total (or your percentage) and see:

- your exact national rank among all ranked students
- your percentile (the share of students you scored at or above)
- your grade band, and whether you are in the top 1%, 5% or 10%
- how many students are ahead of you, tied with you, and below you
- a performance index (50 is the average)
- your position marked on the score distribution chart

You can copy a one-line summary or print the page. The score is calculated in the browser and is not saved or sent anywhere.

**Admission explorer** — enter your percentage, by typing or with a slider, and compare it with each faculty's official minimum. Each
faculty is marked "meets the minimum", "within 1 point" or "below", with your margin and a chart showing where you sit.

**Official minimums** — the ministry's published minimum percentage for each faculty, with the total needed, how many students reached
it, and a link to the official source. Before the ministry publishes, both admission pages say the figures are not out yet and show no numbers.

**Student search** — look up a result by seat number or by name; Arabic spelling variants (أ/ا, ة/ه, ى/ي) are matched automatically.
Opening a student shows their total, percentage, status, rank and the students ranked just around them. It only works where the site
owner has connected the results file.

### Analytics

- **Overview** — total students, pass rate, average, how many passed or failed, students per grade band, how many reached each threshold
  (50% up to 95%), and key takeaways.
- **Score distribution** — charts showing how totals are spread across the cohort, including how often each exact total occurs.
- **Top performers** — the top 100 students, filterable by name or seat number, plus the cut-offs for the top 1%, 5% and 10%.
- **Statistical analysis** — averages, spread, percentiles, score clusters and related statistics, for readers who want the detail.
- **Data quality** — how complete the results file is and which rows were flagged or excluded from ranking, and why.

### About the site

- **Methodology** — how every number is calculated, in plain steps with the formulas.
- **FAQ** — short answers on the data, the ranking, the admission minimums and privacy.
- **About** — what the site is, which year's results are loaded, privacy, and its limits (it is unofficial).

### On every page

- Arabic or English, with the layout switching direction to match.
- Light, dark or automatic theme.
- Works on phones and desktops.
- Tables can be downloaded as CSV or Excel, or printed to PDF.
- Charts have a "show data table" button for the exact numbers.
- Clear messages for invalid input, no results, or a connection problem.

## Run it

```bash
npm install
npm run build
npm start          # http://127.0.0.1:8787  (app + search API with SYNTHETIC demo students)
```

| Command | What it does |
|---|---|
| `npm run build-data -- --csv <file> --year <yyyy>` | Recalculate every statistic on the site from a results CSV |
| `npm run check-admission` | Validate `config/admission.json` (also runs before every build) |
| `npm run build` | Build the site into `dist/` |
| `npm start` | Serve the built site and the search API |
| `npm run dev` | Development server with hot reload |
| `npm test` | Unit tests |
| `npm run e2e` | Browser tests (needs `npm start` running and Playwright available) |

## Every year: new results

**1. Put the new results file in `data-private/`** (never committed; see the CSV format below).

**2. Recalculate the statistics**

```bash
npm run build-data -- --csv data-private/results-2027.csv --year 2027
```

This rewrites `public/data/analytics.json` and `public/data/quality.json`: overview, distribution, top 100, statistics, data quality and
the rank calculator all follow. Read the summary it prints:

- the student and ranked-cohort counts should look right for the year;
- a warning about **unrecognised status labels** means some rows were left out of the ranking; if the ministry changed a label, add it to
  `STATUS_MAP` in `server/dataset.ts` and run the command again.

Options: `--max 320` (maximum total, if it ever changes), `--hide-names` (leave names out of the top-100 list),
`--compare <old analytics.json>` (report which sections differ from another build).

**3. Admission minimums: edit `config/admission.json` by hand**

On results day the ministry has not published the minimums yet, so set the year and leave it unpublished:

```json
{ "year": 2027, "published": false, "…": "…" }
```

The admission pages then say *"Official minimums for 2027 have not been published yet"* and show no numbers.
When the ministry publishes them, fill the file in:

```json
{
  "year": 2027,
  "published": true,
  "label_ar": "الحد الأدنى للمرحلة الأولى 2027",
  "label_en": "2027 first-phase minimums",
  "source": "https://…the ministry's page…",
  "updated": "2027-08-05",
  "faculties": [
    { "key": "medicine", "name_ar": "الطب البشري", "name_en": "Medicine", "track": "science", "cutoff": 93.6 }
  ]
}
```

- One row per faculty; add or remove rows freely. `track` is one of `science`, `math`, `literary`, `mixed`.
- `cutoff` is the official minimum **percentage**. The site works out the total needed and how many students are at or above it.
- If the file is for a different year than the results, or has a mistake (missing cutoff, no source, a percentage above 100), the build
  stops and tells you which line to fix. Figures for the wrong year are never shown.

**4. Build and run**

```bash
npm run build
STUDENTS_CSV=data-private/results-2027.csv npm start
```

Steps 3 and 4 are all you repeat when the minimums are published later.

## The results CSV and student search

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
| `total_degree` | Total (out of 320 by default); half marks such as `285.5` are fine |
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

- For the 2026 file, **884,661 ranked** is the published cohort size.
- If the server prints a warning that the statistics were built from a different number of students, run `npm run build-data` on this file first (see "Every year" above).
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

### Search without a real file

| Setting | Result |
|---|---|
| *(default)* | 5,000 synthetic students — invented names and seat numbers, clearly labelled in the UI |
| `STUDENTS_CSV=path/to/results.csv npm start` | The real results file (see below) |
| `SEARCH_API=off npm start` | No search backend; the page explains this and points to the rank calculator |

A static host (e.g. Vercel, `vercel.json` included) serves everything except student search, which needs the Node server (or any service
implementing the same `/api/health`, `/api/search`, `/api/students`, `/api/student/{seat}` contract; set `VITE_API_BASE` at build time).


## What's inside

```
config/admission.json   official admission minimums, edited by hand
src/domain/             pure, tested logic: percentage, bands, rank/percentile/T-score, admission config rules, search rules, CSV/XLSX export
src/i18n/               Arabic + English dictionaries (structurally identical — enforced by a test)
src/charts/             small dependency-free SVG/HTML charts
src/pages/              13 routes
server/                 results pipeline (clean → validate → rank), statistics build, search API, static server
public/data/            generated statistics (rebuilt by `npm run build-data`)
tests/, e2e/            unit tests and browser tests
docs/                   NEXT-YEAR-PLAN.md — the design notes behind the yearly rebuild
```

## Accuracy

The statistics follow the method of the open [Thanaweya-2026](https://github.com/omarhamed888/Thanaweya-2026) project. `npm test` checks the
calculations two ways:

- **Against that project's Python pipeline** (numpy / pandas / scipy) on identical synthetic files: about 5,500 values on a deliberately
  messy file and 6,200 on a clean one, plus every student's rank, percentile and performance index.
- **Against the published 2026 figures**: rebuilding the full 884,661-student ranked cohort from the published score-frequency table
  reproduces the published histogram, cumulative curve, box statistics, descriptive statistics, percentiles, thresholds and frequency table.

If you have the original 2026 CSV you can confirm the whole pipeline on real rows:

```bash
npm run build-data -- --csv data-private/results-2026.csv --year 2026 --out /tmp/check --compare public/data/analytics.json
```

## Deliberate differences from the reference project

- **No admission predictions.** Only the ministry's official minimums are shown, entered by hand, and only for the matching year.
- **Where do I stand?** — exact national rank / percentile from a total, computed in the browser with no personal data.
- Per-status box/violin shapes leave out withheld (zero) scores.
- Score clusters are the exact best split over all students (the reference ran k-means on a 100k sample); density curves use all students.
- No dual-axis chart, no donut charts; every chart has a data-table view.
- Real `.xlsx` export; Western digits in both languages; language switch never discards input.
- About 90 KB of gzipped JavaScript instead of a 4.5 MB charting bundle.

## Privacy

No accounts, analytics or third-party requests. The student's score stays in memory in the browser. Only language and theme are stored
(`localStorage`). Search queries go to the configured API only. The results CSV is never committed (`*.csv` and `data-private/` are ignored).
