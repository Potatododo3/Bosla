/**
 * Synthetic demo cohort. NOT real students: names are random combinations of
 * common given names and seat numbers are invented. Scores are sampled from
 * the published 2026 score-frequency table so the demo behaves realistically.
 */
import { readFileSync } from "node:fs";
import type { RawRow } from "./dataset.ts";

const MALE = ["محمد", "أحمد", "محمود", "مصطفى", "علي", "عمر", "يوسف", "إبراهيم", "خالد", "حسن", "حسين", "عبدالله", "عبدالرحمن", "كريم", "طارق", "سعيد", "ياسر", "هشام", "مؤمن", "زياد", "آدم", "سيف", "مازن", "وائل", "إسلام", "رامي", "شريف", "عادل", "فتحي", "جمال"];
const FEMALE = ["فاطمة", "مريم", "آية", "نور", "سارة", "هاجر", "ندى", "منة", "ياسمين", "سلمى", "رحمة", "إيمان", "أسماء", "دينا", "هدى", "ملك", "جنى", "روان", "شهد", "بسملة"];

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthesize(count: number, analyticsPath: string, seed = 2026): RawRow[] {
  const table: { score: number; cumulative_count: number }[] = JSON.parse(readFileSync(analyticsPath, "utf8")).frequency_table;
  const total = table[table.length - 1]!.cumulative_count;
  const rnd = mulberry32(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  const sample = () => {
    const target = rnd() * total;
    let lo = 0, hi = table.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (table[m]!.cumulative_count < target) lo = m + 1; else hi = m; }
    return table[lo]!.score;
  };
  const rows: RawRow[] = [];
  const seats = new Set<number>();
  while (rows.length < count) {
    const seat = 1000000 + Math.floor(rnd() * 8999999);
    if (seats.has(seat)) continue;
    seats.add(seat);
    const name = [pick(rnd() < 0.5 ? MALE : FEMALE), pick(MALE), pick(MALE), pick(MALE)].join(" ");
    const r = rnd();
    let score = sample();
    let status: string;
    if (r < 0.005) { status = "غياب كلى دور أول"; score = 0; }
    else if (r < 0.035) { status = rnd() < 0.75 ? "ناجح دور أول" : "دور ثان "; score = 0; } // withheld-score placeholders
    else if (score >= 160) status = rnd() < 0.93 ? "ناجح دور أول" : "دور ثان";
    else status = rnd() < 0.75 ? "دور ثان" : "راسب دور أول";
    rows.push({ seat, name, score, status });
  }
  return rows;
}
