/**
 * Deterministic, deliberately messy synthetic results (no real students):
 * duplicates, missing fields, impossible scores, unknown and untidy status labels.
 * Used to compare the TypeScript build with the reference pipeline's output.
 */
import type { RawRow } from "../../server/dataset.ts";

const FIRST = ["محمد", "أحمد", "محمود", "مصطفى", "علي", "عمر", "يوسف", "إبراهيم", "فاطمة", "مريم", "آية", "نور", "سارة", "هاجر", "مُنى", "عبـدالله"];

export function messyRows(count = 4000, seed = 11): RawRow[] {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const rows: RawRow[] = [];
  for (let i = 0; i < count; i++) {
    let score: number | null = Math.min(320, Math.max(0, Math.round((205 + 52 * gauss()) * 2) / 2));
    let name: string | null = `${pick(FIRST)} ${pick(FIRST)}  ${pick(FIRST)} ${pick(FIRST)}`;
    let seat: number | null = 1000000 + i * 7;
    let status: string | null;
    const r = rnd();
    if (r < 0.01) { status = "غياب كلى دور أول"; score = 0; }
    else if (r < 0.04) { status = rnd() < 0.7 ? "ناجح دور أول" : "دور ثان"; score = 0; } // withheld
    else if (score >= 160) status = rnd() < 0.9 ? "ناجح دور أول" : "دور ثان";
    else status = rnd() < 0.7 ? "دور ثان" : "راسب دور أول";
    if (rnd() < 0.06) status = status + " "; // trailing whitespace
    if (rnd() < 0.01) status = "دور  ثانى";
    const q = rnd();
    if (q < 0.003) seat = null;
    else if (q < 0.006) name = null;
    else if (q < 0.009) name = "مي";
    else if (q < 0.012) score = null;
    else if (q < 0.014) score = -3;
    else if (q < 0.016) score = 321.5;
    else if (q < 0.018) status = "منسحب";
    else if (q < 0.02) status = null;
    rows.push({ seat, name, score, status });
    if (rnd() < 0.004) rows.push({ seat, name, score, status }); // exact duplicate
    if (rnd() < 0.003) rows.push({ seat, name: "طالب آخر بنفس الرقم", score, status }); // duplicate seat, different person
  }
  return rows;
}

export function toCsv(rows: RawRow[]): string {
  const q = (v: string | number | null) => (v === null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  return "﻿seating_no,arabic_name,total_degree,student_case_desc\r\n" + rows.map((r) => [r.seat ?? "", q(r.name), r.score ?? "", q(r.status)].join(",")).join("\r\n") + "\r\n";
}
