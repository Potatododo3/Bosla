import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gradeBand, parseNumberInput, percentageOf, round, normalizeDigits } from "../src/domain/scores.ts";
import { buildCohortIndex, countClearing, standingFor } from "../src/domain/standing.ts";
import { estimateAll, fitTrend, outlookFor, pressureAdjustment } from "../src/domain/admission.ts";
import { ADMISSION_2026 } from "../src/rules/admission2026.ts";
import { cleanName, nameKey, nameMatches, planQuery, seatPrefixRange } from "../src/domain/search.ts";
import { crc32, toCSV, toXLSX } from "../src/domain/exporters.ts";

const load = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), "utf8"));
const A = load("analytics");
const P = JSON.parse(readFileSync(new URL("./fixtures/predictions.json", import.meta.url), "utf8"));
const ix = buildCohortIndex(A.frequency_table, A.stats_score.mean, A.stats_score.std);

describe("scores", () => {
  it("percentage = score / 320 × 100", () => {
    expect(percentageOf(320)).toBe(100);
    expect(percentageOf(160)).toBe(50);
    expect(percentageOf(206)).toBeCloseTo(64.375, 10);
    expect(percentageOf(0.5)).toBeCloseTo(0.15625, 10);
  });
  it("grade bands: low inclusive, high exclusive, 100 in top band", () => {
    expect(gradeBand(100)).toBe("ge95");
    expect(gradeBand(95)).toBe("ge95");
    expect(gradeBand(94.999)).toBe("b90_95");
    expect(gradeBand(90)).toBe("b90_95");
    expect(gradeBand(80)).toBe("b80_90");
    expect(gradeBand(70)).toBe("b70_80");
    expect(gradeBand(60)).toBe("b60_70");
    expect(gradeBand(50)).toBe("b50_60");
    expect(gradeBand(49.99)).toBe("lt50");
    expect(gradeBand(0)).toBe("lt50");
  });
  it("band counts derived from the frequency table equal the published band counts", () => {
    const counts: Record<string, number> = {};
    for (const r of A.frequency_table) { const k = gradeBand(percentageOf(r.score)); counts[k] = (counts[k] ?? 0) + r.count; }
    for (const b of A.grade_bands_sitters) expect(counts[b.key], b.key).toBe(b.count);
  });
  it("parses user input incl. Arabic digits and rejects bad values", () => {
    expect(parseNumberInput("٢٨٥٫٥", 0, 320)).toEqual({ ok: true, value: 285.5 });
    expect(parseNumberInput(" 91.25% ", 0, 100)).toEqual({ ok: true, value: 91.25 });
    expect(parseNumberInput("", 0, 320)).toEqual({ ok: false, error: "empty" });
    expect(parseNumberInput("abc", 0, 320)).toEqual({ ok: false, error: "not_a_number" });
    expect(parseNumberInput("1e3", 0, 320)).toEqual({ ok: false, error: "not_a_number" });
    expect(parseNumberInput("-1", 0, 320)).toEqual({ ok: false, error: "below_min" });
    expect(parseNumberInput("320.5", 0, 320)).toEqual({ ok: false, error: "above_max" });
    expect(normalizeDigits("۱۲۳٤")).toBe("1234");
  });
  it("round is half-away-from-zero and float-safe", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(94.445, 2)).toBe(94.45);
    expect(round(-2.5)).toBe(-3);
  });
});

describe("standing (rank / percentile / T-score)", () => {
  it("cohort size and cumulative counts match the published table", () => {
    expect(ix.n).toBe(A.cohort.sitters);
    for (const r of A.frequency_table) expect(standingFor(ix, r.score).below + r.count).toBe(r.cumulative_count);
  });
  it("reproduces rank and performance index for every published top-100 student", () => {
    for (const s of A.top_100) {
      const st = standingFor(ix, s.total_degree);
      expect(st.rank, `rank of ${s.total_degree}`).toBe(s.national_rank);
      expect(st.performanceIndex).toBeCloseTo(s.performance_index, 2);
      expect(round(st.percentage, 3)).toBeCloseTo(s.percentage, 2);
    }
  });
  it("boundaries: best, worst, tie handling, unseen scores", () => {
    const best = standingFor(ix, 320);
    expect(best).toMatchObject({ rank: 1, percentile: 100, ahead: 0, tied: 1, top1: true });
    const zero = standingFor(ix, 0);
    expect(zero.rank).toBe(ix.n - 2219 + 1);
    expect(zero.percentile).toBe(0.2508);
    expect(zero.below).toBe(0);
    // competition ranking: everyone tied at 319.5 shares rank 2
    expect(standingFor(ix, 319.5)).toMatchObject({ rank: 2, tied: 4 });
    expect(standingFor(ix, 319).rank).toBe(6);
    // a score nobody obtained still ranks consistently between its neighbours
    const odd = standingFor(ix, 319.75);
    expect(odd).toMatchObject({ rank: 2, tied: 0 });
  });
  it("percentile equals published cumulative % and matches reported percentiles", () => {
    for (const r of A.frequency_table) expect(standingFor(ix, r.score).percentile).toBeCloseTo(r.cumulative_pct, 3);
    for (const [p, score] of Object.entries(A.percentiles_score)) {
      const st = standingFor(ix, score as number);
      expect(st.percentile).toBeGreaterThanOrEqual(Number(p) - 0.5);
    }
  });
  it("students clearing each published threshold", () => {
    for (const t of A.thresholds) expect(countClearing(ix, t.threshold), `≥${t.threshold}%`).toBe(t.count_sitters);
    expect(countClearing(ix, 0)).toBe(ix.n);
    expect(countClearing(ix, 100)).toBe(1);
    expect(countClearing(ix, 100.01)).toBe(0);
  });
});

describe("admission estimation model", () => {
  const est = estimateAll(ADMISSION_2026, ix, A.stats_pct.mean);
  it("pressure matches the reference", () => {
    expect(round(pressureAdjustment(ADMISSION_2026, A.stats_pct.mean), 3)).toBe(P.meta.pressure_adjustment);
    expect(pressureAdjustment(ADMISSION_2026, 100)).toBe(3);
    expect(pressureAdjustment(ADMISSION_2026, 0)).toBe(-3);
  });
  it("linear fit: exact line, floor on sigma, two-point series", () => {
    const f = fitTrend([2021, 2022, 2023], [80, 81, 82], 2026, 0.8);
    expect(f.slope).toBeCloseTo(1, 12);
    expect(f.projected).toBeCloseTo(85, 10);
    expect(f.sigma).toBe(0.8);
    expect(fitTrend([2024, 2025], [70, 72], 2026, 0.8).projected).toBeCloseTo(74, 10);
    expect(() => fitTrend([2025], [70], 2026, 0.8)).toThrow();
  });
  it("reproduces every published faculty figure (14 faculties × all fields)", () => {
    expect(est.length).toBe(14);
    expect(est.map((e) => e.key)).toEqual(P.faculties.map((f: { key: string }) => f.key));
    for (const ref of P.faculties) {
      const e = est.find((x) => x.key === ref.key)!;
      const tag = ref.key;
      expect(e.expected, tag).toBe(ref.expected_cutoff);
      expect(e.scoreNeeded, tag).toBe(ref.score_needed);
      expect(e.sigma, tag).toBe(ref.confidence_interval_95.sigma);
      expect(e.ciLow, tag).toBe(ref.confidence_interval_95.low);
      expect(e.ciHigh, tag).toBe(ref.confidence_interval_95.high);
      expect(e.slopePerYear, tag).toBeCloseTo(ref.trend.slope_per_year, 4);
      expect(e.trendProjection, tag).toBe(ref.trend.projected_before_pressure);
      expect(e.lastYear.delta, tag).toBe(ref.last_year.expected_vs_last);
      for (const [mine, theirs] of [[e.optimistic, ref.scenarios.optimistic], [e.central, ref.scenarios.expected], [e.pessimistic, ref.scenarios.pessimistic]] as const) {
        expect(mine.cutoff, tag).toBe(theirs.cutoff);
        expect(mine.eligible, tag).toBe(theirs.eligible_students);
        expect(mine.eligiblePct, tag).toBe(theirs.eligible_pct);
      }
      expect(e.history).toEqual(ref.history);
    }
  });
  it("expected = trend + pressure + calibration (decomposition is consistent)", () => {
    for (const e of est) expect(e.trendProjection + e.pressure + e.calibration).toBeCloseTo(e.expected, 1);
  });
  it("outlook classification", () => {
    const med = est.find((e) => e.key === "medicine")!;
    expect(outlookFor(med.pessimistic.cutoff, med)).toBe("likely");
    expect(outlookFor(med.central.cutoff, med)).toBe("expected");
    expect(outlookFor(med.optimistic.cutoff, med)).toBe("borderline");
    expect(outlookFor(med.optimistic.cutoff - 0.01, med)).toBe("below");
  });
});

describe("search rules", () => {
  it("cleans names and builds folded search keys", () => {
    expect(cleanName("  مُحَمَّــد   أحمد ")).toBe("محمد أحمد");
    expect(nameKey("أحمد إبراهيم آدم")).toBe("احمد ابراهيم ادم");
    expect(nameKey("فاطمة مصطفى")).toBe("فاطمه مصطفي");
    expect(nameKey("مؤمن وائل علاء")).toBe("مومن وايل علا");
    expect(nameKey("Ali 123")).toBe("");
  });
  it("plans queries like the reference API", () => {
    expect(planQuery("", "auto")).toEqual({ kind: "empty" });
    expect(planQuery("2769465", "auto")).toEqual({ kind: "seat", digits: "2769465" });
    expect(planQuery("٢٧٦", "auto")).toEqual({ kind: "seat", digits: "276" });
    expect(planQuery("27", "auto")).toEqual({ kind: "too_short" });
    expect(planQuery("27", "seat")).toEqual({ kind: "seat", digits: "27" });
    expect(planQuery("أحمد محمد", "auto")).toEqual({ kind: "name", key: "احمد محمد", tokens: ["احمد", "محمد"] });
    expect(planQuery("ا", "name")).toEqual({ kind: "too_short" });
  });
  it("seat prefixes map to 7-digit ranges", () => {
    expect(seatPrefixRange("276")).toEqual({ lo: 2760000, hi: 2769999 });
    expect(seatPrefixRange("2769465")).toEqual({ lo: 2769465, hi: 2769465 });
    expect(seatPrefixRange("27694651")).toBeNull();
    expect(seatPrefixRange("")).toBeNull();
  });
  it("name matching is AND of token prefixes", () => {
    const tokens = nameKey("عبدالله محمود عمر").split(" ");
    expect(nameMatches(tokens, ["عبد", "عمر"])).toBe(true);
    expect(nameMatches(tokens, ["محمود", "علي"])).toBe(false);
  });
});

describe("exports", () => {
  it("CSV has BOM and escapes quotes/commas", () => {
    const csv = toCSV(["a", "b"], [["x,y", 'he said "hi"'], [1, null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"x,y","he said ""hi"""');
    expect(csv).toContain("1,\r\n");
  });
  it("crc32 known vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("XLSX is a ZIP container with the sheet inside", () => {
    const x = toXLSX({ name: "الأوائل", header: ["الاسم", "Score"], rows: [["أحمد <&>", 320]], rtl: true });
    expect([x[0], x[1], x[2], x[3]]).toEqual([0x50, 0x4b, 3, 4]);
    const text = new TextDecoder().decode(x);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("أحمد &lt;&amp;&gt;");
    expect(text).toContain('rightToLeft="1"');
  });
});
