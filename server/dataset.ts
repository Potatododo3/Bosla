/**
 * Student dataset: load → clean → validate → engineer features → index.
 * Re-implements the reference pipeline's documented behaviour in TypeScript
 * so a raw 4-column export (seat, name, total, status) is all that is needed.
 */
import { readFileSync } from "node:fs";
import { MAX_SCORE, gradeBand, type BandKey, type StatusKey } from "../src/domain/scores.ts";
import { cleanName, nameKey } from "../src/domain/search.ts";
import { npRound } from "./stats.ts";

export interface RawRow { seat: number | null; name: string | null; score: number | null; status: string | null }

export interface Student {
  seating_no: number;
  name: string;
  total_degree: number;
  percentage: number;
  status: StatusKey;
  grade_band: BandKey;
  national_rank: number | null;
  percentile: number | null;
  performance_index: number | null;
  is_top_1pct: boolean;
  is_top_5pct: boolean;
  is_top_10pct: boolean;
}

export type InvalidReason =
  | "missing_seat" | "missing_or_short_name" | "missing_score"
  | "score_below_zero" | "score_above_max" | "passing_but_zero_score";

/** One cleaned row (every row of the file after exact-duplicate removal). */
export interface CleanRow {
  index: number; // position in the source file
  seat: number | null;
  name: string | null;
  score: number | null;
  pct: number | null; // 4 dp, as the reference stores it
  status: StatusKey;
  band: BandKey;
  sitter: boolean;
  invalid: InvalidReason | null;
  ranked: boolean;
  student: Student | null; // null when there is no seat number to key on
}

export interface CleaningLog {
  rows_in: number;
  exact_duplicate_rows_removed: number;
  status_trailing_ws_fixed: number;
  rows_out: number;
  invalid_rows: number;
  invalid_breakdown: Partial<Record<InvalidReason, number>>;
  unknown_status_labels: Record<string, number>;
}

const STATUS_MAP: Record<string, StatusKey> = {
  "ناجح دور أول": "pass_r1", "دور ثان": "round2", "دور ثانى": "round2",
  "راسب دور أول": "fail_r1", "غياب كلى دور أول": "absent", "غياب كلي دور أول": "absent",
  pass_r1: "pass_r1", round2: "round2", fail_r1: "fail_r1", absent: "absent",
};

const tidy = (raw: string) => raw.replace(/\s+/g, " ").trim();
export function mapStatus(raw: string | null): StatusKey {
  if (!raw) return "unknown";
  return STATUS_MAP[tidy(raw)] ?? "unknown";
}

/** First failing rule wins (order matters). */
export function validateRow(r: { seat: number | null; name: string | null; score: number | null; status: StatusKey }, maxScore: number = MAX_SCORE): InvalidReason | null {
  if (r.seat === null) return "missing_seat";
  if (r.name === null || r.name.length < 3) return "missing_or_short_name";
  if (r.score === null) return "missing_score";
  if (r.score < 0) return "score_below_zero";
  if (r.score > maxScore) return "score_above_max";
  if ((r.status === "pass_r1" || r.status === "round2") && r.score === 0) return "passing_but_zero_score";
  return null;
}

export interface Dataset {
  maxScore: number;
  rows: CleanRow[]; // file order
  students: Student[]; // rows with a seat number, sorted by seat
  bySeat: Map<number, Student>;
  keys: string[][]; // name-key tokens, parallel to `students`
  byRank: Student[]; // ranked cohort, best first
  rankedCount: number;
  rankedMean: number;
  rankedSd: number; // population sd (ddof 0), as used by the performance index
  invalid: Partial<Record<InvalidReason, number>>;
  log: CleaningLog;
  demo: boolean;
}

export function buildDataset(raw: RawRow[], demo: boolean, maxScore: number = MAX_SCORE): Dataset {
  const seen = new Set<string>();
  const invalid: Partial<Record<InvalidReason, number>> = {};
  const unknown: Record<string, number> = {};
  const rows: CleanRow[] = [];
  let wsFixed = 0;
  raw.forEach((r, index) => {
    const dupKey = `${r.seat}|${r.name}|${r.score}|${r.status}`;
    if (seen.has(dupKey)) return; // exact duplicates dropped
    seen.add(dupKey);
    const name = r.name === null ? null : cleanName(r.name);
    const status = mapStatus(r.status);
    if (r.status !== null && r.status !== tidy(r.status)) wsFixed++;
    if (status === "unknown") { const k = r.status === null ? "(empty)" : tidy(r.status); unknown[k] = (unknown[k] ?? 0) + 1; }
    const reason = validateRow({ seat: r.seat, name, score: r.score, status }, maxScore);
    if (reason) invalid[reason] = (invalid[reason] ?? 0) + 1;
    const pct = r.score === null ? null : npRound((r.score / maxScore) * 100, 4);
    // Like the reference, a percentage outside 0–100 (an invalid row) falls in the lowest band.
    const band = pct === null || pct > 100.0001 ? "lt50" : gradeBand(pct);
    const sitter = status === "pass_r1" || status === "round2" || status === "fail_r1";
    const student: Student | null = r.seat === null ? null : {
      seating_no: r.seat, name: name ?? "", total_degree: r.score ?? 0, percentage: pct ?? 0, status, grade_band: band,
      national_rank: null, percentile: null, performance_index: null, is_top_1pct: false, is_top_5pct: false, is_top_10pct: false,
    };
    rows.push({ index, seat: r.seat, name, score: r.score, pct, status, band, sitter, invalid: reason, ranked: sitter && reason === null, student });
  });

  // Features over the ranked cohort.
  const ranked = rows.filter((x) => x.ranked).map((x) => x.student!);
  const n = ranked.length;
  const mean = ranked.reduce((a, s) => a + s.total_degree, 0) / (n || 1);
  const sd = Math.sqrt(ranked.reduce((a, s) => a + (s.total_degree - mean) ** 2, 0) / (n || 1)) || 1;
  ranked.sort((a, b) => b.total_degree - a.total_degree || a.seating_no - b.seating_no);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j < n && ranked[j]!.total_degree === ranked[i]!.total_degree) j++;
    const percentile = npRound(((n - i) / n) * 100, 4); // share scoring ≤ this score
    for (let k = i; k < j; k++) {
      const s = ranked[k]!;
      s.national_rank = i + 1; // competition ranking: ties share the best rank
      s.percentile = percentile;
      s.performance_index = npRound(Math.min(100, Math.max(0, 50 + (10 * (s.total_degree - mean)) / sd)), 2);
      s.is_top_1pct = percentile >= 99; s.is_top_5pct = percentile >= 95; s.is_top_10pct = percentile >= 90;
    }
    i = j;
  }

  const students = rows.filter((x) => x.student).map((x) => x.student!).sort((a, b) => a.seating_no - b.seating_no);
  const invalidRows = Object.values(invalid).reduce((a, b) => a + (b ?? 0), 0);
  return {
    maxScore, rows, students,
    bySeat: new Map(students.map((s) => [s.seating_no, s])),
    keys: students.map((s) => nameKey(s.name).split(" ").filter(Boolean)),
    byRank: ranked, rankedCount: n, rankedMean: mean, rankedSd: sd, invalid,
    log: {
      rows_in: raw.length, exact_duplicate_rows_removed: raw.length - rows.length, status_trailing_ws_fixed: wsFixed,
      rows_out: rows.length, invalid_rows: invalidRows, invalid_breakdown: invalid, unknown_status_labels: unknown,
    },
    demo,
  };
}

/** CSV with header: seating_no,arabic_name,total_degree,student_case_desc */
export function loadCsv(path: string): RawRow[] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const head = splitCsvLine(lines[0] ?? "").map((h) => h.trim());
  const col = (n: string) => head.indexOf(n);
  const [ci, cn, cs, ct] = [col("seating_no"), col("arabic_name"), col("total_degree"), col("student_case_desc")];
  if (ci < 0 || cn < 0 || cs < 0 || ct < 0) throw new Error("CSV must have columns: seating_no, arabic_name, total_degree, student_case_desc");
  const num = (v: string | undefined) => (v === undefined || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return lines.slice(1).map((l) => {
    const c = splitCsvLine(l);
    const seat = num(c[ci]);
    return { seat: seat === null ? null : Math.trunc(seat), name: c[cn]?.trim() || null, score: num(c[cs]), status: c[ct] === undefined || c[ct] === "" ? null : c[ct]! };
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
