import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { buildDataset, mapStatus, validateRow, type RawRow } from "../server/dataset.ts";
import { handleApi } from "../server/api.ts";
import { synthesize } from "../server/synth.ts";

const rows: RawRow[] = [
  { seat: 1000001, name: "أحمد  مُحمد علي", score: 320, status: "ناجح دور أول " },
  { seat: 1000002, name: "فاطمة إبراهيم حسن", score: 300, status: "ناجح دور أول" },
  { seat: 1000003, name: "منى أحمد سعيد", score: 300, status: "ناجح دور أول" },
  { seat: 1000004, name: "عمر خالد يوسف", score: 150.5, status: "دور ثان" },
  { seat: 1000005, name: "سارة محمود طه", score: 90, status: "راسب دور أول" },
  { seat: 1000006, name: "هدى علي كمال", score: 0, status: "غياب كلى دور أول" },
  { seat: 1000007, name: "زياد وائل فتحي", score: 0, status: "ناجح دور أول" }, // withheld score
  { seat: 1000007, name: "زياد وائل فتحي", score: 0, status: "ناجح دور أول" }, // exact duplicate
  { seat: 2000001, name: "آدم مصطفى عادل", score: 200, status: "ناجح دور أول" },
];
const ds = buildDataset(rows, true);
const get = (path: string, qs = "") => handleApi(ds, path, new URLSearchParams(qs));
const body = (r: { body: unknown }) => r.body as Record<string, any>;

describe("dataset pipeline", () => {
  it("maps statuses and tolerates stray whitespace", () => {
    expect(mapStatus("ناجح دور أول  ")).toBe("pass_r1");
    expect(mapStatus("دور  ثان")).toBe("round2");
    expect(mapStatus("غياب كلي دور أول")).toBe("absent");
    expect(mapStatus("؟")).toBe("unknown");
    expect(mapStatus(null)).toBe("unknown");
  });
  it("validation: first failing rule wins", () => {
    const base = { seat: 1, name: "اسم كامل", score: 100, status: "pass_r1" as const };
    expect(validateRow(base)).toBeNull();
    expect(validateRow({ ...base, seat: null, name: null })).toBe("missing_seat");
    expect(validateRow({ ...base, name: "اب", score: null })).toBe("missing_or_short_name");
    expect(validateRow({ ...base, score: null })).toBe("missing_score");
    expect(validateRow({ ...base, score: -0.5 })).toBe("score_below_zero");
    expect(validateRow({ ...base, score: 320.5 })).toBe("score_above_max");
    expect(validateRow({ ...base, score: 0 })).toBe("passing_but_zero_score");
    expect(validateRow({ ...base, score: 0, status: "absent" })).toBeNull();
    expect(validateRow({ ...base, score: 0, status: "fail_r1" })).toBeNull();
  });
  it("dedupes, cleans names, ranks only valid sitters", () => {
    expect(ds.students.length).toBe(8);
    expect(ds.rankedCount).toBe(6);
    expect(ds.invalid).toEqual({ passing_but_zero_score: 1 });
    const s = (seat: number) => ds.bySeat.get(seat)!;
    expect(s(1000001)).toMatchObject({ name: "أحمد محمد علي", national_rank: 1, percentile: 100, status: "pass_r1", grade_band: "ge95" });
    // ties share the best rank; percentile counts everyone ≤
    expect(s(1000002).national_rank).toBe(2);
    expect(s(1000003).national_rank).toBe(2);
    expect(s(1000002).percentile).toBeCloseTo((5 / 6) * 100, 4);
    expect(s(2000001).national_rank).toBe(4);
    expect(s(1000004)).toMatchObject({ national_rank: 5, percentage: 47.0312, grade_band: "lt50" });
    expect(s(1000005).national_rank).toBe(6);
    // absent + withheld are kept but unranked
    expect(s(1000006)).toMatchObject({ national_rank: null, percentile: null, performance_index: null });
    expect(s(1000007).national_rank).toBeNull();
    // T-score: mean 50 at the cohort mean
    const mean = (320 + 300 + 300 + 150.5 + 90 + 200) / 6;
    expect(s(2000001).performance_index).toBeCloseTo(50 + (10 * (200 - mean)) / Math.sqrt([320, 300, 300, 150.5, 90, 200].reduce((a, x) => a + (x - mean) ** 2, 0) / 6), 2);
  });
});

describe("API contract", () => {
  it("health", () => expect(body(get("/api/health"))).toMatchObject({ status: "ok", students: 8, demo: true }));
  it("exact seat, seat prefix, unknown seat", () => {
    expect(body(get("/api/search", "q=1000004"))).toMatchObject({ mode: "seat_exact", total: 1 });
    const p = body(get("/api/search", "q=100&size=3&page=2"));
    expect(p).toMatchObject({ mode: "seat_prefix", total: 7, pages: 3 });
    expect(p.rows.map((r: any) => r.seating_no)).toEqual([1000004, 1000005, 1000006]);
    expect(body(get("/api/search", "q=999"))).toMatchObject({ mode: "seat_prefix", total: 0 });
    expect(body(get("/api/search", "q=12345678"))).toMatchObject({ mode: "seat_prefix", total: 0 });
  });
  it("name search folds spelling variants, ANDs tokens, orders by rank with unranked last", () => {
    const r = body(get("/api/search", "q=" + encodeURIComponent("احمد")));
    expect(r.mode).toBe("name");
    expect(r.rows.map((x: any) => x.seating_no)).toEqual([1000001, 1000003]);
    expect(body(get("/api/search", "q=" + encodeURIComponent("أحم عل"))).total).toBe(1);
    expect(body(get("/api/search", "q=" + encodeURIComponent("ادم"))).rows[0].seating_no).toBe(2000001);
    expect(body(get("/api/search", "q=" + encodeURIComponent("علي"))).rows.map((x: any) => x.seating_no)).toEqual([1000001, 1000006]);
    expect(body(get("/api/search", "q=" + encodeURIComponent("ا"))).total).toBe(0);
    expect(body(get("/api/search", "q=")).mode).toBe("empty");
  });
  it("validates parameters with 422", () => {
    expect(get("/api/search", "q=x&page=abc").status).toBe(422);
    expect(get("/api/search", "q=x&by=nope").status).toBe(422);
    expect(get("/api/students", "sort=password").status).toBe(422);
    expect(get("/api/students", "min_pct=500").status).toBe(422);
    expect(get("/api/student/abc").status).toBe(422);
    expect(body(get("/api/search", "q=10&by=seat&size=9999")).size).toBe(100);
  });
  it("students listing: sort, filter, nulls last", () => {
    const all = body(get("/api/students"));
    expect(all.total).toBe(8);
    expect(all.rows.map((r: any) => r.national_rank)).toEqual([1, 2, 2, 4, 5, 6, null, null]);
    const desc = body(get("/api/students", "sort=score&order=desc&sitters_only=true&min_pct=50"));
    expect(desc.rows.map((r: any) => r.total_degree)).toEqual([320, 300, 300, 200]);
    expect(body(get("/api/students", "status=absent")).total).toBe(1);
    expect(body(get("/api/students", "band=ge95")).total).toBe(1);
    expect(body(get("/api/students", "sort=rank&order=desc")).rows.at(-1).national_rank).toBeNull();
  });
  it("student profile with ±5 rank neighbours; 404 for unknown", () => {
    const s = body(get("/api/student/2000001"));
    expect(s.national_rank).toBe(4);
    expect(s.neighbours.map((n: any) => n.national_rank)).toEqual([1, 2, 2, 4, 5, 6]);
    expect(body(get("/api/student/1000006")).neighbours).toEqual([]);
    expect(get("/api/student/42").status).toBe(404);
    expect(get("/api/nope").status).toBe(404);
  });
});

describe("synthetic demo data", () => {
  it("is deterministic and well-formed", () => {
    const path = fileURLToPath(new URL("../public/data/analytics.json", import.meta.url));
    const a = synthesize(500, path), b = synthesize(500, path);
    expect(a).toEqual(b);
    const d = buildDataset(a, true);
    expect(d.students.length).toBe(500);
    expect(d.rankedCount).toBeGreaterThan(450);
    expect(d.students.every((s) => s.total_degree >= 0 && s.total_degree <= 320 && String(s.seating_no).length === 7)).toBe(true);
  });
});
