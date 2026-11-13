import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Analytics, Quality, SearchResponse, StudentProfile } from "./types.ts";
import { buildCohortIndex, type CohortIndex } from "../domain/standing.ts";
import { resolveAdmission, validateAdmission, type AdmissionConfig, type AdmissionState } from "../domain/admissionConfig.ts";
import { MAX_SCORE } from "../domain/scores.ts";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new ApiError(res.ok ? 502 : res.status, "not_json"); // e.g. SPA fallback HTML
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, typeof body?.detail === "string" ? body.detail : res.statusText);
  return body as T;
}

/* ---- precomputed datasets (static JSON) --------------------------------- */
export interface Core {
  a: Analytics;
  cohort: CohortIndex;
  /** results year and maximum total, from the generated data */
  year: number;
  max: number;
  /** official minimums, or the reason none are shown */
  admission: AdmissionState;
}
let corePromise: Promise<Core> | null = null;
function loadCore(): Promise<Core> {
  // The admission file is optional: if it is missing or malformed, admission pages show "not published".
  const admission = getJson<unknown>("/data/admission.json").then((raw): AdmissionConfig | null => { const v = validateAdmission(raw); return v.ok ? v.config : null; }, () => null);
  corePromise ??= Promise.all([getJson<Analytics>("/data/analytics.json"), admission]).then(([a, cfg]) => {
    const year = a.meta?.year, max = a.meta?.max_score ?? MAX_SCORE;
    if (!Number.isInteger(year)) throw new Error("analytics.json has no meta.year");
    const cohort = buildCohortIndex(a.frequency_table, a.stats_score.mean, a.stats_score.std, max);
    return { a, cohort, year: year as number, max, admission: resolveAdmission(cfg, year as number, cohort) };
  }).catch((e) => { corePromise = null; throw e; });
  return corePromise;
}
let qualityPromise: Promise<Quality> | null = null;
const loadQuality = () => (qualityPromise ??= getJson<Quality>("/data/quality.json").catch((e) => { qualityPromise = null; throw e; }));

export type Async<T> = { state: "loading" } | { state: "error"; retry: () => void } | { state: "ready"; data: T };

function useLoader<T>(loader: () => Promise<T>): Async<T> {
  const [tick, setTick] = useState(0);
  const [s, setS] = useState<{ state: "loading" } | { state: "error" } | { state: "ready"; data: T }>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    setS({ state: "loading" });
    loader().then((data) => alive && setS({ state: "ready", data }), () => alive && setS({ state: "error" }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return s.state === "error" ? { state: "error", retry } : s;
}
export const useCore = () => useLoader(loadCore);
export const useQuality = () => useLoader(loadQuality);

/* ---- search API (optional backend) -------------------------------------- */
const API = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
export type ApiHealth = { state: "checking" } | { state: "off" } | { state: "on"; demo: boolean; students: number; max: number };
let healthPromise: Promise<ApiHealth> | null = null;
export function checkHealth(): Promise<ApiHealth> {
  healthPromise ??= getJson<{ status: string; demo?: boolean; students?: number; max_score?: number }>(`${API}/api/health`)
    .then((h): ApiHealth => (h.status === "ok" ? { state: "on", demo: !!h.demo, students: h.students ?? 0, max: h.max_score ?? MAX_SCORE } : { state: "off" }))
    .catch((): ApiHealth => ({ state: "off" }));
  return healthPromise;
}
export const api = {
  search: (q: string, by: string, page: number, signal?: AbortSignal) =>
    getJson<SearchResponse>(`${API}/api/search?q=${encodeURIComponent(q)}&by=${by}&page=${page}&size=25`, signal),
  student: (seat: number, signal?: AbortSignal) => getJson<StudentProfile>(`${API}/api/student/${seat}`, signal),
};

/* ---- the student's own score (memory only — never persisted) ------------ */
interface ScoreCtx { score: number | null; setScore: (s: number | null) => void }
const Score = createContext<ScoreCtx | null>(null);
export function ScoreProvider({ children }: { children: ReactNode }) {
  const [score, setScore] = useState<number | null>(null);
  const v = useMemo(() => ({ score, setScore }), [score]);
  return <Score.Provider value={v}>{children}</Score.Provider>;
}
export function useScore(): ScoreCtx {
  const v = useContext(Score);
  if (!v) throw new Error("useScore outside provider");
  return v;
}
