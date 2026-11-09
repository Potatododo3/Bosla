/**
 * Core score rules for the 2026 "new system" results.
 * Pure functions only — no UI, no I/O. Every rule here has unit tests.
 */
export const MAX_SCORE = 320;

export type BandKey = "ge95" | "b90_95" | "b80_90" | "b70_80" | "b60_70" | "b50_60" | "lt50";
export type StatusKey = "pass_r1" | "round2" | "fail_r1" | "absent" | "unknown";

/** Grade bands, high → low. `low` inclusive, `high` exclusive (top band includes 100). */
export const GRADE_BANDS: ReadonlyArray<{ key: BandKey; low: number; high: number }> = [
  { key: "ge95", low: 95, high: Infinity },
  { key: "b90_95", low: 90, high: 95 },
  { key: "b80_90", low: 80, high: 90 },
  { key: "b70_80", low: 70, high: 80 },
  { key: "b60_70", low: 60, high: 70 },
  { key: "b50_60", low: 50, high: 60 },
  { key: "lt50", low: -Infinity, high: 50 },
];

/** percentage = score ÷ 320 × 100 (exact; no rounding here). */
export function percentageOf(score: number): number {
  return (score / MAX_SCORE) * 100;
}

export function scoreOfPercentage(pct: number): number {
  return (pct / 100) * MAX_SCORE;
}

export function gradeBand(pct: number): BandKey {
  for (const b of GRADE_BANDS) if (pct >= b.low && pct < b.high) return b.key;
  return "lt50";
}

export type ScoreError = "empty" | "not_a_number" | "below_min" | "above_max";
export type Parsed = { ok: true; value: number } | { ok: false; error: ScoreError };

/** Parse user input. Accepts Arabic-Indic digits and Arabic/Latin decimal marks. */
export function parseNumberInput(raw: string, min: number, max: number): Parsed {
  const s = normalizeDigits(raw).replace(/[٫,]/g, ".").replace(/[%٪\s]/g, "");
  if (s === "") return { ok: false, error: "empty" };
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return { ok: false, error: "not_a_number" };
  const v = Number(s);
  if (!Number.isFinite(v)) return { ok: false, error: "not_a_number" };
  if (v < min) return { ok: false, error: "below_min" };
  if (v > max) return { ok: false, error: "above_max" };
  return { ok: true, value: v };
}

/** Map Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to ASCII. */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Round half away from zero to `d` decimals, robust to binary float noise. */
export function round(v: number, d = 0): number {
  const f = 10 ** d;
  return (Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9)) / f;
}
