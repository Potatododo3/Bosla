/**
 * Official admission minimums, entered by hand in config/admission.json.
 * Nothing here is predicted or estimated: the site shows the ministry's
 * published figures, or — until they are published — nothing at all.
 */
import { round } from "./scores.ts";
import { countClearing, type CohortIndex } from "./standing.ts";

export const TRACKS = ["science", "math", "literary", "mixed"] as const;
export type Track = (typeof TRACKS)[number];

export interface FacultyMinimum { key: string; name_ar: string; name_en: string; track: Track; cutoff: number | null }
export interface AdmissionConfig {
  year: number;
  /** false until the ministry's figures have been entered */
  published: boolean;
  label_ar: string;
  label_en: string;
  source: string;
  updated: string;
  faculties: FacultyMinimum[];
}

export type Validation = { ok: true; config: AdmissionConfig } | { ok: false; errors: string[] };

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export function validateAdmission(raw: unknown): Validation {
  const e: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["The file must contain a JSON object."] };
  if (!Number.isInteger(o.year) || (o.year as number) < 2000 || (o.year as number) > 2100) e.push('"year" must be a four-digit year, e.g. 2027.');
  if (typeof o.published !== "boolean") e.push('"published" must be true or false.');
  const published = o.published === true;
  if (published) {
    if (!isStr(o.label_ar)) e.push('"label_ar" is required when published (what the numbers are, in Arabic).');
    if (!isStr(o.label_en)) e.push('"label_en" is required when published (what the numbers are, in English).');
    if (!isStr(o.source) || !/^https?:\/\//.test(o.source as string)) e.push('"source" must be a link (http… or https…) to where the ministry published the numbers.');
    if (!isStr(o.updated) || !/^\d{4}-\d{2}-\d{2}$/.test(o.updated as string)) e.push('"updated" must be a date like 2027-07-20.');
  }
  if (!Array.isArray(o.faculties) || o.faculties.length === 0) e.push('"faculties" must be a non-empty list.');
  const seen = new Set<string>();
  (Array.isArray(o.faculties) ? o.faculties : []).forEach((f: unknown, i) => {
    const x = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const who = isStr(x.key) ? `faculty "${x.key}"` : `faculty #${i + 1}`;
    if (!isStr(x.key) || !/^[a-z0-9_]+$/.test(x.key)) e.push(`${who}: "key" must be lowercase letters, digits or underscores.`);
    else if (seen.has(x.key)) e.push(`${who}: the key is used more than once.`);
    else seen.add(x.key);
    if (!isStr(x.name_ar)) e.push(`${who}: "name_ar" is missing.`);
    if (!isStr(x.name_en)) e.push(`${who}: "name_en" is missing.`);
    if (!TRACKS.includes(x.track as Track)) e.push(`${who}: "track" must be one of ${TRACKS.join(", ")}.`);
    const c = x.cutoff;
    if (c === null || c === undefined) { if (published) e.push(`${who}: "cutoff" is empty but "published" is true.`); }
    else if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 100) e.push(`${who}: "cutoff" must be a percentage between 0 and 100 (got ${JSON.stringify(c)}).`);
  });
  if (e.length) return { ok: false, errors: e };
  return {
    ok: true,
    config: {
      year: o.year as number, published,
      label_ar: isStr(o.label_ar) ? o.label_ar.trim() : "", label_en: isStr(o.label_en) ? o.label_en.trim() : "",
      source: isStr(o.source) ? o.source.trim() : "", updated: isStr(o.updated) ? o.updated : "",
      faculties: (o.faculties as Record<string, unknown>[]).map((x) => ({
        key: x.key as string, name_ar: (x.name_ar as string).trim(), name_en: (x.name_en as string).trim(), track: x.track as Track,
        cutoff: typeof x.cutoff === "number" ? x.cutoff : null,
      })),
    },
  };
}

export interface OfficialMinimum {
  key: string; name_ar: string; name_en: string; track: Track;
  cutoff: number; // percent
  scoreNeeded: number; // total out of max, 1 dp
  clearing: number; // ranked students at or above the minimum
  clearingPct: number; // share of the ranked cohort, 2 dp
}

export type AdmissionState =
  | { state: "published"; config: AdmissionConfig; faculties: OfficialMinimum[] }
  | { state: "pending"; reason: "not_published" | "wrong_year" | "missing"; configYear: number | null };

/** Decide what the site may show for a given results year. Old figures are never shown as current. */
export function resolveAdmission(config: AdmissionConfig | null, resultsYear: number, cohort: CohortIndex): AdmissionState {
  if (!config) return { state: "pending", reason: "missing", configYear: null };
  if (config.year !== resultsYear) return { state: "pending", reason: "wrong_year", configYear: config.year };
  if (!config.published) return { state: "pending", reason: "not_published", configYear: config.year };
  const faculties = config.faculties.filter((f) => f.cutoff !== null).map((f) => {
    const clearing = countClearing(cohort, f.cutoff!);
    return {
      key: f.key, name_ar: f.name_ar, name_en: f.name_en, track: f.track, cutoff: f.cutoff!,
      scoreNeeded: round((f.cutoff! / 100) * cohort.max, 1), clearing, clearingPct: round((clearing / cohort.n) * 100, 2),
    };
  }).sort((a, b) => b.cutoff - a.cutoff || a.key.localeCompare(b.key));
  return { state: "published", config, faculties };
}

/** above: meets the minimum · close: less than one point below · below: further away. */
export type Outlook = "above" | "close" | "below";
export function outlookFor(pct: number, cutoff: number): Outlook {
  if (pct >= cutoff) return "above";
  return cutoff - pct < 1 ? "close" : "below";
}
