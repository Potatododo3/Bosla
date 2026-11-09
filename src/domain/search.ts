/**
 * Search-query rules shared by the browser client and the Node API.
 */
import { normalizeDigits } from "./scores.ts";

export const SEAT_DIGITS = 7;

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/** Display form of an Arabic name: NFKC, no diacritics/tatweel, single spaces. */
export function cleanName(raw: string): string {
  return raw.normalize("NFKC").replace(TASHKEEL, "").replace(TATWEEL, "").replace(/\s+/g, " ").trim();
}

/** Search key: folds alef/hamza/ya/ta-marbuta variants, drops non-Arabic letters. */
export function nameKey(raw: string): string {
  return cleanName(raw)
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/[^ء-ي ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SearchBy = "auto" | "seat" | "name";
export type QueryPlan =
  | { kind: "empty" }
  | { kind: "seat"; digits: string }
  | { kind: "name"; key: string; tokens: string[] }
  | { kind: "too_short" };

/** Decide how a raw query is interpreted (mirrors the reference API). */
export function planQuery(raw: string, by: SearchBy): QueryPlan {
  const q = normalizeDigits(raw).trim();
  if (!q) return { kind: "empty" };
  const digits = q.replace(/\D/g, "");
  const allDigits = /^\d+$/.test(q.replace(/\s/g, ""));
  if (by === "seat" || (by === "auto" && digits.length >= 3 && allDigits)) return { kind: "seat", digits };
  const key = nameKey(q);
  if (key.length < 2) return { kind: "too_short" };
  return { kind: "name", key, tokens: key.split(" ").filter(Boolean) };
}

/** A seat prefix of L digits covers a numeric range of 7-digit seat numbers. */
export function seatPrefixRange(digits: string): { lo: number; hi: number } | null {
  const L = digits.length;
  if (L === 0 || L > SEAT_DIGITS) return null;
  const span = 10 ** (SEAT_DIGITS - L);
  const lo = Number(digits) * span;
  return { lo, hi: lo + span - 1 };
}

/** Every query token must be a prefix of some token of the name key. */
export function nameMatches(nameKeyTokens: string[], queryTokens: string[]): boolean {
  return queryTokens.every((q) => nameKeyTokens.some((t) => t.startsWith(q)));
}
