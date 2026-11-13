import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gradeBand, parseNumberInput, percentageOf, round, normalizeDigits } from "../src/domain/scores.ts";
import { buildCohortIndex, countClearing, standingFor } from "../src/domain/standing.ts";
import { outlookFor, resolveAdmission, validateAdmission } from "../src/domain/admissionConfig.ts";
import { cleanName, nameKey, nameMatches, planQuery, seatPrefixRange } from "../src/domain/search.ts";
import { crc32, toCSV, toXLSX } from "../src/domain/exporters.ts";

const load = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), "utf8"));
const A = load("analytics");
const CFG = JSON.parse(readFileSync(new URL("../config/admission.json", import.meta.url), "utf8"));
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

describe("official admission minimums (config/admission.json)", () => {
  const published = (over: Record<string, unknown> = {}) => ({
    year: 2026, published: true, label_ar: "الحد الأدنى للمرحلة الأولى", label_en: "First-phase minimums", source: "https://example.org/tansiq", updated: "2026-08-01",
    faculties: [
      { key: "medicine", name_ar: "الطب البشري", name_en: "Medicine", track: "science", cutoff: 95 },
      { key: "law", name_ar: "الحقوق", name_en: "Law", track: "literary", cutoff: 60 },
      { key: "engineering", name_ar: "الهندسة", name_en: "Engineering", track: "math", cutoff: 90 },
    ],
    ...over,
  });
  const errors = (raw: unknown) => { const v = validateAdmission(raw); return v.ok ? [] : v.errors; };

  it("the shipped file is valid and unpublished (no numbers shown until the owner enters them)", () => {
    const v = validateAdmission(CFG);
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.config.published).toBe(false); expect(v.config.faculties.length).toBe(14); expect(v.config.faculties.every((f) => f.cutoff === null)).toBe(true); }
  });
  it("accepts a complete published file", () => expect(errors(published())).toEqual([]));
  it("rejects incomplete or impossible entries with a message per problem", () => {
    expect(errors(null).length).toBe(1);
    expect(errors([]).length).toBe(1);
    expect(errors(published({ year: "2027" }))[0]).toContain("year");
    expect(errors(published({ published: "yes" }))[0]).toContain("published");
    expect(errors(published({ source: "" }))[0]).toContain("source");
    expect(errors(published({ source: "ministry website" }))[0]).toContain("source");
    expect(errors(published({ updated: "August 2026" }))[0]).toContain("updated");
    expect(errors(published({ label_en: " " }))[0]).toContain("label_en");
    expect(errors(published({ faculties: [] }))[0]).toContain("faculties");
    const f = (x: Record<string, unknown>) => errors(published({ faculties: [{ key: "a", name_ar: "أ", name_en: "A", track: "science", cutoff: 80, ...x }] }));
    expect(f({ cutoff: 101 })[0]).toContain("between 0 and 100");
    expect(f({ cutoff: -1 })[0]).toContain("between 0 and 100");
    expect(f({ cutoff: "90" })[0]).toContain("between 0 and 100");
    expect(f({ cutoff: null })[0]).toContain("empty");
    expect(f({ track: "arts" })[0]).toContain("track");
    expect(f({ key: "Has Space" })[0]).toContain("key");
    expect(f({ name_ar: "" })[0]).toContain("name_ar");
    const dup = published(); (dup.faculties as { key: string }[])[1]!.key = "medicine";
    expect(errors(dup)[0]).toContain("more than once");
    // unpublished files may leave cutoffs and labels empty
    expect(errors({ year: 2027, published: false, faculties: [{ key: "a", name_ar: "أ", name_en: "A", track: "mixed", cutoff: null }] })).toEqual([]);
  });
  it("never shows figures for the wrong year, or before publication", () => {
    const ok = validateAdmission(published()); if (!ok.ok) throw new Error("fixture");
    expect(resolveAdmission(null, 2026, ix)).toEqual({ state: "pending", reason: "missing", configYear: null });
    expect(resolveAdmission(ok.config, 2027, ix)).toEqual({ state: "pending", reason: "wrong_year", configYear: 2026 });
    expect(resolveAdmission({ ...ok.config, published: false }, 2026, ix)).toMatchObject({ state: "pending", reason: "not_published" });
  });
  it("published: sorted by minimum, with total needed and students at or above it", () => {
    const ok = validateAdmission(published()); if (!ok.ok) throw new Error("fixture");
    const r = resolveAdmission(ok.config, 2026, ix);
    if (r.state !== "published") throw new Error("expected published");
    expect(r.faculties.map((f) => f.key)).toEqual(["medicine", "engineering", "law"]);
    const med = r.faculties[0]!, t95 = A.thresholds.find((t: { threshold: number }) => t.threshold === 95), t90 = A.thresholds.find((t: { threshold: number }) => t.threshold === 90);
    expect(med).toMatchObject({ cutoff: 95, scoreNeeded: 304, clearing: t95.count_sitters, clearingPct: round(t95.pct_sitters, 2) });
    expect(r.faculties[1]).toMatchObject({ scoreNeeded: 288, clearing: t90.count_sitters });
  });
  it("total needed follows the year's maximum", () => {
    const ix400 = buildCohortIndex([{ score: 100, count: 1, cumulative_count: 1 }, { score: 380, count: 1, cumulative_count: 2 }], 240, 140, 400);
    const ok = validateAdmission(published()); if (!ok.ok) throw new Error("fixture");
    const r = resolveAdmission(ok.config, 2026, ix400);
    if (r.state !== "published") throw new Error("expected published");
    expect(r.faculties[0]).toMatchObject({ scoreNeeded: 380, clearing: 1, clearingPct: 50 });
    expect(standingFor(ix400, 380)).toMatchObject({ rank: 1, percentage: 95, band: "ge95" });
    expect(standingFor(ix400, 100).percentage).toBe(25);
  });
  it("outlook: meets / within one point / below", () => {
    expect(outlookFor(90, 90)).toBe("above");
    expect(outlookFor(95.2, 90)).toBe("above");
    expect(outlookFor(89.99, 90)).toBe("close");
    expect(outlookFor(89.01, 90)).toBe("close");
    expect(outlookFor(89, 90)).toBe("below");
    expect(outlookFor(40, 90)).toBe("below");
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
